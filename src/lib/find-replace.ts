import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchMatch {
  from: number;
  to: number;
}

/** Maximum number of matches returned by findMatches to avoid memory/UI issues. */
export const MATCH_LIMIT = 1000;

/** Document size thresholds (in characters) for adaptive debounce. */
export const LARGE_DOC_THRESHOLD = 50_000;
export const VERY_LARGE_DOC_THRESHOLD = 200_000;
export const YIELD_BATCH_SIZE = 500;

/** Estimate the character count of a ProseMirror document by summing text nodes. */
export function estimateDocSize(doc: ProseMirrorNode): number {
  let size = 0;
  doc.descendants((node) => {
    if (node.isText && node.text) {
      size += node.text.length;
    }
  });
  return size;
}

/** Return an appropriate search debounce (ms) based on document size. */
export function adaptiveDebounce(docSize: number): number {
  if (docSize >= VERY_LARGE_DOC_THRESHOLD) return 500;
  if (docSize >= LARGE_DOC_THRESHOLD) return 350;
  return 200;
}

export interface FindMatchesResult {
  matches: SearchMatch[];
  /** True when the result was truncated at MATCH_LIMIT. */
  truncated: boolean;
}

export type AsyncFindMatchesResult = FindMatchesResult & {
  cancelled: boolean;
};

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Find all occurrences of `query` in a ProseMirror document.
 * Searches within individual text nodes.
 *
 * Accepts an optional `limit` (defaults to {@link MATCH_LIMIT}).
 * When the limit is reached the search terminates early and
 * the returned result is marked as `truncated`.
 */
export function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
  limit: number = MATCH_LIMIT,
): FindMatchesResult {
  if (!query) return { matches: [], truncated: false };

  const matches: SearchMatch[] = [];
  const search = caseSensitive ? query : query.toLowerCase();
  let truncated = false;

  doc.descendants((node, pos) => {
    // Early termination: stop traversing when limit reached
    if (truncated) return false;
    if (!node.isText || !node.text) return;
    const text = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = 0;
    while (idx <= text.length - search.length) {
      const found = text.indexOf(search, idx);
      if (found === -1) break;
      matches.push({ from: pos + found, to: pos + found + search.length });
      if (matches.length >= limit) {
        truncated = true;
        return false;
      }
      idx = found + 1;
    }
  });

  return { matches, truncated };
}

export async function findMatchesAsync(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
  signal: AbortSignal,
  options?: {
    limit?: number;
    onProgress?: (result: FindMatchesResult) => void;
  },
): Promise<AsyncFindMatchesResult> {
  if (signal.aborted) {
    return { matches: [], truncated: false, cancelled: true };
  }
  if (!query) return { matches: [], truncated: false, cancelled: false };

  const limit = options?.limit ?? MATCH_LIMIT;
  const onProgress = options?.onProgress;
  const docSize = estimateDocSize(doc);

  if (docSize < LARGE_DOC_THRESHOLD) {
    const result = findMatches(doc, query, caseSensitive, limit);
    onProgress?.(result);
    return { ...result, cancelled: false };
  }

  const textNodes: { text: string; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    textNodes.push({ text: node.text, pos });
  });

  const matches: SearchMatch[] = [];
  const search = caseSensitive ? query : query.toLowerCase();
  let truncated = false;
  let cancelled = false;
  let sinceYield = 0;

  for (const textNode of textNodes) {
    if (signal.aborted) {
      cancelled = true;
      break;
    }

    const text = caseSensitive ? textNode.text : textNode.text.toLowerCase();
    let idx = 0;
    while (idx <= text.length - search.length) {
      const found = text.indexOf(search, idx);
      if (found === -1) break;
      matches.push({
        from: textNode.pos + found,
        to: textNode.pos + found + search.length,
      });
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      idx = found + 1;
    }

    if (truncated) break;

    sinceYield += 1;
    if (sinceYield >= YIELD_BATCH_SIZE) {
      onProgress?.({ matches: [...matches], truncated });
      await yieldToEventLoop();
      sinceYield = 0;
      if (signal.aborted) {
        cancelled = true;
        break;
      }
    }
  }

  onProgress?.({ matches: [...matches], truncated });
  return { matches, truncated, cancelled };
}

/** Wrap an index into [0, length) with modular arithmetic. */
export function wrapIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
}

// ---- ProseMirror plugin for search decorations ----

export const searchPluginKey = new PluginKey("searchAndReplace");

export interface SearchPluginState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
  /** True when findMatches truncated results at MATCH_LIMIT. */
  truncated: boolean;
  decorations: DecorationSet;
}

interface SearchPluginMeta {
  query?: string;
  caseSensitive?: boolean;
  currentIndex?: number;
  matches?: SearchMatch[];
  truncated?: boolean;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: SearchMatch[],
  currentIndex: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;

  const decorations = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? "find-match find-match-current" : "find-match",
    }),
  );
  return DecorationSet.create(doc, decorations);
}

/**
 * TipTap extension providing document-level find & replace with
 * inline highlight decorations.
 *
 * Controlled via transaction meta on `searchPluginKey`:
 *   `{ query?, caseSensitive?, currentIndex? }`
 */
export const SearchAndReplace = Extension.create({
  name: "searchAndReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,

        state: {
          init(): SearchPluginState {
            return {
              query: "",
              caseSensitive: false,
              matches: [],
              currentIndex: 0,
              truncated: false,
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, prev, _oldState, newState): SearchPluginState {
            const meta: SearchPluginMeta | undefined =
              tr.getMeta(searchPluginKey);

            if (meta) {
              const query = meta.query ?? prev.query;
              const caseSensitive = meta.caseSensitive ?? prev.caseSensitive;
              let currentIndex = meta.currentIndex ?? prev.currentIndex;
              const providedMatches = meta.matches;

              if (providedMatches !== undefined) {
                currentIndex = wrapIndex(currentIndex, providedMatches.length);
                const truncated = meta.truncated ?? false;
                return {
                  query,
                  caseSensitive,
                  matches: providedMatches,
                  currentIndex,
                  truncated,
                  decorations: buildDecorations(
                    newState.doc,
                    providedMatches,
                    currentIndex,
                  ),
                };
              }

              // Query or case-sensitivity changed → recompute matches
              if (
                query !== prev.query ||
                caseSensitive !== prev.caseSensitive
              ) {
                const { matches, truncated } = findMatches(newState.doc, query, caseSensitive);
                currentIndex = wrapIndex(currentIndex, matches.length);
                return {
                  query,
                  caseSensitive,
                  matches,
                  currentIndex,
                  truncated,
                  decorations: buildDecorations(newState.doc, matches, currentIndex),
                };
              }

              // Only currentIndex changed
              if (currentIndex !== prev.currentIndex) {
                const clamped = wrapIndex(currentIndex, prev.matches.length);
                return {
                  ...prev,
                  currentIndex: clamped,
                  decorations: buildDecorations(newState.doc, prev.matches, clamped),
                };
              }

              return prev;
            }

            // Doc changed while search active → recompute
            if (tr.docChanged && prev.query) {
              const { matches, truncated } = findMatches(
                newState.doc,
                prev.query,
                prev.caseSensitive,
              );
              const currentIndex = wrapIndex(prev.currentIndex, matches.length);
              return {
                ...prev,
                matches,
                currentIndex,
                truncated,
                decorations: buildDecorations(newState.doc, matches, currentIndex),
              };
            }

            return prev;
          },
        },

        props: {
          decorations(state) {
            return (
              searchPluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});
