import type { Editor } from "@tiptap/core";
import plaintext from "highlight.js/lib/languages/plaintext";
import { createLowlight } from "lowlight";

/** Lowlight instance – starts with only `plaintext` registered. */
export const lowlight = createLowlight();
lowlight.register("plaintext", plaintext);

/** Maps common aliases to canonical highlight.js grammar names. */
const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  md: "markdown",
  rs: "rust",
  html: "xml",
  htm: "xml",
  svg: "xml",
  txt: "plaintext",
  text: "plaintext",
};

const loaded = new Set(["plaintext"]);
const pending = new Map<string, Promise<void>>();

function canonical(lang: string): string {
  return ALIASES[lang] ?? lang;
}

/** Dynamically import a highlight.js grammar by canonical name. */
async function importGrammar(name: string) {
  switch (name) {
    case "xml":
      return (await import("highlight.js/lib/languages/xml")).default;
    case "css":
      return (await import("highlight.js/lib/languages/css")).default;
    case "javascript":
      return (await import("highlight.js/lib/languages/javascript")).default;
    case "typescript":
      return (await import("highlight.js/lib/languages/typescript")).default;
    case "json":
      return (await import("highlight.js/lib/languages/json")).default;
    case "bash":
      return (await import("highlight.js/lib/languages/bash")).default;
    case "markdown":
      return (await import("highlight.js/lib/languages/markdown")).default;
    case "python":
      return (await import("highlight.js/lib/languages/python")).default;
    case "rust":
      return (await import("highlight.js/lib/languages/rust")).default;
    case "sql":
      return (await import("highlight.js/lib/languages/sql")).default;
    default:
      return null;
  }
}

async function loadOne(lang: string): Promise<boolean> {
  const name = canonical(lang);
  if (loaded.has(name)) return false;

  if (!pending.has(name)) {
    const p = importGrammar(name)
      .then((grammar) => {
        if (!grammar) return;
        lowlight.register(name, grammar);
        loaded.add(name);
        for (const [alias, target] of Object.entries(ALIASES)) {
          if (target === name) {
            lowlight.register(alias, grammar);
            loaded.add(alias);
          }
        }
      })
      .catch(() => {})
      .finally(() => pending.delete(name));
    pending.set(name, p);
  }

  await pending.get(name);
  return loaded.has(name);
}

/**
 * Scan editor doc for codeBlock nodes and lazily load any missing grammars.
 * After loading, dispatches a transaction to re-highlight affected blocks.
 */
export async function loadLanguagesForDoc(editor: Editor): Promise<void> {
  const needed = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock" && node.attrs.language) {
      const lang = node.attrs.language as string;
      if (!loaded.has(canonical(lang))) needed.add(lang);
    }
  });

  if (needed.size === 0) return;

  const results = await Promise.all(Array.from(needed).map(loadOne));

  if (!results.some(Boolean) || editor.isDestroyed) return;

  // Force re-highlight by re-setting code block node markup
  try {
    const { tr } = editor.state;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs });
      }
    });
    if (tr.steps.length > 0) {
      editor.view.dispatch(tr);
    }
  } catch {
    // Editor state changed between scan and dispatch; highlighting
    // will be applied on the next content update.
  }
}
