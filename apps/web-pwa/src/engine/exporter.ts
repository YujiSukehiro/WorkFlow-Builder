import {
  CanvasVisualMode,
  FlowEdge,
  FlowNode,
  FlowSection,
  ProjectBundle,
  WorkshopPhase,
} from "../types/flow";
import { getStickyColorForPrefix } from "./crudEngine";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function compileResultMapSvg(
  title: string,
  sections: FlowSection[],
  nodes: FlowNode[],
  edges: FlowEdge[]
): string {
  const minX = nodes.length ? Math.min(...nodes.map((n) => n.position.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((n) => n.position.y)) : 0;
  const maxX = nodes.length ? Math.max(...nodes.map((n) => n.position.x + 220)) : 900;
  const maxY = nodes.length ? Math.max(...nodes.map((n) => n.position.y + 140)) : 500;

  const padX = 80;
  const headerH = 92;
  const width = Math.max(1024, maxX - minX + padX * 2);
  const height = Math.max(600, maxY - minY + headerH + padX * 2);
  const ox = padX - minX;
  const oy = headerH + padX - minY;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const crudColors: Record<string, string> = {
    C: "#10b981",
    R: "#38bdf8",
    U: "#f59e0b",
    D: "#f43f5e",
  };

  const edgeSvg = edges
    .map((e) => {
      const src = nodeMap.get(e.sourceNodeId);
      const dst = nodeMap.get(e.targetNodeId);
      if (!src || !dst) return "";
      const x1 = src.position.x + ox + 150;
      const y1 = src.position.y + oy + 46;
      const x2 = dst.position.x + ox;
      const y2 = dst.position.y + oy + 46;
      const midX = Math.round((x1 + x2) / 2);
      const midY = Math.round((y1 + y2) / 2);
      const pillColor = crudColors[e.crud] ?? "#94a3b8";
      const condText = e.condition
        ? `<text x="${midX}" y="${midY + 24}" text-anchor="middle" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="10">${escXml(e.condition)}</text>`
        : "";
      return [
        `<path d="M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}" fill="none" stroke="#64748b" stroke-width="2.2" marker-end="url(#arrow)" />`,
        `<rect x="${midX - 30}" y="${midY - 12}" width="60" height="24" rx="12" fill="#0f172a" stroke="${pillColor}" stroke-width="1.8" />`,
        `<text x="${midX}" y="${midY + 4}" text-anchor="middle" fill="${pillColor}" font-family="ui-monospace, monospace" font-weight="700" font-size="11">${e.stepNumber} ${escXml(e.crud)}</text>`,
        condText,
      ].join("\n");
    })
    .join("\n");

  const nodeSvg = nodes
    .map((n) => {
      const cx = n.position.x + ox + 75;
      const cy = n.position.y + oy + 46;
      const fill =
        n.kind === "trigger"
          ? "#065f46"
          : n.kind === "milestone"
          ? "#9a3412"
          : n.kind === "terminal"
          ? "#1e293b"
          : "#f8fafc";
      const stroke =
        n.kind === "trigger"
          ? "#34d399"
          : n.kind === "milestone"
          ? "#fb923c"
          : n.kind === "terminal"
          ? "#2dd4bf"
          : "#334155";
      const textFill = n.kind === "step" ? "#0f172a" : "#f8fafc";
      const badges: string[] = [];
      if (n.isSlow) {
        badges.push(
          `<rect x="${cx - 68}" y="${cy - 54}" width="54" height="18" rx="9" fill="#2563eb" /><text x="${cx - 41}" y="${cy - 42}" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="700" font-size="9">SLOW</text>`
        );
      }
      if (n.hasProblem) {
        badges.push(
          `<rect x="${cx + 14}" y="${cy - 54}" width="58" height="18" rx="9" fill="#dc2626" /><text x="${cx + 43}" y="${cy - 42}" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="700" font-size="9">PROBLEM</text>`
        );
      }
      return [
        `<rect x="${cx - 75}" y="${cy - 36}" width="150" height="72" rx="${n.kind === "trigger" ? 12 : 36}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" />`,
        `<text x="${cx}" y="${cy - 12}" text-anchor="middle" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="9">${n.sectionPrefix}s</text>`,
        `<text x="${cx}" y="${cy + 7}" text-anchor="middle" fill="${textFill}" font-family="system-ui, sans-serif" font-weight="700" font-size="11.5">${escXml(n.label)}</text>`,
        ...badges,
      ].join("\n");
    })
    .join("\n");

  const secLegend = sections.map((s) => `${s.prefix}s: ${s.name}`).join("   •   ");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <defs>`,
    `    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />`,
    `    </marker>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="#020617" />`,
    `  <rect x="0" y="0" width="${width}" height="${headerH}" fill="#0f172a" />`,
    `  <line x1="0" y1="${headerH}" x2="${width}" y2="${headerH}" stroke="#1e293b" stroke-width="2" />`,
    `  <text x="36" y="40" fill="#2dd4bf" font-family="system-ui, sans-serif" font-weight="800" font-size="13">RESULT MAP POSTER</text>`,
    `  <text x="36" y="68" fill="#f8fafc" font-family="system-ui, sans-serif" font-weight="800" font-size="22">${escXml(title)}</text>`,
    `  <text x="${width - 36}" y="56" text-anchor="end" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12">${escXml(secLegend)}</text>`,
    edgeSvg,
    nodeSvg,
    `</svg>`,
  ].join("\n");
}

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

