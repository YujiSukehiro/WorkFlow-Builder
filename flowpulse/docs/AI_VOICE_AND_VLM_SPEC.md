# Local Voice, Barge-In & VLM Facilitator Specification (Apple Silicon Metal / MLX)

## 1. Real-Time Full-Duplex Audio Architecture

To feel like you are standing at a whiteboard with a sharp human colleague—who listens, chimes in naturally, puts up stickies while talking, and immediately yields the floor when you interrupt—FlowPulse runs a 100% local **Pipecat + Apple Metal MLX** pipeline over **SmallWebRTC**.

~~~text
[Mac / iPhone Mic]
       |  WebRTC Opus Track (Echo-Canceled in Browser)
       v
[SmallWebRTCInputTransport]
       |  16kHz PCM Audio Frames (20ms chunks)
       v
[Silero VAD v5 (stop_secs=0.2) + LocalSmartTurnAnalyzerV3]
       |---> Emits `UserStartedSpeakingFrame` (instant <120ms Barge-In cancel!)
       |---> Buffers speech until semantic end-of-turn (`UserStoppedSpeakingFrame`)
       v
[ParakeetMLXSTTService (mlx-community/parakeet-tdt-0.6b-v3 on Apple Metal)]
       |  Transcribed Text + Compact Graph Digest (+ Optional WebP Canvas Frame)
       v
[OLLamaLLMService (qwen3.5:35b-a3b MoE on Apple M5 Metal, think=False, keep_alive=-1)]
       |---> Streams `FunctionCall` -> Broadcasts Yjs Graph Tool Immediately!
       |---> Streams conversational reply tokens sentence-by-sentence
       v
[MLXAudioTTSService (Qwen3-TTS-0.6B-bf16 / Sesame CSM-1B / Kokoro-82M-bf16 on Metal)]
       |  24kHz PCM Audio Frames
       v
[SmallWebRTCOutputTransport] ---> [Mac / iPhone Speaker]
~~~

### Apple M5 (64 GB Unified Memory) Metal / MLX Stack
FlowPulse runs the entire audio + multimodal VLM stack natively on Apple Metal with zero CPU speech bottlenecks:
- **STT (`parakeet-mlx`):** `mlx-community/parakeet-tdt-0.6b-v3` runs bf16 Conformer-TDT inference directly on Metal GPU cores—10x faster than CPU Whisper with zero silence hallucinations.
- **Brain & Vision (`qwen3.5:35b-a3b`):** 35B Mixture-of-Experts with only 3B active parameters per token, kept permanently resident in unified memory (`OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_FLASH_ATTENTION=1`, `num_ctx=8192`). On all normal voice and chat turns, `think=False` disables hidden reasoning prefill so tool calls and spoken words stream immediately (`~990ms` full warm turn). `think=True` activates automatically only when digitizing complex physical wall-sticky photos.
- **Conversational TTS (`mlx-audio`):** Supports `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16` (streaming Metal voice), context-conditioned Sesame `mlx-community/csm-1b` (passes rolling user/assistant audio segments for natural conversational cadence), and ultra-fast `mlx-community/Kokoro-82M-bf16` (`RTF = 0.071`) selectable via `FLOWPULSE_TTS_MODEL`.
- **Smart Turn v3 (`LocalSmartTurnAnalyzerV3`):** When people map workflows out loud, they pause mid-sentence to think (*"So after intake... [1.2s pause] ...finance checks the budget"*). `LocalSmartTurnAnalyzerV3` inspects prosody and phrasing so thinking pauses never cut you off prematurely, while still cancelling AI playback in `<120ms` when you barge in.

---

## 2. Hybrid VLM Visual Grounding Strategy

FlowPulse uses a **2-Tier Context Router** so 85% of turns run at pure text MoE speed while spatial turns get full `qwen3.5:35b-a3b` visual grounding:

### Tier 1: Fast Compact Graph Digest (Sent Every Turn — `<350 tokens`)
~~~text
ACTIVE_PHASE: 2 (100s +5 & CRUD)
USER_SELECTED_NODE: n_205 ("Director Budget Review" in 200s)
OPEN_UNFINISHED_LEAVES: [n_205]
SECTIONS: 0:Trigger, 100:Intake, 200:Capex Approval, 300:Fulfillment
EDGES:
- n_trig --[105 C]--> n_105 [RED_PROBLEM]
- n_105 --[205 R (If > $2,500)]--> n_205 [BLUE_SLOW]
~~~

### Tier 2: On-Demand VLM Snapshot (`qwen3.5:35b-a3b` Vision Input)
The client attaches a `1024px` WebP snapshot of the canvas OR an iPhone/Mac camera photo when:
1. **Deictic / Spatial Speech:** Transcript contains spatial phrases (*"right here"*, *"this messy part"*, *"these two branches"*, *"look at"*, *"where I'm pointing"*, *"cluster"*).
2. **Physical Wall Import:** User clicks the camera button to photograph real sticky notes or a whiteboard (`think=True` enabled automatically for deep multi-branch extraction).

