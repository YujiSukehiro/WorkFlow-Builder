import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";
import { FlowEdge, FlowNode } from "../types/flow";

const elk = new ELK();

export const RESULT_MAP_ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.spacing.nodeNode": "65",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
};

export async function computeOrthogonalLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  respectPinned = true
): Promise<Map<string, { x: number; y: number }>> {
  if (nodes.length === 0) return new Map();
  const graph: ElkNode = {
    id: "root",
    layoutOptions: RESULT_MAP_ELK_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: 190,
      height: 110,
      ...(respectPinned && n.positionPinnedByUser ? { x: n.position.x, y: n.position.y } : {}),
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.sourceNodeId], targets: [e.targetNodeId] })),
  };

  const laidOut = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laidOut.children ?? []) {
    const orig = nodes.find((n) => n.id === child.id);
    positions.set(
      child.id,
      respectPinned && orig?.positionPinnedByUser
        ? orig.position
        : { x: Math.round(child.x ?? 80), y: Math.round(child.y ?? 80) }
    );
  }
  return positions;
}
