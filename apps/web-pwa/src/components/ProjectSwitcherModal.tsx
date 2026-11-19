import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, Upload, Trash2, Sparkles, X } from "lucide-react";
import { useFlowStore } from "../store/useFlowStore";
import { parseProjectBundleJson } from "../engine/exporter";

export const ProjectSwitcherModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const projectId = useFlowStore((s) => s.projectId);
  const savedProjects = useFlowStore((s) => s.savedProjects);
  const refreshSavedProjects = useFlowStore((s) => s.refreshSavedProjects);
  const initProject = useFlowStore((s) => s.initProject);
  const createNewProject = useFlowStore((s) => s.createNewProject);
  const importProjectBundle = useFlowStore((s) => s.importProjectBundle);
  const deleteSavedProject = useFlowStore((s) => s.deleteSavedProject);
  const loadSampleStarterBoard = useFlowStore((s) => s.loadSampleStarterBoard);

  const [newTitle, setNewTitle] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    refreshSavedProjects();
  }, [refreshSavedProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createNewProject(newTitle.trim());
    onClose();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const bundle = parseProjectBundleJson(String(reader.result));
        await importProjectBundle(bundle);
        onClose();
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Failed to parse JSON bundle.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-bold text-slate-100">Workshops &amp; Portable Bundles</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New workshop process title..."
            className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-400"
          />
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-500 text-slate-950 font-bold text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Board
          </button>
        </form>

        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" /> Import .flowpulse.json
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={async () => {
              await loadSampleStarterBoard();
              onClose();
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300"
          >
            <Sparkles className="w-3.5 h-3.5" /> Reset Sample
          </button>
        </div>

        {importError && (
          <div className="rounded-lg bg-rose-950/60 border border-rose-800 px-3 py-2 text-xs text-rose-300">
            {importError}
          </div>
        )}

        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Saved SQLite Host Projects
          </div>
          {savedProjects.length === 0 ? (
            <div className="text-xs text-slate-500 py-3 text-center">
              No server-saved projects yet (boards auto-save when Host Engine is running on :8420).
            </div>
          ) : (
            savedProjects.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                  p.id === projectId
                    ? "bg-teal-500/10 border-teal-500/40 text-teal-200"
                    : "bg-slate-950 border-slate-800 text-slate-200"
                }`}
              >
                <button
                  onClick={async () => {
                    await initProject(p.id);
                    onClose();
                  }}
                  className="flex-1 text-left"
                >
                  <div className="font-bold">{p.title}</div>
                  <div className="text-[10px] text-slate-400">
                    Phase {p.activePhase} · {p.nodeCount} nodes · {p.edgeCount} +5 edges
                  </div>
                </button>
                <button
                  onClick={() => deleteSavedProject(p.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
