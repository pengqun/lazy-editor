import {
  HEADING_LIMIT,
  adaptiveOutlineDebounce,
  extractHeadings,
  extractHeadingsAsync,
  OUTLINE_LARGE_THRESHOLD,
} from "@/lib/outline";
import { describe, expect, it } from "vitest";

// Minimal ProseMirror-like document mock.
interface MockNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
}

function mockDoc(nodes: { type: string; attrs?: Record<string, unknown>; textContent: string }[]) {
  return {
    descendants(fn: (node: MockNode, pos: number) => void | false) {
      let pos = 0;
      for (const n of nodes) {
        const result = fn(
          {
            type: { name: n.type },
            attrs: n.attrs ?? {},
            textContent: n.textContent,
          },
          pos,
        );
        pos += n.textContent.length + 2; // simulate node boundaries
        if (result === false) break;
      }
    },
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any;
}

describe("extractHeadings", () => {
  it("returns empty array for document with no headings", () => {
    const doc = mockDoc([
      { type: "paragraph", textContent: "Just a paragraph" },
    ]);
    const { headings, truncated } = extractHeadings(doc);
    expect(headings).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("extracts H1, H2, and H3 headings", () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 1 }, textContent: "Title" },
      { type: "paragraph", textContent: "Some text" },
      { type: "heading", attrs: { level: 2 }, textContent: "Section" },
      { type: "heading", attrs: { level: 3 }, textContent: "Subsection" },
    ]);
    const { headings } = extractHeadings(doc);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({ level: 1, text: "Title", pos: 0 });
    expect(headings[1]).toEqual({ level: 2, text: "Section", pos: 18 });
    expect(headings[2]).toEqual({ level: 3, text: "Subsection", pos: 27 });
  });

  it("ignores headings below level 3", () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 1 }, textContent: "H1" },
      { type: "heading", attrs: { level: 4 }, textContent: "H4" },
      { type: "heading", attrs: { level: 5 }, textContent: "H5" },
    ]);
    const { headings } = extractHeadings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("H1");
  });

  it("captures empty heading text", () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 2 }, textContent: "" },
    ]);
    const { headings } = extractHeadings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("");
  });

  // --- Edge cases for large-doc hardening ---

  it("returns empty for an empty document", () => {
    const doc = mockDoc([]);
    const { headings, truncated } = extractHeadings(doc);
    expect(headings).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("caps results at HEADING_LIMIT and sets truncated flag", () => {
    const nodes = Array.from({ length: HEADING_LIMIT + 50 }, (_, i) => ({
      type: "heading",
      attrs: { level: 1 },
      textContent: `Heading ${i}`,
    }));
    const doc = mockDoc(nodes);
    const { headings, truncated } = extractHeadings(doc);
    expect(headings).toHaveLength(HEADING_LIMIT);
    expect(truncated).toBe(true);
  });

  it("does not set truncated when headings are below limit", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      type: "heading",
      attrs: { level: 2 },
      textContent: `H ${i}`,
    }));
    const doc = mockDoc(nodes);
    const { headings, truncated } = extractHeadings(doc);
    expect(headings).toHaveLength(10);
    expect(truncated).toBe(false);
  });

  it("respects custom limit parameter", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      type: "heading",
      attrs: { level: 1 },
      textContent: `H ${i}`,
    }));
    const doc = mockDoc(nodes);
    const { headings, truncated } = extractHeadings(doc, 5);
    expect(headings).toHaveLength(5);
    expect(truncated).toBe(true);
  });

  it("handles mixed heading and non-heading nodes at scale", () => {
    const nodes: { type: string; attrs?: Record<string, unknown>; textContent: string }[] = [];
    for (let i = 0; i < 200; i++) {
      nodes.push({ type: "paragraph", textContent: `Paragraph ${i}` });
      nodes.push({ type: "heading", attrs: { level: (i % 3) + 1 }, textContent: `Heading ${i}` });
    }
    const doc = mockDoc(nodes);
    const { headings, truncated } = extractHeadings(doc);
    // 200 headings, which is below the default HEADING_LIMIT (500)
    expect(headings).toHaveLength(200);
    expect(truncated).toBe(false);
  });

  it("handles a document with only non-heading nodes", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      type: "paragraph",
      textContent: `Paragraph ${i}`,
    }));
    const doc = mockDoc(nodes);
    const { headings } = extractHeadings(doc);
    expect(headings).toEqual([]);
  });

  it("handles headings with very long text", () => {
    const longText = "A".repeat(10_000);
    const doc = mockDoc([
      { type: "heading", attrs: { level: 1 }, textContent: longText },
    ]);
    const { headings } = extractHeadings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toHaveLength(10_000);
  });

  it("completes efficiently for huge heading lists", () => {
    const nodes = Array.from({ length: HEADING_LIMIT + 100 }, (_, i) => ({
      type: "heading",
      attrs: { level: 1 },
      textContent: `H${i}`,
    }));
    const doc = mockDoc(nodes);
    const start = performance.now();
    const { headings, truncated } = extractHeadings(doc);
    const elapsed = performance.now() - start;
    expect(headings).toHaveLength(HEADING_LIMIT);
    expect(truncated).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("extractHeadingsAsync", () => {
  it("matches sync behavior", async () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 1 }, textContent: "Title" },
      { type: "paragraph", textContent: "Body" },
      { type: "heading", attrs: { level: 2 }, textContent: "Section" },
    ]);
    const sync = extractHeadings(doc);
    const asyncResult = await extractHeadingsAsync(
      doc,
      new AbortController().signal,
    );
    expect(asyncResult).toEqual({ ...sync, cancelled: false });
  });

  it("cancels large extraction and returns partial headings", async () => {
    const nodes: { type: string; attrs?: Record<string, unknown>; textContent: string }[] = [];
    for (let i = 0; i < 1800; i++) {
      nodes.push({ type: "paragraph", textContent: `p${i} ${"x".repeat(30)}` });
      if (i % 10 === 0) {
        nodes.push({ type: "heading", attrs: { level: 2 }, textContent: `Heading ${i}` });
      }
    }
    const doc = mockDoc(nodes);
    const full = extractHeadings(doc);
    const controller = new AbortController();
    let progressCalls = 0;

    const result = await extractHeadingsAsync(doc, controller.signal, {
      onProgress: () => {
        progressCalls += 1;
        if (progressCalls === 1) controller.abort();
      },
    });

    expect(progressCalls).toBeGreaterThan(0);
    expect(result.cancelled).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.headings.length).toBeLessThan(full.headings.length);
  });
});

describe("adaptiveOutlineDebounce", () => {
  it("returns 300 for small heading counts", () => {
    expect(adaptiveOutlineDebounce(0)).toBe(300);
    expect(adaptiveOutlineDebounce(50)).toBe(300);
    expect(adaptiveOutlineDebounce(OUTLINE_LARGE_THRESHOLD - 1)).toBe(300);
  });

  it("returns 600 for large heading counts", () => {
    expect(adaptiveOutlineDebounce(OUTLINE_LARGE_THRESHOLD)).toBe(600);
    expect(adaptiveOutlineDebounce(500)).toBe(600);
  });
});
