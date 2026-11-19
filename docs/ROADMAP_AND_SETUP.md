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
- [x] Local Ollama `qwen3.5:35b-a3b` MoE integration with `think=False`, `keep_alive=-1`, and atomic graph tools.

### Phase 3: Full-Duplex Apple Metal MLX Voice & Barge-In Pipeline
- [x] `scripts/setup_models.py` caching & benchmarking `parakeet-mlx` (`parakeet-tdt-0.6b-v3`) and `mlx-audio` (`Qwen3-TTS-0.6B-bf16` / `CSM-1B` / `Kokoro-82M-bf16`).
- [x] Full-duplex `Pipecat` + `SmallWebRTC` pipeline with `SileroVADAnalyzer(stop_secs=0.2)` and `LocalSmartTurnAnalyzerV3`.
- [x] Browser `RTCPeerConnection` Live Mic client, `Space` push-to-mute hotkey, and real-time voice tool-call Yjs sync.

### Phase 4: VLM Visual Grounding & Wall-Sticky Photo Import
- [x] 2-Tier Context Router (compact text graph digest every turn + `html-to-image` WebP canvas snapshot on spatial keywords).
- [x] **Import Physical Wall Stickies** camera input triggering `qwen3.5:35b-a3b` (`think=True`) vision extraction.

### Phase 5: Result Map Export Compiler & macOS `.app` / `.dmg` Bundle
- [x] Result Map vector poster `.svg` export + `PROCESS_SPEC.md` report compiler + `.flowpulse.json` export.
- [x] LAN/Tailscale QR-code mobile pairing modal + iOS/macOS PWA manifest icons (`public/`).
- [x] Tauri v2 macOS (`aarch64-apple-darwin`) Rust shell (`Cargo.toml`, sidecar lifecycle manager in `src/lib.rs`, `.icns` bundle icons, and `scripts/build_sidecar.py`).

### Phase 6: Multi-Project SQLite Persistence, 8-Tool Co-Editing & Live Voice Context Sync
- [x] Full SQLite `Project` CRUD endpoints (`GET/PUT/DELETE /api/projects`) with safe additive column migration and `.flowpulse.json` bundle import (`ProjectSwitcherModal`).
- [x] Expanded AI tool suite (`update_workflow_step`, `update_edge`, `delete_workflow_step`) + `[edge_id=...]` digest visibility + rolling 6-turn memory.
- [x] Live WebRTC `context_sync` updates + `AssistantTranscriptTap` streaming spoken AI turns into the sidebar chat log.
- [x] Automatic static PWA hosting on `:8420` when `apps/web-pwa/dist` is built so Tailscale HTTPS works with zero extra proxy setup.

### Phase 7: 4-Stage Workshop Phase Selector, Inspector Drawer, PDF Poster & macOS TCC Hardening
- [x] Interactive `P1–P4` Workshop Phase selector (`FacilitatorSidebar`) wired into LLM system context and Phase 4 sign-off readiness audits (`auditBoardHealth`).
- [x] Non-blocking `InspectorDrawer` for sticky labels, SOP notes, node kinds, `100s` section CRUD, `+5` edge CRUD/guard editing, and 1-click AI draft confirmation.
- [x] Landscape printable Result Map `.pdf` poster + friction/CRUD ledger generator (`openPrintableResultMapPdf`).
- [x] macOS TCC microphone/camera usage descriptions (`src-tauri/Info.plist`), PyInstaller MLX/Pipecat hidden-import collection, and `scripts/collect_m5_diagnostics.py`.

---

## 2. Enabling iPhone / iPad / Secondary Mac PWA Microphones

iOS Safari and macOS/iPadOS browsers block `navigator.mediaDevices.getUserMedia` on plain `http://192.168.x.x` LAN addresses—requiring `localhost` or valid `HTTPS`.

### Option A: Tailscale HTTPS (Recommended — Zero Certificate Hassle)
1. Build the frontend once (`cd apps/web-pwa && npm run build`) so FastAPI serves the compiled SPA directly on `:8420`.
2. Run on your Mac:
   ~~~bash
   tailscale serve --bg https / http://127.0.0.1:8420
   ~~~
3. Scan the QR code inside FlowPulse on your iPhone -> **Share -> Add to Home Screen** -> full native PWA with WebRTC microphone access.

---

## 3. Generating the M5 Diagnostic Handoff File (For Phase 8+ Tuning)

~~~bash
cd services/host-engine
uv run python ../../scripts/collect_m5_diagnostics.py
# Outputs ./flowpulse_m5_handoff.json at the repository root
~~~
