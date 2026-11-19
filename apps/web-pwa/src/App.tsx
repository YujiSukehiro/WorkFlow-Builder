import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  Connection,
} from "@xyflow/react";
import {
  Undo2,
  Bot,
  LayoutGrid,
  Hash,
  Download,
  QrCode,
  PlusCircle,
  Clock,
  AlertTriangle,
  Trash2,
  Layers,
  FolderOpen,
  SlidersHorizontal,
  Printer,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useFlowStore } from "./store/useFlowStore";
import { StickyWorkshopNode } from "./components/nodes/StickyWorkshopNode";
import { ResultMapNode } from "./components/nodes/ResultMapNode";
import { CrudStepEdge } from "./components/edges/CrudStepEdge";
import { FacilitatorSidebar } from "./components/FacilitatorSidebar";
import { InspectorDrawer } from "./components/InspectorDrawer";
import { ProjectSwitcherModal } from "./components/ProjectSwitcherModal";
import {
  compileProcessSpecMarkdown,
  compileResultMapSvg,
  openPrintableResultMapPdf,
  triggerTextDownload,
} from "./engine/exporter";
import { CrudOperation, FlowNodeKind } from "./types/flow";

const nodeTypes = { "sticky-workshop": StickyWorkshopNode, "result-map": ResultMapNode };
const edgeTypes = { crudStep: CrudStepEdge };

