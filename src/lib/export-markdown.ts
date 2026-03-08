import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { JSONContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

/**
 * Export the current editor content as a Markdown file via a save dialog.
 * Returns the saved file path, or null if cancelled.
 */
export async function exportEditorToMarkdown(
  editor: Editor,
  defaultName?: string,
): Promise<string | null> {
  const doc = editor.getJSON();
  const markdown = jsonToMarkdown(doc);

  const filePath = await save({
    title: "Export as Markdown",
    defaultPath: defaultName ?? "export.md",
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return null;

  await writeTextFile(filePath, markdown);
  return filePath;
}

/**
 * Convert a TipTap JSON document to Markdown.
 *
 * Supports: headings, bold, italic, strikethrough, inline code, code blocks,
 * bullet/ordered lists, blockquotes, links, horizontal rules, hard breaks.
 */
export function jsonToMarkdown(doc: JSONContent): string {
  if (!doc.content || doc.content.length === 0) return "";
  const result = renderNodes(doc.content)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result ? `${result}\n` : "";
}

function renderNodes(nodes: JSONContent[], joinWith = "\n\n"): string {
  return nodes.map((node) => renderNode(node)).join(joinWith);
}

function renderNode(node: JSONContent): string {
  switch (node.type) {
    case "heading":
      return renderHeading(node);
    case "paragraph":
      return renderInlineContent(node.content);
    case "bulletList":
      return renderList(node, false);
    case "orderedList":
      return renderList(node, true);
    case "blockquote":
      return renderBlockquote(node);
    case "codeBlock":
      return renderCodeBlock(node);
    case "horizontalRule":
      return "---";
    case "hardBreak":
      return "\n";
    case "text":
      return renderText(node);
    default:
      // Fallback: render children if any
      if (node.content) return renderNodes(node.content);
      return node.text ?? "";
  }
}

function renderHeading(node: JSONContent): string {
  const level = (node.attrs?.level as number) ?? 1;
  const prefix = "#".repeat(level);
  const text = renderInlineContent(node.content);
  return `${prefix} ${text}`;
}

function renderInlineContent(content?: JSONContent[]): string {
  if (!content) return "";
  return content.map((child) => renderInline(child)).join("");
}

function renderInline(node: JSONContent): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text" || !node.text) {
    // Inline nodes like images or other extensions
    if (node.content) return renderInlineContent(node.content);
    return "";
  }
  return renderText(node);
}

function renderText(node: JSONContent): string {
  let text = node.text ?? "";
  if (!node.marks) return text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case "bold":
        text = `**${text}**`;
        break;
      case "italic":
        text = `*${text}*`;
        break;
      case "strike":
        text = `~~${text}~~`;
        break;
      case "code":
        text = `\`${text}\``;
        break;
      case "link":
        text = `[${text}](${mark.attrs?.href ?? ""})`;
        break;
    }
  }

  return text;
}

function renderList(node: JSONContent, ordered: boolean): string {
  if (!node.content) return "";
  return node.content
    .map((item, i) => {
      const prefix = ordered ? `${i + 1}. ` : "- ";
      const body = renderListItem(item);
      // Indent continuation lines
      const indented = body
        .split("\n")
        .map((line, li) => (li === 0 ? `${prefix}${line}` : `  ${line}`))
        .join("\n");
      return indented;
    })
    .join("\n");
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
  const inner = renderNodes(node.content);
  return inner
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderCodeBlock(node: JSONContent): string {
  const lang = (node.attrs?.language as string) ?? "";
  const code = node.content?.map((c) => c.text ?? "").join("") ?? "";
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}
