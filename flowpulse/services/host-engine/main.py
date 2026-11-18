import json
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from storage.database import init_db, get_session
from storage.models import ConversationTurn
from agent.facilitator import run_facilitator_turn
from voice.pipecat_pipeline import check_local_voice_models, create_webrtc_voice_session


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FlowPulse Host Engine", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class FacilitatorTurnRequest(BaseModel):
    project_id: str = "default-workshop"
    transcript: str
    selected_node_id: str | None = None
    sections: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    canvas_webp_data_url: str | None = None


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "flowpulse-host-engine", "voice_models": check_local_voice_models()}


@app.post("/api/facilitator/turn")
async def facilitator_turn(req: FacilitatorTurnRequest):
    result = await run_facilitator_turn(
        transcript=req.transcript,
        sections=req.sections,
        nodes=req.nodes,
        edges=req.edges,
        selected_node_id=req.selected_node_id,
        canvas_webp_data_url=req.canvas_webp_data_url,
    )
    with get_session() as session:
        session.add(ConversationTurn(project_id=req.project_id, speaker="user", transcript=req.transcript))
        session.add(ConversationTurn(
            project_id=req.project_id,
            speaker="ai",
            transcript=result["reply"],
            mutated_ids_json=json.dumps([c["name"] for c in result["tool_calls"]]),
        ))
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
            await websocket.receive_text()
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
