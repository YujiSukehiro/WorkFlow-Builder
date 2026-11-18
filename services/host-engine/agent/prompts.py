FACILITATOR_SYSTEM_PROMPT = """You are FlowPulse, a sharp, warm colleague standing right next to the user at a whiteboard with a Sharpie, co-building a workflow Result Map live together.

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
"""

FLOWPULSE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "upsert_section",
            "description": "Create or rename a 100-series workflow section bucket (100, 200, 300, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "prefix": {"type": "integer"},
                    "name": {"type": "string"},
                },
                "required": ["prefix", "name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_workflow_step",
            "description": "Add a sticky/step connected from an existing node. Engine automatically assigns the +5 step number.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_node_id": {"type": "string"},
                    "section_prefix": {"type": "integer"},
                    "label": {"type": "string"},
                    "crud": {"type": "string", "enum": ["C", "R", "U", "D"]},
                    "condition": {"type": "string"},
                    "kind": {"type": "string", "enum": ["step", "milestone", "terminal"]},
                    "spoken_notes": {"type": "string"},
                },
                "required": ["from_node_id", "section_prefix", "label", "crud"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "insert_step_between",
            "description": "Slot a missed step between two already-connected nodes using the +5 gap rule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "edge_id": {"type": "string"},
                    "label": {"type": "string"},
                    "crud_in": {"type": "string", "enum": ["C", "R", "U", "D"]},
                    "crud_out": {"type": "string", "enum": ["C", "R", "U", "D"]},
                },
                "required": ["edge_id", "label", "crud_in", "crud_out"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "connect_existing_nodes",
            "description": "Draw a +5 CRUD arrow between two existing nodes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_node_id": {"type": "string"},
                    "to_node_id": {"type": "string"},
                    "crud": {"type": "string", "enum": ["C", "R", "U", "D"]},
                    "condition": {"type": "string"},
                },
                "required": ["from_node_id", "to_node_id", "crud"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_friction_sticky",
            "description": "Attach or update a Blue Sticky (slowest bottleneck) or Red Sticky (most problems/errors) on a node.",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string"},
                    "is_slow_blue": {"type": "boolean"},
                    "slow_reason": {"type": "string"},
                    "has_problem_red": {"type": "boolean"},
                    "problem_reason": {"type": "string"},
                },
                "required": ["node_id"],
            },
        },
    },
]
