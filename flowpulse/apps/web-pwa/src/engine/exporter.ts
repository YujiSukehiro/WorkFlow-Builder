import { FlowEdge, FlowNode, FlowSection } from "../types/flow";

export function compileProcessSpecMarkdown(
  title: string,
  sections: FlowSection[],
  nodes: FlowNode[],
  edges: FlowEdge[]
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const blueSlow = nodes.filter((n) => n.isSlow);
  const redProblems = nodes.filter((n) => n.hasProblem);

  const lines: string[] = [
    `# Result Map & Process Specification: ${title}`,
    ``,
    `## 1. Executive Summary`,
    `- **Total 100s Sections:** ${sections.length}`,
    `- **Total Workflow Nodes:** ${nodes.length}`,
    `- **Total +5 CRUD Transitions:** ${edges.length}`,
    `- **Blue Stickies (Slowest Cycle-Time Bottlenecks):** ${blueSlow.length}`,
    `- **Red Stickies (High-Error / Rework Hotspots):** ${redProblems.length}`,
    ``,
    `## 2. Prioritized Friction Backlog (Red & Blue Stickies)`,
    `| Type | Section | Step Label | Root-Cause / Spoken Notes |`,
    `| :--- | :--- | :--- | :--- |`,
  ];

  if (blueSlow.length === 0 && redProblems.length === 0) {
    lines.push(`| None | - | No friction hotspots flagged yet | - |`);
  } else {
    for (const n of redProblems) {
      lines.push(
        `| RED (Problem) | ${n.sectionPrefix}s | **${n.label}** | ${n.problemNote || n.notes || "High error/rework rate"} |`
      );
    }
    for (const n of blueSlow) {
      lines.push(
        `| BLUE (Slowest) | ${n.sectionPrefix}s | **${n.label}** | ${n.slowNote || n.notes || "Cycle-time bottleneck"} |`
      );
    }
  }

  lines.push(
    ``,
    `## 3. Complete +5 CRUD Data Dictionary`,
    `| Step # | CRUD | Section | From Node | To Node | Guard Condition |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`
  );

  for (const e of [...edges].sort((a, b) => a.stepNumber - b.stepNumber)) {
    const src = nodeMap.get(e.sourceNodeId)?.label ?? e.sourceNodeId;
    const dst = nodeMap.get(e.targetNodeId)?.label ?? e.targetNodeId;
    lines.push(
      `| **${e.stepNumber}** | \`${e.crud}\` | ${e.sectionPrefix}s | ${src} | ${dst} | ${e.condition || "—"} |`
    );
  }
  return lines.join("\n");
}

export function triggerTextDownload(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
