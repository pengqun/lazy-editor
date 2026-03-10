import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface OutlineHeading {
  level: 1 | 2 | 3;
  text: string;
  pos: number;
}

/**
 * Extract H1–H3 headings from a ProseMirror document.
 */
export function extractHeadings(doc: ProseMirrorNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  doc.descendants((node, pos) => {
    if (
      node.type.name === "heading" &&
      node.attrs.level >= 1 &&
      node.attrs.level <= 3
    ) {
      headings.push({
        level: node.attrs.level as 1 | 2 | 3,
        text: node.textContent,
        pos,
      });
    }
  });
  return headings;
}
