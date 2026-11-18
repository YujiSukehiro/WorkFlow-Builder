# Phased Build Roadmap, Mobile HTTPS Setup & `.exe` Packaging

## 1. Step-by-Step Engineering Roadmap (GitHub Milestones)

### Phase 1: Interactive Canvas & Deterministic `+5` Engine (Week 1)
- [ ] Scaffold monorepo (`apps/web-pwa` with Vite + React 19 + TypeScript + Tailwind v4).
- [ ] Build custom `@xyflow/react` node components:
  - `StickyWorkshopNode` (colored tactile sticky note with word-count badge).
  - `ResultMapNode` (Green Trigger card, White Step circle, Orange Milestone circle, End circle).
  - `CrudStepEdge` (orthogonal stepped SVG path with `+5` number & `C/R/U/D` color pill + branch condition label).
- [ ] Implement the deterministic `+5` numbering & mid-edge slotting module + `ELKjs` WebWorker auto-layout.
- [ ] Add Blue Sticky (Slowest) and Red Sticky (Problem) quick-toggles + bottom direct-manipulation bar.

### Phase 2: Local Backend, Yjs Co-Editing & Text AI Tool-Calling (Week 2)
- [ ] Set up `services/host-engine` with Python 3.12, FastAPI, SQLModel (SQLite), and `pycrdt-websocket`.
- [ ] Wire `Y.Doc` synchronization between React (`y-websocket`) and Python (`pycrdt`), including separate `"human"` and `"ai-agent"` `UndoManager` stacks.
- [ ] Connect local `Ollama` (`qwen2.5vl:7b`) with the 5 atomic graph tool calls and verify live simultaneous editing (dragging a node while AI builds a branch).

### Phase 3: Full-Duplex Local Voice & Barge-In Pipeline (Week 3)
- [ ] Build `scripts/setup_models.py` to download `faster-whisper` (`large-v3-turbo`), `Silero VAD`, `Smart Turn v2`, and `Kokoro-82M` ONNX weights into `~/.flowpulse/models/`.
- [ ] Stand up the `Pipecat` + `SmallWebRTC` audio route in FastAPI.
- [ ] Build the React audio visualizer HUD, push-to-mute hotkey (`Space`), and test mid-sentence barge-in interruption (`<150ms` audio cutoff).

### Phase 4: VLM Visual Grounding & Wall-Sticky Photo Import (Week 4)
- [ ] Implement the 2-Tier Context Router (text graph digest every turn + `html-to-image` WebP canvas snapshot on spatial keywords like *"right here"*).
- [ ] Add **Import Physical Wall Stickies** camera button in the mobile PWA: snaps a photo of physical stickies or a whiteboard, extracts branches via `Qwen2.5-VL`, and populates an editable digital graph.

### Phase 5: Result Map Export Compiler & Tauri `.exe` Installer (Week 5)
- [ ] Build high-DPI SVG/PDF Result Map poster export and auto-compiled `PROCESS_SPEC.md` report (Red/Blue friction backlog + `+5 CRUD` data dictionary).
- [ ] Configure LAN/Tailscale QR-code mobile pairing modal inside the desktop app.
- [ ] Bundle Python backend with `PyInstaller` and wrap with `Tauri v2` into a standalone `FlowPulse_Setup.exe` Windows installer.

---

## 2. Crucial Setup Detail: Enabling Phone & Laptop PWA Microphones

Modern mobile browsers (iOS Safari and Android Chrome) **block microphone access (`getUserMedia`) and PWA installation on plain `http://192.168.x.x` LAN addresses**—they strictly allow `localhost` or valid `HTTPS`.

Choose either zero-cost local approach below:

### Option A: Tailscale HTTPS (Recommended — Zero Certificate Hassle)
1. Install [Tailscale](https://tailscale.com) (free personal tier) on your GPU PC and your phone/laptop.
2. Run a single command on your GPU PC:
   ~~~bash
   tailscale serve --bg https / http://127.0.0.1:8420
   ~~~
3. Tailscale automatically provisions a trusted Let's Encrypt TLS certificate for `https://<your-pc>.<tailnet>.ts.net`.
4. Scan the QR code shown in FlowPulse on your phone -> **Add to Home Screen** -> full native PWA with instant WebRTC microphone access over Wi-Fi or away from home.

### Option B: 100% Offline LAN with `mkcert`
1. Run `mkcert -install` on your PC to create a local Root CA, and generate `lan-cert.pem` + `lan-key.pem` for your PC's `.local` hostname and LAN IP.
2. AirDrop / copy `rootCA.pem` once onto your phone to trust your PC's local authority.
3. Pass `--ssl-keyfile lan-key.pem --ssl-certfile lan-cert.pem` directly to FastAPI `uvicorn`.

---

## 3. Local Development Quickstart Commands

~~~bash
# 1. Install & pull local Ollama VLM
ollama pull qwen2.5vl:7b

# 2. Set up Python Host Engine (Python 3.12 + uv recommended)
cd services/host-engine
uv venv && uv sync
uv run python ../../scripts/setup_models.py
uv run uvicorn main:app --host 0.0.0.0 --port 8420 --reload

# 3. Start Frontend PWA (in a second terminal)
cd apps/web-pwa
npm install
npm run dev
~~~

---

## 4. Building the Standalone Windows `.exe`

~~~bash
# 1. Freeze Python FastAPI + Pipecat engine into a Tauri sidecar binary
python scripts/build_sidecar.py

# 2. Compile Tauri v2 desktop application + NSIS installer (.exe)
cd apps/desktop-shell
npm run tauri build
~~~

Output installer location:
`apps/desktop-shell/src-tauri/target/release/bundle/nsis/FlowPulse_0.1.0_x64-setup.exe`