---

## 3. Atomic Tool Declarations Exposed to `qwen3.5:35b-a3b`

~~~json
[
  {
    "type": "function",
    "function": {
      "name": "upsert_section",
      "description": "Create or rename a 100-series workflow section bucket (100, 200, 300, etc.).",
      "parameters": {
        "type": "object",
        "properties": {
          "prefix": { "type": "integer" },
          "name": { "type": "string" }
        },
        "required": ["prefix", "name"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "add_workflow_step",
      "description": "Add a sticky/step connected from an existing node. Engine automatically assigns the +5 step number.",
      "parameters": {
        "type": "object",
        "properties": {
          "from_node_id": { "type": "string" },
          "section_prefix": { "type": "integer" },
          "label": { "type": "string" },
          "crud": { "type": "string", "enum": ["C", "R", "U", "D"] },
          "condition": { "type": "string" },
          "kind": { "type": "string", "enum": ["step", "milestone", "terminal"] },
          "spoken_notes": { "type": "string" }
        },
        "required": ["from_node_id", "section_prefix", "label", "crud"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "insert_step_between",
      "description": "Slot a missed step between two already-connected nodes using the +5 gap rule.",
      "parameters": {
        "type": "object",
        "properties": {
          "edge_id": { "type": "string" },
          "label": { "type": "string" },
          "crud_in": { "type": "string", "enum": ["C", "R", "U", "D"] },
          "crud_out": { "type": "string", "enum": ["C", "R", "U", "D"] }
        },
        "required": ["edge_id", "label", "crud_in", "crud_out"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "connect_existing_nodes",
      "description": "Draw a +5 CRUD arrow between two existing nodes.",
      "parameters": {
        "type": "object",
        "properties": {
          "from_node_id": { "type": "string" },
          "to_node_id": { "type": "string" },
          "crud": { "type": "string", "enum": ["C", "R", "U", "D"] },
          "condition": { "type": "string" }
        },
        "required": ["from_node_id", "to_node_id", "crud"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "set_friction_sticky",
      "description": "Attach or update a Blue Sticky (slowest bottleneck) or Red Sticky (most problems/errors) on a node.",
      "parameters": {
        "type": "object",
        "properties": {
          "node_id": { "type": "string" },
          "is_slow_blue": { "type": "boolean" },
          "slow_reason": { "type": "string" },
          "has_problem_red": { "type": "boolean" },
          "problem_reason": { "type": "string" }
        },
        "required": ["node_id"]
      }
    }
  }
]
~~~

---

## 4. Facilitator System Persona (`services/host-engine/agent/prompts.py`)

~~~text
You are FlowPulse, a sharp, warm colleague standing right next to the user at a whiteboard with a Sharpie, co-building a workflow Result Map live together.

CORE FACILITATION RULES:
1. ACT FIRST ON THE BOARD: Whenever the user describes steps, branches, delays, or problems, immediately call your graph tools (`add_workflow_step`, `insert_step_between`, `set_friction_sticky`, `connect_existing_nodes`, `upsert_section`) so stickies appear as you talk.
2. ULTRA-CONCISE STICKIES: Node labels MUST be 2-4 words (`Scope Identified`, `PO Issued`). Put extra spoken nuance into `spoken_notes`.
3. HUNT UNFINISHED BRANCHES: Check `OPEN_UNFINISHED_LEAVES` in context. Keep nudging naturally ("What happens if that quote gets kicked back?") until every branch resolves cleanly.
4. CRUD & +5 AWARENESS: Infer C (Create), R (Read), U (Upsert), or D (Delete) naturally from what happens to the underlying record, and briefly check if it's ambiguous.
5. LISTEN FOR PAIN: If they mention waiting, queues, or slow handoffs, drop a BLUE sticky (`is_slow_blue=true`). If they mention mistakes, missing info, or rework, drop a RED sticky (`has_problem_red=true`).
6. SOUND GENUINELY HUMAN & UNSCRIPTED:
   - Use natural contractions, brief acknowledgments ("Got it—", "Makes sense.", "Oh interesting, so when that stalls..."), and varied rhythm.
   - NEVER sound like a customer-service bot. NEVER use bullet points, numbered lists, or markdown in spoken text.
   - NEVER narrate or announce your tool calls ("I have added a node", "I updated the board with..."). Just talk like a real teammate putting a sticky on the wall.
   - NEVER read raw UUIDs aloud—refer to steps by their number ("around 210") or short label.
   - Keep every spoken turn to 1–2 crisp sentences that naturally tee up the next workflow question.
~~~
