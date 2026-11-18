# Data Model, +5 CRUD Rules Engine & Layout Specification

## 1. Core Design Principle

**Never let the LLM compute `+5` step numbers or `(x, y)` coordinates directly.**
LLMs excel at extracting workflow logic, conditions, and CRUD actions from natural speech, but they frequently collide step numbers during long sessions. FlowPulse separates responsibilities strictly:

- **AI Facilitator:** Decides *semantic graph intent* (e.g., *"Add a step after node `n_105` in section `200` with label `'Purchase Amount Checked'` via a `Read` action"*).
- **Deterministic Graph Engine:** Allocates exact `+5` numbers, enforces the `<= 4 words` rule, updates the shared Yjs CRDT document, and triggers `ELKjs` orthogonal auto-layout.

---

## 2. Shared TypeScript Schema (`apps/web-pwa/src/types/flow.ts`)

~~~typescript
export type CrudOperation = "C" | "R" | "U" | "D";

export type FlowNodeKind =
  | "trigger"      // Green boxed circle ("Need Established")
  | "step"         // Standard white circle (or colored sticky in Workshop Mode)
  | "milestone"    // Orange circle ("PO Issued", "Contract Signed")
  | "terminal";    // Red/Green terminal completion circle ("Invoice Paid", "Rejected")

export type CanvasVisualMode = "sticky-workshop" | "result-map";

export interface FlowSection {
  id: string;              // e.g., "sec_100"
  prefix: number;          // Multiples of 100: 0, 100, 200, 300, 400...
  name: string;            // e.g., "Intake", "Capex Approval", "Fleet"
  stickyColorHex: string;  // Used in Sticky Workshop mode
  sortOrder: number;
}

export interface FlowNode {
  id: string;              // Stable UUID (never changes even if step numbers resequence)
  sectionPrefix: number;   // 0, 100, 200, etc.
  label: string;           // Strictly concise: target 2-4 words
  notes: string;           // Full spoken nuance / detail captured during chat
  kind: FlowNodeKind;

  // Friction Stickies (Phase 3 of Workshop)
  isSlow: boolean;         // Blue Sticky: Slowest cycle-time bottleneck
  slowNote: string;        // e.g., "Sits in manager inbox 4 days avg"
  hasProblem: boolean;     // Red Sticky: Highest error / rework rate
  problemNote: string;     // e.g., "Wrong GL code selected 30% of the time"

  // Collaborative Position & Provenance
  position: { x: number; y: number };
  positionPinnedByUser: boolean; // If true, ELK auto-layout respects manual placement
  createdBy: "human" | "ai";
  aiStatus: "confirmed" | "draft";
}

export interface FlowEdge {
  id: string;              // Stable UUID
  sourceNodeId: string;
  targetNodeId: string;
  sectionPrefix: number;   // Matches branch section (e.g., 200)
  stepNumber: number;      // Increments by 5: 205, 210, 215...
  crud: CrudOperation;     // C = Create, R = Read, U = Upsert, D = Delete
  condition: string;       // Optional branch guard, e.g., "If > $2,500"
}
~~~

---

## 3. SQLite Persistence Schema (`services/host-engine/storage/models.py`)

~~~python
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = Field(default="Untitled Process")
    visual_mode: str = Field(default="sticky-workshop")
    yjs_state_blob: Optional[bytes] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConversationTurn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    speaker: str  # "user" | "ai"
    transcript: str
    mutated_ids_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
~~~

---

## 4. The `+5` CRUD Numbering & Auto-Slotting Algorithm

Your training methodology uses increments of `5` (`105, 110, 115, 120...`) specifically so missed actions can be wedged between existing arrows without rewriting the entire board.

### Rule A: Appending a New Sequential or Branch Step
1. Identify `sectionPrefix` (e.g., `200`).
2. Find `max_step` among all edges currently in `sectionPrefix`.
3. If none exist yet, assign `sectionPrefix + 5` (`205`). Otherwise assign `max_step + 5` (`210`, `215`, etc.).

### Rule B: Inserting a Missed Step *Between* Two Connected Nodes (`A -> B`)
Suppose `Node A` connects to `Node B` via `Edge e1` with `stepNumber = 210`, and the downstream chain continues `215 -> 220`:

~~~python
def allocate_inserted_step_numbers(
    prev_step: int, next_downstream_steps: list[int]
) -> tuple[int, int, bool]:
    """
    Splits an existing edge `prev_step` into (first_half_num, second_half_num).
    Uses integer midpoint gap if available before triggering a +5 cascade.
    """
    next_num = min(next_downstream_steps) if next_downstream_steps else (prev_step + 10)
    gap = next_num - prev_step

    if gap >= 2:
        # Clean gap available! E.g. prev=210, next=215 -> keep 210, slot new edge at 212
        slotted_num = prev_step + (gap // 2)
        return prev_step, slotted_num, False

    # Gap exhausted (e.g., 210, 211, 212 all used) -> trigger clean +5 resequence on section
    return prev_step, prev_step + 5, True
~~~

- **During Active Brainstorming:** Slotting `212` between `210` and `215` keeps verbal references consistent (*"Remember step 215 we talked about earlier?"* stays `215`!).
- **One-Click "Normalize +5s" Pass:** Moving to **Phase 4 (Final Result Map)** runs `normalize_section_by_fives(prefix)` in topological order so the final published Result Map displays spotless `205, 210, 215, 220` numbering.

---

## 5. Word-Count Guardrail (`<= 4 Words`)

To maintain the crisp readability of a Result Map:
1. Every AI tool call passes `label` through `validate_concise_label(label, notes)`:
   - Strips filler articles (`the`, `a`, `an`, `is`, `was`).
   - Checks `len(label.split()) <= 4`.
   - Soft warning badge (`Trim!`) renders on the node if a human manually types `5+` words, with a 1-click **"Compress"** button.

---

## 6. ELKjs Orthogonal Layout Configuration

To replicate the clean horizontal swimlanes and crisp right-angle stepped connectors from the Result Map wall board, run `ELKjs` inside a browser Web Worker with these layout options:

~~~json
{
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.spacing.nodeNode": "65",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP"
}
~~~

---

## 7. Automated Output Deliverable Compiler

Clicking **Export Deliverable** compiles three synchronized artifacts from the SQLite + Yjs graph:
1. **Poster Vector Diagram (`.svg` & `.pdf`):** High-resolution Result Map with header block (`Result Map | <PROCESS TITLE>`), green Trigger card, white step circles, orange Milestone circles, `+5 [C/R/U/D]` edge callouts, and Blue/Red friction badges.
2. **Process & CRUD Ledger (`PROCESS_SPEC.md`):**
   - Executive Summary counts (Total Branches, Steps, Blue Bottlenecks, Red Problem Hotspots).
   - Prioritized **Red & Blue Action Table** with spoken root-cause notes.
   - Complete **100s–900s +5 CRUD Data Dictionary** ready to hand to software engineers or operations leads.
3. **Portable Project Bundle (`.flowpulse.json`):** Version-controlled snapshot you can commit directly to Git.