export type CrudOperation = "C" | "R" | "U" | "D";

export type FlowNodeKind =
  | "trigger"
  | "step"
  | "milestone"
  | "terminal";

export type CanvasVisualMode = "sticky-workshop" | "result-map";

export type WorkshopPhase = 1 | 2 | 3 | 4;

export interface WorkshopPhaseInfo {
  phase: WorkshopPhase;
  shortLabel: string;
  title: string;
  hint: string;
}

export const WORKSHOP_PHASES: WorkshopPhaseInfo[] = [
  {
    phase: 1,
    shortLabel: "P1 · Branching",
    title: "Trigger & Exhaustive Branching",
    hint: "Establish trigger, keep stickies <=4 words, and resolve every open leaf.",
  },
  {
    phase: 2,
    shortLabel: "P2 · 100s & CRUD",
    title: "100s Sections & +5 CRUD Wiring",
    hint: "Group into 100s buckets, verify C/R/U/D & guard conditions, slot missed steps.",
  },
  {
    phase: 3,
    shortLabel: "P3 · Friction",
    title: "Blue & Red Friction Heatmap",
    hint: "Stamp Blue stickies on slowest queues and Red stickies on rework/error hotspots.",
  },
  {
    phase: 4,
    shortLabel: "P4 · Sign-Off",
    title: "Normalize +5s & Result Map Sign-Off",
    hint: "Confirm AI drafts, normalize +5 sequence, and export Result Map Poster + SOP.",
  },
];

export interface FlowSection {
  id: string;
  prefix: number;
  name: string;
  stickyColorHex: string;
  sortOrder: number;
}

export interface FlowNode {
  id: string;
  sectionPrefix: number;
  label: string;
  notes: string;
  kind: FlowNodeKind;
  isSlow: boolean;
  slowNote: string;
  hasProblem: boolean;
  problemNote: string;
  position: { x: number; y: number };
  positionPinnedByUser: boolean;
  createdBy: "human" | "ai";
  aiStatus: "confirmed" | "draft";
}

export interface FlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sectionPrefix: number;
  stepNumber: number;
  crud: CrudOperation;
  condition: string;
}

export interface BoardHealthAudit {
  openLeafIds: string[];
  draftNodeIds: string[];
  verboseNodeIds: string[];
  nonMultipleOfFiveEdgeIds: string[];
  hasTrigger: boolean;
  hasTerminal: boolean;
  readyForSignoff: boolean;
}

export interface ProjectSummary {
  id: string;
  title: string;
  visualMode: CanvasVisualMode;
  activePhase: WorkshopPhase;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

export interface ProjectBundle {
  projectId?: string;
  projectTitle: string;
  visualMode?: CanvasVisualMode;
  activePhase?: WorkshopPhase;
  exportedAt: string;
  sections: FlowSection[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}
