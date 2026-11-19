import { useState, useRef, useEffect, useCallback } from "react";
import { useFlowStore } from "../store/useFlowStore";

export type VoiceStatus = "disconnected" | "connecting" | "live" | "error";

export function useVoiceSession() {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);

  const projectId = useFlowStore((s) => s.projectId);
  const activePhase = useFlowStore((s) => s.activePhase);
  const sections = useFlowStore((s) => s.sections);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const applyAiToolCalls = useFlowStore((s) => s.applyAiToolCalls);
  const appendChatTurn = useFlowStore((s) => s.appendChatTurn);

  const disconnectVoice = useCallback(() => {
    voiceWsRef.current?.close();
    voiceWsRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setVoiceStatus("disconnected");
    setIsMuted(false);
  }, []);

  const connectVoice = useCallback(async () => {
    setVoiceError(null);
    setVoiceStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/voice-events/${projectId}`);
      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "tool_call" && msg.call) {
            await applyAiToolCalls([msg.call]);
          } else if (msg.type === "transcript" && msg.text) {
            appendChatTurn(msg.speaker === "ai" ? "ai" : "user", String(msg.text));
          }
        } catch {
          // Ignore malformed event frames
        }
      };
      voiceWsRef.current = ws;

      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          disconnectVoice();
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const timeout = window.setTimeout(resolve, 1200);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") {
            window.clearTimeout(timeout);
            resolve();
          }
        };
      });

      const localDesc = pc.localDescription;
      const res = await fetch("/api/voice/webrtc-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: localDesc?.sdp,
          type: localDesc?.type,
          project_id: projectId,
          active_phase: activePhase,
          selected_node_id: selectedNodeId,
          sections,
          nodes,
          edges,
        }),
      });

      if (!res.ok) throw new Error(`Voice server returned ${res.status}`);
      const answer = await res.json();
      if (answer.status !== "ok" || !answer.sdp) {
        throw new Error(answer.detail || "Voice pipeline unavailable on host engine");
      }

      await pc.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp }));
      setVoiceStatus("live");
      setIsMuted(false);
    } catch (err) {
      disconnectVoice();
      setVoiceStatus("error");
      setVoiceError(err instanceof Error ? err.message : "Could not start Live Mic");
    }
  }, [
    projectId,
    activePhase,
    selectedNodeId,
    sections,
    nodes,
    edges,
    applyAiToolCalls,
    appendChatTurn,
    disconnectVoice,
  ]);

  useEffect(() => {
    if (voiceStatus !== "live") return;
    const ws = voiceWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "context_sync",
        active_phase: activePhase,
        selected_node_id: selectedNodeId,
        sections,
        nodes,
        edges,
      })
    );
  }, [voiceStatus, activePhase, selectedNodeId, sections, nodes, edges]);

  const toggleVoiceConnection = useCallback(() => {
    if (voiceStatus === "live" || voiceStatus === "connecting") {
      disconnectVoice();
    } else {
      connectVoice();
    }
  }, [voiceStatus, disconnectVoice, connectVoice]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setIsMuted((prev) => {
      const nextMuted = !prev;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      return nextMuted;
    });
  }, []);

  useEffect(() => {
    if (voiceStatus !== "live") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
      e.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [voiceStatus, toggleMute]);

  useEffect(() => () => disconnectVoice(), [disconnectVoice]);

  return {
    voiceStatus,
    isMuted,
    voiceError,
    remoteAudioRef,
    toggleVoiceConnection,
    toggleMute,
  };
}
