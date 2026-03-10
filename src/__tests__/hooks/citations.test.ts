import { describe, expect, it } from "vitest";
import { buildCitationHtml, deduplicateCitations } from "@/hooks/useAI";
import type { CitationSource } from "@/lib/tauri";

const makeCitation = (overrides: Partial<CitationSource> = {}): CitationSource => ({
  documentTitle: "Test Doc",
  documentId: 1,
  chunkId: 10,
  chunkIndex: 0,
  score: 0.9,
  ...overrides,
});

describe("deduplicateCitations", () => {
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
    expect(result.map((c) => c.documentTitle)).toEqual(["Doc A", "Doc B"]);
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

describe("buildCitationHtml", () => {
  it("returns empty string for empty citations", () => {
    expect(buildCitationHtml([])).toBe("");
  });

  it("renders single citation", () => {
    const html = buildCitationHtml([makeCitation({ documentTitle: "My Paper" })]);
    expect(html).toContain("Sources:");
    expect(html).toContain("[1] My Paper");
    expect(html).toContain("<em>");
  });

  it("renders multiple citations with numbered references", () => {
    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Doc A" }),
      makeCitation({ documentId: 2, documentTitle: "Doc B" }),
    ];
    const html = buildCitationHtml(citations);
    expect(html).toContain("[1] Doc A");
    expect(html).toContain("[2] Doc B");
  });

  it("deduplicates before rendering", () => {
    const citations = [
      makeCitation({ documentId: 1, documentTitle: "Same Doc", chunkId: 10, score: 0.8 }),
      makeCitation({ documentId: 1, documentTitle: "Same Doc", chunkId: 11, score: 0.9 }),
    ];
    const html = buildCitationHtml(citations);
    // Should only appear once
    expect(html.match(/Same Doc/g)).toHaveLength(1);
    expect(html).toContain("[1] Same Doc");
    expect(html).not.toContain("[2]");
  });
});
