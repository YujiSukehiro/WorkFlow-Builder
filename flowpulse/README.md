# FlowPulse — Local AI Collaborative Result Map Studio (macOS Apple Silicon MLX)

FlowPulse is a **100% local, privacy-first, voice-and-vision AI workflow mapping studio** purpose-built for **macOS on Apple Silicon (M5 64 GB Unified Memory + Apple Metal / MLX)**. It recreates the collaborative energy of a physical sticky-note process-mapping workshop—where you talk naturally with an AI colleague that places sticky notes, breaks down every workflow branch until none remain, assigns `100s` section prefixes and `+5` `CRUD` transitions (`105, 110, 115...`), flags **Blue (Slowest)** and **Red (Most Problems)** hotspots, and compiles everything into a clean **Result Map** poster and SOP specification.

---

## Core Product Goals

1. **AI-First Board Co-Creation:** Talk naturally through a workflow; the AI puts up and wires sticky notes live on the canvas while you speak. Both you and the AI can drag, edit, re-wire, or undo changes simultaneously via Yjs CRDTs with zero state conflicts.
2. **Full-Duplex Natural Voice & Barge-In:** Speak over or interrupt the AI mid-sentence just like a human teammate at a whiteboard (`<120ms` barge-in cutoff via `Silero VAD` + `LocalSmartTurnAnalyzerV3`, while preserving mid-sentence thinking pauses).
3. **Methodology Guardrails Built In:**
   - **Minimal Words:** Node labels are strictly compressed to `2–4` words (`Purchase Req Submitted`), storing verbose context in attached metadata.
   - **Exhaustive Branching:** The AI tracks open leaf nodes and proactively asks *"What happens if that quote gets kicked back?"* until every branch resolves.
   - **100s Sections & +5 Numbering:** Sections group into `100s, 200s, 300s...` while arrows increment by `+5` (`105, 110, 115`) so missed steps slot cleanly in between without breaking downstream IDs.
   - **CRUD Edge Semantics:** Every arrow explicitly declares whether a **Create (`C`)**, **Read (`R`)**, **Upsert (`U`)**, or **Delete (`D`)** action happens between steps.
   - **Blue & Red Friction Heatmap:** Stamp **Blue Stickies** on the slowest cycle-time bottlenecks and **Red Stickies** on high-error problem areas.
4. **Native macOS `.app` / `.dmg` + Mobile/Laptop PWA:** Runs natively on your Mac via Tauri v2 (`aarch64-apple-darwin` WebKit) while serving an installable Progressive Web App (PWA) over secure local Wi-Fi/Tailscale so iPhone, iPad, or secondary laptops connect with full WebRTC microphone and touch access.

---

## Repository Structure

~~~text
flowpulse/
├── README.md                          # Project overview & Apple Silicon MLX architecture
├── docs/
│   ├── ARCHITECTURE.md                # System topology, Metal MLX stack & package manifests
│   ├── DATA_MODEL_AND_ENGINE.md       # Schemas, +5 CRUD numbering engine & layout spec
│   ├── AI_VOICE_AND_VLM_SPEC.md       # Metal MLX STT/VLM/TTS pipeline, Smart Turn v3 & AI tools
│   └── ROADMAP_AND_SETUP.md           # Phased build checklist, HTTPS mic setup & macOS .dmg build
├── apps/
│   ├── web-pwa/                       # React 19 + TypeScript + Vite + XYFlow + Yjs PWA
│   └── desktop-shell/                 # Tauri v2 macOS arm64 wrapper (.app / .dmg)
├── services/
│   └── host-engine/                   # Python 3.12 FastAPI + Pipecat + Apple MLX + SQLite
└── scripts/
    ├── setup_mac.sh                   # One-command macOS Apple Silicon environment bootstrap
    ├── setup_models.py                # Metal MLX model downloader & benchmark (Parakeet + MLX-Audio)
    └── build_sidecar.py               # PyInstaller arm64 sidecar bundler for Tauri macOS .dmg
~~~

---

## Target Hardware & Native Apple Metal / MLX Stack

All AI inference runs locally on Apple Silicon unified memory via **Apple Metal / MLX** with zero cloud API fees:

| Subsystem | Active Model & Runtime | Memory Footprint | Measured Performance (Apple M5 64 GB) |
| :--- | :--- | :--- | :--- |
| **Speech-to-Text (STT)** | `mlx-community/parakeet-tdt-0.6b-v3` (`parakeet-mlx` bf16) | `~2.5 GB` | Zero silence hallucinations; ultra-low Metal RTF |
| **Turn-Taking & VAD** | `Silero VAD v5` (`stop_secs=0.2`) + `LocalSmartTurnAnalyzerV3` | `<100 MB` | `<120 ms` barge-in cutoff; thinking-pause aware |
| **Brain, Tools & Vision** | `qwen3.5:35b-a3b` (Ollama Metal MLX, 35B MoE / 3B active, `think=False`, `keep_alive=-1`) | `~21 GB` (pinned) | `~990 ms` full warm turn + multi-tool execution |
| **Conversational TTS** | `mlx-audio`: `Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16` / `csm-1b` / `Kokoro-82M-bf16` | `~0.4–6.2 GB` | `RTF = 0.78` (`Qwen3-TTS`) / `RTF = 0.071` (`Kokoro-bf16`) |

---

## Documentation Index

- **[System Architecture & Tech Stack](./docs/ARCHITECTURE.md)** — End-to-end topology, Apple Silicon MLX packages, `package.json` and `pyproject.toml` manifests, and CRDT synchronization design.
- **[Data Model & +5 CRUD Rules Engine](./docs/DATA_MODEL_AND_ENGINE.md)** — TypeScript/SQLite schemas, deterministic `+5` numbering & mid-stream insertion logic, and ELKjs auto-layout config.
- **[Local Voice, Barge-In & VLM Pipeline](./docs/AI_VOICE_AND_VLM_SPEC.md)** — Pipecat + SmallWebRTC + Metal MLX audio graph, Smart Turn v3, VLM snapshot triggers, atomic AI tool definitions, and Facilitator persona.
- **[Build Roadmap & macOS Setup Guide](./docs/ROADMAP_AND_SETUP.md)** — Implementation milestones, iOS/macOS PWA HTTPS microphone setup, and compiling the standalone macOS `.app` / `.dmg`.
