import { describe, expect, it } from "vitest";
import {
  buildReferenceHtml,
  deduplicateCitations,
  formatReferenceBlock,
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
});

describe("formatReferenceBlock", () => {
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
    // Only one entry
    expect(result).toContain("[1] Same Doc");
    expect(result).not.toContain("[2]");
    // Uses the higher-scoring chunk's metadata
    expect(result).toContain("95% relevance");
  });

  it("rounds relevance percentage", () => {
    const result = formatReferenceBlock([
      makeCitation({ score: 0.876 }),
    ]);
    expect(result).toContain("88% relevance");
  });
});

describe("buildReferenceHtml", () => {
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
