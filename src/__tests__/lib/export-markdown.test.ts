import { jsonToMarkdown } from "@/lib/export-markdown";
import type { JSONContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";

function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function p(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function text(t: string, marks?: JSONContent["marks"]): JSONContent {
  return { type: "text", text: t, marks };
}

describe("jsonToMarkdown", () => {
  it("converts an empty doc to empty string", () => {
    expect(jsonToMarkdown({ type: "doc" })).toBe("");
    expect(jsonToMarkdown({ type: "doc", content: [] })).toBe("");
  });

  it("converts a simple paragraph", () => {
    const result = jsonToMarkdown(doc(p(text("Hello world"))));
    expect(result).toBe("Hello world\n");
  });

  it("converts headings at different levels", () => {
    const result = jsonToMarkdown(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
        { type: "heading", attrs: { level: 2 }, content: [text("Subtitle")] },
        { type: "heading", attrs: { level: 3 }, content: [text("Section")] },
      ),
    );
    expect(result).toBe("# Title\n\n## Subtitle\n\n### Section\n");
  });

  it("converts bold and italic marks", () => {
    const result = jsonToMarkdown(
      doc(p(text("bold", [{ type: "bold" }]), text(" and "), text("italic", [{ type: "italic" }]))),
    );
    expect(result).toBe("**bold** and *italic*\n");
  });

  it("converts strikethrough and inline code", () => {
    const result = jsonToMarkdown(
      doc(
        p(text("removed", [{ type: "strike" }]), text(" and "), text("code()", [{ type: "code" }])),
      ),
    );
    expect(result).toBe("~~removed~~ and `code()`\n");
  });

  it("converts links", () => {
    const result = jsonToMarkdown(
      doc(p(text("click here", [{ type: "link", attrs: { href: "https://example.com" } }]))),
    );
    expect(result).toBe("[click here](https://example.com)\n");
  });

  it("converts bullet lists", () => {
    const result = jsonToMarkdown(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("First"))] },
          { type: "listItem", content: [p(text("Second"))] },
        ],
      }),
    );
    expect(result).toBe("- First\n- Second\n");
  });

  it("converts ordered lists", () => {
    const result = jsonToMarkdown(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [p(text("One"))] },
          { type: "listItem", content: [p(text("Two"))] },
          { type: "listItem", content: [p(text("Three"))] },
        ],
      }),
    );
    expect(result).toBe("1. One\n2. Two\n3. Three\n");
  });

  it("converts blockquotes", () => {
    const result = jsonToMarkdown(
      doc({
        type: "blockquote",
        content: [p(text("A wise quote"))],
      }),
    );
    expect(result).toBe("> A wise quote\n");
  });

  it("converts code blocks with language", () => {
    const result = jsonToMarkdown(
      doc({
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [text("const x = 1;")],
      }),
    );
    expect(result).toBe("```typescript\nconst x = 1;\n```\n");
  });

  it("converts horizontal rules", () => {
    const result = jsonToMarkdown(
      doc(p(text("before")), { type: "horizontalRule" }, p(text("after"))),
    );
    expect(result).toBe("before\n\n---\n\nafter\n");
  });

  it("handles mixed formatting in a paragraph", () => {
    const result = jsonToMarkdown(
      doc(
        p(
          text("normal "),
          text("bold", [{ type: "bold" }]),
          text(" "),
          text("bold+italic", [{ type: "bold" }, { type: "italic" }]),
        ),
      ),
    );
    expect(result).toBe("normal **bold** ***bold+italic***\n");
  });
});
