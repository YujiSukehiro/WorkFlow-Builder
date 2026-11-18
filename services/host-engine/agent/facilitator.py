import os
from typing import Any
from engine.crud_rules import build_compact_graph_digest, compress_label_for_ai
from agent.prompts import FACILITATOR_SYSTEM_PROMPT, FLOWPULSE_TOOLS

OLLAMA_MODEL = os.environ.get("FLOWPULSE_OLLAMA_MODEL", "qwen3.5:35b-a3b")
SPATIAL_TRIGGERS = ("right here", "this messy", "these two", "look at", "pointing", "cluster", "import physical", "photo")
WALL_IMPORT_TRIGGERS = ("import physical", "wall stickies", "whiteboard photo", "from this photo")


async def run_facilitator_turn(
    transcript: str,
    sections: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    selected_node_id: str | None = None,
    canvas_webp_data_url: str | None = None,
) -> dict[str, Any]:
    digest = build_compact_graph_digest(sections, nodes, edges, selected_node_id)
    lower_tx = transcript.lower()
    user_message: dict[str, Any] = {
        "role": "user",
        "content": f"BOARD_CONTEXT:\n{digest}\n\nUSER_SPOKEN_TURN:\n{transcript}",
    }
    if canvas_webp_data_url and any(kw in lower_tx for kw in SPATIAL_TRIGGERS):
        user_message["images"] = [canvas_webp_data_url.split(",", 1)[-1]]

    # CRITICAL METAL LATENCY FIX: disable hidden <think> tokens on normal voice/text turns
    # so qwen3.5:35b-a3b streams tool calls & replies immediately; only think on wall-photo imports.
    use_thinking = bool("images" in user_message and any(kw in lower_tx for kw in WALL_IMPORT_TRIGGERS))

    try:
        import ollama
        client = ollama.AsyncClient()
        response = await client.chat(
            model=OLLAMA_MODEL,
            messages=[{"role": "system", "content": FACILITATOR_SYSTEM_PROMPT}, user_message],
            tools=FLOWPULSE_TOOLS,
            think=use_thinking,
            keep_alive=-1,
            options={"num_ctx": 8192, "temperature": 0.6},
        )
        msg = response.get("message", {})
        sanitized_calls = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            args = dict(fn.get("arguments") or {})
            if name in ("add_workflow_step", "insert_step_between") and "label" in args:
                args["label"] = compress_label_for_ai(str(args["label"]))
            sanitized_calls.append({"name": name, "arguments": args})

        reply_text = (msg.get("content") or "").strip() or "Got it up on the board—what happens right after that?"
        return {
            "reply": reply_text,
            "tool_calls": sanitized_calls,
            "vision_used": "images" in user_message,
            "model": OLLAMA_MODEL,
            "think_used": use_thinking,
        }
    except Exception as exc:
        return {
            "reply": f"Local Ollama ({OLLAMA_MODEL}) unavailable ({exc}). Run `ollama pull {OLLAMA_MODEL}`.",
            "tool_calls": [],
            "vision_used": False,
            "model": OLLAMA_MODEL,
            "think_used": use_thinking,
        }
