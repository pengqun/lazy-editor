import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type AiAction = "draft" | "expand" | "rewrite" | "research" | "summarize";
export type AiProvider = "claude" | "openai" | "ollama";

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

  runAction: (action: AiAction, params: Record<string, string>) => Promise<void>;
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

  runAction: async (action, params) => {
    set({ isStreaming: true, streamContent: "", currentAction: action });
    try {
      await invoke(`ai_${action}`, params);
    } catch (err) {
      console.error(`AI ${action} failed:`, err);
    } finally {
      set({ isStreaming: false, currentAction: null });
    }
  },

  cancelStream: () => {
    invoke("ai_cancel_stream").catch(console.error);
    set({ isStreaming: false, currentAction: null });
  },
}));
