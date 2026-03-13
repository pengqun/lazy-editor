import { KnowledgePanel } from "@/components/sidebar/KnowledgePanel";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CITATION_LINK_SELECTOR,
  buildReferenceHtml,
  citationDataAttrs,
  parseCitationElement,
} from "@/lib/citation-notes";
import type { CitationSource } from "@/lib/tauri";
import { navigateToCitationSource } from "@/hooks/useAI";
import { useEditorStore } from "@/stores/editor";
import { useKnowledgeStore } from "@/stores/knowledge";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockedInvoke = vi.mocked(invoke);

const makeCitation = (overrides: Partial<CitationSource> = {}): CitationSource => ({
  documentTitle: "Test Doc",
  documentId: 1,
  chunkId: 10,
  chunkIndex: 0,
  score: 0.9,
  ...overrides,
});

function resetStores() {
  useEditorStore.setState({
    editor: null,
    showCommandPalette: false,
    showShortcutHelp: false,
    showFindReplace: false,
    showOutline: false,
    rightPanel: null,
    isAiStreaming: false,
    aiStreamContent: "",
    selectedText: "",
  });
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
    viewedChunk: null,
    lastRequestedChunkId: null,
    viewedChunkQuery: null,
    viewedChunkScore: null,
    viewChunkLoading: false,
    viewChunkError: null,
  });
}

// ---------------------------------------------------------------------------
// citationDataAttrs
// ---------------------------------------------------------------------------

describe("citationDataAttrs", () => {
  it("produces correct data attributes for a citation", () => {
    const citation = makeCitation({ chunkId: 42, documentId: 7, score: 0.85 });
    const attrs = citationDataAttrs(citation);
    expect(attrs).toContain('data-chunk-id="42"');
    expect(attrs).toContain('data-document-id="7"');
    expect(attrs).toContain('data-score="0.85"');
  });

  it("handles zero score", () => {
    const citation = makeCitation({ score: 0 });
    const attrs = citationDataAttrs(citation);
    expect(attrs).toContain('data-score="0"');
  });
});

// ---------------------------------------------------------------------------
// parseCitationElement
// ---------------------------------------------------------------------------

