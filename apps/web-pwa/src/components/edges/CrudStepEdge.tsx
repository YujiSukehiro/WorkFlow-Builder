import React from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from "@xyflow/react";
import { Plus } from "lucide-react";
import { CrudOperation, FlowEdge } from "../../types/flow";
import { useFlowStore } from "../../store/useFlowStore";

const CRUD_COLORS: Record<CrudOperation, string> = {
  C: "bg-emerald-600 text-white border-emerald-400",
  R: "bg-sky-600 text-white border-sky-400",
  U: "bg-amber-600 text-white border-amber-400",
  D: "bg-rose-600 text-white border-rose-400",
};

export const CrudStepEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}) => {
  const insertStepBetween = useFlowStore((s) => s.insertStepBetween);
  const selectEdge = useFlowStore((s) => s.selectEdge);
  const runAutoLayout = useFlowStore((s) => s.runAutoLayout);
  const flowEdge = (data as { flowEdge?: FlowEdge })?.flowEdge;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });

  if (!flowEdge) return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />;

  const handleQuickMidInsert = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const mid = insertStepBetween({
      edgeId: flowEdge.id,
      label: "Missed Check",
      crudIn: "R",
      crudOut: flowEdge.crud,
      origin: "human",
    });
    if (mid) {
      await runAutoLayout(true);
      useFlowStore.getState().selectNode(mid.id);
    }
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ strokeWidth: selected ? 3 : 2, stroke: selected ? "#38bdf8" : "#94a3b8" }}
      />
      <EdgeLabelRenderer>
        <div
          onClick={(e) => {
            e.stopPropagation();
            selectEdge(flowEdge.id);
          }}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex flex-col items-center gap-0.5 group cursor-pointer"
        >
          <div
            className={`flex items-center gap-1 rounded-full bg-slate-900/95 border px-2 py-0.5 text-[11px] font-mono font-bold text-slate-100 shadow-md ${
              selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-slate-700"
            }`}
          >
            <span>{flowEdge.stepNumber}</span>
            <span className={`rounded px-1 text-[10px] border ${CRUD_COLORS[flowEdge.crud]}`}>
              {flowEdge.crud}
            </span>
            <button
              onClick={handleQuickMidInsert}
              title="Slot missed step (+5 gap rule)"
              className="ml-0.5 hidden group-hover:inline-flex items-center justify-center rounded-full bg-slate-700 hover:bg-teal-500 hover:text-slate-950 w-4 h-4 transition"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {flowEdge.condition && (
            <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/30 shadow">
              {flowEdge.condition}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
