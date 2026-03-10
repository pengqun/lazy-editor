import { findMatches, wrapIndex } from "@/lib/find-replace";
import { describe, expect, it } from "vitest";

// Minimal ProseMirror-like document mock for testing findMatches.
// The real ProseMirror Node.descendants(fn) calls fn(node, pos) for each node.
function mockDoc(textNodes: { text: string; pos: number }[]) {
  return {
    descendants(fn: (node: { isText: boolean; text: string | null }, pos: number) => void) {
      for (const tn of textNodes) {
        fn({ isText: true, text: tn.text }, tn.pos);
      }
    },
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any;
}

describe("findMatches", () => {
  it("returns empty array for empty query", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    expect(findMatches(doc, "", false)).toEqual([]);
  });

  it("finds a single match", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    expect(findMatches(doc, "world", false)).toEqual([{ from: 7, to: 12 }]);
  });

  it("finds multiple matches", () => {
    const doc = mockDoc([{ text: "aaa", pos: 1 }]);
    const matches = findMatches(doc, "a", false);
    expect(matches).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ]);
  });

  it("finds overlapping matches", () => {
    const doc = mockDoc([{ text: "aaa", pos: 1 }]);
    const matches = findMatches(doc, "aa", false);
    expect(matches).toEqual([
      { from: 1, to: 3 },
      { from: 2, to: 4 },
    ]);
  });

  it("is case-insensitive by default", () => {
    const doc = mockDoc([{ text: "Hello HELLO hello", pos: 1 }]);
    const matches = findMatches(doc, "hello", false);
    expect(matches).toHaveLength(3);
  });

  it("respects case-sensitive flag", () => {
    const doc = mockDoc([{ text: "Hello HELLO hello", pos: 1 }]);
    const matches = findMatches(doc, "hello", true);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 13, to: 18 });
  });

  it("finds matches across multiple text nodes", () => {
    const doc = mockDoc([
      { text: "first match here", pos: 1 },
      { text: "second match here", pos: 20 },
    ]);
    const matches = findMatches(doc, "match", false);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 7, to: 12 });
    expect(matches[1]).toEqual({ from: 27, to: 32 });
  });

  it("returns empty array when no matches", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    expect(findMatches(doc, "xyz", false)).toEqual([]);
  });

  it("handles special regex characters as literal text", () => {
    const doc = mockDoc([{ text: "price is $100.00", pos: 1 }]);
    const matches = findMatches(doc, "$100", false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 10, to: 14 });
  });
});

describe("wrapIndex", () => {
  it("returns 0 for empty length", () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });

  it("wraps positive overflow", () => {
    expect(wrapIndex(5, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
  });

  it("wraps negative index", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-3, 3)).toBe(0);
  });

  it("leaves valid index unchanged", () => {
    expect(wrapIndex(1, 5)).toBe(1);
    expect(wrapIndex(0, 5)).toBe(0);
  });
});
