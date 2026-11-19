"""
Freeze FlowPulse Python Host Engine into a macOS Apple Silicon (`aarch64-apple-darwin`)
sidecar binary for Tauri v2 `.app` and `.dmg` packaging.
"""

import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = ROOT / "services" / "host-engine"
TAURI_BIN_DIR = ROOT / "apps" / "desktop-shell" / "src-tauri" / "binaries"
TARGET_TRIPLE = "aarch64-apple-darwin"

HIDDEN_IMPORTS = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "aiosqlite",
    "sqlmodel",
    "ollama",
]

COLLECT_PACKAGES = [
    "mlx",
    "parakeet_mlx",
    "mlx_audio",
    "pipecat",
]


def main() -> None:
    if platform.system().lower() != "darwin" or platform.machine().lower() != "arm64":
        raise SystemExit(
            f"FlowPulse sidecar bundler targets strictly {TARGET_TRIPLE} (macOS Apple Silicon)."
        )

    TAURI_BIN_DIR.mkdir(parents=True, exist_ok=True)
    sidecar_name = f"flowpulse-host-engine-{TARGET_TRIPLE}"
    pyinstaller_bin = ENGINE_DIR / ".venv" / "bin" / "pyinstaller"
    cmd_prefix = (
        [str(pyinstaller_bin)]
        if pyinstaller_bin.exists()
        else [sys.executable, "-m", "PyInstaller"]
    )

    extra_flags: list[str] = ["--paths", str(ENGINE_DIR)]
    for mod in HIDDEN_IMPORTS:
        extra_flags.extend(["--hidden-import", mod])
    for pkg in COLLECT_PACKAGES:
        extra_flags.extend(["--collect-all", pkg])

    subprocess.run(
        [
            *cmd_prefix,
            "--noconfirm",
            "--onefile",
            "--name",
            sidecar_name,
            "--distpath",
            str(TAURI_BIN_DIR),
            *extra_flags,
            str(ENGINE_DIR / "main.py"),
        ],
        check=True,
    )
    print(f"[FlowPulse] Built macOS arm64 sidecar: {TAURI_BIN_DIR / sidecar_name}")


if __name__ == "__main__":
    main()
