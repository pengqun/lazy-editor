import {
  loadDocRetrievalSettings,
  loadWorkspaceRetrievalSettings,
  saveWorkspaceRetrievalSettings,
} from "@/lib/retrieval-presets";
import { useKnowledgeStore } from "@/stores/knowledge";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
  localStorage.removeItem("lazy-editor:retrieval-preset");
  useKnowledgeStore.setState({
    documents: [],
    isIngesting: false,
    ingestProgress: "",
    searchResults: [],
    pinnedDocIds: new Set(),
    retrievalTopK: 5,
    retrievalScope: "all",
    activePreset: null,
    _activeDocPath: null,
    _workspacePath: null,
    settingsSource: "global",
    viewedChunk: null,
    viewedChunkQuery: null,
    viewedChunkScore: null,
    viewChunkLoading: false,
  });
}

describe("useKnowledgeStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useKnowledgeStore.getState();
    expect(state.documents).toEqual([]);
    expect(state.isIngesting).toBe(false);
    expect(state.searchResults).toEqual([]);
    expect(state.pinnedDocIds.size).toBe(0);
  });

  it("loadDocuments calls invoke and sets documents", async () => {
    const docs = [
      {
        id: 1,
        title: "Doc 1",
        sourceType: "paste",
        sourcePath: null,
        createdAt: "2024-01-01",
        chunkCount: 3,
      },
    ];
    mockedInvoke.mockResolvedValueOnce(docs);

    await useKnowledgeStore.getState().loadDocuments();

    expect(mockedInvoke).toHaveBeenCalledWith("list_kb_documents");
    expect(useKnowledgeStore.getState().documents).toEqual(docs);
  });

  it("ingestText sets ingesting state and reloads documents", async () => {
    mockedInvoke
      .mockResolvedValueOnce(undefined) // ingest_text
      .mockResolvedValueOnce([]); // list_kb_documents (reload)

    const promise = useKnowledgeStore.getState().ingestText("My Note", "some content");
    expect(useKnowledgeStore.getState().isIngesting).toBe(true);

    await promise;
    expect(mockedInvoke).toHaveBeenCalledWith("ingest_text", {
      title: "My Note",
      text: "some content",
    });
    expect(useKnowledgeStore.getState().isIngesting).toBe(false);
  });

  it("searchKB calls invoke and returns results", async () => {
    const results = [
      { chunkContent: "result text", documentTitle: "Doc", documentId: 1, score: 0.85 },
    ];
    mockedInvoke.mockResolvedValueOnce(results);

    const returned = await useKnowledgeStore.getState().searchKB("test query", 3);

    expect(mockedInvoke).toHaveBeenCalledWith("search_knowledge_base", {
      query: "test query",
      topK: 3,
    });
    expect(returned).toEqual(results);
    expect(useKnowledgeStore.getState().searchResults).toEqual(results);
  });

  it("searchKB returns empty array on error", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("search failed"));
    const results = await useKnowledgeStore.getState().searchKB("query");
    expect(results).toEqual([]);
  });

  it("removeDocument calls invoke and reloads", async () => {
    mockedInvoke
      .mockResolvedValueOnce(undefined) // remove_kb_document
      .mockResolvedValueOnce([]); // list_kb_documents

    await useKnowledgeStore.getState().removeDocument(42);
    expect(mockedInvoke).toHaveBeenCalledWith("remove_kb_document", { id: 42 });
  });

  it("togglePinDocument adds then removes document id", () => {
    const { togglePinDocument } = useKnowledgeStore.getState();
    togglePinDocument(5);
    expect(useKnowledgeStore.getState().pinnedDocIds.has(5)).toBe(true);

    togglePinDocument(5);
    expect(useKnowledgeStore.getState().pinnedDocIds.has(5)).toBe(false);
  });

  it("togglePinDocument handles multiple document ids", () => {
    const { togglePinDocument } = useKnowledgeStore.getState();
    togglePinDocument(1);
    togglePinDocument(2);
    togglePinDocument(3);
    const pinned = useKnowledgeStore.getState().pinnedDocIds;
    expect(pinned.size).toBe(3);
    expect(pinned.has(1)).toBe(true);
    expect(pinned.has(2)).toBe(true);
    expect(pinned.has(3)).toBe(true);
  });

  describe("viewChunk with query and score", () => {
    it("stores query and score when provided", async () => {
      const mockChunk = {
        chunkContent: "some content about testing",
        documentTitle: "Test Doc",
        documentId: 1,
        chunkId: 10,
        chunkIndex: 2,
        totalChunks: 5,
        prevChunk: "prev",
        nextChunk: "next",
      };
      mockedInvoke.mockResolvedValueOnce(mockChunk);

      await useKnowledgeStore.getState().viewChunk(10, "testing concepts", 0.87);

      const state = useKnowledgeStore.getState();
      expect(state.viewedChunk).toEqual(mockChunk);
      expect(state.viewedChunkQuery).toBe("testing concepts");
      expect(state.viewedChunkScore).toBe(0.87);
    });

    it("sets query/score to null when empty string query passed", async () => {
      mockedInvoke.mockResolvedValueOnce({
        chunkContent: "c",
        documentTitle: "D",
        documentId: 1,
        chunkId: 1,
        chunkIndex: 0,
        totalChunks: 1,
        prevChunk: null,
        nextChunk: null,
      });

      await useKnowledgeStore.getState().viewChunk(1, "", 0.5);

      expect(useKnowledgeStore.getState().viewedChunkQuery).toBeNull();
      expect(useKnowledgeStore.getState().viewedChunkScore).toBe(0.5);
    });

    it("preserves query/score when navigating without passing them", async () => {
      // Set initial state
      useKnowledgeStore.setState({ viewedChunkQuery: "my query", viewedChunkScore: 0.9 });

      mockedInvoke.mockResolvedValueOnce({
        chunkContent: "c",
        documentTitle: "D",
        documentId: 1,
        chunkId: 2,
        chunkIndex: 1,
        totalChunks: 3,
        prevChunk: null,
        nextChunk: null,
      });

      // Navigate without query/score (e.g., prev/next click)
      await useKnowledgeStore.getState().viewChunk(2);

      const state = useKnowledgeStore.getState();
      expect(state.viewedChunkQuery).toBe("my query");
      expect(state.viewedChunkScore).toBe(0.9);
    });

    it("clears query/score on closeChunkViewer", async () => {
      useKnowledgeStore.setState({
        viewedChunk: {
          chunkContent: "c",
          documentTitle: "D",
          documentId: 1,
          chunkId: 1,
          chunkIndex: 0,
          totalChunks: 1,
          prevChunk: null,
          nextChunk: null,
        },
        viewedChunkQuery: "some query",
        viewedChunkScore: 0.75,
      });

      useKnowledgeStore.getState().closeChunkViewer();

      const state = useKnowledgeStore.getState();
      expect(state.viewedChunk).toBeNull();
      expect(state.viewedChunkQuery).toBeNull();
      expect(state.viewedChunkScore).toBeNull();
    });
  });

  describe("retrieval settings", () => {
    it("has correct defaults", () => {
      const state = useKnowledgeStore.getState();
      expect(state.retrievalTopK).toBe(5);
      expect(state.retrievalScope).toBe("all");
    });

    it("setRetrievalTopK updates value", () => {
      useKnowledgeStore.getState().setRetrievalTopK(8);
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(8);
    });

    it("setRetrievalTopK clamps to 1–10", () => {
      useKnowledgeStore.getState().setRetrievalTopK(0);
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(1);
      useKnowledgeStore.getState().setRetrievalTopK(15);
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(10);
    });

    it("setRetrievalScope updates value", () => {
      useKnowledgeStore.getState().setRetrievalScope("pinned");
      expect(useKnowledgeStore.getState().retrievalScope).toBe("pinned");
    });

    it("getScopeDocIds returns undefined for scope=all", () => {
      useKnowledgeStore.getState().setRetrievalScope("all");
      expect(useKnowledgeStore.getState().getScopeDocIds()).toBeUndefined();
    });

    it("getScopeDocIds returns undefined for scope=pinned with no pins", () => {
      useKnowledgeStore.getState().setRetrievalScope("pinned");
      expect(useKnowledgeStore.getState().getScopeDocIds()).toBeUndefined();
    });

    it("getScopeDocIds returns pinned IDs for scope=pinned with pins", () => {
      useKnowledgeStore.getState().togglePinDocument(10);
      useKnowledgeStore.getState().togglePinDocument(20);
      useKnowledgeStore.getState().setRetrievalScope("pinned");
      const ids = useKnowledgeStore.getState().getScopeDocIds();
      expect(ids).toBeDefined();
      expect(ids!.sort()).toEqual([10, 20]);
    });
  });

  describe("retrieval presets", () => {
    it("has null activePreset by default (no localStorage)", () => {
      expect(useKnowledgeStore.getState().activePreset).toBeNull();
    });

    it("setPreset applies writing preset settings", () => {
      useKnowledgeStore.getState().setPreset("writing");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBe("writing");
      expect(state.retrievalTopK).toBe(5);
      expect(state.retrievalScope).toBe("all");
    });

    it("setPreset applies research preset settings", () => {
      useKnowledgeStore.getState().setPreset("research");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBe("research");
      expect(state.retrievalTopK).toBe(8);
      expect(state.retrievalScope).toBe("all");
    });

    it("setPreset applies precision preset settings", () => {
      useKnowledgeStore.getState().setPreset("precision");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBe("precision");
      expect(state.retrievalTopK).toBe(3);
      expect(state.retrievalScope).toBe("pinned");
    });

    it("setPreset persists to localStorage", () => {
      useKnowledgeStore.getState().setPreset("research");
      expect(localStorage.getItem("lazy-editor:retrieval-preset")).toBe("research");
    });

    it("manual topK change clears preset when settings no longer match", () => {
      useKnowledgeStore.getState().setPreset("writing");
      expect(useKnowledgeStore.getState().activePreset).toBe("writing");

      useKnowledgeStore.getState().setRetrievalTopK(7);
      expect(useKnowledgeStore.getState().activePreset).toBeNull();
    });

    it("manual topK change detects matching preset", () => {
      useKnowledgeStore.getState().setPreset("writing");
      // Change topK to research value (8) while scope is still "all"
      useKnowledgeStore.getState().setRetrievalTopK(8);
      expect(useKnowledgeStore.getState().activePreset).toBe("research");
    });

    it("manual scope change clears preset when settings no longer match", () => {
      useKnowledgeStore.getState().setPreset("research");
      useKnowledgeStore.getState().setRetrievalScope("pinned");
      // topK=8, scope=pinned doesn't match any preset
      expect(useKnowledgeStore.getState().activePreset).toBeNull();
    });

    it("manual scope change detects matching preset", () => {
      // Start at topK=3, scope=all (no preset match)
      useKnowledgeStore.getState().setRetrievalTopK(3);
      expect(useKnowledgeStore.getState().activePreset).toBeNull();
      // Switch scope to pinned → matches precision
      useKnowledgeStore.getState().setRetrievalScope("pinned");
      expect(useKnowledgeStore.getState().activePreset).toBe("precision");
    });

    it("switching presets updates localStorage each time", () => {
      useKnowledgeStore.getState().setPreset("writing");
      expect(localStorage.getItem("lazy-editor:retrieval-preset")).toBe("writing");
      useKnowledgeStore.getState().setPreset("precision");
      expect(localStorage.getItem("lazy-editor:retrieval-preset")).toBe("precision");
    });

    it("clearing preset via manual override removes from localStorage", () => {
      useKnowledgeStore.getState().setPreset("writing");
      useKnowledgeStore.getState().setRetrievalTopK(7); // no matching preset
      expect(localStorage.getItem("lazy-editor:retrieval-preset")).toBeNull();
    });
  });

  describe("per-document retrieval settings", () => {
    beforeEach(() => {
      // Clear any per-doc storage
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("lazy-editor:doc-retrieval:")) {
          localStorage.removeItem(key);
        }
      }
    });

    it("restoreForDocument sets _activeDocPath", () => {
      useKnowledgeStore.getState().restoreForDocument("/path/essay.md");
      expect(useKnowledgeStore.getState()._activeDocPath).toBe("/path/essay.md");
    });

    it("restoreForDocument falls back to global preset for new documents", () => {
      // Set a global preset first
      localStorage.setItem("lazy-editor:retrieval-preset", "research");
      useKnowledgeStore.getState().restoreForDocument("/new-file.md");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBe("research");
      expect(state.retrievalTopK).toBe(8);
      expect(state.retrievalScope).toBe("all");
    });

    it("restoreForDocument falls back to defaults when no global preset", () => {
      useKnowledgeStore.getState().restoreForDocument("/new-file.md");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBeNull();
      expect(state.retrievalTopK).toBe(5);
      expect(state.retrievalScope).toBe("all");
    });

    it("restoreForDocument(null) uses global defaults", () => {
      localStorage.setItem("lazy-editor:retrieval-preset", "precision");
      useKnowledgeStore.getState().restoreForDocument(null);
      const state = useKnowledgeStore.getState();
      expect(state._activeDocPath).toBeNull();
      expect(state.activePreset).toBe("precision");
      expect(state.retrievalTopK).toBe(3);
      expect(state.retrievalScope).toBe("pinned");
    });

    it("setPreset persists per-document when _activeDocPath is set", () => {
      useKnowledgeStore.getState().restoreForDocument("/essay.md");
      useKnowledgeStore.getState().setPreset("precision");

      const saved = loadDocRetrievalSettings("/essay.md");
      expect(saved).toEqual({ preset: "precision", topK: 3, scope: "pinned" });
    });

    it("setRetrievalTopK persists per-document", () => {
      useKnowledgeStore.getState().restoreForDocument("/essay.md");
      useKnowledgeStore.getState().setRetrievalTopK(7);

      const saved = loadDocRetrievalSettings("/essay.md");
      expect(saved?.topK).toBe(7);
      expect(saved?.preset).toBeNull(); // 7 doesn't match any preset
    });

    it("setRetrievalScope persists per-document", () => {
      useKnowledgeStore.getState().restoreForDocument("/essay.md");
      useKnowledgeStore.getState().setPreset("writing"); // topK=5, scope=all
      useKnowledgeStore.getState().setRetrievalScope("pinned");

      const saved = loadDocRetrievalSettings("/essay.md");
      expect(saved?.scope).toBe("pinned");
    });

    it("does not persist per-document when no active doc", () => {
      useKnowledgeStore.getState().restoreForDocument(null);
      useKnowledgeStore.getState().setPreset("research");

      // No per-doc key should exist
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("lazy-editor:doc-retrieval:"),
      );
      expect(keys).toHaveLength(0);
      // But global should be updated
      expect(localStorage.getItem("lazy-editor:retrieval-preset")).toBe("research");
    });

    it("switching documents restores each document's saved settings", () => {
      // Set up doc A with precision
      useKnowledgeStore.getState().restoreForDocument("/a.md");
      useKnowledgeStore.getState().setPreset("precision");
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(3);

      // Set up doc B with research
      useKnowledgeStore.getState().restoreForDocument("/b.md");
      useKnowledgeStore.getState().setPreset("research");
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(8);

      // Switch back to A — should restore precision
      useKnowledgeStore.getState().restoreForDocument("/a.md");
      const state = useKnowledgeStore.getState();
      expect(state.activePreset).toBe("precision");
      expect(state.retrievalTopK).toBe(3);
      expect(state.retrievalScope).toBe("pinned");

      // Switch back to B — should restore research
      useKnowledgeStore.getState().restoreForDocument("/b.md");
      const state2 = useKnowledgeStore.getState();
      expect(state2.activePreset).toBe("research");
      expect(state2.retrievalTopK).toBe(8);
      expect(state2.retrievalScope).toBe("all");
    });

    it("preset detection works after document switching", () => {
      // Set up doc with custom settings
      useKnowledgeStore.getState().restoreForDocument("/custom.md");
      useKnowledgeStore.getState().setRetrievalTopK(7);
      expect(useKnowledgeStore.getState().activePreset).toBeNull();

      // Switch to another doc and back
      useKnowledgeStore.getState().restoreForDocument("/other.md");
      useKnowledgeStore.getState().restoreForDocument("/custom.md");

      // Should restore as custom (null preset)
      expect(useKnowledgeStore.getState().activePreset).toBeNull();
      expect(useKnowledgeStore.getState().retrievalTopK).toBe(7);

      // Now change to match a preset
      useKnowledgeStore.getState().setRetrievalTopK(5);
      expect(useKnowledgeStore.getState().activePreset).toBe("writing");
    });
  });

  describe("workspace-level retrieval defaults", () => {
    beforeEach(() => {
      // Clear all storage to avoid cross-test leakage
      localStorage.clear();
    });

    it("setWorkspacePath updates _workspacePath", () => {
      useKnowledgeStore.getState().setWorkspacePath("/my-workspace");
      expect(useKnowledgeStore.getState()._workspacePath).toBe("/my-workspace");
    });

    it("settingsSource defaults to global", () => {
      expect(useKnowledgeStore.getState().settingsSource).toBe("global");
    });

    it("restoreForDocument uses workspace default when no per-doc settings exist", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });

      useKnowledgeStore.getState().restoreForDocument("/new-file.md");
      const state = useKnowledgeStore.getState();
      expect(state.settingsSource).toBe("workspace");
      expect(state.activePreset).toBe("precision");
      expect(state.retrievalTopK).toBe(3);
      expect(state.retrievalScope).toBe("pinned");
    });

    it("restoreForDocument prefers per-doc over workspace", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "precision", topK: 3, scope: "pinned" });

      // Set up per-doc settings
      useKnowledgeStore.getState().restoreForDocument("/essay.md");
      useKnowledgeStore.getState().setPreset("research");

      // Switch away and back
      useKnowledgeStore.getState().restoreForDocument("/other.md");
      useKnowledgeStore.getState().restoreForDocument("/essay.md");

      const state = useKnowledgeStore.getState();
      expect(state.settingsSource).toBe("doc");
      expect(state.activePreset).toBe("research");
      expect(state.retrievalTopK).toBe(8);
    });

    it("restoreForDocument falls back to global when no workspace settings", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      localStorage.setItem("lazy-editor:retrieval-preset", "writing");

      useKnowledgeStore.getState().restoreForDocument("/file.md");
      const state = useKnowledgeStore.getState();
      expect(state.settingsSource).toBe("global");
      expect(state.activePreset).toBe("writing");
    });

    it("three-tier precedence: per-doc > workspace > global", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      localStorage.setItem("lazy-editor:retrieval-preset", "writing");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "research", topK: 8, scope: "all" });

      // File with no per-doc settings => workspace
      useKnowledgeStore.getState().restoreForDocument("/new.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("workspace");
      expect(useKnowledgeStore.getState().activePreset).toBe("research");

      // Save per-doc override
      useKnowledgeStore.getState().setPreset("precision");
      expect(useKnowledgeStore.getState().settingsSource).toBe("doc");

      // Switch away and back — per-doc should still win
      useKnowledgeStore.getState().restoreForDocument("/other.md");
      useKnowledgeStore.getState().restoreForDocument("/new.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("doc");
      expect(useKnowledgeStore.getState().activePreset).toBe("precision");
    });

    it("saveAsWorkspaceDefault persists current settings to workspace storage", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      useKnowledgeStore.getState().setPreset("precision");
      useKnowledgeStore.getState().saveAsWorkspaceDefault();

      const loaded = loadWorkspaceRetrievalSettings("/workspace");
      expect(loaded).toEqual({ preset: "precision", topK: 3, scope: "pinned" });
    });

    it("saveAsWorkspaceDefault does nothing when no workspace path", () => {
      useKnowledgeStore.getState().setPreset("research");
      useKnowledgeStore.getState().saveAsWorkspaceDefault();

      // No workspace keys should exist
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("lazy-editor:workspace-retrieval:"),
      );
      expect(keys).toHaveLength(0);
    });

    it("manual changes set settingsSource to doc when activeDocPath exists", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "writing", topK: 5, scope: "all" });

      useKnowledgeStore.getState().restoreForDocument("/file.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("workspace");

      // Manual change promotes to per-doc
      useKnowledgeStore.getState().setRetrievalTopK(7);
      expect(useKnowledgeStore.getState().settingsSource).toBe("doc");
    });

    it("workspace defaults apply to all new documents in that workspace", () => {
      useKnowledgeStore.getState().setWorkspacePath("/workspace");
      saveWorkspaceRetrievalSettings("/workspace", { preset: "research", topK: 8, scope: "all" });

      // Multiple new files should all get workspace defaults
      useKnowledgeStore.getState().restoreForDocument("/file-a.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("workspace");
      expect(useKnowledgeStore.getState().activePreset).toBe("research");

      useKnowledgeStore.getState().restoreForDocument("/file-b.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("workspace");
      expect(useKnowledgeStore.getState().activePreset).toBe("research");

      useKnowledgeStore.getState().restoreForDocument("/file-c.md");
      expect(useKnowledgeStore.getState().settingsSource).toBe("workspace");
      expect(useKnowledgeStore.getState().activePreset).toBe("research");
    });
  });
});
