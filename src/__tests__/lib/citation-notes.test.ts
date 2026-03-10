import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FIELD_OPTIONS,
  buildReferenceHtml,
  copyReferencesToClipboard,
  deduplicateCitations,
  formatReferenceBlock,
  loadFieldOptions,
  loadLastTemplate,
  saveFieldOptions,
  saveLastTemplate,
} from "@/lib/citation-notes";
import type { CitationSource } from "@/lib/tauri";

const makeCitation = (overrides: Partial<CitationSource> = {}): CitationSource => ({
  documentTitle: "Test Doc",
  documentId: 1,
  chunkId: 10,
  chunkIndex: 0,
  score: 0.9,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe("deduplicateCitations (citation-notes)", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateCitations([])).toEqual([]);
  });

  it("passes through unique documents unchanged", () => {
    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Doc A" }),
      makeCitation({ documentId: 2, documentTitle: "Doc B" }),
    ];
    const result = deduplicateCitations(citations);
    expect(result).toHaveLength(2);
  });

  it("deduplicates by document ID, keeping highest score", () => {
    const citations = [
      makeCitation({ documentId: 1, chunkId: 10, score: 0.7 }),
      makeCitation({ documentId: 1, chunkId: 11, score: 0.95 }),
      makeCitation({ documentId: 2, chunkId: 20, score: 0.8 }),
    ];
    const result = deduplicateCitations(citations);
    expect(result).toHaveLength(2);
    const doc1 = result.find((c) => c.documentId === 1);
    expect(doc1?.score).toBe(0.95);
    expect(doc1?.chunkId).toBe(11);
  });

  it("keeps first entry when scores are equal", () => {
    const citations = [
      makeCitation({ documentId: 1, chunkId: 10, score: 0.9 }),
      makeCitation({ documentId: 1, chunkId: 11, score: 0.9 }),
    ];
    const result = deduplicateCitations(citations);
    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe(10);
  });

  it("numbering is stable across templates for same input", () => {
    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Doc A", score: 0.9 }),
      makeCitation({ documentId: 2, documentTitle: "Doc B", score: 0.7 }),
    ];
    const compact = formatReferenceBlock(citations, "compact");
    const academic = formatReferenceBlock(citations, "academic");
    // Both should have [1] Doc A and [2] Doc B in the same order
    expect(compact.indexOf("[1] Doc A")).toBeLessThan(compact.indexOf("[2] Doc B"));
    expect(academic.indexOf("[1] Doc A")).toBeLessThan(academic.indexOf("[2] Doc B"));
  });
});

// ---------------------------------------------------------------------------
// formatReferenceBlock — compact (default, backward compatible)
// ---------------------------------------------------------------------------