export function App() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [quickCrud, setQuickCrud] = useState<CrudOperation>("C");
  const [quickPrefix, setQuickPrefix] = useState<number>(100);

  const {
    initProject,
    projectId,
    projectTitle,
    setProjectTitle,
    visualMode,
    setVisualMode,
    activePhase,
    sections,
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectNode,
    selectEdge,
    wsConnected,
    canUndoHuman,
    canUndoAi,
    undoHuman,
    undoAi,
    addWorkflowStep,
    connectExistingNodes,
    setFrictionSticky,
    updateNodePosition,
    deleteNode,
    runAutoLayout,
    normalizeAllPlusFives,
  } = useFlowStore();

  useEffect(() => {
    initProject("default-workshop");
  }, [initProject]);

  useEffect(() => {
    if (selectedNodeId || selectedEdgeId) {
      setShowInspector(true);
    }
  }, [selectedNodeId, selectedEdgeId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (e.shiftKey) {
          undoAi();
        } else {
          undoHuman();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoHuman, undoAi]);

  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.prefix, s])), [sections]);
  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: visualMode,
        position: n.position,
        selected: n.id === selectedNodeId,
        data: {
          flowNode: n,
          sectionName: sectionMap.get(n.sectionPrefix)?.name ?? "Step",
          stickyColor: sectionMap.get(n.sectionPrefix)?.stickyColorHex ?? "#fde047",
        },
      })),
    [nodes, sectionMap, visualMode, selectedNodeId]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        type: "crudStep",
        selected: e.id === selectedEdgeId,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        data: { flowEdge: e },
      })),
    [edges, selectedEdgeId]
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleConnect = (conn: Connection) => {
    if (conn.source && conn.target) {
      connectExistingNodes({
        fromNodeId: conn.source,
        toNodeId: conn.target,
        crud: quickCrud,
        origin: "human",
      });
    }
  };

  const handleQuickAddStep = async (kind: FlowNodeKind = "step") => {
    const baseId = selectedNodeId ?? nodes[nodes.length - 1]?.id;
    if (!baseId) return;
    const defaultLabel =
      kind === "milestone"
        ? "Milestone Reached"
        : kind === "terminal"
        ? "Process Completed"
        : "New Step Checked";
    const { node } = addWorkflowStep({
      fromNodeId: baseId,
      sectionPrefix: quickPrefix,
      label: defaultLabel,
      crud: quickCrud,
      kind,
      origin: "human",
    });
    selectNode(node.id);
    setShowInspector(true);
    await runAutoLayout(true);
  };

  const handleExportDeliverables = () => {
    const slug = projectTitle.toLowerCase().replace(/\s+/g, "_");
    triggerTextDownload(
      "PROCESS_SPEC.md",
      compileProcessSpecMarkdown(projectTitle, sections, nodes, edges),
      "text/markdown"
    );
    triggerTextDownload(
      `${slug}_result_map.svg`,
      compileResultMapSvg(projectTitle, sections, nodes, edges),
      "image/svg+xml"
    );
    triggerTextDownload(
      `${slug}.flowpulse.json`,
      JSON.stringify(
        {
          projectId,
          projectTitle,
          visualMode,
          activePhase,
          exportedAt: new Date().toISOString(),
          sections,
          nodes,
          edges,
        },
        null,
        2
      ),
      "application/json"
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950">
            FP
          </div>
          <button
            onClick={() => setShowProjectModal(true)}
            title="Switch or Import Workshop"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <input
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="bg-transparent font-bold text-sm text-slate-100 border-b border-transparent focus:border-teal-400 focus:outline-none px-1 py-0.5"
          />
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              wsConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
            }`}
          >
            {wsConnected ? "CRDT Live" : "Local Offline Ready"}
          </span>
        </div>

        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setVisualMode("sticky-workshop")}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${
              visualMode === "sticky-workshop" ? "bg-amber-400 text-slate-950" : "text-slate-400"
            }`}
          >
            Sticky Workshop
          </button>
          <button
            onClick={() => setVisualMode("result-map")}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${
              visualMode === "result-map" ? "bg-emerald-400 text-slate-950" : "text-slate-400"
            }`}
          >
            Result Map Poster
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={undoHuman}
            disabled={!canUndoHuman}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40 text-xs"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo Mine
          </button>
          <button
            onClick={undoAi}
            disabled={!canUndoAi}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 disabled:opacity-40 text-xs text-teal-300"
          >
            <Bot className="w-3.5 h-3.5" /> Undo AI
          </button>
          <button
            onClick={() => runAutoLayout(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-sky-400" /> Layout
          </button>
          <button
            onClick={normalizeAllPlusFives}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs"
          >
            <Hash className="w-3.5 h-3.5 text-amber-400" /> Normalize +5s
          </button>
          <button
            onClick={() => setShowInspector((v) => !v)}
            title="Toggle Node/Edge/Section Inspector"
            className={`p-1.5 rounded-lg ${
              showInspector ? "bg-teal-500/20 text-teal-300" : "bg-slate-800 text-slate-300"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowQrModal(true)}
            title="Pair Mobile PWA Mic"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200"
          >
            <QrCode className="w-4 h-4" />
          </button>
          <button
            onClick={() => openPrintableResultMapPdf(projectTitle, sections, nodes, edges)}
            title="Print / Save Landscape Result Map PDF"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" /> PDF
          </button>
          <button
            onClick={handleExportDeliverables}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Export Bundle
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div ref={canvasRef} className="flex-1 h-full relative">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => selectNode(node.id)}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            onPaneClick={() => selectNode(null)}
            onConnect={handleConnect}
            onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position, true)}
            fitView
            className="bg-slate-950"
          >
            <Background color="#334155" gap={24} />
            <Controls className="!bg-slate-900 !border-slate-700 !fill-slate-200" />
            <MiniMap
              nodeColor="#14b8a6"
              maskColor="rgba(2, 6, 23, 0.75)"
              className="!bg-slate-900 !border-slate-800"
            />
          </ReactFlow>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-900/95 backdrop-blur border border-slate-700 px-3.5 py-2 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-700">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={quickPrefix}
                onChange={(e) => setQuickPrefix(Number(e.target.value))}
                className="bg-slate-800 text-xs font-semibold rounded px-2 py-1 border border-slate-700"
              >
                {sections
                  .filter((s) => s.prefix > 0)
                  .map((s) => (
                    <option key={s.id} value={s.prefix}>
                      {s.prefix}s · {s.name}
                    </option>
                  ))}
              </select>
              <select
                value={quickCrud}
                onChange={(e) => setQuickCrud(e.target.value as CrudOperation)}
                className="bg-slate-800 text-xs font-mono font-bold rounded px-2 py-1 border border-slate-700"
              >
                <option value="C">C</option>
                <option value="R">R</option>
                <option value="U">U</option>
                <option value="D">D</option>
              </select>
            </div>
            <button
              onClick={() => handleQuickAddStep("step")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" /> +5 Sticky
            </button>
            <button
              onClick={() => handleQuickAddStep("milestone")}
              className="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold text-xs"
            >
              + Milestone
            </button>
            <button
              onClick={() => handleQuickAddStep("terminal")}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-xs"
            >
              + Terminal
            </button>

            {selectedNode && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                <button
                  onClick={() => {
                    setFrictionSticky({
                      nodeId: selectedNode.id,
                      isSlow: !selectedNode.isSlow,
                    });
                    setShowInspector(true);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                    selectedNode.isSlow ? "bg-blue-600 text-white" : "bg-slate-800 text-blue-300"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> Blue
                </button>
                <button
                  onClick={() => {
                    setFrictionSticky({
                      nodeId: selectedNode.id,
                      hasProblem: !selectedNode.hasProblem,
                    });
                    setShowInspector(true);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                    selectedNode.hasProblem ? "bg-red-600 text-white" : "bg-slate-800 text-red-300"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Red
                </button>
                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {showInspector && (
          <InspectorDrawer
            onClose={() => {
              setShowInspector(false);
              selectNode(null);
            }}
          />
        )}
        <FacilitatorSidebar canvasRef={canvasRef} />
      </div>

      {showProjectModal && <ProjectSwitcherModal onClose={() => setShowProjectModal(false)} />}

      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 text-center space-y-4"
          >
            <h3 className="text-base font-bold text-slate-100">
              Pair Mobile / Laptop PWA Microphone
            </h3>
            <p className="text-xs text-slate-400">
              Build PWA (<code className="text-teal-300">npm run build</code>) then expose FastAPI
              via Tailscale HTTPS (
              <code className="text-teal-300">
                tailscale serve --bg https / http://127.0.0.1:8420
              </code>
              ) for full mobile WebRTC mic access.
            </p>
            <div className="bg-white p-4 rounded-xl inline-block mx-auto">
              <QRCodeSVG value={window.location.href} size={176} />
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 rounded-lg bg-slate-800 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