describe("parseCitationElement", () => {
  it("parses valid citation element data attributes", () => {
    const el = document.createElement("a");
    el.dataset.chunkId = "42";
    el.dataset.documentId = "7";
    el.dataset.score = "0.85";

    const result = parseCitationElement(el);
    expect(result).toEqual({ chunkId: 42, documentId: 7, score: 0.85 });
  });

  it("returns null when chunkId is missing", () => {
    const el = document.createElement("a");
    el.dataset.documentId = "7";
    el.dataset.score = "0.85";

    const result = parseCitationElement(el);
    expect(result).toBeNull();
  });

  it("returns null when documentId is missing", () => {
    const el = document.createElement("a");
    el.dataset.chunkId = "42";
    el.dataset.score = "0.85";

    const result = parseCitationElement(el);
    expect(result).toBeNull();
  });

  it("defaults score to 0 when missing", () => {
    const el = document.createElement("a");
    el.dataset.chunkId = "42";
    el.dataset.documentId = "7";

    const result = parseCitationElement(el);
    expect(result).toEqual({ chunkId: 42, documentId: 7, score: 0 });
  });

  it("returns null for non-numeric chunkId", () => {
    const el = document.createElement("a");
    el.dataset.chunkId = "abc";
    el.dataset.documentId = "7";

    const result = parseCitationElement(el);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildReferenceHtml — deep-link attributes
// ---------------------------------------------------------------------------

describe("buildReferenceHtml — deep-link attributes", () => {
  it("includes citation-link class and data attributes in compact HTML", () => {
    const html = buildReferenceHtml([
      makeCitation({ chunkId: 42, documentId: 7, score: 0.85 }),
    ]);
    expect(html).toContain('class="citation-link"');
    expect(html).toContain('data-chunk-id="42"');
    expect(html).toContain('data-document-id="7"');
    expect(html).toContain('data-score="0.85"');
  });

  it("includes citation-link class and data attributes in academic HTML", () => {
    const html = buildReferenceHtml(
      [makeCitation({ chunkId: 15, documentId: 3, score: 0.72 })],
      "academic",
    );
    expect(html).toContain('class="citation-link"');
    expect(html).toContain('data-chunk-id="15"');
    expect(html).toContain('data-document-id="3"');
    expect(html).toContain('data-score="0.72"');
  });

  it("wraps citation text in an anchor tag", () => {
    const html = buildReferenceHtml([makeCitation({ documentTitle: "My Paper" })]);
    expect(html).toMatch(/<a[^>]*>[^<]*My Paper[^<]*<\/a>/);
  });

  it("includes href='#' for citation links", () => {
    const html = buildReferenceHtml([makeCitation()]);
    expect(html).toContain('href="#"');
  });

  it("produces multiple citation links for multiple citations", () => {
    const html = buildReferenceHtml([
      makeCitation({ documentId: 1, chunkId: 10, documentTitle: "Doc A" }),
      makeCitation({ documentId: 2, chunkId: 20, documentTitle: "Doc B" }),
    ]);
    expect(html).toContain('data-chunk-id="10"');
    expect(html).toContain('data-chunk-id="20"');
    const linkMatches = html.match(/class="citation-link"/g);
    expect(linkMatches).toHaveLength(2);
  });

  it("embeds query as data attribute on the reference list when provided", () => {
    const html = buildReferenceHtml([makeCitation()], "compact", undefined, "machine learning");
    expect(html).toContain('data-query="machine learning"');
    expect(html).toContain('class="citation-references"');
  });

  it("omits data-query when query is not provided", () => {
    const html = buildReferenceHtml([makeCitation()]);
    expect(html).not.toContain("data-query");
  });

  it("escapes HTML special characters in query attribute", () => {
    const html = buildReferenceHtml([makeCitation()], "compact", undefined, 'test "query" <script>');
    expect(html).toContain("data-query=");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;query&quot;");
  });

  it("citation links match CITATION_LINK_SELECTOR", () => {
    const html = buildReferenceHtml([makeCitation({ chunkId: 42 })]);
    const container = document.createElement("div");
    container.innerHTML = html;
    const links = container.querySelectorAll(CITATION_LINK_SELECTOR);
    expect(links.length).toBe(1);
    expect((links[0] as HTMLElement).dataset.chunkId).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// navigateToCitationSource
// ---------------------------------------------------------------------------

describe("navigateToCitationSource", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it("opens knowledge panel when it is closed", () => {
    const mockChunk = {
      chunkContent: "content",
      documentTitle: "Test",
      documentId: 1,
      chunkId: 10,
      chunkIndex: 0,
      totalChunks: 3,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    expect(useEditorStore.getState().rightPanel).toBeNull();
    navigateToCitationSource(10, "test query", 0.85);

    expect(useEditorStore.getState().rightPanel).toBe("knowledge");
    expect(mockedInvoke).toHaveBeenCalledWith("get_kb_chunk", { chunkId: 10 });
  });

  it("preserves knowledge panel open state", () => {
    useEditorStore.setState({ rightPanel: "knowledge" });
    const mockChunk = {
      chunkContent: "content",
      documentTitle: "Test",
      documentId: 1,
      chunkId: 10,
      chunkIndex: 0,
      totalChunks: 3,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    navigateToCitationSource(10, "query", 0.9);

    expect(useEditorStore.getState().rightPanel).toBe("knowledge");
  });

  it("passes query and score to viewChunk", async () => {
    const mockChunk = {
      chunkContent: "content about testing",
      documentTitle: "Test Doc",
      documentId: 1,
      chunkId: 42,
      chunkIndex: 2,
      totalChunks: 5,
      prevChunk: "prev",
      nextChunk: "next",
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    navigateToCitationSource(42, "testing", 0.87);

    // Wait for async viewChunk to complete
    await vi.waitFor(() => {
      const state = useKnowledgeStore.getState();
      expect(state.viewedChunk).toEqual(mockChunk);
    });

    const state = useKnowledgeStore.getState();
    expect(state.viewedChunkQuery).toBe("testing");
    expect(state.viewedChunkScore).toBe(0.87);
  });

  it("works without query and score", async () => {
    const mockChunk = {
      chunkContent: "content",
      documentTitle: "Test",
      documentId: 1,
      chunkId: 10,
      chunkIndex: 0,
      totalChunks: 1,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    navigateToCitationSource(10);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewedChunk).toEqual(mockChunk);
    });
  });

  it("classifies source-missing when document id is absent locally", () => {
    useKnowledgeStore.setState({
      documents: [
        {
          id: 7,
          title: "Existing Doc",
          sourceType: "paste",
          sourcePath: null,
          createdAt: "2024-01-01",
          chunkCount: 1,
        },
      ],
    });

    navigateToCitationSource(88, "query", 0.5, 12345);

    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(useKnowledgeStore.getState().viewChunkError).toEqual({
      kind: "source-missing",
      message: "Source missing — this document is no longer in the knowledge base.",
    });
  });

  it("sets viewChunkError when the source chunk no longer exists", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("Failed to get chunk: Query returned no rows"));

    navigateToCitationSource(9999, "stale query", 0.41);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewChunkLoading).toBe(false);
    });

    const state = useKnowledgeStore.getState();
    expect(state.viewedChunk).toBeNull();
    expect(state.viewChunkError).toEqual({
      kind: "chunk-missing",
      message: "Chunk missing — this citation points to content that no longer exists.",
    });
    expect(useEditorStore.getState().rightPanel).toBe("knowledge");
  });

  it("stale citation deep-link still attempts navigation and stores error when missing", async () => {
    const html = buildReferenceHtml([makeCitation({ chunkId: 321, documentId: 99 })], "compact", undefined, "old query");
    const container = document.createElement("div");
    container.innerHTML = html;
    const link = container.querySelector("a.citation-link") as HTMLAnchorElement;
    const chunkId = Number(link.dataset.chunkId);

    mockedInvoke.mockRejectedValueOnce(new Error("missing chunk"));

    navigateToCitationSource(chunkId, "old query", Number(link.dataset.score));

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewChunkLoading).toBe(false);
    });

    expect(mockedInvoke).toHaveBeenCalledWith("get_kb_chunk", { chunkId: 321 });
    expect(useKnowledgeStore.getState().viewChunkError).toEqual({
      kind: "chunk-missing",
      message: "Chunk missing — this citation points to content that no longer exists.",
    });
  });
});