describe("formatReferenceBlock — compact", () => {
  it("returns empty string for empty citations", () => {
    expect(formatReferenceBlock([])).toBe("");
  });

  it("formats single citation with title, chunk position, and relevance", () => {
    const result = formatReferenceBlock([
      makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 }),
    ]);
    expect(result).toContain("---");
    expect(result).toContain("**References**");
    expect(result).toContain("[1] My Paper (chunk 3, 87% relevance)");
  });

  it("formats multiple citations with stable numbering", () => {
    const result = formatReferenceBlock([
      makeCitation({ documentId: 1, documentTitle: "First Doc", chunkIndex: 0, score: 0.9 }),
      makeCitation({ documentId: 2, documentTitle: "Second Doc", chunkIndex: 4, score: 0.72 }),
    ]);
    expect(result).toContain("[1] First Doc (chunk 1, 90% relevance)");
    expect(result).toContain("[2] Second Doc (chunk 5, 72% relevance)");
  });

  it("deduplicates before formatting", () => {
    const result = formatReferenceBlock([
      makeCitation({ documentId: 1, documentTitle: "Same Doc", chunkId: 10, score: 0.6 }),
      makeCitation({ documentId: 1, documentTitle: "Same Doc", chunkId: 11, score: 0.95 }),
    ]);
    expect(result).toContain("[1] Same Doc");
    expect(result).not.toContain("[2]");
    expect(result).toContain("95% relevance");
  });

  it("rounds relevance percentage", () => {
    const result = formatReferenceBlock([makeCitation({ score: 0.876 })]);
    expect(result).toContain("88% relevance");
  });

  it("called without template defaults to compact", () => {
    const a = formatReferenceBlock([makeCitation()]);
    const b = formatReferenceBlock([makeCitation()], "compact");
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// formatReferenceBlock — academic
// ---------------------------------------------------------------------------

describe("formatReferenceBlock — academic", () => {
  it("returns empty string for empty citations", () => {
    expect(formatReferenceBlock([], "academic")).toBe("");
  });

  it("formats with title on first line and metadata on second", () => {
    const result = formatReferenceBlock(
      [makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 })],
      "academic",
    );
    expect(result).toContain("---");
    expect(result).toContain("**References**");
    expect(result).toContain("[1] My Paper");
    expect(result).toContain("Source: chunk 3");
    expect(result).toContain("Relevance: 87%");
  });

  it("formats multiple entries with stable numbering", () => {
    const result = formatReferenceBlock(
      [
        makeCitation({ documentId: 1, documentTitle: "Doc A", chunkIndex: 0, score: 0.9 }),
        makeCitation({ documentId: 2, documentTitle: "Doc B", chunkIndex: 4, score: 0.72 }),
      ],
      "academic",
    );
    expect(result).toContain("[1] Doc A");
    expect(result).toContain("[2] Doc B");
    expect(result).toContain("Relevance: 90%");
    expect(result).toContain("Relevance: 72%");
  });

  it("deduplicates before formatting", () => {
    const result = formatReferenceBlock(
      [
        makeCitation({ documentId: 1, documentTitle: "Same", chunkId: 10, score: 0.6 }),
        makeCitation({ documentId: 1, documentTitle: "Same", chunkId: 11, score: 0.95 }),
      ],
      "academic",
    );
    expect(result).toContain("[1] Same");
    expect(result).not.toContain("[2]");
    expect(result).toContain("Relevance: 95%");
  });
});

// ---------------------------------------------------------------------------
// buildReferenceHtml — compact (default)
// ---------------------------------------------------------------------------

