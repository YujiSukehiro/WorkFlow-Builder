import { create } from "zustand";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  CanvasVisualMode,
  CrudOperation,
  FlowEdge,
  FlowNode,
  FlowNodeKind,
  FlowSection,
} from "../types/flow";
import {
  allocateInsertedStepNumbers,
  allocateNextStepNumber,
  compressToFourWords,
  getStickyColorForPrefix,
  normalizeSectionByFives,
  validateConciseLabel,
} from "../engine/crudEngine";
import { computeOrthogonalLayout } from "../engine/elkLayout";

export type ActorOrigin = "human" | "ai-agent";

export interface ChatTurn {
  id: string;
  speaker: "user" | "ai";
  transcript: string;
  mutatedIds: string[];
  timestamp: string;
}

interface FlowStoreState {
  projectId: string;
  projectTitle: string;
  visualMode: CanvasVisualMode;
  sections: FlowSection[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  wsConnected: boolean;
  canUndoHuman: boolean;
  canUndoAi: boolean;
  chatHistory: ChatTurn[];
  isAiThinking: boolean;

  initProject: (projectId?: string) => void;
  setProjectTitle: (title: string) => void;
  setVisualMode: (mode: CanvasVisualMode) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;

  upsertSection: (prefix: number, name: string, origin?: ActorOrigin) => FlowSection;
  addWorkflowStep: (params: {
    fromNodeId: string;
    sectionPrefix: number;
    label: string;
    crud: CrudOperation;
    condition?: string;
    kind?: FlowNodeKind;
    notes?: string;
    origin?: ActorOrigin;
  }) => { node: FlowNode; edge: FlowEdge };
  insertStepBetween: (params: {
    edgeId: string;
    label: string;
    crudIn: CrudOperation;
    crudOut: CrudOperation;
    origin?: ActorOrigin;
  }) => FlowNode | null;
  connectExistingNodes: (params: {
    fromNodeId: string;
    toNodeId: string;
    crud: CrudOperation;
    condition?: string;
    origin?: ActorOrigin;
  }) => FlowEdge | null;
  updateNodeLabel: (nodeId: string, label: string, origin?: ActorOrigin) => void;
  compressNodeLabel: (nodeId: string) => void;
  setFrictionSticky: (params: {
    nodeId: string;
    isSlow?: boolean;
    slowNote?: string;
    hasProblem?: boolean;
    problemNote?: string;
    origin?: ActorOrigin;
  }) => void;
  updateNodePosition: (nodeId: string, pos: { x: number; y: number }, pinned?: boolean) => void;
  confirmAiDraft: (nodeId: string) => void;
  rejectAiDraft: (nodeId: string) => void;
  deleteNode: (nodeId: string, origin?: ActorOrigin) => void;

  runAutoLayout: (respectPinned?: boolean) => Promise<void>;
  normalizeAllPlusFives: () => void;
  undoHuman: () => void;
  undoAi: () => void;

  sendFacilitatorTurn: (userText: string, snapshotDataUrl?: string) => Promise<void>;
  applyAiToolCalls: (calls: Array<{ name: string; arguments?: Record<string, unknown> }>) => Promise<string[]>;
  appendChatTurn: (speaker: "user" | "ai", transcript: string, mutatedIds?: string[]) => void;
  loadSampleStarterBoard: () => Promise<void>;
}

let ydoc: Y.Doc | null = null;
let ySections: Y.Map<FlowSection> | null = null;
let yNodes: Y.Map<FlowNode> | null = null;
let yEdges: Y.Map<FlowEdge> | null = null;
let humanUndoManager: Y.UndoManager | null = null;
let aiUndoManager: Y.UndoManager | null = null;
let wsProvider: WebsocketProvider | null = null;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useFlowStore = create<FlowStoreState>((set, get) => {
  const syncFromYDoc = () => {
    if (!ySections || !yNodes || !yEdges) return;
    set({
      sections: Array.from(ySections.values()).sort((a, b) => a.prefix - b.prefix),
      nodes: Array.from(yNodes.values()),
      edges: Array.from(yEdges.values()).sort((a, b) => a.stepNumber - b.stepNumber),
      canUndoHuman: (humanUndoManager?.undoStack.length ?? 0) > 0,
      canUndoAi: (aiUndoManager?.undoStack.length ?? 0) > 0,
    });
  };

  return {
    projectId: "default-workshop",
    projectTitle: "Purchase Requisition & Approval",
    visualMode: "sticky-workshop",
    sections: [],
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    wsConnected: false,
    canUndoHuman: false,
    canUndoAi: false,
    chatHistory: [
      {
        id: "welcome",
        speaker: "ai",
        transcript:
          "Ready on the board! Walk me through what triggers this workflow—or click a sticky to branch out.",
        mutatedIds: [],
        timestamp: new Date().toISOString(),
      },
    ],
    isAiThinking: false,

    initProject: (projectId = "default-workshop") => {
      if (ydoc) return;
      ydoc = new Y.Doc();
      ySections = ydoc.getMap<FlowSection>("sections");
      yNodes = ydoc.getMap<FlowNode>("nodes");
      yEdges = ydoc.getMap<FlowEdge>("edges");

      humanUndoManager = new Y.UndoManager([ySections, yNodes, yEdges], {
        trackedOrigins: new Set(["human"]),
      });
      aiUndoManager = new Y.UndoManager([ySections, yNodes, yEdges], {
        trackedOrigins: new Set(["ai-agent"]),
      });

      humanUndoManager.on("stack-item-added", syncFromYDoc);
      humanUndoManager.on("stack-item-popped", syncFromYDoc);
      aiUndoManager.on("stack-item-added", syncFromYDoc);
      aiUndoManager.on("stack-item-popped", syncFromYDoc);
      ydoc.on("update", syncFromYDoc);

      const idb = new IndexeddbPersistence(`flowpulse-${projectId}`, ydoc);
      idb.once("synced", () => {
        if (yNodes && yNodes.size === 0) {
          get().loadSampleStarterBoard();
        } else {
          syncFromYDoc();
        }
      });

      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${proto}//${window.location.host}/ws/yjs`;
        wsProvider = new WebsocketProvider(wsUrl, projectId, ydoc, { connect: true });
        wsProvider.on("status", (ev: { status: string }) => {
          set({ wsConnected: ev.status === "connected" });
        });
      } catch {
        set({ wsConnected: false });
      }
      set({ projectId });
    },

    setProjectTitle: (title) => set({ projectTitle: title }),
    setVisualMode: (mode) => set({ visualMode: mode }),
    selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
    selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

    upsertSection: (prefix, name, origin = "human") => {
      if (!ydoc || !ySections) throw new Error("YDoc not initialized");
      const existing = Array.from(ySections.values()).find((s) => s.prefix === prefix);
      const section: FlowSection = existing
        ? { ...existing, name }
        : {
            id: `sec_${prefix}`,
            prefix,
            name,
            stickyColorHex: getStickyColorForPrefix(prefix),
            sortOrder: prefix,
          };
      ydoc.transact(() => {
        ySections!.set(section.id, section);
      }, origin);
      return section;
    },

    addWorkflowStep: ({
      fromNodeId,
      sectionPrefix,
      label,
      crud,
      condition = "",
      kind = "step",
      notes = "",
      origin = "human",
    }) => {
      if (!ydoc || !yNodes || !yEdges || !ySections) throw new Error("YDoc not initialized");
      const hasSec = Array.from(ySections.values()).some((s) => s.prefix === sectionPrefix);
      if (!hasSec) get().upsertSection(sectionPrefix, `Section ${sectionPrefix}`, origin);

      const { cleaned } = validateConciseLabel(label);
      const sourceNode = yNodes.get(fromNodeId);
      const stepNumber = allocateNextStepNumber(Array.from(yEdges.values()), sectionPrefix);

      const newNode: FlowNode = {
        id: uid("n"),
        sectionPrefix,
        label: origin === "ai-agent" ? compressToFourWords(cleaned) : cleaned,
        notes,
        kind,
        isSlow: false,
        slowNote: "",
        hasProblem: false,
        problemNote: "",
        position: {
          x: (sourceNode?.position.x ?? 100) + 270,
          y: (sourceNode?.position.y ?? 180) + (Math.random() * 80 - 40),
        },
        positionPinnedByUser: false,
        createdBy: origin === "ai-agent" ? "ai" : "human",
        aiStatus: origin === "ai-agent" ? "draft" : "confirmed",
      };

      const newEdge: FlowEdge = {
        id: uid("e"),
        sourceNodeId: fromNodeId,
        targetNodeId: newNode.id,
        sectionPrefix,
        stepNumber,
        crud,
        condition,
      };

      ydoc.transact(() => {
        yNodes!.set(newNode.id, newNode);
        yEdges!.set(newEdge.id, newEdge);
      }, origin);
      return { node: newNode, edge: newEdge };
    },

    insertStepBetween: ({ edgeId, label, crudIn, crudOut, origin = "human" }) => {
      if (!ydoc || !yNodes || !yEdges) return null;
      const targetEdge = yEdges.get(edgeId);
      if (!targetEdge) return null;
      const sourceNode = yNodes.get(targetEdge.sourceNodeId);
      const destNode = yNodes.get(targetEdge.targetNodeId);
      if (!sourceNode || !destNode) return null;

      const downstreamSteps = Array.from(yEdges.values())
        .filter((e) => e.sectionPrefix === targetEdge.sectionPrefix && e.stepNumber > targetEdge.stepNumber)
        .map((e) => e.stepNumber);

      const { firstHalfNum, secondHalfNum, needsResequence } = allocateInsertedStepNumbers(
        targetEdge.stepNumber,
        downstreamSteps
      );

      const { cleaned } = validateConciseLabel(label);
      const midNode: FlowNode = {
        id: uid("n"),
        sectionPrefix: targetEdge.sectionPrefix,
        label: origin === "ai-agent" ? compressToFourWords(cleaned) : cleaned,
        notes: "Inserted mid-stream via +5 gap rule",
        kind: "step",
        isSlow: false,
        slowNote: "",
        hasProblem: false,
        problemNote: "",
        position: {
          x: Math.round((sourceNode.position.x + destNode.position.x) / 2),
          y: Math.round((sourceNode.position.y + destNode.position.y) / 2),
        },
        positionPinnedByUser: false,
        createdBy: origin === "ai-agent" ? "ai" : "human",
        aiStatus: origin === "ai-agent" ? "draft" : "confirmed",
      };

      const edgeA: FlowEdge = {
        ...targetEdge,
        targetNodeId: midNode.id,
        stepNumber: firstHalfNum,
        crud: crudIn,
      };

      const edgeB: FlowEdge = {
        id: uid("e"),
        sourceNodeId: midNode.id,
        targetNodeId: destNode.id,
        sectionPrefix: targetEdge.sectionPrefix,
        stepNumber: secondHalfNum,
        crud: crudOut,
        condition: "",
      };

      ydoc.transact(() => {
        yNodes!.set(midNode.id, midNode);
        yEdges!.set(edgeA.id, edgeA);
        yEdges!.set(edgeB.id, edgeB);
        if (needsResequence) {
          for (const ne of normalizeSectionByFives(
            Array.from(yNodes!.values()),
            Array.from(yEdges!.values()),
            targetEdge.sectionPrefix
          )) {
            yEdges!.set(ne.id, ne);
          }
        }
      }, origin);
      return midNode;
    },

    connectExistingNodes: ({ fromNodeId, toNodeId, crud, condition = "", origin = "human" }) => {
      if (!ydoc || !yNodes || !yEdges) return null;
      const fromNode = yNodes.get(fromNodeId);
      if (!fromNode) return null;
      const stepNumber = allocateNextStepNumber(Array.from(yEdges.values()), fromNode.sectionPrefix);
      const edge: FlowEdge = {
        id: uid("e"),
        sourceNodeId: fromNodeId,
        targetNodeId: toNodeId,
        sectionPrefix: fromNode.sectionPrefix,
        stepNumber,
        crud,
        condition,
      };
      ydoc.transact(() => {
        yEdges!.set(edge.id, edge);
      }, origin);
      return edge;
    },

    updateNodeLabel: (nodeId, label, origin = "human") => {
      if (!ydoc || !yNodes) return;
      const existing = yNodes.get(nodeId);
      if (!existing) return;
      ydoc.transact(() => {
        yNodes!.set(nodeId, { ...existing, label });
      }, origin);
    },

    compressNodeLabel: (nodeId) => {
      if (!ydoc || !yNodes) return;
      const existing = yNodes.get(nodeId);
      if (!existing) return;
      ydoc.transact(() => {
        yNodes!.set(nodeId, { ...existing, label: compressToFourWords(existing.label) });
      }, "human");
    },

    setFrictionSticky: ({ nodeId, isSlow, slowNote, hasProblem, problemNote, origin = "human" }) => {
      if (!ydoc || !yNodes) return;
      const existing = yNodes.get(nodeId);
      if (!existing) return;
      ydoc.transact(() => {
        yNodes!.set(nodeId, {
          ...existing,
          isSlow: isSlow !== undefined ? isSlow : existing.isSlow,
          slowNote: slowNote !== undefined ? slowNote : existing.slowNote,
          hasProblem: hasProblem !== undefined ? hasProblem : existing.hasProblem,
          problemNote: problemNote !== undefined ? problemNote : existing.problemNote,
        });
      }, origin);
    },

    updateNodePosition: (nodeId, pos, pinned = true) => {
      if (!ydoc || !yNodes) return;
      const existing = yNodes.get(nodeId);
      if (!existing) return;
      ydoc.transact(() => {
        yNodes!.set(nodeId, { ...existing, position: pos, positionPinnedByUser: pinned });
      }, "human");
    },

    confirmAiDraft: (nodeId) => {
      if (!ydoc || !yNodes) return;
      const existing = yNodes.get(nodeId);
      if (!existing) return;
      ydoc.transact(() => {
        yNodes!.set(nodeId, { ...existing, aiStatus: "confirmed" });
      }, "human");
    },

    rejectAiDraft: (nodeId) => {
      get().deleteNode(nodeId, "human");
    },

    deleteNode: (nodeId, origin = "human") => {
      if (!ydoc || !yNodes || !yEdges) return;
      ydoc.transact(() => {
        yNodes!.delete(nodeId);
        for (const [eid, edge] of yEdges!.entries()) {
          if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
            yEdges!.delete(eid);
          }
        }
      }, origin);
      if (get().selectedNodeId === nodeId) set({ selectedNodeId: null });
    },

    runAutoLayout: async (respectPinned = false) => {
      if (!ydoc || !yNodes || !yEdges) return;
      const positions = await computeOrthogonalLayout(
        Array.from(yNodes.values()),
        Array.from(yEdges.values()),
        respectPinned
      );
      ydoc.transact(() => {
        for (const [nid, pos] of positions.entries()) {
          const existing = yNodes!.get(nid);
          if (existing) {
            yNodes!.set(nid, {
              ...existing,
              position: pos,
              positionPinnedByUser: respectPinned ? existing.positionPinnedByUser : false,
            });
          }
        }
      }, "human");
    },

    normalizeAllPlusFives: () => {
      if (!ydoc || !yNodes || !yEdges) return;
      const normalized = normalizeSectionByFives(
        Array.from(yNodes.values()),
        Array.from(yEdges.values())
      );
      ydoc.transact(() => {
        for (const edge of normalized) {
          yEdges!.set(edge.id, edge);
        }
      }, "human");
    },

    undoHuman: () => {
      humanUndoManager?.undo();
      syncFromYDoc();
    },

    undoAi: () => {
      aiUndoManager?.undo();
      syncFromYDoc();
    },

    applyAiToolCalls: async (calls) => {
      const mutatedIds: string[] = [];
      for (const call of calls ?? []) {
        const args = (call.arguments ?? {}) as Record<string, any>;
        if (call.name === "upsert_section") {
          const sec = get().upsertSection(Number(args.prefix), String(args.name), "ai-agent");
          mutatedIds.push(sec.id);
        } else if (call.name === "add_workflow_step") {
          const { node, edge } = get().addWorkflowStep({
            fromNodeId: String(args.from_node_id),
            sectionPrefix: Number(args.section_prefix),
            label: String(args.label),
            crud: (args.crud as CrudOperation) || "C",
            condition: args.condition ? String(args.condition) : "",
            kind: (args.kind as FlowNodeKind) || "step",
            notes: args.spoken_notes ? String(args.spoken_notes) : "",
            origin: "ai-agent",
          });
          mutatedIds.push(node.id, edge.id);
        } else if (call.name === "insert_step_between") {
          const mid = get().insertStepBetween({
            edgeId: String(args.edge_id),
            label: String(args.label),
            crudIn: (args.crud_in as CrudOperation) || "R",
            crudOut: (args.crud_out as CrudOperation) || "U",
            origin: "ai-agent",
          });
          if (mid) mutatedIds.push(mid.id);
        } else if (call.name === "connect_existing_nodes") {
          const edge = get().connectExistingNodes({
            fromNodeId: String(args.from_node_id),
            toNodeId: String(args.to_node_id),
            crud: (args.crud as CrudOperation) || "U",
            condition: args.condition ? String(args.condition) : "",
            origin: "ai-agent",
          });
          if (edge) mutatedIds.push(edge.id);
        } else if (call.name === "set_friction_sticky") {
          get().setFrictionSticky({
            nodeId: String(args.node_id),
            isSlow: args.is_slow_blue,
            slowNote: args.slow_reason,
            hasProblem: args.has_problem_red,
            problemNote: args.problem_reason,
            origin: "ai-agent",
          });
          mutatedIds.push(String(args.node_id));
        }
      }
      if (mutatedIds.length > 0) await get().runAutoLayout(true);
      return mutatedIds;
    },

    appendChatTurn: (speaker, transcript, mutatedIds = []) => {
      const turn: ChatTurn = {
        id: uid("turn"),
        speaker,
        transcript,
        mutatedIds,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({ chatHistory: [...s.chatHistory, turn] }));
    },

    sendFacilitatorTurn: async (userText, snapshotDataUrl) => {
      const state = get();
      const userTurn: ChatTurn = {
        id: uid("turn"),
        speaker: "user",
        transcript: userText,
        mutatedIds: [],
        timestamp: new Date().toISOString(),
      };
      set({ chatHistory: [...state.chatHistory, userTurn], isAiThinking: true });

      try {
        const res = await fetch("/api/facilitator/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: state.projectId,
            transcript: userText,
            selected_node_id: state.selectedNodeId,
            sections: state.sections,
            nodes: state.nodes,
            edges: state.edges,
            canvas_webp_data_url: snapshotDataUrl ?? null,
          }),
        });
        if (!res.ok) throw new Error(`Host engine returned ${res.status}`);
        const payload = await res.json();

