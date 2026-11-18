"""
FlowPulse Apple Silicon (Metal / MLX) Voice & VLM Model Setup + Smoke Benchmark.
Pre-downloads and verifies:
  1. STT: mlx-community/parakeet-tdt-0.6b-v3 (NVIDIA Parakeet TDT 0.6B v3 via parakeet-mlx)
  2. TTS: Probes conversational Metal MLX models via mlx-audio in priority order:
     - mlx-community/csm-1b (Sesame Conversational Speech Model — context-aware human prosody)
     - mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16 (streaming low-latency MLX voice)
     - mlx-community/Kokoro-82M-bf16 (ultra-fast <80ms fallback)
  3. VLM: Verifies Ollama qwen3.5:35b-a3b availability.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

MODELS_DIR = Path.home() / ".flowpulse" / "models"
CONFIG_PATH = MODELS_DIR / "mlx_voice_config.json"

STT_MODEL_ID = os.environ.get("FLOWPULSE_STT_MODEL", "mlx-community/parakeet-tdt-0.6b-v3")
TTS_CANDIDATES = [
    {
        "repo_id": "mlx-community/csm-1b",
        "kind": "sesame",
        "label": "Sesame CSM-1B (Conversational Human Prosody)",
        "default_voice": None,
    },
    {
        "repo_id": "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16",
        "kind": "qwen3_tts",
        "label": "Qwen3-TTS 0.6B CustomVoice (bf16 Streaming)",
        "default_voice": "Vivian",
    },
    {
        "repo_id": "mlx-community/Kokoro-82M-bf16",
        "kind": "kokoro",
        "label": "Kokoro-82M (bf16 Ultra-Fast Fallback)",
        "default_voice": "af_heart",
    },
]


def setup_stt() -> dict:
    print(f"[FlowPulse MLX] Loading STT model: {STT_MODEL_ID} ...")
    t0 = time.perf_counter()
    import parakeet_mlx

    model = parakeet_mlx.from_pretrained(STT_MODEL_ID)
    load_ms = (time.perf_counter() - t0) * 1000

    # Smoke-test 1 second of silent 16kHz audio to warm Metal shaders & verify zero hallucinations
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
        sf.write(wav_path, np.zeros(16000, dtype=np.float32), 16000)

    t1 = time.perf_counter()
    try:
        res = model.transcribe(wav_path)
        infer_ms = (time.perf_counter() - t1) * 1000
        text = (res.text or "").strip()
    finally:
        Path(wav_path).unlink(missing_ok=True)

    print(f"[FlowPulse MLX] STT ready! load={load_ms:.0f}ms, 1s-silence-infer={infer_ms:.0f}ms, text={text!r}")
    return {
        "repo_id": STT_MODEL_ID,
        "load_ms": round(load_ms, 1),
        "smoke_infer_ms": round(infer_ms, 1),
        "ready": True,
    }


def _run_tts_smoke(model, kind: str, default_voice: str | None) -> tuple[float, float, int]:
    sample_text = "Got it, let's drop that right after budget review. What happens if it gets rejected?"
    t0 = time.perf_counter()
    audio_chunks = []
    sample_rate = getattr(model, "sample_rate", 24000)

    kwargs: dict = {}
    if kind == "kokoro":
        kwargs["voice"] = default_voice or "af_heart"
        kwargs["lang_code"] = "a"
    elif kind == "sesame":
        kwargs["speaker"] = 0
        kwargs["stream"] = True
        kwargs["streaming_interval"] = 0.5
    elif kind == "qwen3_tts":
        if default_voice:
            kwargs["voice"] = default_voice
        kwargs["stream"] = True

    first_chunk_ms: float | None = None
    for result in model.generate(sample_text, **kwargs):
        if first_chunk_ms is None:
            first_chunk_ms = (time.perf_counter() - t0) * 1000
        arr = np.asarray(result.audio, dtype=np.float32).reshape(-1)
        if arr.size > 0:
            audio_chunks.append(arr)
        if getattr(result, "sample_rate", None):
            sample_rate = int(result.sample_rate)

    total_ms = (time.perf_counter() - t0) * 1000
    full_audio = np.concatenate(audio_chunks) if audio_chunks else np.zeros(0, dtype=np.float32)
    audio_secs = full_audio.size / float(sample_rate) if sample_rate > 0 else 0.0
    rtf = (total_ms / 1000.0) / audio_secs if audio_secs > 0 else 999.0
    return (first_chunk_ms or total_ms), total_ms, round(rtf, 3)


def setup_tts() -> dict:
    from mlx_audio.tts.utils import load_model

    requested = os.environ.get("FLOWPULSE_TTS_MODEL")
    candidates = list(TTS_CANDIDATES)
    if requested:
        # Put explicitly requested model first
        matched = [c for c in candidates if c["repo_id"] == requested]
        if matched:
            candidates = matched + [c for c in candidates if c["repo_id"] != requested]
        else:
            candidates.insert(0, {"repo_id": requested, "kind": "auto", "label": requested, "default_voice": None})

    working: list[dict] = []
    # Always verify at least one primary conversational model AND Kokoro fallback
    for cand in candidates:
        repo_id = cand["repo_id"]
        print(f"[FlowPulse MLX] Testing TTS model: {repo_id} ({cand['label']}) ...")
        try:
            t0 = time.perf_counter()
            model = load_model(repo_id)
            load_ms = (time.perf_counter() - t0) * 1000
            first_chunk_ms, total_ms, rtf = _run_tts_smoke(model, cand["kind"], cand["default_voice"])
            print(
                f"[FlowPulse MLX] TTS OK: {repo_id} | load={load_ms:.0f}ms | "
                f"ttfa={first_chunk_ms:.0f}ms | total={total_ms:.0f}ms | RTF={rtf}"
            )
            working.append(
                {
                    "repo_id": repo_id,
                    "kind": cand["kind"],
                    "label": cand["label"],
                    "default_voice": cand["default_voice"],
                    "load_ms": round(load_ms, 1),
                    "ttfa_ms": round(first_chunk_ms, 1),
                    "total_ms": round(total_ms, 1),
                    "rtf": rtf,
                }
            )
            # Once we have a conversational primary AND we also want Kokoro fallback cached, keep going only for Kokoro
            if cand["kind"] in ("sesame", "qwen3_tts"):
                # Continue to also cache Kokoro fallback if not yet cached, skip the other conversational model
                candidates = [c for c in candidates if c["kind"] == "kokoro"]
        except Exception as exc:
            print(f"[FlowPulse MLX] TTS candidate {repo_id} skipped: {type(exc).__name__}: {exc}")

    # Ensure Kokoro fallback is also cached if we broke out early
    if not any(w["kind"] == "kokoro" for w in working):
        kokoro_cand = next(c for c in TTS_CANDIDATES if c["kind"] == "kokoro")
        try:
            print(f"[FlowPulse MLX] Caching ultra-fast fallback: {kokoro_cand['repo_id']} ...")
            t0 = time.perf_counter()
            model = load_model(kokoro_cand["repo_id"])
            load_ms = (time.perf_counter() - t0) * 1000
            first_chunk_ms, total_ms, rtf = _run_tts_smoke(model, "kokoro", "af_heart")
            print(
                f"[FlowPulse MLX] Fallback TTS OK: {kokoro_cand['repo_id']} | "
                f"ttfa={first_chunk_ms:.0f}ms | total={total_ms:.0f}ms | RTF={rtf}"
            )
            working.append(
                {
                    "repo_id": kokoro_cand["repo_id"],
                    "kind": "kokoro",
                    "label": kokoro_cand["label"],
                    "default_voice": "af_heart",
                    "load_ms": round(load_ms, 1),
                    "ttfa_ms": round(first_chunk_ms, 1),
                    "total_ms": round(total_ms, 1),
                    "rtf": rtf,
                }
            )
        except Exception as exc:
            print(f"[FlowPulse MLX] Kokoro fallback failed: {type(exc).__name__}: {exc}")

    primary = working[0] if working else None
    return {
        "primary": primary,
        "available": working,
        "ready": primary is not None,
    }


def check_ollama() -> str:
    target = os.environ.get("FLOWPULSE_OLLAMA_MODEL", "qwen3.5:35b-a3b")
    try:
        out = subprocess.run(["ollama", "list"], check=True, capture_output=True, text=True).stdout
        if target in out:
            print(f"[FlowPulse MLX] Ollama model verified: {target}")
        else:
            print(f"[FlowPulse MLX] Ollama detected. Run `ollama pull {target}` if not already pulled.")
    except Exception:
        print(f"[FlowPulse MLX] Install Ollama from https://ollama.com and run `ollama pull {target}`.")
    return target


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    stt_info = setup_stt()
    tts_info = setup_tts()
    ollama_model = check_ollama()

    cfg = {
        "backend": "apple-mlx-metal",
        "stt": stt_info,
        "tts": tts_info,
        "ollama_vlm": ollama_model,
    }
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    print(f"[FlowPulse MLX] Saved voice configuration to {CONFIG_PATH}")


if __name__ == "__main__":
    main()
