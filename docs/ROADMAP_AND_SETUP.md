# Phased Build Roadmap, iOS/macOS HTTPS Mic Setup & `.dmg` Packaging

## 1. Engineering Roadmap (macOS Apple Silicon Edition)

### Phase 1: Interactive Canvas & Deterministic `+5` Engine
- [x] Monorepo (`apps/web-pwa` with Vite + React 19 + TypeScript + Tailwind v4).
- [x] Custom `@xyflow/react` node & edge components (`StickyWorkshopNode`, `ResultMapNode`, `CrudStepEdge`).
- [x] Deterministic `+5` numbering, midpoint gap slotting, topological `+5` normalization, and `ELKjs` orthogonal layout.
- [x] Blue Sticky (Slowest) and Red Sticky (Problem) friction toggles + direct-manipulation toolbar.

### Phase 2: Local Backend, Yjs Co-Editing & `qwen3.5:35b-a3b` Tool-Calling
- [x] `services/host-engine` with Python 3.12, FastAPI, SQLModel (SQLite), and WebSocket Yjs relay.
- [x] Separate `"human"` (`Cmd+Z`) and `"ai-agent"` (`Cmd+Shift+Z`) `Y.UndoManager` stacks.
- [x] Local Ollama `qwen3.5:35b-a3b` MoE integration with `think=False`, `keep_alive=-1`, and 5 atomic graph tools.

### Phase 3: Full-Duplex Apple Metal MLX Voice & Barge-In Pipeline
- [x] `scripts/setup_models.py` caching & benchmarking `parakeet-mlx` (`parakeet-tdt-0.6b-v3`) and `mlx-audio` (`Qwen3-TTS-0.6B-bf16` / `CSM-1B` / `Kokoro-82M-bf16`).
- [x] Full-duplex `Pipecat` + `SmallWebRTC` pipeline with `SileroVADAnalyzer(stop_secs=0.2)` and `LocalSmartTurnAnalyzerV3`.
- [x] Browser `RTCPeerConnection` Live Mic client, `Space` push-to-mute hotkey, and real-time voice tool-call Yjs sync.

### Phase 4: VLM Visual Grounding & Wall-Sticky Photo Import
- [x] 2-Tier Context Router (compact text graph digest every turn + `html-to-image` WebP canvas snapshot on spatial keywords).
- [x] **Import Physical Wall Stickies** camera input triggering `qwen3.5:35b-a3b` (`think=True`) vision extraction.

### Phase 5: Result Map Export Compiler & macOS `.app` / `.dmg` Bundle
- [x] Result Map vector poster `.svg` export + `PROCESS_SPEC.md` report compiler (Executive Summary, Red/Blue friction table, `+5 CRUD` data dictionary) + `.flowpulse.json` export.
- [x] LAN/Tailscale QR-code mobile pairing modal + iOS/macOS PWA manifest icons (`public/`).
- [x] Tauri v2 macOS (`aarch64-apple-darwin`) Rust shell (`Cargo.toml`, sidecar lifecycle manager in `src/lib.rs`, `.icns` bundle icons, and `scripts/build_sidecar.py`).

---

## 2. Enabling iPhone / iPad / Secondary Mac PWA Microphones

iOS Safari and macOS/iPadOS browsers block `navigator.mediaDevices.getUserMedia` on plain `http://192.168.x.x` LAN addresses—requiring `localhost` or valid `HTTPS`.

### Option A: Tailscale HTTPS (Recommended — Zero Certificate Hassle)
1. Install Tailscale (`brew install --cask tailscale`) on your Mac and iPhone/iPad.
2. Run on your Mac:
   ~~~bash
   tailscale serve --bg https / http://127.0.0.1:8420
   ~~~
3. Scan the QR code inside FlowPulse on your iPhone -> **Share -> Add to Home Screen** -> full native PWA with WebRTC microphone access.

### Option B: 100% Offline LAN with `mkcert`
1. Install `mkcert` (`brew install mkcert`) and run `mkcert -install` on your Mac, then generate `lan-cert.pem` + `lan-key.pem` for your `.local` hostname and LAN IP.
2. AirDrop `rootCA.pem` onto your iPhone/iPad (Settings -> General -> VPN & Device Management -> Certificate Trust Settings).
3. Pass `--ssl-keyfile lan-key.pem --ssl-certfile lan-cert.pem` to `uvicorn`.

---

## 3. macOS Apple Silicon Quickstart Commands

~~~bash
# One-command full setup (Ollama qwen3.5:35b-a3b + Python 3.12 uv + Metal MLX voice models + PWA build)
./scripts/setup_mac.sh

# Start Host Engine (pins qwen3.5:35b-a3b in 64 GB Unified Memory with Flash Attention)
cd services/host-engine
OLLAMA_FLASH_ATTENTION=1 OLLAMA_KEEP_ALIVE=-1 uv run uvicorn main:app --host 0.0.0.0 --port 8420 --reload

# Start Frontend PWA (in a second terminal)
cd apps/web-pwa
npm run dev
~~~

---

## 4. Building the Native macOS `.app` & `.dmg`

~~~bash
# 1. Freeze Python FastAPI + Pipecat + MLX engine into an arm64 Tauri sidecar
python3 scripts/build_sidecar.py

# 2. Compile Tauri v2 macOS application (.app) and disk image (.dmg)
cd apps/desktop-shell
npm run tauri build
~~~

Output bundle locations:
- `apps/desktop-shell/src-tauri/target/release/bundle/macos/FlowPulse.app`
- `apps/desktop-shell/src-tauri/target/release/bundle/dmg/FlowPulse_0.1.0_aarch64.dmg`