export function openPrintableResultMapPdf(
  title: string,
  sections: FlowSection[],
  nodes: FlowNode[],
  edges: FlowEdge[]
): void {
  const svgMarkup = compileResultMapSvg(title, sections, nodes, edges).replace(
    /^<\?xml[^>]*\?>\s*/,
    ""
  );
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const frictionRows = nodes
    .filter((n) => n.isSlow || n.hasProblem)
    .map(
      (n) =>
        `<tr>
          <td>${n.hasProblem ? '<span class="badge red">RED · PROBLEM</span> ' : ""}${
            n.isSlow ? '<span class="badge blue">BLUE · SLOW</span>' : ""
          }</td>
          <td>${n.sectionPrefix}s</td>
          <td><strong>${escXml(n.label)}</strong></td>
          <td>${escXml([n.problemNote, n.slowNote, n.notes].filter(Boolean).join(" | ") || "—")}</td>
        </tr>`
    )
    .join("");

  const crudRows = [...edges]
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((e) => {
      const src = nodeMap.get(e.sourceNodeId)?.label ?? e.sourceNodeId;
      const dst = nodeMap.get(e.targetNodeId)?.label ?? e.targetNodeId;
      return `<tr>
        <td><strong>${e.stepNumber}</strong></td>
        <td><code>${escXml(e.crud)}</code></td>
        <td>${e.sectionPrefix}s</td>
        <td>${escXml(src)}</td>
        <td>${escXml(dst)}</td>
        <td>${escXml(e.condition || "—")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Result Map PDF — ${escXml(title)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; }
    .poster-wrap { width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; page-break-after: always; }
    .poster-wrap svg { width: 100%; height: auto; display: block; }
    h2 { font-size: 16px; margin: 16px 0 8px; border-bottom: 2px solid #0f172a; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; color: #fff; }
    .red { background: #dc2626; }
    .blue { background: #2563eb; }
  </style>
</head>
<body>
  <div class="poster-wrap">${svgMarkup}</div>
  <h2>Prioritized Friction Backlog (Red &amp; Blue Stickies)</h2>
  <table>
    <thead><tr><th>Type</th><th>Section</th><th>Step</th><th>Root Cause &amp; Spoken Notes</th></tr></thead>
    <tbody>${frictionRows || '<tr><td colspan="4">No friction stickies flagged.</td></tr>'}</tbody>
  </table>
  <h2>Complete +5 CRUD Data Dictionary</h2>
  <table>
    <thead><tr><th>Step #</th><th>CRUD</th><th>Section</th><th>From</th><th>To</th><th>Condition</th></tr></thead>
    <tbody>${crudRows || '<tr><td colspan="6">No transitions defined.</td></tr>'}</tbody>
  </table>
  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

export function parseProjectBundleJson(rawText: string): ProjectBundle {
  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid .flowpulse.json file: missing nodes or edges arrays.");
  }

  const sections: FlowSection[] = Array.isArray(parsed.sections)
    ? (parsed.sections as FlowSection[]).map((s) => ({
        id: String(s.id || `sec_${s.prefix}`),
        prefix: Number(s.prefix ?? 100),
        name: String(s.name || `Section ${s.prefix}`),
        stickyColorHex: String(s.stickyColorHex || getStickyColorForPrefix(Number(s.prefix ?? 100))),
        sortOrder: Number(s.sortOrder ?? s.prefix ?? 100),
      }))
    : [{ id: "sec_0", prefix: 0, name: "Trigger", stickyColorHex: "#86efac", sortOrder: 0 }];

  const visualMode: CanvasVisualMode =
    parsed.visualMode === "result-map" ? "result-map" : "sticky-workshop";
  const phaseNum = Number(parsed.activePhase ?? 2);
  const activePhase: WorkshopPhase =
    phaseNum === 1 || phaseNum === 2 || phaseNum === 3 || phaseNum === 4 ? phaseNum : 2;

  return {
    projectId: parsed.projectId ? String(parsed.projectId) : undefined,
    projectTitle: String(parsed.projectTitle || parsed.title || "Imported Workflow"),
    visualMode,
    activePhase,
    exportedAt: String(parsed.exportedAt || new Date().toISOString()),
    sections,
    nodes: parsed.nodes as FlowNode[],
    edges: parsed.edges as FlowEdge[],
  };
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
