import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { AlertTriangle, Clock } from "lucide-react";
import { CustomNodeData } from "./StickyWorkshopNode";

export const ResultMapNode: React.FC<NodeProps> = ({ data, selected }) => {
  const { flowNode } = data as CustomNodeData;
  let shapeClasses = "bg-white text-slate-900 border-2 border-slate-700 rounded-full w-32 h-32";
  if (flowNode.kind === "trigger") {
    shapeClasses = "bg-emerald-50 text-emerald-950 border-3 border-emerald-600 rounded-xl w-40 h-28";
  } else if (flowNode.kind === "milestone") {
    shapeClasses = "bg-amber-400 text-slate-950 border-3 border-amber-700 rounded-full w-34 h-34";
  } else if (flowNode.kind === "terminal") {
    shapeClasses = "bg-emerald-600 text-white border-4 border-emerald-900 rounded-full w-32 h-32";
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-3 text-center shadow-md transition-all ${shapeClasses} ${
        selected ? "ring-4 ring-sky-400" : ""
      } ${flowNode.aiStatus === "draft" ? "ai-draft-glow" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-slate-900" />
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-0.5">{flowNode.kind}</span>
      <span className="text-xs font-bold leading-tight px-1">{flowNode.label}</span>
      <div className="absolute -top-2 -right-2 flex gap-1">
        {flowNode.isSlow && (
          <span title={flowNode.slowNote} className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow">
            <Clock className="w-3.5 h-3.5" />
          </span>
        )}
        {flowNode.hasProblem && (
          <span title={flowNode.problemNote} className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow">
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-slate-900" />
    </div>
  );
};
