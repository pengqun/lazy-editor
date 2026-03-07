import { useKnowledgeStore } from "@/stores/knowledge";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
  useKnowledgeStore.setState({
    documents: [],
    isIngesting: false,
    ingestProgress: "",
    searchResults: [],
    pinnedDocIds: new Set(),
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
});
