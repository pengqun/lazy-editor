import type { Editor } from "@tiptap/react";
import { create } from "zustand";

interface EditorState {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;

  showCommandPalette: boolean;
  setShowCommandPalette: (show: boolean) => void;

  rightPanel: "knowledge" | "research" | null;
  setRightPanel: (panel: "knowledge" | "research" | null) => void;

  isAiStreaming: boolean;
  setAiStreaming: (streaming: boolean) => void;

  aiStreamContent: string;
  appendAiStream: (chunk: string) => void;
  clearAiStream: () => void;

  selectedText: string;
  setSelectedText: (text: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),

  showCommandPalette: false,
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  rightPanel: "knowledge",
  setRightPanel: (panel) => set({ rightPanel: panel }),

  isAiStreaming: false,
  setAiStreaming: (streaming) => set({ isAiStreaming: streaming }),

  aiStreamContent: "",
  appendAiStream: (chunk) => set((state) => ({ aiStreamContent: state.aiStreamContent + chunk })),
  clearAiStream: () => set({ aiStreamContent: "" }),

  selectedText: "",
  setSelectedText: (text) => set({ selectedText: text }),
}));
