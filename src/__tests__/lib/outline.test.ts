import { extractHeadings } from "@/lib/outline";
import { describe, expect, it } from "vitest";

// Minimal ProseMirror-like document mock.
interface MockNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
}

function mockDoc(nodes: { type: string; attrs?: Record<string, unknown>; textContent: string }[]) {
  return {
    descendants(fn: (node: MockNode, pos: number) => void) {
      let pos = 0;
      for (const n of nodes) {
        fn(
          {
            type: { name: n.type },
            attrs: n.attrs ?? {},
            textContent: n.textContent,
          },
          pos,
        );
        pos += n.textContent.length + 2; // simulate node boundaries
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
    expect(extractHeadings(doc)).toEqual([]);
  });

  it("extracts H1, H2, and H3 headings", () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 1 }, textContent: "Title" },
      { type: "paragraph", textContent: "Some text" },
      { type: "heading", attrs: { level: 2 }, textContent: "Section" },
      { type: "heading", attrs: { level: 3 }, textContent: "Subsection" },
    ]);
    const headings = extractHeadings(doc);
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
    const headings = extractHeadings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("H1");
  });

  it("captures empty heading text", () => {
    const doc = mockDoc([
      { type: "heading", attrs: { level: 2 }, textContent: "" },
    ]);
    const headings = extractHeadings(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("");
  });
});
