import { useEditorStore } from "@/stores/editor";
import { beforeEach, describe, expect, it } from "vitest";

// Reset store between tests
function resetStore() {
  useEditorStore.setState({
    editor: null,
    showCommandPalette: false,
    showShortcutHelp: false,
    rightPanel: "knowledge",
    isAiStreaming: false,
    aiStreamContent: "",
    selectedText: "",
  });
}

describe("useEditorStore", () => {
  beforeEach(resetStore);

  it("has correct initial state", () => {
    const state = useEditorStore.getState();
    expect(state.editor).toBeNull();
    expect(state.showCommandPalette).toBe(false);
    expect(state.showShortcutHelp).toBe(false);
    expect(state.rightPanel).toBe("knowledge");
    expect(state.isAiStreaming).toBe(false);
    expect(state.aiStreamContent).toBe("");
    expect(state.selectedText).toBe("");
  });

  it("setShowCommandPalette toggles visibility", () => {
    useEditorStore.getState().setShowCommandPalette(true);
    expect(useEditorStore.getState().showCommandPalette).toBe(true);

    useEditorStore.getState().setShowCommandPalette(false);
    expect(useEditorStore.getState().showCommandPalette).toBe(false);
  });

  it("setShowShortcutHelp toggles visibility", () => {
    useEditorStore.getState().setShowShortcutHelp(true);
    expect(useEditorStore.getState().showShortcutHelp).toBe(true);

    useEditorStore.getState().setShowShortcutHelp(false);
    expect(useEditorStore.getState().showShortcutHelp).toBe(false);
  });

  it("setRightPanel switches panels", () => {
    useEditorStore.getState().setRightPanel("research");
    expect(useEditorStore.getState().rightPanel).toBe("research");

    useEditorStore.getState().setRightPanel(null);
    expect(useEditorStore.getState().rightPanel).toBeNull();
  });

  it("setAiStreaming updates streaming flag", () => {
    useEditorStore.getState().setAiStreaming(true);
    expect(useEditorStore.getState().isAiStreaming).toBe(true);
  });

  it("appendAiStream concatenates chunks", () => {
    const { appendAiStream } = useEditorStore.getState();
    appendAiStream("Hello ");
    appendAiStream("world");
    expect(useEditorStore.getState().aiStreamContent).toBe("Hello world");
  });

  it("clearAiStream resets content", () => {
    useEditorStore.getState().appendAiStream("some content");
    useEditorStore.getState().clearAiStream();
    expect(useEditorStore.getState().aiStreamContent).toBe("");
  });

  it("setSelectedText stores selected text", () => {
    useEditorStore.getState().setSelectedText("selected paragraph");
    expect(useEditorStore.getState().selectedText).toBe("selected paragraph");
  });
});
