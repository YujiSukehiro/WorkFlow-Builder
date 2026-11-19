"""
Collects Apple Silicon M5 MLX voice benchmark config (`~/.flowpulse/models/mlx_voice_config.json`),
installed package versions, and Ollama model status into `flowpulse_m5_handoff.json` at the repo root
so you can attach a single file back for Phase 8+ voice & VLM calibration.
"""

from __future__ import annotations

import importlib.metadata
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_CFG_PATH = Path.home() / ".flowpulse" / "models" / "mlx_voice_config.json"
OUT_PATH = ROOT / "flowpulse_m5_handoff.json"

TRACKED_PACKAGES = [
    "mlx",
    "parakeet-mlx",
    "mlx-audio",
    "pipecat-ai",
    "aiortc",
    "ollama",
    "fastapi",
    "sqlmodel",
]


def get_pkg_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for pkg in TRACKED_PACKAGES:
        try:
            versions[pkg] = importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            versions[pkg] = "not_installed"
    return versions


def get_ollama_models() -> str:
    try:
        res = subprocess.run(
            ["ollama", "list"], check=False, capture_output=True, text=True, timeout=5
        )
        return (res.stdout or res.stderr or "").strip()
    except Exception as exc:
        return f"unavailable: {exc}"


def get_mac_hardware() -> dict[str, str]:
    info = {
        "system": platform.system(),
        "machine": platform.machine(),
        "mac_ver": platform.mac_ver()[0],
        "python": platform.python_version(),
    }
    try:
        chip = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout.strip()
        mem_bytes = subprocess.run(
            ["sysctl", "-n", "hw.memsize"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout.strip()
        if chip:
            info["chip"] = chip
        if mem_bytes.isdigit():
            info["memory_gb"] = str(round(int(mem_bytes) / (1024**3), 1))
    except Exception:
        pass
    return info


def main() -> None:
    voice_cfg = None
    if VOICE_CFG_PATH.exists():
        try:
            voice_cfg = json.loads(VOICE_CFG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            voice_cfg = {"error": str(exc)}

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "hardware": get_mac_hardware(),
        "python_packages": get_pkg_versions(),
        "mlx_voice_config_path": str(VOICE_CFG_PATH),
        "mlx_voice_config_exists": VOICE_CFG_PATH.exists(),
        "mlx_voice_config": voice_cfg,
        "ollama_models": get_ollama_models(),
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[FlowPulse] Wrote diagnostic handoff bundle: {OUT_PATH}")


if __name__ == "__main__":
    main()
