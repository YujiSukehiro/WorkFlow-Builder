import React, { useState, useRef } from "react";
import { Mic, MicOff, Send, Camera, Sparkles, GitBranch, CheckCircle2, Volume2, VolumeX } from "lucide-react";
import { toBlob } from "html-to-image";
import { useFlowStore } from "../store/useFlowStore";
import { findOpenUnfinishedLeaves } from "../engine/crudEngine";
import { useVoiceSession } from "../hooks/useVoiceSession";

const SPATIAL_KEYWORDS = ["right here", "this messy", "these two", "look at", "pointing", "bottom", "top", "cluster"];

export const FacilitatorSidebar: React.FC<{ canvasRef: React.RefObject<HTMLDivElement | null> }> = ({ canvasRef }) => {
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { voiceStatus, isMuted, voiceError, remoteAudioRef, toggleVoiceConnection, toggleMute } = useVoiceSession();

  const chatHistory = useFlowStore((s) => s.chatHistory);
  const isAiThinking = useFlowStore((s) => s.isAiThinking);
  const sendFacilitatorTurn = useFlowStore((s) => s.sendFacilitatorTurn);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selectNode = useFlowStore((s) => s.selectNode);

  const openLeaves = findOpenUnfinishedLeaves(nodes, edges);

  const captureCanvasIfDeictic = async (text: string): Promise<string | undefined> => {
    if (!SPATIAL_KEYWORDS.some((kw) => text.toLowerCase().includes(kw)) || !canvasRef.current) return undefined;
    try {
      const blob = await toBlob(canvasRef.current, { type: "image/webp", quality: 0.8 });
      if (!blob) return undefined;
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAiThinking) return;
    const text = input.trim();
    setInput("");
    const snap = await captureCanvasIfDeictic(text);
    await sendFacilitatorTurn(text, snap);
  };

  const handleWallPhotoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      await sendFacilitatorTurn("Import physical wall stickies from this photo into sections and +5 CRUD steps.", String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const isLive = voiceStatus === "live";

  return (
    <aside className="w-88 bg-slate-900 border-l border-slate-800 flex flex-col h-full">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-bold tracking-wide text-slate-100">AI Facilitator</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => fileInputRef.current?.click()} title="Import Physical Wall Stickies" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
            <Camera className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleWallPhotoImport} />
          {isLive && (
            <button
              onClick={toggleMute}
              title="Toggle Mute (Space)"
              className={`p-1.5 rounded-lg ${isMuted ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-slate-800 text-emerald-300"}`}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={toggleVoiceConnection}
            title={isLive ? "Disconnect Live Voice (Press Space to Mute)" : "Start Full-Duplex MLX WebRTC Voice"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isLive
                ? isMuted
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : voiceStatus === "connecting"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {isLive && !isMuted ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
            {voiceStatus === "connecting" ? "Connecting..." : isLive ? (isMuted ? "Muted (Space)" : "Live Mic") : "Start Voice"}
          </button>
        </div>
      </div>

      {voiceError && (
        <div className="px-3.5 py-2 bg-rose-950/60 border-b border-rose-800/60 text-[11px] text-rose-300">
          {voiceError}
        </div>
      )}

      <div className="px-3.5 py-2.5 bg-slate-950/60 border-b border-slate-800">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
          <span className="flex items-center gap-1"><GitBranch className="w-3.5 h-3.5 text-amber-400" /> Open Unfinished Branches</span>
          <span className="px-1.5 rounded bg-slate-800 text-slate-200">{openLeaves.length}</span>
        </div>
        {openLeaves.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Every branch resolves cleanly!</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {openLeaves.map((leaf) => (
              <button key={leaf.id} onClick={() => selectNode(leaf.id)} className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate max-w-40">
                {leaf.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {chatHistory.map((turn) => (
          <div key={turn.id} className={`rounded-xl p-2.5 text-xs leading-relaxed ${turn.speaker === "ai" ? "bg-slate-800/90 text-slate-200 border border-slate-700/70" : "bg-teal-600/20 text-teal-100 border border-teal-500/30 ml-6"}`}>
            <div className="font-bold text-[10px] uppercase tracking-wider opacity-60 mb-1">{turn.speaker === "ai" ? "FlowPulse AI" : "You"}</div>
            <div>{turn.transcript}</div>
          </div>
        ))}
        {isAiThinking && <div className="text-xs text-teal-400 animate-pulse px-2">Facilitator updating stickies...</div>}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe next step, branch, or bottleneck..."
          className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-400"
        />
        <button type="submit" disabled={isAiThinking} className="rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold px-3 py-2">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
};
