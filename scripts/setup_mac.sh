#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "Error: FlowPulse is configured strictly for macOS Apple Silicon (arm64 / Metal MLX)." >&2
  exit 1
fi

echo "=== FlowPulse Local Setup — macOS Apple Silicon (M5 Metal / MLX) ==="
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KEEP_ALIVE=-1
export FLOWPULSE_OLLAMA_MODEL="${FLOWPULSE_OLLAMA_MODEL:-qwen3.5:35b-a3b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama via Homebrew..."
  brew install ollama
fi

echo "Pulling Apple Silicon MLX brain model: ${FLOWPULSE_OLLAMA_MODEL} ..."
ollama pull "${FLOWPULSE_OLLAMA_MODEL}"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv via Homebrew..."
  brew install uv
fi

pushd services/host-engine >/dev/null
uv venv --python 3.12
uv sync --all-extras
uv run python ../../scripts/setup_models.py
popd >/dev/null

pushd apps/web-pwa >/dev/null
npm install
npm run build
popd >/dev/null

pushd apps/desktop-shell >/dev/null
npm install
popd >/dev/null

echo "=== Setup Complete! ==="
echo "Launch Host Engine: cd services/host-engine && OLLAMA_FLASH_ATTENTION=1 OLLAMA_KEEP_ALIVE=-1 uv run uvicorn main:app --host 0.0.0.0 --port 8420 --reload"
echo "Build macOS .app/.dmg: python3 scripts/build_sidecar.py && cd apps/desktop-shell && npm run tauri build"
