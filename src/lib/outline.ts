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

export interface AsyncExtractHeadingsResult extends ExtractHeadingsResult {
  /** True when extraction was aborted via AbortSignal. */
  cancelled: boolean;
}

/** Number of doc nodes to visit before yielding. */
const OUTLINE_YIELD_BATCH = 500;

/** Doc size threshold below which we skip yielding. */
const OUTLINE_SMALL_DOC = 50_000;

/**
 * Async, cancellable version of {@link extractHeadings}.
 *
 * For small documents (< 50K chars), runs synchronously.
 * For larger documents, yields every {@link OUTLINE_YIELD_BATCH} nodes.
 */
export async function extractHeadingsAsync(
  doc: ProseMirrorNode,
  limit: number = HEADING_LIMIT,
  signal?: AbortSignal,
): Promise<AsyncExtractHeadingsResult> {
  // Small doc — sync path. Use node count as proxy since outline traversal
  // processes structural nodes (headings), not just text nodes.
  let nodeCount = 0;
  let docSize = 0;
  doc.descendants((node) => {
    nodeCount++;
    if (node.isText && node.text) docSize += node.text.length;
    else if (node.textContent) docSize += node.textContent.length;
  });
  if (docSize < OUTLINE_SMALL_DOC) {
    return { ...extractHeadings(doc, limit), cancelled: false };
  }

  // Collect all nodes for batch processing
  const allNodes: { type: string; level: number; textContent: string; pos: number }[] = [];
  doc.descendants((node, pos) => {
    allNodes.push({
      type: node.type.name,
      level: node.attrs?.level ?? 0,
      textContent: node.textContent,
      pos,
    });
  });

  const headings: OutlineHeading[] = [];
  let truncated = false;

  for (let i = 0; i < allNodes.length; i++) {
    if (signal?.aborted) return { headings, truncated, cancelled: true };

    const n = allNodes[i];
    if (n.type === "heading" && n.level >= 1 && n.level <= 3) {
      headings.push({ level: n.level as 1 | 2 | 3, text: n.textContent, pos: n.pos });
      if (headings.length >= limit) {
        truncated = true;
        break;
      }
    }

    if ((i + 1) % OUTLINE_YIELD_BATCH === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { headings, truncated, cancelled: false };
}
