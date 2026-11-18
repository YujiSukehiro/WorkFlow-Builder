# FlowPulse — Local AI Collaborative Result Map Studio

FlowPulse is a **100% local, privacy-first, voice-and-vision AI workflow mapping studio**. It recreates the collaborative energy of a physical sticky-note process-mapping workshop—where you talk naturally with an AI teammate that places sticky notes, breaks down every workflow branch until none remain, assigns `100s` section prefixes and `+5` `CRUD` transitions (`105, 110, 115...`), flags **Blue (Slowest)** and **Red (Most Problems)** hotspots, and compiles everything into a clean **Result Map** poster and SOP specification.

---

## Core Product Goals

1. **AI-First Board Co-Creation:** You talk naturally through a workflow; the AI puts up and wires sticky notes live on the canvas while you speak. Both you and the AI can physically drag, edit, re-wire, or undo changes simultaneously with zero state conflicts.
2. **Full-Duplex Natural Voice & Barge-In:** Speak over or interrupt the AI mid-sentence just like a human teammate at a whiteboard (`<150ms` barge-in cutoff).
3. **Methodology Guardrails Built In:**
   - **Minimal Words:** Node labels are strictly compressed to `2–4` words (`Purchase Req Submitted`), storing verbose context in attached metadata.
   - **Exhaustive Branching:** The AI tracks open leaf nodes and proactively asks *"What happens if this is rejected?"* until every branch resolves.
   - **100s Sections & +5 Numbering:** Sections group into `100s, 200s, 300s...` while arrows increment by `+5` (`105, 110, 115`) so missed steps slot cleanly in between without breaking downstream IDs.
   - **CRUD Edge Semantics:** Every arrow explicitly declares whether a **Create (`C`)**, **Read (`R`)**, **Upsert (`U`)**, or **Delete (`D`)** action happens between steps.
   - **Blue & Red Friction Heatmap:** Stamp **Blue Stickies** on the slowest cycle-time bottlenecks and **Red Stickies** on high-error problem areas.
4. **Dual Deployment (Desktop `.exe` + Mobile/Laptop PWA):** Runs locally on your main GPU PC as a standalone Windows `.exe` (via Tauri v2) while serving an installable Progressive Web App (PWA) over secure local Wi-Fi/Tailscale so you can use your phone or laptop mic and touch screen from anywhere in the room.

---

## Repository Structure

~~~text
flowpulse/
├── README.md                          # Project overview & quick links
├── docs/
│   ├── ARCHITECTURE.md                # System topology, tech stack & package manifests
│   ├── DATA_MODEL_AND_ENGINE.md       # Schemas, +5 CRUD numbering engine & layout spec
│   ├── AI_VOICE_AND_VLM_SPEC.md       # Local STT/VLM/TTS pipeline, barge-in & AI tools
│   └── ROADMAP_AND_SETUP.md           # Phased build checklist, HTTPS mic setup & .exe build
├── apps/
│   ├── web-pwa/                       # React 19 + TypeScript + Vite + XYFlow + Yjs PWA
│   └── desktop-shell/                 # Tauri v2 Rust wrapper + system tray launcher
├── services/
│   └── host-engine/                   # Python 3.12 FastAPI + Pipecat + SQLite + Exporters
└── scripts/
    ├── setup_models.py                # One-command local downloader (Whisper, Qwen-VL, Kokoro)
    └── build_sidecar.py               # PyInstaller freeze script for Tauri .exe bundling
~~~

---

## Recommended Hardware & Local Model Tiers

All AI inference runs locally on your host PC GPU with zero cloud API fees:

| GPU VRAM Tier | Speech-to-Text (STT) | Brain & Vision (Ollama VLM) | Text-to-Speech (TTS) | Expected Voice Turn Latency |
| :--- | :--- | :--- | :--- | :--- |
| **8 GB VRAM** | `faster-whisper` (`small.en` INT8) | `qwen2.5vl:3b-q8_0` | `Kokoro-82M` (ONNX FP16) | `~550 ms` |
| **12–16 GB VRAM** | `faster-whisper` (`large-v3-turbo` INT8) | `qwen2.5vl:7b-q4_K_M` | `Kokoro-82M` (ONNX FP16) | `~420 ms` |
| **24 GB+ VRAM** | `faster-whisper` (`large-v3-turbo` FP16) | `qwen2.5vl:32b-q4_K_M` | `Kokoro-82M` (ONNX FP16) | `~380 ms` |

---

## Documentation Index

- **[System Architecture & Tech Stack](./docs/ARCHITECTURE.md)** — End-to-end topology, chosen frameworks, exact `package.json` and `pyproject.toml` dependencies, and CRDT synchronization design.
- **[Data Model & +5 CRUD Rules Engine](./docs/DATA_MODEL_AND_ENGINE.md)** — TypeScript/SQLite schemas, deterministic `+5` numbering & mid-stream insertion logic, and ELKjs auto-layout config.
- **[Local Voice, Barge-In & VLM Pipeline](./docs/AI_VOICE_AND_VLM_SPEC.md)** — Pipecat audio graph, WebRTC transport, VLM snapshot triggers, atomic AI tool definitions, and Facilitator system prompt.
- **[Build Roadmap & Local Setup Guide](./docs/ROADMAP_AND_SETUP.md)** — 5-phase implementation plan, solving iOS/Android PWA microphone HTTPS rules, and compiling the standalone `.exe`.