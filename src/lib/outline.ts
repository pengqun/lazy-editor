import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { LARGE_DOC_THRESHOLD, YIELD_BATCH_SIZE } from "./find-replace";

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

export type AsyncExtractHeadingsResult = ExtractHeadingsResult & {
  cancelled: boolean;
};

function estimateOutlineDocSize(doc: ProseMirrorNode): number {
  let size = 0;
  doc.descendants((node) => {
    if (node.isText && node.text) {
      size += node.text.length;
      return;
    }
    size += node.textContent.length;
  });
  return size;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

export async function extractHeadingsAsync(
  doc: ProseMirrorNode,
  signal: AbortSignal,
  options?: {
    limit?: number;
    onProgress?: (result: ExtractHeadingsResult) => void;
  },
): Promise<AsyncExtractHeadingsResult> {
  if (signal.aborted) {
    return { headings: [], truncated: false, cancelled: true };
  }

  const limit = options?.limit ?? HEADING_LIMIT;
  const onProgress = options?.onProgress;
  const docSize = estimateOutlineDocSize(doc);

  if (docSize < LARGE_DOC_THRESHOLD) {
    const result = extractHeadings(doc, limit);
    onProgress?.(result);
    return { ...result, cancelled: false };
  }

  const nodes: { isHeading: boolean; level: number; text: string; pos: number }[] = [];
  doc.descendants((node, pos) => {
    const level = Number(node.attrs?.level ?? 0);
    nodes.push({
      isHeading: node.type.name === "heading" && level >= 1 && level <= 3,
      level,
      text: node.textContent,
      pos,
    });
  });

  const headings: OutlineHeading[] = [];
  let truncated = false;
  let cancelled = false;
  let sinceYield = 0;

  for (const node of nodes) {
    if (signal.aborted) {
      cancelled = true;
      break;
    }

    if (node.isHeading) {
      headings.push({
        level: node.level as 1 | 2 | 3,
        text: node.text,
        pos: node.pos,
      });
      if (headings.length >= limit) {
        truncated = true;
        break;
      }
    }

    sinceYield += 1;
    if (sinceYield >= YIELD_BATCH_SIZE) {
      onProgress?.({ headings: [...headings], truncated });
      await yieldToEventLoop();
      sinceYield = 0;
      if (signal.aborted) {
        cancelled = true;
        break;
      }
    }
  }

  onProgress?.({ headings: [...headings], truncated });
  return { headings, truncated, cancelled };
}
