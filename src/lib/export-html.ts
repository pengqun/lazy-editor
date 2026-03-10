import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Editor, JSONContent } from "@tiptap/react";

/**
 * Export the current editor content as a standalone HTML file via a save dialog.
 * Returns the saved file path, or null if cancelled.
 */
export async function exportEditorToHtml(
  editor: Editor,
  defaultName?: string,
): Promise<string | null> {
  const doc = editor.getJSON();
  const title = extractTitle(doc) ?? "Untitled";
  const bodyHtml = jsonToHtml(doc);
  const fullHtml = wrapStandaloneHtml(title, bodyHtml);

  const filePath = await save({
    title: "Export as HTML",
    defaultPath: defaultName ?? "export.html",
    filters: [{ name: "HTML", extensions: ["html"] }],
  });

  if (!filePath) return null;

  await writeTextFile(filePath, fullHtml);
  return filePath;
}

/** Extract the first heading text to use as document title. */
function extractTitle(doc: JSONContent): string | null {
  if (!doc.content) return null;
  for (const node of doc.content) {
    if (node.type === "heading" && node.content) {
      return renderInlineText(node.content);
    }
  }
  return null;
}

function renderInlineText(content: JSONContent[]): string {
  return content.map((n) => n.text ?? "").join("");
}

/**
 * Convert a TipTap JSON document to an HTML body string.
 *
 * Supports: headings, bold, italic, strikethrough, inline code, code blocks,
 * bullet/ordered lists, blockquotes, links, horizontal rules, hard breaks.
 */
export function jsonToHtml(doc: JSONContent): string {
  if (!doc.content || doc.content.length === 0) return "";
  return doc.content.map((node) => renderNode(node)).join("\n");
}

function renderNode(node: JSONContent): string {
  switch (node.type) {
    case "heading":
      return renderHeading(node);
    case "paragraph":
      return `<p>${renderInlineContent(node.content)}</p>`;
    case "bulletList":
      return renderList(node, "ul");
    case "orderedList":
      return renderList(node, "ol");
    case "blockquote":
      return renderBlockquote(node);
    case "codeBlock":
      return renderCodeBlock(node);
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    case "text":
      return renderText(node);
    default:
      if (node.content) return node.content.map((n) => renderNode(n)).join("\n");
      return escapeHtml(node.text ?? "");
  }
}

function renderHeading(node: JSONContent): string {
  const level = (node.attrs?.level as number) ?? 1;
  const text = renderInlineContent(node.content);
  return `<h${level}>${text}</h${level}>`;
}

function renderInlineContent(content?: JSONContent[]): string {
  if (!content) return "";
  return content.map((child) => renderInline(child)).join("");
}

function renderInline(node: JSONContent): string {
  if (node.type === "hardBreak") return "<br>";
  if (node.type !== "text" || !node.text) {
    if (node.content) return renderInlineContent(node.content);
    return "";
  }
  return renderText(node);
}

function renderText(node: JSONContent): string {
  let text = escapeHtml(node.text ?? "");
  if (!node.marks) return text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case "bold":
        text = `<strong>${text}</strong>`;
        break;
      case "italic":
        text = `<em>${text}</em>`;
        break;
      case "strike":
        text = `<s>${text}</s>`;
        break;
      case "code":
        text = `<code>${text}</code>`;
        break;
      case "link": {
        const href = escapeHtml(String(mark.attrs?.href ?? ""));
        text = `<a href="${href}">${text}</a>`;
        break;
      }
    }
  }

  return text;
}

function renderList(node: JSONContent, tag: "ul" | "ol"): string {
  if (!node.content) return "";
  const items = node.content
    .map((item) => {
      const body = renderListItem(item);
      return `<li>${body}</li>`;
    })
    .join("\n");
  return `<${tag}>\n${items}\n</${tag}>`;
}

function renderListItem(item: JSONContent): string {
  if (!item.content) return "";
  return item.content
    .map((child) => {
      if (child.type === "paragraph") return renderInlineContent(child.content);
      return renderNode(child);
    })
    .join("\n");
}

function renderBlockquote(node: JSONContent): string {
  if (!node.content) return "";
  const inner = node.content.map((n) => renderNode(n)).join("\n");
  return `<blockquote>\n${inner}\n</blockquote>`;
}

function renderCodeBlock(node: JSONContent): string {
  const lang = (node.attrs?.language as string) ?? "";
  const code = node.content?.map((c) => escapeHtml(c.text ?? "")).join("") ?? "";
  const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return `<pre><code${langAttr}>${code}</code></pre>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Wrap body HTML in a self-contained HTML document with minimal styling. */
export function wrapStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body {
    max-width: 720px;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
  }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
  p { margin: 0.8em 0; }
  code { background: #f4f4f4; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 1em; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #555; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
  a { color: #0066cc; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.3em 0; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
