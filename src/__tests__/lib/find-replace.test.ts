import {
  MATCH_LIMIT,
  YIELD_BATCH_SIZE,
  adaptiveDebounce,
  estimateDocSize,
  findMatches,
  findMatchesAsync,
  wrapIndex,
  LARGE_DOC_THRESHOLD,
  VERY_LARGE_DOC_THRESHOLD,
} from "@/lib/find-replace";
import { describe, expect, it, vi } from "vitest";

// Minimal ProseMirror-like document mock for testing findMatches.
// The real ProseMirror Node.descendants(fn) calls fn(node, pos) for each node.
// Returning `false` from the callback stops traversal into children (and in our
// mock, we treat it as an early-exit signal).
function mockDoc(textNodes: { text: string; pos: number }[]) {
  return {
    descendants(fn: (node: { isText: boolean; text: string | null }, pos: number) => void | false) {
      for (const tn of textNodes) {
        const result = fn({ isText: true, text: tn.text }, tn.pos);
        if (result === false) break;
      }
    },
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any;
}

describe("findMatches", () => {
  it("returns empty array for empty query", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    const { matches, truncated } = findMatches(doc, "", false);
    expect(matches).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("finds a single match", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    const { matches } = findMatches(doc, "world", false);
    expect(matches).toEqual([{ from: 7, to: 12 }]);
  });

  it("finds multiple matches", () => {
    const doc = mockDoc([{ text: "aaa", pos: 1 }]);
    const { matches } = findMatches(doc, "a", false);
    expect(matches).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ]);
  });

  it("finds overlapping matches", () => {
    const doc = mockDoc([{ text: "aaa", pos: 1 }]);
    const { matches } = findMatches(doc, "aa", false);
    expect(matches).toEqual([
      { from: 1, to: 3 },
      { from: 2, to: 4 },
    ]);
  });

  it("is case-insensitive by default", () => {
    const doc = mockDoc([{ text: "Hello HELLO hello", pos: 1 }]);
    const { matches } = findMatches(doc, "hello", false);
    expect(matches).toHaveLength(3);
  });

  it("respects case-sensitive flag", () => {
    const doc = mockDoc([{ text: "Hello HELLO hello", pos: 1 }]);
    const { matches } = findMatches(doc, "hello", true);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 13, to: 18 });
  });

  it("finds matches across multiple text nodes", () => {
    const doc = mockDoc([
      { text: "first match here", pos: 1 },
      { text: "second match here", pos: 20 },
    ]);
    const { matches } = findMatches(doc, "match", false);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 7, to: 12 });
    expect(matches[1]).toEqual({ from: 27, to: 32 });
  });

  it("returns empty array when no matches", () => {
    const doc = mockDoc([{ text: "hello world", pos: 1 }]);
    const { matches } = findMatches(doc, "xyz", false);
    expect(matches).toEqual([]);
  });

  it("handles special regex characters as literal text", () => {
    const doc = mockDoc([{ text: "price is $100.00", pos: 1 }]);
    const { matches } = findMatches(doc, "$100", false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 10, to: 14 });
  });

  // --- Edge cases for large-doc hardening ---

  it("returns empty for a document with no text nodes", () => {
    const doc = mockDoc([]);
    const { matches, truncated } = findMatches(doc, "hello", false);
    expect(matches).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("handles single-character query", () => {
    const doc = mockDoc([{ text: "abcabc", pos: 0 }]);
    const { matches } = findMatches(doc, "a", false);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 0, to: 1 });
    expect(matches[1]).toEqual({ from: 3, to: 4 });
  });

  it("handles query longer than document text", () => {
    const doc = mockDoc([{ text: "hi", pos: 1 }]);
    const { matches } = findMatches(doc, "hello world", false);
    expect(matches).toEqual([]);
  });

  it("handles query equal to entire document text", () => {
    const doc = mockDoc([{ text: "exact", pos: 0 }]);
    const { matches } = findMatches(doc, "exact", false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 0, to: 5 });
  });

  it("caps results at MATCH_LIMIT and sets truncated flag", () => {
    // Create a text node with many repeating characters
    const bigText = "a".repeat(MATCH_LIMIT + 500);
    const doc = mockDoc([{ text: bigText, pos: 0 }]);
    const { matches, truncated } = findMatches(doc, "a", false);
    expect(matches).toHaveLength(MATCH_LIMIT);
    expect(truncated).toBe(true);
  });

  it("does not set truncated when matches are below limit", () => {
    const doc = mockDoc([{ text: "aaa", pos: 0 }]);
    const { matches, truncated } = findMatches(doc, "a", false);
    expect(matches).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("respects custom limit parameter", () => {
    const doc = mockDoc([{ text: "aaaaaaaaaa", pos: 0 }]);
    const { matches, truncated } = findMatches(doc, "a", false, 5);
    expect(matches).toHaveLength(5);
    expect(truncated).toBe(true);
  });

  it("early-terminates across multiple text nodes", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      text: "match here",
      pos: i * 20,
    }));
    const doc = mockDoc(nodes);
    const { matches, truncated } = findMatches(doc, "match", false, 10);
    expect(matches).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it("handles thousands of matches with default limit efficiently", () => {
    // 5000 repetitions of "x " → 5000 matches for "x"
    const bigText = "x ".repeat(5000);
    const doc = mockDoc([{ text: bigText, pos: 0 }]);
    const start = performance.now();
    const { matches, truncated } = findMatches(doc, "x", false);
    const elapsed = performance.now() - start;
    expect(matches).toHaveLength(MATCH_LIMIT);
    expect(truncated).toBe(true);
    // Should complete well under 1 second
    expect(elapsed).toBeLessThan(1000);
  });

  it("handles text nodes with null text gracefully", () => {
    const doc = {
      descendants(fn: (node: { isText: boolean; text: string | null }, pos: number) => void | false) {
        fn({ isText: true, text: null }, 0);
        fn({ isText: false, text: null }, 5);
        fn({ isText: true, text: "hello" }, 10);
      },
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any;
    const { matches } = findMatches(doc, "hello", false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 10, to: 15 });
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

describe("estimateDocSize", () => {
  it("returns 0 for empty document", () => {
    const doc = mockDoc([]);
    expect(estimateDocSize(doc)).toBe(0);
  });

  it("sums text lengths across nodes", () => {
    const doc = mockDoc([
      { text: "hello", pos: 0 },
      { text: " world", pos: 6 },
    ]);
    expect(estimateDocSize(doc)).toBe(11);
  });
});

describe("adaptiveDebounce", () => {
  it("returns 200 for small documents", () => {
    expect(adaptiveDebounce(0)).toBe(200);
    expect(adaptiveDebounce(1000)).toBe(200);
    expect(adaptiveDebounce(LARGE_DOC_THRESHOLD - 1)).toBe(200);
  });

  it("returns 350 for large documents", () => {
    expect(adaptiveDebounce(LARGE_DOC_THRESHOLD)).toBe(350);
    expect(adaptiveDebounce(100_000)).toBe(350);
  });

  it("returns 500 for very large documents", () => {
    expect(adaptiveDebounce(VERY_LARGE_DOC_THRESHOLD)).toBe(500);
    expect(adaptiveDebounce(1_000_000)).toBe(500);
  });
});

// Helper to build a large mock doc that exceeds LARGE_DOC_THRESHOLD.
// Uses one match per node ("needle" prefix) to avoid hitting MATCH_LIMIT
// before the yield point, allowing cancellation and progress tests to work.
function mockLargeDoc(nodeCount: number, charsPerNode: number) {
  const text = "needle" + "a".repeat(Math.max(0, charsPerNode - 6));
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    text,
    pos: i * (charsPerNode + 2),
  }));
  return mockDoc(nodes);
}

