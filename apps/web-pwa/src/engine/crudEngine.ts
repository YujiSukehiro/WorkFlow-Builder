import { FlowEdge, FlowNode, FlowSection } from "../types/flow";

const FILLER_WORDS = new Set(["the", "a", "an", "is", "was", "are", "were", "be", "been", "being"]);

export const SECTION_STICKY_PALETTE: Record<number, string> = {
  0: "#86efac",
  100: "#fde047",
  200: "#fdba74",
  300: "#c4b5fd",
  400: "#f9a8d4",
  500: "#67e8f9",
  600: "#bef264",
  700: "#fca5a5",
  800: "#cbd5e1",
  900: "#fde68a",
};

export function getStickyColorForPrefix(prefix: number): string {
  return SECTION_STICKY_PALETTE[prefix] ?? "#fde047";
}

export function validateConciseLabel(rawLabel: string): {
  cleaned: string;
  wordCount: number;
  needsCompression: boolean;
} {
  const tokens = rawLabel.trim().split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((w, idx) => {
    const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    return !FILLER_WORDS.has(lower) || tokens.length <= 2 || idx === tokens.length - 1;
  });

  const cleaned = (filtered.length > 0 ? filtered : tokens).join(" ");
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return { cleaned, wordCount, needsCompression: wordCount > 4 };
}

export function compressToFourWords(rawLabel: string): string {
  const { cleaned } = validateConciseLabel(rawLabel);
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length <= 4 ? cleaned : words.slice(0, 4).join(" ");
}

export function allocateNextStepNumber(edges: FlowEdge[], sectionPrefix: number): number {
  const sectionEdges = edges.filter((e) => e.sectionPrefix === sectionPrefix);
  if (sectionEdges.length === 0) return sectionPrefix + 5;
  const maxStep = Math.max(...sectionEdges.map((e) => e.stepNumber));
  const rem = maxStep % 5;
  return rem === 0 ? maxStep + 5 : maxStep + (5 - rem);
}

export function allocateInsertedStepNumbers(
  prevStep: number,
  nextDownstreamSteps: number[]
): { firstHalfNum: number; secondHalfNum: number; needsResequence: boolean } {
  const validDownstream = nextDownstreamSteps.filter((s) => s > prevStep);
  const nextNum = validDownstream.length > 0 ? Math.min(...validDownstream) : prevStep + 10;
  const gap = nextNum - prevStep;

  if (gap >= 2) {
    return {
      firstHalfNum: prevStep,
      secondHalfNum: prevStep + Math.floor(gap / 2),
      needsResequence: false,
    };
  }
  return { firstHalfNum: prevStep, secondHalfNum: prevStep + 5, needsResequence: true };
}

export function normalizeSectionByFives(
  nodes: FlowNode[],
  edges: FlowEdge[],
  sectionPrefix?: number
): FlowEdge[] {
  const prefixes =
    sectionPrefix !== undefined
      ? [sectionPrefix]
      : Array.from(new Set(edges.map((e) => e.sectionPrefix))).sort((a, b) => a - b);

  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, FlowEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) ?? 0) + 1);
    outgoing.get(e.sourceNodeId)?.push(e);
  }

  const queue = Array.from(inDegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  const topoRank = new Map<string, number>();
  let rank = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoRank.set(curr, rank++);
    for (const edge of outgoing.get(curr) ?? []) {
      const nextDeg = (inDegree.get(edge.targetNodeId) ?? 1) - 1;
      inDegree.set(edge.targetNodeId, nextDeg);
      if (nextDeg === 0) queue.push(edge.targetNodeId);
    }
  }

  const updated = new Map<string, FlowEdge>(edges.map((e) => [e.id, { ...e }]));
  for (const pfx of prefixes) {
    edges
      .filter((e) => e.sectionPrefix === pfx)
      .sort((a, b) => {
        const ra = topoRank.get(a.sourceNodeId) ?? 9999;
        const rb = topoRank.get(b.sourceNodeId) ?? 9999;
        return ra !== rb ? ra - rb : a.stepNumber - b.stepNumber;
      })
      .forEach((edge, idx) => {
        updated.get(edge.id)!.stepNumber = pfx + (idx + 1) * 5;
      });
  }
  return Array.from(updated.values());
}

export function findOpenUnfinishedLeaves(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const sources = new Set(edges.map((e) => e.sourceNodeId));
  return nodes.filter((n) => n.kind !== "terminal" && !sources.has(n.id));
}

export function buildCompactGraphDigest(
  sections: FlowSection[],
  nodes: FlowNode[],
  edges: FlowEdge[],
  selectedNodeId: string | null
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const selected = selectedNodeId ? nodeMap.get(selectedNodeId) : undefined;
  const openLeaves = findOpenUnfinishedLeaves(nodes, edges);
  const secSummary = [...sections]
    .sort((a, b) => a.prefix - b.prefix)
    .map((s) => `${s.prefix}:${s.name}`)
    .join(", ");

  const edgeLines = [...edges]
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((e) => {
      const target = nodeMap.get(e.targetNodeId);
      const cond = e.condition ? ` (${e.condition})` : "";
      const flags: string[] = [];
      if (target?.isSlow) flags.push("BLUE_SLOW");
      if (target?.hasProblem) flags.push("RED_PROBLEM");
      const flagStr = flags.length ? ` [${flags.join(",")}]` : "";
      return `- ${e.sourceNodeId} --[${e.stepNumber} ${e.crud}${cond}]--> ${e.targetNodeId} ("${target?.label ?? "?"}")${flagStr}`;
    })
    .join("\n");

  return [
    `USER_SELECTED_NODE: ${selected ? `${selected.id} ("${selected.label}" in ${selected.sectionPrefix}s)` : "None"}`,
    `OPEN_UNFINISHED_LEAVES: [${openLeaves.map((n) => `${n.id}:"${n.label}"`).join(", ")}]`,
    `SECTIONS: ${secSummary}`,
    `EDGES:`,
    edgeLines || "(none yet)",
  ].join("\n");
}
