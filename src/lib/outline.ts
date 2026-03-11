import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface OutlineHeading {
  level: 1 | 2 | 3;
  text: string;
  pos: number;
}

/** Maximum number of headings returned to avoid UI rendering issues. */
export const HEADING_LIMIT = 500;

/** Debounce delay thresholds (ms) based on heading count. */
export const OUTLINE_LARGE_THRESHOLD = 100;

export interface ExtractHeadingsResult {
  headings: OutlineHeading[];
  /** True when the result was truncated at HEADING_LIMIT. */
  truncated: boolean;
}

/**
 * Return an appropriate outline debounce (ms) based on heading count.
 * Used by OutlinePanel to avoid excessive re-renders in huge docs.
 */
export function adaptiveOutlineDebounce(headingCount: number): number {
  if (headingCount >= OUTLINE_LARGE_THRESHOLD) return 600;
  return 300;
}

/**
 * Extract H1–H3 headings from a ProseMirror document.
 *
 * Accepts an optional `limit` (defaults to {@link HEADING_LIMIT}).
 * When the limit is reached the traversal terminates early and
 * the returned result is marked as `truncated`.
 */
export function extractHeadings(
  doc: ProseMirrorNode,
  limit: number = HEADING_LIMIT,
): ExtractHeadingsResult {
  const headings: OutlineHeading[] = [];
  let truncated = false;

  doc.descendants((node, pos) => {
    if (truncated) return false;
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
      if (headings.length >= limit) {
        truncated = true;
        return false;
      }
    }
  });

  return { headings, truncated };
}
