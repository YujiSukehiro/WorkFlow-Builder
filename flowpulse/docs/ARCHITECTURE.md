# System Architecture & Apple Silicon MLX Tech Stack

## 1. High-Level Topology

FlowPulse uses a **macOS Apple Silicon Metal Host + Thin Installable PWA** architecture. Your Apple M5 (64 GB Unified Memory) runs the multimodal MoE brain, Metal MLX speech models, and deterministic graph engine inside a local Python sidecar wrapped by Tauri v2 (`.app` / `.dmg`), while simultaneously exposing a local endpoint so iPhones, iPads, and laptops connect as collaborative peers.

~~~text
+-----------------------------------------------------------------------------+
|                        CLIENT SURFACES (UI & AUDIO)                         |
|    [macOS Desktop .app/.dmg (Tauri v2 WebKit)]   [iPhone / iPad PWA (LAN)]  |
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
|  | - Silero VAD v5 (0.2s stop) |      | - 100s Section Manager           |  |
|  | - LocalSmartTurnAnalyzerV3  |----->| - +5 Step Allocator & Slotting   |  |
|  | - <120ms Barge-In Canceler  |      | - <= 4 Word Compression Check    |  |
|  +--------------+--------------+      | - Yjs pycrdt State Bridge        |  |
|                 |                     +-----------------+----------------+  |
+-----------------+---------------------------------------+-------------------+
                  |                                       |
                  v                                       v
+-------------------------------------+   +-----------------------------------+
|   APPLE M5 METAL / MLX INFERENCE    |   |     PERSISTENCE & COMPILERS       |
| - STT: parakeet-mlx (0.6b-tdt-v3)   |   | - SQLite + SQLModel (WAL mode)    |
| - VLM: Ollama qwen3.5:35b-a3b (MoE) |   | - Binary Yjs Snapshot History     |
| - TTS: mlx-audio (Qwen3/CSM/Kokoro) |   | - Export: SVG / Markdown / JSON   |
+-------------------------------------+   +-----------------------------------+
~~~

---

## 2. Opinionated Language & Package Decisions

### Why These Exact Choices on Apple Silicon?

1. **Frontend (`TypeScript` + `React 19` + `@xyflow/react` + `ELKjs`):**
   - `@xyflow/react` gives full DOM/SVG control over custom circular Result Map nodes, tactile sticky-note cards, custom orthogonal edges with `+5 CRUD` pills, and 60 FPS pan/zoom.
   - `elkjs` (`layered` algorithm) guarantees deterministic left-to-right orthogonal layout matching professional Result Maps so the AI never dumps overlapping boxes onto the canvas.
2. **Multiplayer Human + AI State (`Yjs` + `pycrdt-websocket`):**
   - Because the AI puts stickies down *while* you drag or rename another sticky, standard REST calls cause race conditions.
   - Using **Yjs CRDTs** (`Y.Map` for nodes, edges, and sections) makes the AI just another collaborative peer on the board with separate human vs. AI undo/redo stacks.
3. **macOS Native App (`Tauri v2` + `aarch64-apple-darwin` Sidecar):**
   - Uses native macOS WebKit (~8 MB bundle) instead of a 200 MB Electron runtime, spawning the compiled arm64 `flowpulse-host-engine-aarch64-apple-darwin` sidecar cleanly on launch.
4. **Full-Duplex Voice & Metal MLX Inference (`Pipecat` + `SmallWebRTC` + `MLX`):**
   - `pipecat-ai` (`1.16+`) orchestrates frame-level interruption (`UserStartedSpeakingFrame` cancels in-flight LLM/TTS audio in `<120ms`) paired with `LocalSmartTurnAnalyzerV3` so thinking pauses never cut you off mid-thought.
   - `parakeet-mlx` (`parakeet-tdt-0.6b-v3`) and `mlx-audio` (`Qwen3-TTS-0.6B-bf16` / `CSM-1B` / `Kokoro-82M-bf16`) execute natively on Apple M5 Metal GPU cores alongside `qwen3.5:35b-a3b` pinned in 64 GB unified memory (`OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_FLASH_ATTENTION=1`, `think=False`).

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
description = "Apple Silicon Metal MLX voice, VLM, and deterministic Result Map engine"
requires-python = ">=3.12,<3.13"
dependencies = [
    "fastapi>=0.115.8",
    "uvicorn[standard]>=0.34.0",
    "websockets>=14.2",
    "pipecat-ai[silero,webrtc,ollama]>=0.0.102",
    "aiortc>=1.9.0",
    "mlx>=0.22.0",
    "parakeet-mlx",
    "mlx-audio",
    "misaki[en]",
    "huggingface-hub>=0.27.0",
    "soundfile>=0.13.1",
    "numpy>=2.1.0",
    "ollama>=0.4.7",
    "pycrdt>=0.10.9",
    "pycrdt-websocket>=0.15.3",
    "sqlmodel>=0.0.22",
    "aiosqlite>=0.21.0",
    "pydantic>=2.10.6",
    "pillow>=11.1.0",
    "jinja2>=3.1.5"
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

1. **Draft Glow (`aiStatus: "draft"`):** Any sticky note placed by the AI gently pulses with a teal border. Clicking confirm locks it in; clicking `×` removes it cleanly.
2. **Actor-Scoped Undo (`Y.UndoManager`):**
   - Every local client touch/mouse mutation tags the Yjs transaction with `origin = "human"`.
   - Every AI tool-call mutation tags the Yjs transaction with `origin = "ai-agent"`.
   - The UI exposes both **`Undo Mine` (`Cmd+Z`)** and **`Undo AI` (`Cmd+Shift+Z`)** so reverting an AI suggestion never wipes out manual layout edits you just made.
