# System Architecture & Opinionated Tech Stack

## 1. High-Level Topology

FlowPulse uses a **Local GPU Host + Thin Installable PWA** architecture. Your main desktop GPU runs the heavy AI models and graph engine inside a local Python sidecar wrapped by Tauri v2 (`.exe`), while simultaneously exposing a secure local web endpoint so phones, tablets, and laptops connect as first-class collaborative clients.

~~~text
+-----------------------------------------------------------------------------+
|                        CLIENT SURFACES (UI & AUDIO)                         |
|   [Windows Desktop .exe (Tauri v2 WebView2)]    [Phone / Laptop PWA (LAN)]  |
|                      |                                       |              |
|                      +-------------------+-------------------+              |
|                                          |                                  |
|            React 19 + XYFlow Canvas + ELKjs WebWorker + Tailwind v4         |
+---------------------------------+------------------------+------------------+
                                  |                        |
             SmallWebRTC Audio    |                        |  Yjs WebSocket
             (Opus 16kHz/24kHz)   |                        |  (CRDT Graph Sync)
                                  v                        v
+-----------------------------------------------------------------------------+
|                   LOCAL PYTHON HOST ENGINE (FastAPI + Pipecat)              |
|                                                                             |
|  +-----------------------------+      +----------------------------------+  |
|  | Real-Time Audio Pipeline    |      | Deterministic Graph & CRUD Core  |  |
|  | - Silero VAD v5             |      | - 100s Section Manager           |  |
|  | - Smart Turn v2             |----->| - +5 Step Allocator & Slotting   |  |
|  | - Barge-In Task Canceler    |      | - <= 4 Word Compression Check    |  |
|  +--------------+--------------+      | - Yjs pycrdt State Bridge        |  |
|                 |                     +-----------------+----------------+  |
+-----------------+---------------------------------------+-------------------+
                  |                                       |
                  v                                       v
+-------------------------------------+   +-----------------------------------+
|     LOCAL GPU INFERENCE RUNTIME     |   |     PERSISTENCE & COMPILERS       |
| - STT: faster-whisper (v3-turbo)    |   | - SQLite + SQLModel (WAL mode)    |
| - LLM/VLM: Ollama (Qwen2.5-VL)      |   | - Binary Yjs Snapshot History     |
| - TTS: Kokoro-82M (kokoro-onnx)     |   | - Export: SVG / PDF / Markdown    |
+-------------------------------------+   +-----------------------------------+
~~~

---

## 2. Opinionated Language & Package Decisions

### Why These Exact Choices?

1. **Frontend (`TypeScript` + `React 19` + `@xyflow/react` + `ELKjs`):**
   - `@xyflow/react` gives full DOM/SVG control over custom circular Result Map nodes, tactile sticky-note cards, custom orthogonal edges with `+5 CRUD` pills, and 60 FPS pan/zoom.
   - `elkjs` (`layered` algorithm) guarantees deterministic left-to-right orthogonal layout similar to professional Result Maps so the AI never dumps overlapping boxes onto the canvas.
2. **Multiplayer Human + AI State (`Yjs` + `pycrdt-websocket`):**
   - Because the AI puts stickies down *while* you might be dragging or renaming another sticky, standard REST calls cause race conditions and overwritten work.
   - Using **Yjs CRDTs** (`Y.Map` for nodes, edges, and sections) on both the React client and Python backend (`pycrdt`) makes the AI just another collaborative peer on the board with separate human vs. AI undo/redo stacks.
3. **Desktop Executable (`Tauri v2` + `PyInstaller` Sidecar):**
   - Electron bundles a massive ~200MB Chromium runtime. **Tauri v2** uses native OS WebView2 (~8MB binary) and natively manages spawning/killing a compiled Python `host-engine.exe` sidecar on startup/exit.
4. **Voice Orchestration (`Pipecat` + `SmallWebRTC`):**
   - `pipecat-ai` is purpose-built in Python for real-time full-duplex voice agents with frame-level interruption (`UserStartedSpeakingFrame` immediately cancels in-flight LLM/TTS audio frames).
   - `SmallWebRTC` provides local peer-to-peer WebRTC with browser echo cancellation (AEC) without needing LiveKit cloud servers or external TURN infrastructure.

---

## 3. Frontend Package Manifest (`apps/web-pwa/package.json`)

~~~json
{
  "name": "@flowpulse/web-pwa",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@xyflow/react": "^12.4.4",
    "clsx": "^2.1.1",
    "elkjs": "^0.9.3",
    "html-to-image": "^1.11.13",
    "lucide-react": "^0.475.0",
    "qrcode.react": "^4.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.1",
    "y-indexeddb": "^9.0.12",
    "y-websocket": "^2.0.4",
    "yjs": "^13.6.24",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "@tauri-apps/api": "^2.2.0",
    "@tauri-apps/cli": "^2.2.7",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "tailwindcss": "^4.0.6",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vite-plugin-pwa": "^0.21.1"
  }
}
~~~

---

## 4. Python Backend Package Manifest (`services/host-engine/pyproject.toml`)

~~~toml
[project]
name = "flowpulse-host-engine"
version = "0.1.0"
description = "Local GPU voice, VLM, and deterministic Result Map engine"
requires-python = ">=3.12,<3.13"
dependencies = [
    "fastapi>=0.115.8",
    "uvicorn[standard]>=0.34.0",
    "websockets>=14.2",
    "pipecat-ai[silero,webrtc,ollama,whisper]>=0.0.58",
    "aiortc>=1.9.0",
    "faster-whisper>=1.1.1",
    "kokoro-onnx>=0.4.4",
    "soundfile>=0.13.1",
    "numpy>=2.1.0",
    "ollama>=0.4.7",
    "pycrdt>=0.10.9",
    "pycrdt-websocket>=0.15.3",
    "sqlmodel>=0.0.22",
    "aiosqlite>=0.21.0",
    "pydantic>=2.10.6",
    "pillow>=11.1.0",
    "jinja2>=3.1.5",
    "weasyprint>=64.0"
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.4",
    "pytest-asyncio>=0.25.3",
    "ruff>=0.9.6",
    "pyinstaller>=6.12.0"
]
~~~

---

## 5. Dual-Origin Undo & Confidence UX

When co-building a workflow with an AI, trust depends on easy correction:

1. **Draft Glow (`aiConfidence: "draft"`):** Any sticky note or CRUD edge placed by the AI gently pulses with a teal border for 8 seconds (or until the next turn). Tapping it confirms it; tapping `×` removes it and automatically notifies the AI context (`User rejected step 215`).
2. **Actor-Scoped Undo (`Y.UndoManager`):**
   - Every local client touch/mouse mutation tags the Yjs transaction with `origin = "human"`.
   - Every Python tool-call mutation tags the Yjs transaction with `origin = "ai-agent"`.
   - The UI exposes both **`Undo My Edit` (`Ctrl+Z`)** and **`Undo Last AI Action` (`Ctrl+Shift+Z`)** so reverting an AI hallucination never wipes out manual layout tweaks you just made.