        const mutatedIds = await get().applyAiToolCalls(payload.tool_calls ?? []);

        const aiTurn: ChatTurn = {
          id: uid("turn"),
          speaker: "ai",
          transcript: payload.reply || "Got it up on the board—what happens right after that?",
          mutatedIds,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ chatHistory: [...s.chatHistory, aiTurn], isAiThinking: false }));
      } catch {
        const fallbackTurn: ChatTurn = {
          id: uid("turn"),
          speaker: "ai",
          transcript:
            "Host Engine offline (start FastAPI on :8420 for live Ollama Qwen3.5 tool-calling). Direct canvas +5 editing and auto-layout are active!",
          mutatedIds: [],
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ chatHistory: [...s.chatHistory, fallbackTurn], isAiThinking: false }));
      }
    },

    loadSampleStarterBoard: async () => {
      if (!ydoc || !ySections || !yNodes || !yEdges) return;
      ydoc.transact(() => {
        ySections!.clear();
        yNodes!.clear();
        yEdges!.clear();
        [
          { id: "sec_0", prefix: 0, name: "Trigger", stickyColorHex: "#86efac", sortOrder: 0 },
          { id: "sec_100", prefix: 100, name: "Intake", stickyColorHex: "#fde047", sortOrder: 100 },
          { id: "sec_200", prefix: 200, name: "Capex Approval", stickyColorHex: "#fdba74", sortOrder: 200 },
          { id: "sec_300", prefix: 300, name: "Fulfillment", stickyColorHex: "#c4b5fd", sortOrder: 300 },
        ].forEach((s) => ySections!.set(s.id, s));

        const starterNodes: FlowNode[] = [
          {
            id: "n_trig",
            sectionPrefix: 0,
            label: "Need Established",
            notes: "Department identifies equipment or software need",
            kind: "trigger",
            isSlow: false,
            slowNote: "",
            hasProblem: false,
            problemNote: "",
            position: { x: 60, y: 180 },
            positionPinnedByUser: false,
            createdBy: "human",
            aiStatus: "confirmed",
          },
          {
            id: "n_105",
            sectionPrefix: 100,
            label: "Scope & Quote Gathered",
            notes: "Requestor collects vendor quote and GL code",
            kind: "step",
            isSlow: false,
            slowNote: "",
            hasProblem: true,
            problemNote: "Wrong GL code chosen 30% of the time",
            position: { x: 340, y: 180 },
            positionPinnedByUser: false,
            createdBy: "human",
            aiStatus: "confirmed",
          },
          {
            id: "n_205",
            sectionPrefix: 200,
            label: "Director Budget Review",
            notes: "Required when purchase exceeds $2,500",
            kind: "step",
            isSlow: true,
            slowNote: "Sits in inbox 4.5 days on average",
            hasProblem: false,
            problemNote: "",
            position: { x: 640, y: 90 },
            positionPinnedByUser: false,
            createdBy: "ai",
            aiStatus: "draft",
          },
          {
            id: "n_305",
            sectionPrefix: 300,
            label: "PO Issued",
            notes: "Purchase order dispatched to vendor",
            kind: "milestone",
            isSlow: false,
            slowNote: "",
            hasProblem: false,
            problemNote: "",
            position: { x: 940, y: 180 },
            positionPinnedByUser: false,
            createdBy: "human",
            aiStatus: "confirmed",
          },
          {
            id: "n_end",
            sectionPrefix: 300,
            label: "Invoice Paid",
            notes: "Three-way match completed and settled",
            kind: "terminal",
            isSlow: false,
            slowNote: "",
            hasProblem: false,
            problemNote: "",
            position: { x: 1220, y: 180 },
            positionPinnedByUser: false,
            createdBy: "human",
            aiStatus: "confirmed",
          },
        ];
        starterNodes.forEach((n) => yNodes!.set(n.id, n));

        const starterEdges: FlowEdge[] = [
          { id: "e_105", sourceNodeId: "n_trig", targetNodeId: "n_105", sectionPrefix: 100, stepNumber: 105, crud: "C", condition: "" },
          { id: "e_205", sourceNodeId: "n_105", targetNodeId: "n_205", sectionPrefix: 200, stepNumber: 205, crud: "R", condition: "If > $2,500" },
          { id: "e_305_fast", sourceNodeId: "n_105", targetNodeId: "n_305", sectionPrefix: 300, stepNumber: 305, crud: "C", condition: "If <= $2,500" },
          { id: "e_210", sourceNodeId: "n_205", targetNodeId: "n_305", sectionPrefix: 200, stepNumber: 210, crud: "U", condition: "Approved" },
          { id: "e_310", sourceNodeId: "n_305", targetNodeId: "n_end", sectionPrefix: 300, stepNumber: 310, crud: "U", condition: "" },
        ];
        starterEdges.forEach((e) => yEdges!.set(e.id, e));
      }, "human");
      await get().runAutoLayout(false);
    },
  };
});
