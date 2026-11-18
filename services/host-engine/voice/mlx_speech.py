"""
Native Apple Silicon (Metal / MLX) Speech Services for Pipecat:
  - ParakeetMLXSTTService: NVIDIA Parakeet TDT 0.6B v3 via `parakeet-mlx` (16kHz PCM -> transcript)
  - MLXAudioTTSService: Conversational Metal TTS via `mlx-audio`
    (Sesame CSM-1B with rolling conversational context, Qwen3-TTS, or Kokoro-82M-bf16 fallback)
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from collections import deque
from pathlib import Path
from typing import AsyncGenerator

import numpy as np
import soundfile as sf
from loguru import logger

from pipecat.frames.frames import (
    ErrorFrame,
    Frame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.services.stt_service import SegmentedSTTService
from pipecat.services.tts_service import TTSService
from pipecat.utils.time import time_now_iso8601

MODELS_DIR = Path.home() / ".flowpulse" / "models"
CONFIG_PATH = MODELS_DIR / "mlx_voice_config.json"

DEFAULT_STT_REPO = os.environ.get("FLOWPULSE_STT_MODEL", "mlx-community/parakeet-tdt-0.6b-v3")


def resolve_active_tts_config() -> dict:
    """Resolve the active MLX TTS model from env or setup_models.py config."""
    env_model = os.environ.get("FLOWPULSE_TTS_MODEL")
    if env_model:
        kind = "kokoro" if "kokoro" in env_model.lower() else (
            "sesame" if "csm" in env_model.lower() or "sesame" in env_model.lower() else (
                "qwen3_tts" if "qwen3" in env_model.lower() else "auto"
            )
        )
        default_voice = "af_heart" if kind == "kokoro" else ("Vivian" if kind == "qwen3_tts" else None)
        return {"repo_id": env_model, "kind": kind, "default_voice": default_voice}

    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            primary = (cfg.get("tts") or {}).get("primary")
            if primary and primary.get("repo_id"):
                return primary
        except Exception:
            pass

    return {
        "repo_id": "mlx-community/Kokoro-82M-bf16",
        "kind": "kokoro",
        "default_voice": "af_heart",
    }


# Shared lazy singletons so multiple WebRTC reconnects don't reload Metal weights
_stt_model_cache: dict[str, object] = {}
_tts_model_cache: dict[str, object] = {}


def _get_parakeet_model(repo_id: str):
    if repo_id not in _stt_model_cache:
        import parakeet_mlx

        logger.info(f"[FlowPulse MLX] Loading Parakeet STT on Metal: {repo_id}")
        _stt_model_cache[repo_id] = parakeet_mlx.from_pretrained(repo_id)
    return _stt_model_cache[repo_id]


def _get_mlx_tts_model(repo_id: str):
    if repo_id not in _tts_model_cache:
        from mlx_audio.tts.utils import load_model

        logger.info(f"[FlowPulse MLX] Loading MLX-Audio TTS on Metal: {repo_id}")
        _tts_model_cache[repo_id] = load_model(repo_id)
    return _tts_model_cache[repo_id]


class ParakeetMLXSTTService(SegmentedSTTService):
    """Metal-accelerated NVIDIA Parakeet TDT 0.6B v3 STT service for Pipecat."""

    def __init__(
        self,
        *,
        model_id: str = DEFAULT_STT_REPO,
        sample_rate: int = 16000,
        on_user_audio_callback=None,
        **kwargs,
    ):
        super().__init__(sample_rate=sample_rate, **kwargs)
        self._model_id = model_id
        self._on_user_audio_callback = on_user_audio_callback

    def _transcribe_sync(self, audio_bytes: bytes) -> tuple[str, np.ndarray]:
        model = _get_parakeet_model(self._model_id)
        pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        if pcm.size < 1600:  # Ignore ultra-short clicks (<100ms)
            return "", pcm

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            wav_path = tmp.name
            sf.write(wav_path, pcm, self.sample_rate)

        try:
            result = model.transcribe(wav_path)
            text = (getattr(result, "text", "") or "").strip()
            return text, pcm
        finally:
            Path(wav_path).unlink(missing_ok=True)

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        if not audio:
            return
        try:
            text, pcm = await asyncio.to_thread(self._transcribe_sync, audio)
            if text:
                logger.info(f"[Parakeet MLX STT] {text}")
                if self._on_user_audio_callback is not None:
                    self._on_user_audio_callback(text, pcm, self.sample_rate)
                yield TranscriptionFrame(text=text, user_id="", timestamp=time_now_iso8601())
        except Exception as exc:
            logger.error(f"[Parakeet MLX STT] Error: {exc}")
            yield ErrorFrame(error=f"Parakeet MLX STT failed: {exc}")


class MLXAudioTTSService(TTSService):
    """Metal-accelerated MLX-Audio TTS service supporting CSM-1B, Qwen3-TTS, and Kokoro-bf16."""

    def __init__(
        self,
        *,
        model_id: str | None = None,
        voice: str | None = None,
        sample_rate: int = 24000,
        **kwargs,
    ):
        super().__init__(sample_rate=sample_rate, **kwargs)
        cfg = resolve_active_tts_config()
        self._model_id = model_id or cfg["repo_id"]
        self._kind = cfg.get("kind", "auto")
        self._voice = voice or cfg.get("default_voice")
        # Rolling conversational audio/text context for Sesame CSM-1B prosody continuity
        self._csm_context: deque[tuple[int, str, np.ndarray]] = deque(maxlen=4)

    def push_user_turn_context(self, text: str, pcm_float32: np.ndarray, src_sample_rate: int = 16000) -> None:
        """Store recent user speech segment so CSM-1B matches conversational rhythm and energy."""
        if self._kind != "sesame" or not text or pcm_float32.size == 0:
            return
        # Resample 16kHz user audio to 24kHz for CSM-1B context if needed
        if src_sample_rate != self.sample_rate and pcm_float32.size > 0:
            ratio = self.sample_rate / float(src_sample_rate)
            new_len = int(round(pcm_float32.size * ratio))
            x_old = np.linspace(0.0, 1.0, pcm_float32.size)
            x_new = np.linspace(0.0, 1.0, new_len)
            pcm_24k = np.interp(x_new, x_old, pcm_float32).astype(np.float32)
        else:
            pcm_24k = pcm_float32.astype(np.float32)
        # Keep at most last 4 seconds of user turn to keep CSM prefill fast
        max_samples = self.sample_rate * 4
        if pcm_24k.size > max_samples:
            pcm_24k = pcm_24k[-max_samples:]
        self._csm_context.append((1, text, pcm_24k))

    def _synthesize_chunks_sync(self, text: str) -> list[tuple[bytes, int]]:
        import mlx.core as mx

        model = _get_mlx_tts_model(self._model_id)
        out_chunks: list[tuple[bytes, int]] = []
        full_ai_audio: list[np.ndarray] = []
        sr = getattr(model, "sample_rate", self.sample_rate)

        kwargs: dict = {}
        if self._kind == "kokoro":
            kwargs["voice"] = self._voice or "af_heart"
            kwargs["lang_code"] = "a"
            kwargs["speed"] = 1.05
        elif self._kind == "sesame":
            kwargs["speaker"] = 0
            kwargs["stream"] = True
            kwargs["streaming_interval"] = 0.4
            if self._csm_context:
                try:
                    from mlx_audio.tts.models.sesame.sesame import Segment

                    kwargs["context"] = [
                        Segment(speaker=spk, text=txt, audio=mx.array(aud))
                        for spk, txt, aud in self._csm_context
                    ]
                except Exception:
                    pass
        elif self._kind == "qwen3_tts":
            if self._voice:
                kwargs["voice"] = self._voice
            kwargs["stream"] = True
            kwargs["streaming_interval"] = 0.5

        for result in model.generate(text, **kwargs):
            arr = np.asarray(result.audio, dtype=np.float32).reshape(-1)
            if arr.size == 0:
                continue
            chunk_sr = int(getattr(result, "sample_rate", sr) or sr)
            full_ai_audio.append(arr)
            pcm16 = np.clip(arr, -1.0, 1.0)
            pcm_bytes = (pcm16 * 32767.0).astype(np.int16).tobytes()
            out_chunks.append((pcm_bytes, chunk_sr))

        if self._kind == "sesame" and full_ai_audio:
            ai_concat = np.concatenate(full_ai_audio)
            max_samples = self.sample_rate * 4
            if ai_concat.size > max_samples:
                ai_concat = ai_concat[-max_samples:]
            self._csm_context.append((0, text, ai_concat))

        return out_chunks

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        cleaned = (text or "").strip()
        if not cleaned:
            return
        try:
            yield TTSStartedFrame(context_id=context_id)
            chunks = await asyncio.to_thread(self._synthesize_chunks_sync, cleaned)
            for pcm_bytes, chunk_sr in chunks:
                yield TTSAudioRawFrame(
                    audio=pcm_bytes,
                    sample_rate=chunk_sr,
                    num_channels=1,
                    context_id=context_id,
                )
            yield TTSStoppedFrame(context_id=context_id)
        except Exception as exc:
            logger.error(f"[MLX-Audio TTS] Error: {exc}")
            yield ErrorFrame(error=f"MLX-Audio TTS failed: {exc}")
