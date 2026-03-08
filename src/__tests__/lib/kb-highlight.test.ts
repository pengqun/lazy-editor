import { describe, expect, it } from "vitest";
import { findMatchedTerms, highlightText, tokenize } from "../../lib/kb-highlight";

describe("tokenize", () => {
  it("splits Latin text on spaces and punctuation", () => {
    expect(tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("lowercases tokens", () => {
    expect(tokenize("TypeScript React")).toEqual(["typescript", "react"]);
  });

  it("handles CJK characters as individual tokens", () => {
    expect(tokenize("你好世界")).toEqual(["你", "好", "世", "界"]);
  });

  it("handles mixed CJK and Latin", () => {
    expect(tokenize("Hello你好World")).toEqual(["hello", "你", "好", "world"]);
  });

  it("returns empty for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles punctuation-only input", () => {
    expect(tokenize("...!!!")).toEqual([]);
  });
});

describe("findMatchedTerms", () => {
  it("finds overlapping terms", () => {
    const result = findMatchedTerms("machine learning", "deep learning and machine vision");
    expect(result).toContain("machine");
    expect(result).toContain("learning");
  });

  it("filters stop words", () => {
    const result = findMatchedTerms("the quick brown fox", "a quick fox");
    expect(result).toContain("quick");
    expect(result).toContain("fox");
    expect(result).not.toContain("the");
  });

  it("filters short tokens (length <= 1)", () => {
    const result = findMatchedTerms("I x y", "x y z");
    expect(result).toEqual([]);
  });

  it("works with CJK queries", () => {
    const result = findMatchedTerms("机器学习", "深度学习和机器视觉");
    expect(result).toContain("机");
    expect(result).toContain("器");
    expect(result).toContain("学");
    expect(result).toContain("习");
  });

  it("returns empty when no overlap", () => {
    expect(findMatchedTerms("alpha beta", "gamma delta")).toEqual([]);
  });

  it("deduplicates query tokens", () => {
    const result = findMatchedTerms("test test test", "this is a test case");
    expect(result).toEqual(["test"]);
  });
});

describe("highlightText", () => {
  it("returns single unhighlighted segment when no matches", () => {
    const result = highlightText("hello world", "xyz");
    expect(result).toEqual([{ text: "hello world", highlighted: false }]);
  });

  it("highlights matched terms", () => {
    const result = highlightText("machine learning is great", "machine");
    expect(result).toEqual([
      { text: "machine", highlighted: true },
      { text: " learning is great", highlighted: false },
    ]);
  });

  it("highlights multiple occurrences", () => {
    const result = highlightText("test a test b test", "test");
    const highlighted = result.filter((s) => s.highlighted);
    expect(highlighted).toHaveLength(3);
    for (const s of highlighted) {
      expect(s.text.toLowerCase()).toBe("test");
    }
  });

  it("preserves original case in output", () => {
    const result = highlightText("React and TypeScript", "react typescript");
    const highlighted = result.filter((s) => s.highlighted);
    expect(highlighted.map((s) => s.text)).toEqual(["React", "TypeScript"]);
  });

  it("handles CJK highlighting", () => {
    const result = highlightText("深度学习模型", "学习");
    const highlighted = result.filter((s) => s.highlighted);
    expect(highlighted.length).toBeGreaterThan(0);
    // Each CJK char is an individual token, so 学 and 习 are separately matched
    const highlightedChars = highlighted.map((s) => s.text).join("");
    expect(highlightedChars).toContain("学");
    expect(highlightedChars).toContain("习");
  });

  it("does not produce empty segments", () => {
    const result = highlightText("abc", "abc");
    for (const seg of result) {
      expect(seg.text.length).toBeGreaterThan(0);
    }
  });

  it("all segments concatenated equal original text", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const query = "quick lazy dog";
    const result = highlightText(text, query);
    const rebuilt = result.map((s) => s.text).join("");
    expect(rebuilt).toBe(text);
  });
});
