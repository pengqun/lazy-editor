import { useAiStore } from "@/stores/ai";
import { useKnowledgeStore } from "@/stores/knowledge";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
  useAiStore.setState({
    settings: {
      provider: "claude",
      claudeApiKey: "",
      claudeModel: "claude-sonnet-4-20250514",
      openaiApiKey: "",
      openaiModel: "gpt-4o",
      ollamaEndpoint: "http://localhost:11434",
      ollamaModel: "llama3.2",
      temperature: 0.7,
      maxTokens: 4096,
    },
    isStreaming: false,
    streamContent: "",
    currentAction: null,
    outputPlacementOverride: null,
    lockedPlacement: null,
  });
}

describe("useAiStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("has correct default settings", () => {
    const { settings } = useAiStore.getState();
    expect(settings.provider).toBe("claude");
    expect(settings.temperature).toBe(0.7);
    expect(settings.maxTokens).toBe(4096);
    expect(settings.claudeModel).toBe("claude-sonnet-4-20250514");
  });

  it("setSettings merges partial settings", () => {
    useAiStore.getState().setSettings({ provider: "openai", temperature: 0.5 });
    const { settings } = useAiStore.getState();
    expect(settings.provider).toBe("openai");
    expect(settings.temperature).toBe(0.5);
    // Other fields unchanged
    expect(settings.maxTokens).toBe(4096);
  });

  it("saveSettings calls invoke with current settings", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    await useAiStore.getState().saveSettings();
    expect(mockedInvoke).toHaveBeenCalledWith("save_ai_settings", {
      settings: useAiStore.getState().settings,
    });
  });

  it("loadSettings calls invoke and merges result", async () => {
    mockedInvoke.mockResolvedValueOnce({
      provider: "ollama",
      ollamaModel: "mistral",
    });
    await useAiStore.getState().loadSettings();
    const { settings } = useAiStore.getState();
    expect(settings.provider).toBe("ollama");
    expect(settings.ollamaModel).toBe("mistral");
    // Defaults preserved
    expect(settings.maxTokens).toBe(4096);
  });

  it("loadSettings handles error gracefully (uses defaults)", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("first run"));
    await useAiStore.getState().loadSettings();
    expect(useAiStore.getState().settings.provider).toBe("claude");
  });

  it("runAction sets streaming state and calls invoke with retrieval params", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const promise = useAiStore.getState().runAction("draft", { topic: "test" });

    // During the action, streaming should be true
    expect(useAiStore.getState().isStreaming).toBe(true);
    expect(useAiStore.getState().currentAction).toBe("draft");

    await promise;

    // topK is injected from knowledge store defaults
    expect(mockedInvoke).toHaveBeenCalledWith("ai_draft", { topic: "test", topK: 5 });
    expect(useAiStore.getState().isStreaming).toBe(false);
    expect(useAiStore.getState().currentAction).toBeNull();
  });

  it("runAction injects scopeDocIds when knowledge store scope is pinned", async () => {
    useKnowledgeStore.setState({
      retrievalTopK: 3,
      retrievalScope: "pinned",
      pinnedDocIds: new Set([10, 20]),
    });
    mockedInvoke.mockResolvedValueOnce(undefined);
    await useAiStore.getState().runAction("research", { query: "test" });
    expect(mockedInvoke).toHaveBeenCalledWith("ai_research", {
      query: "test",
      topK: 3,
      scopeDocIds: expect.arrayContaining([10, 20]),
    });
  });

  it("runAction does not inject retrieval params for summarize", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    await useAiStore.getState().runAction("summarize", { text: "hello" });
    expect(mockedInvoke).toHaveBeenCalledWith("ai_summarize", { text: "hello" });
  });

  it("runAction resets streaming on error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("API error"));
    await useAiStore.getState().runAction("expand", { selectedText: "hello" });
    expect(useAiStore.getState().isStreaming).toBe(false);
    expect(useAiStore.getState().currentAction).toBeNull();
  });

  it("cancelStream calls invoke and resets state", () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    useAiStore.setState({
      isStreaming: true,
      currentAction: "draft",
      lockedPlacement: "insert_at_cursor",
      citations: [{ documentTitle: "Doc", documentId: 1, chunkId: 1, chunkIndex: 0, score: 0.9 }],
    });
    useAiStore.getState().cancelStream();
    expect(mockedInvoke).toHaveBeenCalledWith("ai_cancel_stream");
    expect(useAiStore.getState().isStreaming).toBe(false);
    expect(useAiStore.getState().currentAction).toBeNull();
    expect(useAiStore.getState().lockedPlacement).toBeNull();
    expect(useAiStore.getState().citations).toEqual([]);
  });

  describe("citations", () => {
    it("has empty citations by default", () => {
      expect(useAiStore.getState().citations).toEqual([]);
    });

    it("setCitations stores citation sources", () => {
      const citations = [
        { documentTitle: "Doc A", documentId: 1, chunkId: 10, chunkIndex: 0, score: 0.95 },
        { documentTitle: "Doc B", documentId: 2, chunkId: 20, chunkIndex: 1, score: 0.80 },
      ];
      useAiStore.getState().setCitations(citations);
      expect(useAiStore.getState().citations).toEqual(citations);
    });

    it("runAction clears citations on start", async () => {
      useAiStore.setState({
        citations: [{ documentTitle: "Old", documentId: 1, chunkId: 1, chunkIndex: 0, score: 0.5 }],
      });
      mockedInvoke.mockResolvedValueOnce(undefined);
      await useAiStore.getState().runAction("draft", { topic: "test" });
      expect(useAiStore.getState().citations).toEqual([]);
    });
  });

  describe("output placement", () => {
    it("has null outputPlacementOverride by default", () => {
      expect(useAiStore.getState().outputPlacementOverride).toBeNull();
    });

    it("setOutputPlacementOverride persists the mode", () => {
      useAiStore.getState().setOutputPlacementOverride("append_to_end");
      expect(useAiStore.getState().outputPlacementOverride).toBe("append_to_end");
    });

    it("setOutputPlacementOverride can reset to null (auto)", () => {
      useAiStore.getState().setOutputPlacementOverride("append_to_end");
      useAiStore.getState().setOutputPlacementOverride(null);
      expect(useAiStore.getState().outputPlacementOverride).toBeNull();
    });

    it("runAction locks placement to insert_at_cursor when no selection and no override", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      const promise = useAiStore.getState().runAction("draft", { topic: "test" }, false);
      expect(useAiStore.getState().lockedPlacement).toBe("insert_at_cursor");
      await promise;
      expect(useAiStore.getState().lockedPlacement).toBeNull();
    });

    it("runAction locks placement to replace_selection when selection exists", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      const promise = useAiStore.getState().runAction("expand", { selectedText: "hi" }, true);
      expect(useAiStore.getState().lockedPlacement).toBe("replace_selection");
      await promise;
    });

    it("runAction uses override when set", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      useAiStore.getState().setOutputPlacementOverride("append_to_end");
      const promise = useAiStore.getState().runAction("draft", { topic: "test" }, false);
      expect(useAiStore.getState().lockedPlacement).toBe("append_to_end");
      await promise;
    });

    it("runAction falls back replace_selection override to insert_at_cursor without selection", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      useAiStore.getState().setOutputPlacementOverride("replace_selection");
      const promise = useAiStore.getState().runAction("draft", { topic: "test" }, false);
      expect(useAiStore.getState().lockedPlacement).toBe("insert_at_cursor");
      await promise;
    });

    it("cancelStream clears lockedPlacement", () => {
      mockedInvoke.mockResolvedValueOnce(undefined);
      useAiStore.setState({ isStreaming: true, lockedPlacement: "append_to_end" });
      useAiStore.getState().cancelStream();
      expect(useAiStore.getState().lockedPlacement).toBeNull();
    });
  });
});
