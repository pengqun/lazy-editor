import type { Editor } from "@tiptap/react";
import { jsonToHtml, wrapStandaloneHtml } from "./export-html";

/**
 * Export editor content as PDF via the browser's native print dialog.
 * Opens a new window with clean HTML and triggers window.print(),
 * which lets the user choose "Save as PDF" from the print destination.
 */
export function exportEditorToPdf(editor: Editor): void {
  const doc = editor.getJSON();
  const title =
    doc.content
      ?.find((n) => n.type === "heading")
      ?.content?.map((n) => n.text ?? "")
      .join("") ?? "Untitled";
  const bodyHtml = jsonToHtml(doc);
  const fullHtml = wrapStandaloneHtml(title, bodyHtml);

  // Inject print-specific styles and auto-trigger print
  const printHtml = fullHtml.replace(
    "</style>",
    `  @media print {
    body { margin: 0; max-width: none; }
  }
</style>`,
  );

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(printHtml);
  printWindow.document.close();

  // Wait for content to render before triggering print
  printWindow.addEventListener("load", () => {
    printWindow.print();
  });
  // Fallback for fast-loading content
  setTimeout(() => {
    printWindow.print();
  }, 300);
}