describe("ChunkViewer error UI", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
    mockedInvoke.mockResolvedValue([]);
  });

  it("shows friendly missing-source message in ChunkViewer area", async () => {
    useKnowledgeStore.setState({
      viewChunkError: {
        kind: "chunk-missing",
        message: "Chunk missing — this citation points to content that no longer exists.",
      },
    });

    render(createElement(KnowledgePanel));

    expect(
      await screen.findByText("Chunk missing — this citation points to content that no longer exists."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("dismiss clears error and returns to normal knowledge panel view", async () => {
    useKnowledgeStore.setState({
      viewChunkError: {
        kind: "chunk-missing",
        message: "Chunk missing — this citation points to content that no longer exists.",
      },
      documents: [
        {
          id: 1,
          title: "Doc 1",
          sourceType: "paste",
          sourcePath: null,
          createdAt: "2024-01-01",
          chunkCount: 1,
        },
      ],
    });

    render(createElement(KnowledgePanel));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(useKnowledgeStore.getState().viewChunkError).toBeNull();
    expect(await screen.findByText("Knowledge Base")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edge case: chunk viewer state persists across panel close/reopen
// ---------------------------------------------------------------------------

describe("chunk viewer state persistence across panel toggle", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it("viewedChunk survives panel close (rightPanel = null) in store", async () => {
    const mockChunk = {
      chunkContent: "content about testing",
      documentTitle: "Test Doc",
      documentId: 1,
      chunkId: 42,
      chunkIndex: 2,
      totalChunks: 5,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    // Open chunk viewer via deep-link
    navigateToCitationSource(42, "testing", 0.87);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewedChunk).toEqual(mockChunk);
    });

    // Simulate panel close (user toggles rightPanel to null)
    useEditorStore.setState({ rightPanel: null });

    // Store state should still have the viewed chunk
    const state = useKnowledgeStore.getState();
    expect(state.viewedChunk).toEqual(mockChunk);
    expect(state.viewedChunkQuery).toBe("testing");
    expect(state.viewedChunkScore).toBe(0.87);

    // Simulate panel reopen
    useEditorStore.setState({ rightPanel: "knowledge" });

    // State should still be there
    const stateAfterReopen = useKnowledgeStore.getState();
    expect(stateAfterReopen.viewedChunk).toEqual(mockChunk);
    expect(stateAfterReopen.viewedChunkQuery).toBe("testing");
    expect(stateAfterReopen.viewedChunkScore).toBe(0.87);
  });
});

// ---------------------------------------------------------------------------
// Edge case: document switch does not break citation deep-links
// ---------------------------------------------------------------------------

describe("document switch does not break citation deep-links", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it("viewedChunk survives document switch via restoreForDocument", async () => {
    const mockChunk = {
      chunkContent: "content",
      documentTitle: "Source Doc",
      documentId: 5,
      chunkId: 50,
      chunkIndex: 0,
      totalChunks: 3,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunk);

    // Simulate deep-link navigation
    navigateToCitationSource(50, "query", 0.8);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewedChunk).toEqual(mockChunk);
    });

    // Simulate document switch — restoreForDocument only touches retrieval settings
    useKnowledgeStore.getState().restoreForDocument("/another-doc.md");

    // Chunk viewer state should still be intact
    const state = useKnowledgeStore.getState();
    expect(state.viewedChunk).toEqual(mockChunk);
    expect(state.viewedChunkQuery).toBe("query");
    expect(state.viewedChunkScore).toBe(0.8);
  });

  it("deep-link uses chunkId (stable DB ID) that works regardless of active document", async () => {
    // First, set up a viewed chunk for doc A
    const mockChunkA = {
      chunkContent: "content from doc A",
      documentTitle: "Doc A",
      documentId: 1,
      chunkId: 100,
      chunkIndex: 0,
      totalChunks: 2,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(mockChunkA);

    navigateToCitationSource(100, "query A", 0.9);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewedChunk).toEqual(mockChunkA);
    });

    // Switch to doc B
    useKnowledgeStore.getState().restoreForDocument("/doc-b.md");

    // Now navigate to a citation from doc B
    const mockChunkB = {
      chunkContent: "content from doc B",
      documentTitle: "Doc B",
      documentId: 2,
      chunkId: 200,
      chunkIndex: 1,
      totalChunks: 4,
      prevChunk: "prev B",
      nextChunk: "next B",
    };
    mockedInvoke.mockResolvedValueOnce(mockChunkB);

    navigateToCitationSource(200, "query B", 0.75);

    await vi.waitFor(() => {
      expect(useKnowledgeStore.getState().viewedChunk).toEqual(mockChunkB);
    });

    const state = useKnowledgeStore.getState();
    expect(state.viewedChunkQuery).toBe("query B");
    expect(state.viewedChunkScore).toBe(0.75);
  });
});

afterEach(() => {
  cleanup();
});
