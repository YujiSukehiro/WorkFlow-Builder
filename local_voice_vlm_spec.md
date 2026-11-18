# Local Voice, Barge-In & VLM Facilitator Specification

## 1. Real-Time Full-Duplex Audio Architecture

To feel like you are standing at a whiteboard with a sharp human facilitator—who listens, chimes in, puts up stickies while talking, and immediately yields the floor when you interrupt—FlowPulse runs a fully local **Pipecat** pipeline over **SmallWebRTC**.

~~~text
[Phone / PC Mic]
       |  WebRTC Opus Track (Echo-Canceled in Browser)
       v
[SmallWebRTCInputTransport]
       |  16kHz PCM Audio Frames (20ms chunks)
       v
[Silero VAD v5 + Smart Turn v2 Analyzer]
       |---> Emits `UserStartedSpeakingFrame` (instant <120ms Barge-In cancel!)
       |---> Buffers speech until semantic end-of-turn (`UserStoppedSpeakingFrame`)
       v
[FasterWhisperSTTService (large-v3-turbo)]
       |  Transcribed Text + Compact Graph Digest (+ Optional WebP Canvas Frame)
       v
[OllamaLLMService (Qwen2.5-VL-7B / 32B)]
       |---> Streams `FunctionCall` -> Executes Yjs Graph Tool Immediately!
       |---> Streams conversational reply tokens sentence-by-sentence
       v
[KokoroTTSService (kokoro-onnx, voice="af_heart" or "am_michael")]
       |  24kHz PCM Audio Frames
       v
[SmallWebRTCOutputTransport] ---> [Phone / PC Speaker]
~~~

### Why `Smart Turn v2` Matters Alongside `Silero VAD`
When people map workflows out loud, they pause mid-sentence to think: *"Okay so after intake... [1.2s pause] ...accounting checks the budget."*
- Standard VAD cuts you off during that 1.2s pause.
- **Smart Turn v2** (tiny local audio-prosody model built into Pipecat) inspects intonation and phrasing to distinguish *thinking pauses* from *finished turns*, while still allowing instant barge-in the moment you talk over the AI.

---

## 2. Hybrid VLM Visual Grounding Strategy

Running full vision inference on *every* spoken turn adds `600–1200ms` of unnecessary prefill latency when 85% of turns only need structural graph context. FlowPulse uses a **2-Tier Context Router**:

### Tier 1: Fast Compact Graph Digest (Sent Every Turn — `<350 tokens`)
Every turn injects a compact, token-optimized state summary into the system context:
~~~text
ACTIVE_PHASE: 2 (100s +5 & CRUD)
USER_SELECTED_NODE: n_210 ("Budget Checked" in 200s)
OPEN_UNFINISHED_LEAVES: [n_210, n_405]
SECTIONS: 0:Trigger, 100:Capex, 200:Ops, 400:Contracts
EDGES:
- n_trig --[100 C]--> n_req
- n_req --[105 C (If Capex)]--> n_105
- n_req --[205 C (If Ops)]--> n_210 [RED_PROBLEM]
~~~

### Tier 2: On-Demand VLM Snapshot (`Qwen2.5-VL` Vision Frame)
The client automatically attaches a `1024px` WebP snapshot of the canvas (with the user's live cursor/selection highlighted in bright magenta) OR a phone camera photo when any of these triggers fire:
1. **Deictic / Spatial Speech:** Transcript contains spatial words (*"right here"*, *"this messy part"*, *"these two branches"*, *"look at the bottom"*, *"where I'm pointing"*).
2. **Recent Manual Drag Burst:** The user manually dragged `3+` sticky notes into visual clusters without connecting arrows yet (*"Can you wire up the cluster I just arranged?"*).
3. **Physical Wall Import:** User snaps a photo of real sticky notes or an existing whiteboard flow from the mobile PWA camera to digitize into editable nodes.

---

## 3. Atomic Tool Declarations Exposed to `Qwen2.5-VL`

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
          "prefix": { "type": "integer", "description": "Multiple of 100, e.g. 100, 200, 300" },
          "name": { "type": "string", "description": "Short 1-3 word section title, e.g. Intake, Fleet" }
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
          "label": { "type": "string", "description": "MUST be 2 to 4 words max, e.g. Budget Reviewed" },
          "crud": { "type": "string", "enum": ["C", "R", "U", "D"] },
          "condition": { "type": "string", "description": "Optional branch condition, e.g. If > $2500" },
          "kind": { "type": "string", "enum": ["step", "milestone", "terminal"] },
          "spoken_notes": { "type": "string", "description": "Extra context spoken by the user" }
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
          "edge_id": { "type": "string", "description": "Existing edge ID to split" },
          "label": { "type": "string", "description": "2 to 4 words max" },
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
      "description": "Draw a +5 CRUD arrow between two existing nodes (e.g. closing a branch into Invoice Paid).",
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

## 4. Facilitator System Prompt (`services/host-engine/agent/prompts.py`)

~~~text
You are FlowPulse, an energetic, sharp teammate co-building a workflow Result Map live on a shared board with the user.

CORE FACILITATION RULES:
1. ACT FIRST ON THE BOARD: Whenever the user describes steps, branches, delays, or problems, immediately call your graph tools (`add_workflow_step`, `insert_step_between`, `set_friction_sticky`) so stickies appear as you respond.
2. ULTRA-CONCISE STICKIES: Node labels MUST be 2–4 words (`Scope Identified`, `PO Issued`). Put extra details into `spoken_notes`.
3. HUNT UNFINISHED BRANCHES: Check `OPEN_UNFINISHED_LEAVES` in context. Keep asking natural follow-ups ("What happens if that quote gets rejected?") until zero dangling branches remain.
4. CRUD & +5 AWARENESS: Infer C (Create), R (Read), U (Upsert), or D (Delete) naturally from what happens to the underlying record, and briefly confirm if ambiguous.
5. LISTEN FOR PAIN: If the user mentions waiting, queues, or delays, drop a BLUE sticky (`is_slow_blue=true`). If they mention mistakes, missing info, or rework, drop a RED sticky (`has_problem_red=true`).
6. SPEAK LIKE A HUMAN TEAMMATE AT A WHITEBOARD: Keep spoken responses to 1–2 short sentences max. Never read raw UUIDs aloud—use step numbers ("around 210") or short node names.
~~~