export type CrudOperation = "C" | "R" | "U" | "D";

export type FlowNodeKind =
  | "trigger"
  | "step"
  | "milestone"
  | "terminal";

export type CanvasVisualMode = "sticky-workshop" | "result-map";

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
