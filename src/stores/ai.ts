import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { type OutputPlacementMode, resolveOutputPlacement } from "../lib/output-placement";
import type { CitationSource } from "../lib/tauri";
import { useKnowledgeStore } from "./knowledge";
import { toast } from "./toast";

export type AiAction = "draft" | "expand" | "rewrite" | "research" | "summarize";
export type AiProvider = "claude" | "openai" | "ollama";
export type AiPhase = "idle" | "searching_kb" | "streaming" | "done" | "error";

export interface AiSettings {
  provider: AiProvider;
  claudeApiKey: string;
  claudeModel: string;
  openaiApiKey: string;
  openaiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  temperature: number;
  maxTokens: number;
}

interface AiState {
  settings: AiSettings;
  setSettings: (settings: Partial<AiSettings>) => void;
  saveSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;

  isStreaming: boolean;
  streamContent: string;
  currentAction: AiAction | null;
  aiPhase: AiPhase;
  aiError: string | null;
  setAiPhase: (phase: AiPhase) => void;

  /** Citation sources from KB used in the current AI action. */
  citations: CitationSource[];
  setCitations: (citations: CitationSource[]) => void;

  /** The query text that was used for KB retrieval in the current AI action. */
  lastKbQuery: string;

  /** User-selected output placement override (null = auto-detect). */
  outputPlacementOverride: OutputPlacementMode | null;
  setOutputPlacementOverride: (mode: OutputPlacementMode | null) => void;

  /** Resolved placement mode locked for the current action (null when idle). */
  lockedPlacement: OutputPlacementMode | null;

  runAction: (
    action: AiAction,
    params: Record<string, string>,
    hasSelection?: boolean,
  ) => Promise<void>;
  cancelStream: () => void;
}

const DEFAULT_SETTINGS: AiSettings = {
  provider: "claude",
  claudeApiKey: "",
  claudeModel: "claude-sonnet-4-20250514",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  temperature: 0.7,
  maxTokens: 4096,
};

export const useAiStore = create<AiState>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  saveSettings: async () => {
    try {
      await invoke("save_ai_settings", { settings: get().settings });
    } catch (err) {
      console.error("Failed to save AI settings:", err);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await invoke<AiSettings>("load_ai_settings");
      set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
    } catch {
      // First run — use defaults
    }
  },

  isStreaming: false,
  streamContent: "",
  currentAction: null,
  aiPhase: "idle",
  aiError: null,
  setAiPhase: (phase) => set({ aiPhase: phase }),

  citations: [],
  setCitations: (citations) => set({ citations }),

  lastKbQuery: "",

  outputPlacementOverride: null,
  setOutputPlacementOverride: (mode) => set({ outputPlacementOverride: mode }),

  lockedPlacement: null,

  runAction: async (action, params, hasSelection = false) => {
    if (get().isStreaming) return; // prevent duplicate triggers

    const locked = resolveOutputPlacement(get().outputPlacementOverride, hasSelection);

    // Derive the KB query from the action params (used for citation highlighting later)
    const kbQuery =
      action === "draft"
        ? (params.topic ?? "")
        : action === "research"
          ? (params.query ?? "")
          : (params.selectedText ?? "");

    set({
      isStreaming: true,
      streamContent: "",
      currentAction: action,
      aiPhase: "searching_kb",
      aiError: null,
      lockedPlacement: locked,
      citations: [],
      lastKbQuery: kbQuery,
    });
    // Inject retrieval controls for KB-backed actions (summarize has no KB query)
    const invokeParams: Record<string, unknown> = { ...params };
    if (action !== "summarize") {
      const kbStore = useKnowledgeStore.getState();
      invokeParams.topK = kbStore.retrievalTopK;
      const scopeDocIds = kbStore.getScopeDocIds();
      if (scopeDocIds) {
        invokeParams.scopeDocIds = scopeDocIds;
      }
    }

    try {
      await invoke(`ai_${action}`, invokeParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`AI ${action} failed:`, message);
      set({
        aiPhase: "error",
        aiError: message,
        isStreaming: false,
        currentAction: null,
        lockedPlacement: null,
      });
      toast.error(`AI ${action} failed: ${message}`);
      return;
    }

    // If backend invocation finished before any stream-phase update,
    // reset to idle to avoid a stuck loading state in non-stream/error paths.
    if (get().aiPhase === "searching_kb") {
      set({ isStreaming: false, currentAction: null, lockedPlacement: null });
    }
  },

  cancelStream: () => {
    invoke("ai_cancel_stream").catch(console.error);
    set({
      isStreaming: false,
      currentAction: null,
      aiPhase: "idle",
      aiError: null,
      lockedPlacement: null,
      citations: [],
    });
  },
}));
