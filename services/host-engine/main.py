import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import select

from storage.database import init_db, get_session
from storage.models import ConversationTurn, Project
from agent.facilitator import run_facilitator_turn
from engine.crud_rules import audit_board_health
from voice.pipecat_pipeline import (
    check_local_voice_models,
    create_webrtc_voice_session,
    update_voice_session_context,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FlowPulse Host Engine", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FacilitatorTurnRequest(BaseModel):
    project_id: str = "default-workshop"
    transcript: str
    selected_node_id: str | None = None
    active_phase: int = 2
    sections: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    canvas_webp_data_url: str | None = None


class ProjectSaveRequest(BaseModel):
    title: str = "Untitled Process"
    visual_mode: str = "sticky-workshop"
    active_phase: int = 2
    sections: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "flowpulse-host-engine",
        "version": "0.2.0",
        "voice_models": check_local_voice_models(),
    }


@app.get("/api/projects")
async def list_projects():
    with get_session() as session:
        projects = session.exec(select(Project).order_by(Project.updated_at.desc())).all()
        items = []
        for p in projects:
            try:
                board = json.loads(p.board_json or "{}")
            except Exception:
                board = {}
            items.append(
                {
                    "id": p.id,
                    "title": p.title,
                    "visualMode": p.visual_mode,
                    "activePhase": p.active_phase,
                    "nodeCount": len(board.get("nodes") or []),
                    "edgeCount": len(board.get("edges") or []),
                    "updatedAt": p.updated_at.isoformat(),
                }
            )
        return {"projects": items}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    with get_session() as session:
        proj = session.get(Project, project_id)
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        turns = session.exec(
            select(ConversationTurn)
            .where(ConversationTurn.project_id == project_id)
            .order_by(ConversationTurn.id.asc())
        ).all()
        try:
            board = json.loads(proj.board_json or "{}")
        except Exception:
            board = {}
        nodes = board.get("nodes") or []
        edges = board.get("edges") or []
        return {
            "id": proj.id,
            "title": proj.title,
            "visualMode": proj.visual_mode,
            "activePhase": proj.active_phase,
            "sections": board.get("sections") or [],
            "nodes": nodes,
            "edges": edges,
            "health": audit_board_health(nodes, edges),
            "chatHistory": [
                {
                    "id": f"db_turn_{t.id}",
                    "speaker": "ai" if t.speaker == "ai" else "user",
                    "transcript": t.transcript,
                    "mutatedIds": json.loads(t.mutated_ids_json or "[]"),
                    "timestamp": t.created_at.isoformat(),
                }
                for t in turns[-60:]
            ],
            "updatedAt": proj.updated_at.isoformat(),
        }


@app.put("/api/projects/{project_id}")
async def save_project(project_id: str, req: ProjectSaveRequest):
    now = datetime.now(timezone.utc)
    board_str = json.dumps(
        {"sections": req.sections, "nodes": req.nodes, "edges": req.edges}
    )
    with get_session() as session:
        proj = session.get(Project, project_id)
        if proj is None:
            proj = Project(
                id=project_id,
                title=req.title,
                visual_mode=req.visual_mode,
                active_phase=req.active_phase,
                board_json=board_str,
                created_at=now,
                updated_at=now,
            )
            session.add(proj)
        else:
            proj.title = req.title
            proj.visual_mode = req.visual_mode
            proj.active_phase = req.active_phase
            proj.board_json = board_str
            proj.updated_at = now
        session.commit()
    return {
        "status": "saved",
        "id": project_id,
        "health": audit_board_health(req.nodes, req.edges),
        "updatedAt": now.isoformat(),
    }


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    with get_session() as session:
        proj = session.get(Project, project_id)
        if proj:
            session.delete(proj)
        turns = session.exec(
            select(ConversationTurn).where(ConversationTurn.project_id == project_id)
        ).all()
        for t in turns:
            session.delete(t)
        session.commit()
    return {"status": "deleted", "id": project_id}


@app.post("/api/facilitator/turn")
async def facilitator_turn(req: FacilitatorTurnRequest):
    with get_session() as session:
        prior_turns = session.exec(
            select(ConversationTurn)
            .where(ConversationTurn.project_id == req.project_id)
            .order_by(ConversationTurn.id.desc())
            .limit(6)
        ).all()
        recent_history = [
            {"speaker": t.speaker, "transcript": t.transcript}
            for t in reversed(prior_turns)
        ]

    result = await run_facilitator_turn(
        transcript=req.transcript,
        sections=req.sections,
        nodes=req.nodes,
        edges=req.edges,
        selected_node_id=req.selected_node_id,
        active_phase=req.active_phase,
        recent_turns=recent_history,
        canvas_webp_data_url=req.canvas_webp_data_url,
    )
    with get_session() as session:
        session.add(
            ConversationTurn(
                project_id=req.project_id,
                speaker="user",
                transcript=req.transcript,
            )
        )
        session.add(
            ConversationTurn(
                project_id=req.project_id,
                speaker="ai",
                transcript=result["reply"],
                mutated_ids_json=json.dumps([c["name"] for c in result["tool_calls"]]),
            )
        )
        session.commit()
    return result


voice_event_rooms: dict[str, set[WebSocket]] = {}


async def broadcast_voice_event(project_id: str, event: dict[str, Any]) -> None:
    peers = voice_event_rooms.get(project_id, set())
    if not peers:
        return
    payload = json.dumps(event)
    for peer in list(peers):
        try:
            await peer.send_text(payload)
        except Exception:
            peers.discard(peer)


@app.websocket("/ws/voice-events/{project_id}")
async def voice_events_ws(websocket: WebSocket, project_id: str):
    await websocket.accept()
    peers = voice_event_rooms.setdefault(project_id, set())
    peers.add(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "context_sync":
                    update_voice_session_context(project_id, msg)
            except Exception:
                pass
    except WebSocketDisconnect:
        peers.discard(websocket)


@app.post("/api/voice/webrtc-offer")
async def voice_webrtc_offer(sdp_offer: dict[str, Any]):
    project_id = str(sdp_offer.get("project_id") or "default-workshop")
    return await create_webrtc_voice_session(
        sdp_offer,
        emit_event=lambda evt: broadcast_voice_event(project_id, evt),
    )


yjs_rooms: dict[str, set[WebSocket]] = {}


@app.websocket("/ws/yjs/{room_name}")
async def yjs_websocket_relay(websocket: WebSocket, room_name: str):
    await websocket.accept()
    peers = yjs_rooms.setdefault(room_name, set())
    peers.add(websocket)
    try:
        while True:
            msg = await websocket.receive_bytes()
            for peer in list(peers):
                if peer is not websocket:
                    try:
                        await peer.send_bytes(msg)
                    except Exception:
                        peers.discard(peer)
    except WebSocketDisconnect:
        peers.discard(websocket)


PWA_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "apps" / "web-pwa" / "dist"
if PWA_DIST_DIR.is_dir() and (PWA_DIST_DIR / "index.html").is_file():
    assets_dir = PWA_DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="pwa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_pwa_spa(full_path: str):
        candidate = (PWA_DIST_DIR / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(PWA_DIST_DIR.resolve())):
            return FileResponse(str(candidate))
        return FileResponse(str(PWA_DIST_DIR / "index.html"))
