import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchMatch {
  from: number;
  to: number;
}

/**
 * Find all occurrences of `query` in a ProseMirror document.
 * Searches within individual text nodes.
 */
export function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return [];

  const matches: SearchMatch[] = [];
  const search = caseSensitive ? query : query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = 0;
    while (idx <= text.length - search.length) {
      const found = text.indexOf(search, idx);
      if (found === -1) break;
      matches.push({ from: pos + found, to: pos + found + search.length });
      idx = found + 1;
    }
  });

  return matches;
}

/** Wrap an index into [0, length) with modular arithmetic. */
export function wrapIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
}

// ---- ProseMirror plugin for search decorations ----

export const searchPluginKey = new PluginKey("searchAndReplace");

interface SearchPluginState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
  decorations: DecorationSet;
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
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, prev, _oldState, newState): SearchPluginState {
            const meta: Partial<SearchPluginState> | undefined =
              tr.getMeta(searchPluginKey);

            if (meta) {
              const query = meta.query ?? prev.query;
              const caseSensitive = meta.caseSensitive ?? prev.caseSensitive;
              let currentIndex = meta.currentIndex ?? prev.currentIndex;

              // Query or case-sensitivity changed → recompute matches
              if (
                query !== prev.query ||
                caseSensitive !== prev.caseSensitive
              ) {
                const matches = findMatches(newState.doc, query, caseSensitive);
                currentIndex = wrapIndex(currentIndex, matches.length);
                return {
                  query,
                  caseSensitive,
                  matches,
                  currentIndex,
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
              const matches = findMatches(
                newState.doc,
                prev.query,
                prev.caseSensitive,
              );
              const currentIndex = wrapIndex(prev.currentIndex, matches.length);
              return {
                ...prev,
                matches,
                currentIndex,
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
