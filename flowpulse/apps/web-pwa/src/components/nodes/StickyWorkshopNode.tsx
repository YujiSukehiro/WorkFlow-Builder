import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { AlertTriangle, Clock, Check, X, Scissors } from "lucide-react";
import { FlowNode } from "../../types/flow";
import { getStickyColorForPrefix, validateConciseLabel } from "../../engine/crudEngine";
import { useFlowStore } from "../../store/useFlowStore";

export interface CustomNodeData extends Record<string, unknown> {
  flowNode: FlowNode;
  sectionName: string;
  stickyColor: string;
}

export const StickyWorkshopNode: React.FC<NodeProps> = ({ data, selected }) => {
  const { flowNode, sectionName, stickyColor } = data as CustomNodeData;
  const compressNodeLabel = useFlowStore((s) => s.compressNodeLabel);
  const confirmAiDraft = useFlowStore((s) => s.confirmAiDraft);
  const rejectAiDraft = useFlowStore((s) => s.rejectAiDraft);

  const { wordCount, needsCompression } = validateConciseLabel(flowNode.label);
  const bg = stickyColor || getStickyColorForPrefix(flowNode.sectionPrefix);

  return (
    <div
      style={{ backgroundColor: bg }}
      className={`relative w-48 min-h-28 rounded-md p-3 text-slate-900 shadow-lg transition-all ${
        selected ? "ring-3 ring-sky-400 scale-[1.02]" : "ring-1 ring-black/15"
      } ${flowNode.aiStatus === "draft" ? "ai-draft-glow" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-slate-800" />
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-700/80 mb-1.5">
        <span>{flowNode.sectionPrefix}s · {sectionName}</span>
        <span className={`px-1.5 py-0.5 rounded ${needsCompression ? "bg-amber-600 text-white" : "bg-black/10 text-slate-800"}`}>
          {wordCount}w
        </span>
      </div>
      <div className="font-semibold text-sm leading-snug text-slate-950 break-words">{flowNode.label}</div>
      {needsCompression && (
        <button
          onClick={(e) => { e.stopPropagation(); compressNodeLabel(flowNode.id); }}
          className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-900/90 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-950"
        >
          <Scissors className="w-3 h-3" /> Trim &le;4w
        </button>
      )}
      {(flowNode.isSlow || flowNode.hasProblem) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flowNode.isSlow && (
            <span title={flowNode.slowNote} className="inline-flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Clock className="w-2.5 h-2.5" /> SLOW
            </span>
          )}
          {flowNode.hasProblem && (
            <span title={flowNode.problemNote} className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <AlertTriangle className="w-2.5 h-2.5" /> PROBLEM
            </span>
          )}
        </div>
      )}
      {flowNode.aiStatus === "draft" && (
        <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-1.5 text-[10px]">
          <span className="font-bold text-teal-900">AI Draft</span>
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); confirmAiDraft(flowNode.id); }} className="rounded bg-emerald-700 p-0.5 text-white">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); rejectAiDraft(flowNode.id); }} className="rounded bg-rose-700 p-0.5 text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-slate-800" />
    </div>
  );
};
