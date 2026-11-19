import React, { useState } from "react";
import {
  X,
  Scissors,
  Clock,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  Layers,
  Plus,
  Pin,
  ShieldCheck,
} from "lucide-react";
import { useFlowStore } from "../store/useFlowStore";
import { auditBoardHealth, validateConciseLabel } from "../engine/crudEngine";
import { CrudOperation, FlowNodeKind } from "../types/flow";

export const InspectorDrawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections = useFlowStore((s) => s.sections);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId);

  const selectNode = useFlowStore((s) => s.selectNode);
  const updateNodeDetails = useFlowStore((s) => s.updateNodeDetails);
  const compressNodeLabel = useFlowStore((s) => s.compressNodeLabel);
  const setFrictionSticky = useFlowStore((s) => s.setFrictionSticky);
  const confirmAiDraft = useFlowStore((s) => s.confirmAiDraft);
  const confirmAllAiDrafts = useFlowStore((s) => s.confirmAllAiDrafts);
  const deleteNode = useFlowStore((s) => s.deleteNode);

  const updateEdgeDetails = useFlowStore((s) => s.updateEdgeDetails);
  const insertStepBetween = useFlowStore((s) => s.insertStepBetween);
  const deleteEdge = useFlowStore((s) => s.deleteEdge);
  const upsertSection = useFlowStore((s) => s.upsertSection);
  const deleteSection = useFlowStore((s) => s.deleteSection);
  const normalizeAllPlusFives = useFlowStore((s) => s.normalizeAllPlusFives);
  const runAutoLayout = useFlowStore((s) => s.runAutoLayout);

  const [newSecPrefix, setNewSecPrefix] = useState(400);
  const [newSecName, setNewSecName] = useState("");
  const [midStepLabel, setMidStepLabel] = useState("");

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const health = auditBoardHealth(nodes, edges);

  const handleAddSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecName.trim()) return;
    upsertSection(newSecPrefix, newSecName.trim());
    setNewSecName("");
  };

  const handleInsertMidpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEdge || !midStepLabel.trim()) return;
    const mid = insertStepBetween({
      edgeId: selectedEdge.id,
      label: midStepLabel.trim(),
      crudIn: "R",
      crudOut: selectedEdge.crud,
      origin: "human",
    });
    setMidStepLabel("");
    if (mid) {
      await runAutoLayout(true);
      selectNode(mid.id);
    }
  };

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-20 overflow-y-auto">
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {selectedNode
            ? "Sticky Node Inspector"
            : selectedEdge
            ? "+5 CRUD Edge Inspector"
            : "100s Sections & Sign-Off"}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {selectedNode && (
        <div className="p-3.5 space-y-3.5 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-400">Concise Label (2–4 words)</label>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  validateConciseLabel(selectedNode.label).needsCompression
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {validateConciseLabel(selectedNode.label).wordCount}w
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={selectedNode.label}
                onChange={(e) => updateNodeDetails(selectedNode.id, { label: e.target.value })}
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-400"
              />
              {validateConciseLabel(selectedNode.label).needsCompression && (
                <button
                  onClick={() => compressNodeLabel(selectedNode.id)}
                  title="Auto-trim to <=4 words"
                  className="px-2 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center gap-1"
                >
                  <Scissors className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-400 mb-1">Node Kind</label>
              <select
                value={selectedNode.kind}
                onChange={(e) =>
                  updateNodeDetails(selectedNode.id, { kind: e.target.value as FlowNodeKind })
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-slate-100"
              >
                <option value="trigger">Trigger</option>
                <option value="step">Step</option>
                <option value="milestone">Milestone</option>
                <option value="terminal">Terminal</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-400 mb-1">100s Section</label>
              <select
                value={selectedNode.sectionPrefix}
                onChange={(e) =>
                  updateNodeDetails(selectedNode.id, { sectionPrefix: Number(e.target.value) })
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-slate-100"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.prefix}>
                    {s.prefix}s · {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-400 mb-1">Spoken Context / SOP Notes</label>
            <textarea
              rows={3}
              value={selectedNode.notes}
              onChange={(e) => updateNodeDetails(selectedNode.id, { notes: e.target.value })}
              placeholder="Nuance, actors, systems, or SLA details..."
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-1.5 font-semibold text-blue-300">
                <Clock className="w-3.5 h-3.5" /> Blue Sticky (Slowest Queue)
              </span>
              <input
                type="checkbox"
                checked={selectedNode.isSlow}
                onChange={(e) =>
                  setFrictionSticky({ nodeId: selectedNode.id, isSlow: e.target.checked })
                }
              />
            </label>
            {selectedNode.isSlow && (
              <input
                type="text"
                value={selectedNode.slowNote}
                onChange={(e) =>
                  setFrictionSticky({ nodeId: selectedNode.id, slowNote: e.target.value })
                }
                placeholder="Why does work wait here? (e.g., 4d inbox queue)"
                className="w-full rounded-lg bg-blue-950/40 border border-blue-700/50 px-2.5 py-1.5 text-blue-100"
              />
            )}

            <label className="flex items-center justify-between cursor-pointer pt-1">
              <span className="flex items-center gap-1.5 font-semibold text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Red Sticky (High Rework/Error)
              </span>
              <input
                type="checkbox"
                checked={selectedNode.hasProblem}
                onChange={(e) =>
                  setFrictionSticky({ nodeId: selectedNode.id, hasProblem: e.target.checked })
                }
              />
            </label>
            {selectedNode.hasProblem && (
              <input
                type="text"
                value={selectedNode.problemNote}
                onChange={(e) =>
                  setFrictionSticky({ nodeId: selectedNode.id, problemNote: e.target.value })
                }
                placeholder="What breaks or causes rework here?"
                className="w-full rounded-lg bg-red-950/40 border border-red-700/50 px-2.5 py-1.5 text-red-100"
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              onClick={() =>
                updateNodeDetails(selectedNode.id, {
                  positionPinnedByUser: !selectedNode.positionPinnedByUser,
                })
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${
                selectedNode.positionPinnedByUser
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              {selectedNode.positionPinnedByUser ? "Pinned" : "Pin Pos"}
            </button>

            {selectedNode.aiStatus === "draft" && (
              <button
                onClick={() => confirmAiDraft(selectedNode.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Draft
              </button>
            )}

            <button
              onClick={() => deleteNode(selectedNode.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {selectedEdge && (
        <div className="p-3.5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-400 mb-1">Step Number</label>
              <input
                type="number"
                value={selectedEdge.stepNumber}
                onChange={(e) =>
                  updateEdgeDetails(selectedEdge.id, { stepNumber: Number(e.target.value) })
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-400 mb-1">CRUD Action</label>
              <select
                value={selectedEdge.crud}
                onChange={(e) =>
                  updateEdgeDetails(selectedEdge.id, { crud: e.target.value as CrudOperation })
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 font-mono font-bold text-slate-100"
              >
                <option value="C">C · Create</option>
                <option value="R">R · Read</option>
                <option value="U">U · Upsert</option>
                <option value="D">D · Delete</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-400 mb-1">Branch Guard Condition</label>
            <input
              type="text"
              value={selectedEdge.condition}
              onChange={(e) => updateEdgeDetails(selectedEdge.id, { condition: e.target.value })}
              placeholder="e.g., If > $2,500 or Rejected"
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
            />
          </div>

          <form onSubmit={handleInsertMidpoint} className="pt-3 border-t border-slate-800 space-y-2">
            <label className="block font-semibold text-teal-300">
              Slot Missed Step Between (+5 Gap Rule)
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={midStepLabel}
                onChange={(e) => setMidStepLabel(e.target.value)}
                placeholder="2–4 word sticky..."
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-bold"
              >
                Slot
              </button>
            </div>
          </form>

          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              onClick={() => deleteEdge(selectedEdge.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Arrow
            </button>
          </div>
        </div>
      )}

      {!selectedNode && !selectedEdge && (
        <div className="p-3.5 space-y-4 text-xs">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-200">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-400" /> Phase 4 Sign-Off Audit
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  health.readyForSignoff
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {health.readyForSignoff ? "Ready" : "Needs Review"}
              </span>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-400">
              <li>
                • Open unfinished leaves:{" "}
                <strong className="text-slate-200">{health.openLeafIds.length}</strong>
              </li>
              <li>
                • Unconfirmed AI drafts:{" "}
                <strong className="text-slate-200">{health.draftNodeIds.length}</strong>
              </li>
              <li>
                • Labels over 4 words:{" "}
                <strong className="text-slate-200">{health.verboseNodeIds.length}</strong>
              </li>
              <li>
                • Midpoint edges to normalize:{" "}
                <strong className="text-slate-200">
                  {health.nonMultipleOfFiveEdgeIds.length}
                </strong>
              </li>
            </ul>
            <div className="flex gap-1.5 pt-1">
              {health.draftNodeIds.length > 0 && (
                <button
                  onClick={confirmAllAiDrafts}
                  className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                >
                  Confirm All Drafts
                </button>
              )}
              {health.nonMultipleOfFiveEdgeIds.length > 0 && (
                <button
                  onClick={normalizeAllPlusFives}
                  className="flex-1 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold"
                >
                  Normalize +5s
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-300">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> 100s Workflow Sections
            </div>
            <div className="space-y-1.5">
              {sections.map((sec) => (
                <div
                  key={sec.id}
                  className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5"
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: sec.stickyColorHex }}
                  />
                  <span className="font-mono font-bold text-slate-400 w-10">{sec.prefix}s</span>
                  <input
                    type="text"
                    value={sec.name}
                    onChange={(e) => upsertSection(sec.prefix, e.target.value, sec.stickyColorHex)}
                    className="flex-1 bg-transparent text-slate-100 focus:outline-none border-b border-transparent focus:border-teal-400"
                  />
                  {sec.prefix !== 0 && (
                    <button
                      onClick={() => deleteSection(sec.prefix)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddSection} className="flex gap-1.5 pt-1">
              <select
                value={newSecPrefix}
                onChange={(e) => setNewSecPrefix(Number(e.target.value))}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 font-mono text-slate-200"
              >
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((p) => (
                  <option key={p} value={p}>
                    {p}s
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newSecName}
                onChange={(e) => setNewSecName(e.target.value)}
                placeholder="New section name..."
                className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-teal-500 hover:text-slate-950 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