describe("findMatchesAsync", () => {
  it("returns same results as sync findMatches for small docs", async () => {
    const doc = mockDoc([{ text: "hello world hello", pos: 1 }]);
    const syncResult = findMatches(doc, "hello", false);
    const asyncResult = await findMatchesAsync(doc, "hello", false);
    expect(asyncResult.matches).toEqual(syncResult.matches);
    expect(asyncResult.truncated).toBe(syncResult.truncated);
    expect(asyncResult.cancelled).toBe(false);
  });

  it("returns empty for empty query", async () => {
    const doc = mockDoc([{ text: "hello", pos: 0 }]);
    const result = await findMatchesAsync(doc, "", false);
    expect(result.matches).toEqual([]);
    expect(result.cancelled).toBe(false);
  });

  it("cancels mid-search when signal is aborted", async () => {
    // Create a large doc to trigger async path (1 match per node = won't hit MATCH_LIMIT)
    const doc = mockLargeDoc(YIELD_BATCH_SIZE + 100, 200);
    const controller = new AbortController();

    // Abort after yielding starts (very short delay)
    setTimeout(() => controller.abort(), 1);

    const result = await findMatchesAsync(doc, "needle", false, MATCH_LIMIT, controller.signal);
    expect(result.cancelled).toBe(true);
    // Should have partial results (some but not all)
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("calls onProgress during large doc search", async () => {
    const doc = mockLargeDoc(YIELD_BATCH_SIZE * 2, 200);
    const progressCalls: number[] = [];

    await findMatchesAsync(doc, "needle", false, MATCH_LIMIT, undefined, (count) => {
      progressCalls.push(count);
    });

    // Should have been called at least once (after first batch)
    expect(progressCalls.length).toBeGreaterThanOrEqual(1);
    // Each progress call should have an increasing count
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i]).toBeGreaterThanOrEqual(progressCalls[i - 1]);
    }
  });

  it("skips yielding for small docs (< LARGE_DOC_THRESHOLD)", async () => {
    const smallDoc = mockDoc([{ text: "hello", pos: 0 }]);
    const spy = vi.spyOn(globalThis, "setTimeout");
    const callsBefore = spy.mock.calls.length;

    await findMatchesAsync(smallDoc, "hello", false);

    // No setTimeout(0) calls for yielding in small doc path
    const yieldCalls = spy.mock.calls
      .slice(callsBefore)
      .filter(([_, ms]) => ms === 0);
    expect(yieldCalls.length).toBe(0);
    spy.mockRestore();
  });

  it("already-aborted signal returns immediately with cancelled", async () => {
    const doc = mockLargeDoc(YIELD_BATCH_SIZE + 10, 200);
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const result = await findMatchesAsync(doc, "needle", false, MATCH_LIMIT, controller.signal);
    expect(result.cancelled).toBe(true);
    expect(result.matches).toEqual([]);
  });
});