describe("buildReferenceHtml — compact", () => {
  it("returns empty string for empty citations", () => {
    expect(buildReferenceHtml([])).toBe("");
  });

  it("builds HTML with hr, heading, and ordered list", () => {
    const html = buildReferenceHtml([
      makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 }),
    ]);
    expect(html).toContain("<hr>");
    expect(html).toContain("<strong>References</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("[1] My Paper");
    expect(html).toContain("chunk 3, 87% relevance");
    expect(html).toContain("</ol>");
  });

  it("renders multiple items in ordered list", () => {
    const html = buildReferenceHtml([
      makeCitation({ documentId: 1, documentTitle: "Doc A", chunkIndex: 0, score: 0.9 }),
      makeCitation({ documentId: 2, documentTitle: "Doc B", chunkIndex: 3, score: 0.7 }),
    ]);
    expect(html).toContain("[1] Doc A");
    expect(html).toContain("[2] Doc B");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("deduplicates before rendering", () => {
    const html = buildReferenceHtml([
      makeCitation({ documentId: 1, documentTitle: "Same", chunkId: 10, score: 0.8 }),
      makeCitation({ documentId: 1, documentTitle: "Same", chunkId: 11, score: 0.9 }),
    ]);
    expect(html).toContain("[1] Same");
    expect(html).not.toContain("[2]");
    expect(html.match(/<li>/g)).toHaveLength(1);
  });

  it("escapes HTML special chars in document titles", () => {
    const html = buildReferenceHtml([
      makeCitation({ documentTitle: 'Doc <script>"xss"</script>' }),
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;xss&quot;");
  });
});

// ---------------------------------------------------------------------------
// buildReferenceHtml — academic
// ---------------------------------------------------------------------------

describe("buildReferenceHtml — academic", () => {
  it("returns empty string for empty citations", () => {
    expect(buildReferenceHtml([], "academic")).toBe("");
  });

  it("renders title in bold and metadata on a separate line", () => {
    const html = buildReferenceHtml(
      [makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 })],
      "academic",
    );
    expect(html).toContain("<strong>My Paper</strong>");
    expect(html).toContain("Source: chunk 3");
    expect(html).toContain("Relevance: 87%");
    expect(html).toContain("<br/>");
  });

  it("escapes HTML in academic template", () => {
    const html = buildReferenceHtml(
      [makeCitation({ documentTitle: '<img onerror="alert(1)">' })],
      "academic",
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders multiple entries", () => {
    const html = buildReferenceHtml(
      [
        makeCitation({ documentId: 1, documentTitle: "Doc A", score: 0.9 }),
        makeCitation({ documentId: 2, documentTitle: "Doc B", score: 0.7 }),
      ],
      "academic",
    );
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("[1]");
    expect(html).toContain("[2]");
  });
});

// ---------------------------------------------------------------------------
// Template persistence
// ---------------------------------------------------------------------------

describe("template persistence", () => {
  afterEach(() => localStorage.clear());

  it("defaults to compact when nothing stored", () => {
    expect(loadLastTemplate()).toBe("compact");
  });

  it("round-trips a saved template", () => {
    saveLastTemplate("academic");
    expect(loadLastTemplate()).toBe("academic");
  });

  it("returns compact for invalid stored value", () => {
    localStorage.setItem("lazy-editor:citation-template", "bogus");
    expect(loadLastTemplate()).toBe("compact");
  });
});

// ---------------------------------------------------------------------------
// Clipboard export
// ---------------------------------------------------------------------------

describe("copyReferencesToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies compact text and returns it", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeMock } });

    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Doc A", chunkIndex: 0, score: 0.9 }),
    ];
    const result = await copyReferencesToClipboard(citations, "compact");
    expect(writeMock).toHaveBeenCalledOnce();
    expect(result).toContain("[1] Doc A");
    expect(result).toContain("90% relevance");
  });

  it("copies academic text when requested", async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeMock } });

    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Doc A", chunkIndex: 0, score: 0.9 }),
    ];
    const result = await copyReferencesToClipboard(citations, "academic");
    expect(writeMock).toHaveBeenCalledOnce();
    expect(result).toContain("[1] Doc A");
    expect(result).toContain("Relevance: 90%");
  });

  it("returns empty string and does not call clipboard for empty citations", async () => {
    const writeMock = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: writeMock } });

    const result = await copyReferencesToClipboard([]);
    expect(writeMock).not.toHaveBeenCalled();
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Field options — formatReferenceBlock
// ---------------------------------------------------------------------------

