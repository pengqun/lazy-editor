import { escapeHtml, jsonToHtml, wrapStandaloneHtml } from "@/lib/export-html";
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

describe("jsonToHtml", () => {
  it("converts an empty doc to empty string", () => {
    expect(jsonToHtml({ type: "doc" })).toBe("");
    expect(jsonToHtml({ type: "doc", content: [] })).toBe("");
  });

  it("converts a simple paragraph", () => {
    const result = jsonToHtml(doc(p(text("Hello world"))));
    expect(result).toBe("<p>Hello world</p>");
  });

  it("converts headings at different levels", () => {
    const result = jsonToHtml(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
        { type: "heading", attrs: { level: 2 }, content: [text("Subtitle")] },
        { type: "heading", attrs: { level: 3 }, content: [text("Section")] },
      ),
    );
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<h2>Subtitle</h2>");
    expect(result).toContain("<h3>Section</h3>");
  });

  it("converts bold and italic marks", () => {
    const result = jsonToHtml(
      doc(p(text("bold", [{ type: "bold" }]), text(" and "), text("italic", [{ type: "italic" }]))),
    );
    expect(result).toBe("<p><strong>bold</strong> and <em>italic</em></p>");
  });

  it("converts strikethrough and inline code", () => {
    const result = jsonToHtml(
      doc(
        p(text("removed", [{ type: "strike" }]), text(" and "), text("code()", [{ type: "code" }])),
      ),
    );
    expect(result).toBe("<p><s>removed</s> and <code>code()</code></p>");
  });

  it("converts links", () => {
    const result = jsonToHtml(
      doc(p(text("click here", [{ type: "link", attrs: { href: "https://example.com" } }]))),
    );
    expect(result).toBe('<p><a href="https://example.com">click here</a></p>');
  });

  it("converts bullet lists", () => {
    const result = jsonToHtml(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(text("First"))] },
          { type: "listItem", content: [p(text("Second"))] },
        ],
      }),
    );
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>First</li>");
    expect(result).toContain("<li>Second</li>");
    expect(result).toContain("</ul>");
  });

  it("converts ordered lists", () => {
    const result = jsonToHtml(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [p(text("One"))] },
          { type: "listItem", content: [p(text("Two"))] },
        ],
      }),
    );
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>One</li>");
    expect(result).toContain("<li>Two</li>");
    expect(result).toContain("</ol>");
  });

  it("converts blockquotes", () => {
    const result = jsonToHtml(
      doc({
        type: "blockquote",
        content: [p(text("A wise quote"))],
      }),
    );
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<p>A wise quote</p>");
    expect(result).toContain("</blockquote>");
  });

  it("converts code blocks with language", () => {
    const result = jsonToHtml(
      doc({
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [text("const x = 1;")],
      }),
    );
    expect(result).toBe('<pre><code class="language-typescript">const x = 1;</code></pre>');
  });

  it("converts horizontal rules", () => {
    const result = jsonToHtml(doc(p(text("before")), { type: "horizontalRule" }, p(text("after"))));
    expect(result).toContain("<p>before</p>");
    expect(result).toContain("<hr>");
    expect(result).toContain("<p>after</p>");
  });

  it("escapes HTML entities in text", () => {
    const result = jsonToHtml(doc(p(text("<script>alert('xss')</script>"))));
    expect(result).toBe("<p>&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;</p>");
  });

  it("handles mixed formatting in a paragraph", () => {
    const result = jsonToHtml(
      doc(
        p(
          text("normal "),
          text("bold", [{ type: "bold" }]),
          text(" "),
          text("bold+italic", [{ type: "bold" }, { type: "italic" }]),
        ),
      ),
    );
    expect(result).toBe(
      "<p>normal <strong>bold</strong> <em><strong>bold+italic</strong></em></p>",
    );
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("wrapStandaloneHtml", () => {
  it("produces a valid HTML document", () => {
    const result = wrapStandaloneHtml("Test Title", "<p>Hello</p>");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<title>Test Title</title>");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("</html>");
  });

  it("escapes HTML in the title", () => {
    const result = wrapStandaloneHtml('<script>alert("xss")</script>', "<p>body</p>");
    expect(result).toContain("<title>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</title>");
    expect(result).not.toContain("<title><script>");
  });
});
