"""
Full-Duplex Local Voice Pipeline for FlowPulse (Apple Silicon Metal / MLX):
  SmallWebRTCTransport (16kHz in / 24kHz out)
    -> SileroVADAnalyzer(stop_secs=0.2) + LocalSmartTurnAnalyzerV3 (thinking-pause aware, <120ms barge-in)
    -> ParakeetMLXSTTService (mlx-community/parakeet-tdt-0.6b-v3 on Metal)
    -> OLLamaLLMService (qwen3.5:35b-a3b with think=False + FlowPulse atomic board tools)
    -> MLXAudioTTSService (Sesame CSM-1B / Qwen3-TTS / Kokoro-bf16 on Metal)
    -> SmallWebRTCOutputTransport
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Awaitable, Callable

from loguru import logger

from agent.facilitator import OLLAMA_MODEL
from agent.prompts import FACILITATOR_SYSTEM_PROMPT, FLOWPULSE_TOOLS
from engine.crud_rules import build_compact_graph_digest, compress_label_for_ai
from voice.mlx_speech import CONFIG_PATH, DEFAULT_STT_REPO, resolve_active_tts_config

MODELS_DIR = Path.home() / ".flowpulse" / "models"

# Keep active WebRTC connections & background pipeline tasks alive
_active_sessions: dict[str, dict[str, Any]] = {}


def check_local_voice_models() -> dict[str, Any]:
    tts_cfg = resolve_active_tts_config()
    saved_cfg: dict[str, Any] = {}
    if CONFIG_PATH.exists():
        try:
            saved_cfg = json.loads(CONFIG_PATH.read_text())
        except Exception:
            saved_cfg = {}

    return {
        "backend": "apple-mlx-metal",
        "models_dir": str(MODELS_DIR),
        "mlx_ready": bool((saved_cfg.get("stt") or {}).get("ready")) and bool((saved_cfg.get("tts") or {}).get("ready")),
        "stt_model": DEFAULT_STT_REPO,
        "tts_model": tts_cfg.get("repo_id"),
        "tts_kind": tts_cfg.get("kind"),
        "ollama_vlm": os.environ.get("FLOWPULSE_OLLAMA_MODEL", OLLAMA_MODEL),
        "turn_analyzer": "LocalSmartTurnAnalyzerV3",
        "vad": "SileroVADAnalyzer(stop_secs=0.2)",
    }


def _build_pipecat_tools(
    project_id: str,
    emit_event: Callable[[dict[str, Any]], Awaitable[None]],
):
    from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
    from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
    from pipecat.services.llm_service import FunctionCallParams

    async def _handle_tool(params: FunctionCallParams) -> None:
        name = params.function_name
        args = dict(params.arguments or {})
        if name in ("add_workflow_step", "insert_step_between") and "label" in args:
            args["label"] = compress_label_for_ai(str(args["label"]))

        logger.info(f"[FlowPulse Voice Tool] project={project_id} {name}({args})")
        await emit_event({"type": "tool_call", "call": {"name": name, "arguments": args}})
        await params.result_callback({"status": "applied_to_board", "tool": name, "arguments": args})

    schemas = []
    for raw in FLOWPULSE_TOOLS:
        fn = raw["function"]
        p = fn["parameters"]
        schemas.append(
            FunctionSchema(
                name=fn["name"],
                description=fn["description"],
                properties=p.get("properties", {}),
                required=p.get("required", []),
                handler=_handle_tool,
            )
        )
    return ToolsSchema(standard_tools=schemas), _handle_tool


async def create_webrtc_voice_session(
    sdp_offer: dict[str, Any],
    emit_event: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> dict[str, Any]:
    """Establish a full-duplex SmallWebRTC session backed by Pipecat + Apple MLX Metal."""
    try:
        from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
        from pipecat.audio.vad.silero import SileroVADAnalyzer
        from pipecat.audio.vad.vad_analyzer import VADParams
        from pipecat.pipeline.pipeline import Pipeline
        from pipecat.pipeline.runner import PipelineRunner
        from pipecat.pipeline.task import PipelineParams, PipelineTask
        from pipecat.processors.aggregators.llm_context import LLMContext
        from pipecat.processors.aggregators.llm_response_universal import (
            LLMContextAggregatorPair,
            LLMUserAggregatorParams,
        )
        from pipecat.services.ollama.llm import OLLamaLLMService
        from pipecat.transports.base_transport import TransportParams
        from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
        from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
        from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
        from pipecat.turns.user_turn_strategies import UserTurnStrategies

        from voice.mlx_speech import MLXAudioTTSService, ParakeetMLXSTTService
    except Exception as exc:
        return {
            "status": "unavailable",
            "detail": f"MLX Pipecat voice pipeline import failed: {exc}",
        }

    project_id = str(sdp_offer.get("project_id") or "default-workshop")
    sections = sdp_offer.get("sections") or []
    nodes = sdp_offer.get("nodes") or []
    edges = sdp_offer.get("edges") or []
    selected_node_id = sdp_offer.get("selected_node_id")

    async def _noop_emit(_evt: dict[str, Any]) -> None:
        return None

    emitter = emit_event or _noop_emit

    connection = SmallWebRTCConnection()
    await connection.initialize(sdp=sdp_offer["sdp"], type=sdp_offer["type"])
    answer = connection.get_answer()
    pc_id = answer.get("pc_id") or f"pc_{id(connection)}"

    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
    )

    tts = MLXAudioTTSService(sample_rate=24000)
    stt = ParakeetMLXSTTService(
        sample_rate=16000,
        on_user_audio_callback=lambda text, pcm, sr: (
            tts.push_user_turn_context(text, pcm, sr),
            asyncio.create_task(emitter({"type": "transcript", "speaker": "user", "text": text})),
        ),
    )

    active_model = os.environ.get("FLOWPULSE_OLLAMA_MODEL", OLLAMA_MODEL)
    llm = OLLamaLLMService(
        model=active_model,
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
    )
    tools_schema, tool_handler = _build_pipecat_tools(project_id, emitter)
    for tool in tools_schema.standard_tools:
        llm.register_function(tool.name, tool_handler)

    board_digest = build_compact_graph_digest(sections, nodes, edges, selected_node_id)
    context = LLMContext(
        messages=[
            {
                "role": "system",
                "content": f"{FACILITATOR_SYSTEM_PROMPT}\n\nINITIAL_BOARD_CONTEXT:\n{board_digest}",
            }
        ],
        tools=tools_schema,
    )

    vad_analyzer = SileroVADAnalyzer(params=VADParams(stop_secs=0.2))
    smart_turn = LocalSmartTurnAnalyzerV3()
    user_params = LLMUserAggregatorParams(
        vad_analyzer=vad_analyzer,
        user_turn_strategies=UserTurnStrategies(
            stop=[TurnAnalyzerUserTurnStopStrategy(turn_analyzer=smart_turn)]
        ),
    )
    context_aggregator = LLMContextAggregatorPair(context, user_params=user_params)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
            enable_metrics=True,
        ),
    )

    @transport.event_handler("on_client_disconnected")
    async def _on_disconnected(_transport, _client):
        logger.info(f"[FlowPulse Voice] WebRTC client disconnected ({pc_id})")
        await task.cancel()
        _active_sessions.pop(pc_id, None)

    runner = PipelineRunner(handle_sigint=False)
    bg_task = asyncio.create_task(runner.run(task))
    _active_sessions[pc_id] = {"connection": connection, "task": task, "runner_task": bg_task}

    return {
        "status": "ok",
        "pc_id": pc_id,
        "sdp": answer["sdp"],
        "type": answer["type"],
        "voice_stack": check_local_voice_models(),
    }