describe("formatReferenceBlock — field options", () => {
  const cite = makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 });

  it("default field options match backward-compatible output", () => {
    const withDefaults = formatReferenceBlock([cite], "compact", DEFAULT_FIELD_OPTIONS);
    const withoutArgs = formatReferenceBlock([cite], "compact");
    expect(withDefaults).toBe(withoutArgs);
  });

  // -- compact --
  it("compact: hides relevance when showRelevance=false", () => {
    const result = formatReferenceBlock([cite], "compact", { showRelevance: false, showChunkLabel: true });
    expect(result).toContain("chunk 3");
    expect(result).not.toContain("relevance");
  });

  it("compact: hides chunk label when showChunkLabel=false", () => {
    const result = formatReferenceBlock([cite], "compact", { showRelevance: true, showChunkLabel: false });
    expect(result).not.toContain("chunk");
    expect(result).toContain("87% relevance");
  });

  it("compact: title only when both fields hidden", () => {
    const result = formatReferenceBlock([cite], "compact", { showRelevance: false, showChunkLabel: false });
    expect(result).toContain("[1] My Paper");
    expect(result).not.toContain("(");
    expect(result).not.toContain("chunk");
    expect(result).not.toContain("relevance");
  });

  // -- academic --
  it("academic: hides relevance when showRelevance=false", () => {
    const result = formatReferenceBlock([cite], "academic", { showRelevance: false, showChunkLabel: true });
    expect(result).toContain("Source: chunk 3");
    expect(result).not.toContain("Relevance");
  });

  it("academic: hides chunk label when showChunkLabel=false", () => {
    const result = formatReferenceBlock([cite], "academic", { showRelevance: true, showChunkLabel: false });
    expect(result).not.toContain("Source:");
    expect(result).toContain("Relevance: 87%");
  });

  it("academic: title only when both fields hidden", () => {
    const result = formatReferenceBlock([cite], "academic", { showRelevance: false, showChunkLabel: false });
    expect(result).toContain("[1] My Paper");
    expect(result).not.toContain("Source:");
    expect(result).not.toContain("Relevance");
    // No metadata line at all
    expect(result).not.toContain("\n      ");
  });
});

// ---------------------------------------------------------------------------
// Field options — buildReferenceHtml
// ---------------------------------------------------------------------------

describe("buildReferenceHtml — field options", () => {
  const cite = makeCitation({ documentTitle: "My Paper", chunkIndex: 2, score: 0.87 });

  it("compact HTML: hides relevance", () => {
    const html = buildReferenceHtml([cite], "compact", { showRelevance: false, showChunkLabel: true });
    expect(html).toContain("chunk 3");
    expect(html).not.toContain("relevance");
  });

  it("compact HTML: hides chunk label", () => {
    const html = buildReferenceHtml([cite], "compact", { showRelevance: true, showChunkLabel: false });
    expect(html).not.toContain("chunk");
    expect(html).toContain("87% relevance");
  });

  it("compact HTML: title only when both hidden", () => {
    const html = buildReferenceHtml([cite], "compact", { showRelevance: false, showChunkLabel: false });
    expect(html).toContain("[1] My Paper");
    expect(html).not.toContain("<em>");
  });

  it("academic HTML: hides relevance", () => {
    const html = buildReferenceHtml([cite], "academic", { showRelevance: false, showChunkLabel: true });
    expect(html).toContain("Source: chunk 3");
    expect(html).not.toContain("Relevance");
  });

  it("academic HTML: title only when both hidden — no metadata span", () => {
    const html = buildReferenceHtml([cite], "academic", { showRelevance: false, showChunkLabel: false });
    expect(html).toContain("<strong>My Paper</strong>");
    expect(html).not.toContain("<br/>");
    expect(html).not.toContain("opacity");
  });
});

// ---------------------------------------------------------------------------
// Field options — persistence
// ---------------------------------------------------------------------------

describe("field options persistence", () => {
  afterEach(() => localStorage.clear());

  it("defaults to all fields shown", () => {
    const opts = loadFieldOptions();
    expect(opts.showRelevance).toBe(true);
    expect(opts.showChunkLabel).toBe(true);
  });

  it("round-trips saved field options", () => {
    saveFieldOptions({ showRelevance: false, showChunkLabel: true });
    const opts = loadFieldOptions();
    expect(opts.showRelevance).toBe(false);
    expect(opts.showChunkLabel).toBe(true);
  });

  it("returns defaults for corrupted JSON", () => {
    localStorage.setItem("lazy-editor:citation-fields", "not json");
    const opts = loadFieldOptions();
    expect(opts.showRelevance).toBe(true);
    expect(opts.showChunkLabel).toBe(true);
  });

  it("fills missing keys with true", () => {
    localStorage.setItem("lazy-editor:citation-fields", JSON.stringify({ showRelevance: false }));
    const opts = loadFieldOptions();
    expect(opts.showRelevance).toBe(false);
    expect(opts.showChunkLabel).toBe(true);
  });
});
