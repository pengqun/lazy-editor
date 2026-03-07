# Dynamic Lowlight Language Loading — Results

## Changes

### `src/lib/lowlight-loader.ts` (new file)
Extracted lowlight setup into a dedicated module with dynamic language loading:

- **Synchronous startup**: Only `plaintext` is registered at init via `createLowlight()`.
- **Alias normalization**: Maps common shorthand to canonical grammar names:
  - `js`/`jsx` → `javascript`, `ts`/`tsx` → `typescript`, `py` → `python`
  - `sh`/`zsh`/`shell` → `bash`, `md` → `markdown`, `rs` → `rust`
  - `html`/`htm`/`svg` → `xml`, `txt`/`text` → `plaintext`
- **Dynamic import map**: A `switch`-based `importGrammar()` function with explicit dynamic `import()` for each supported language (xml, css, javascript, typescript, json, bash, markdown, python, rust, sql, plaintext). Unknown languages return `null` silently.
- **Dedup tracking**: A `loaded` Set tracks registered grammars; a `pending` Map tracks in-flight import promises to prevent duplicate parallel loads.
- **`loadLanguagesForDoc(editor)`**: Walks the editor document's codeBlock nodes, collects unloaded language attrs, loads them in parallel via `Promise.all`, and dispatches a transaction to re-highlight affected blocks. All operations are wrapped in try/catch — never throws.

### `src/components/editor/Editor.tsx`
- Imports `lowlight` and `loadLanguagesForDoc` from the new loader module.
- Calls `loadLanguagesForDoc(editor)` in `onUpdate` (every content change) and after `setContent` (file switch).
- No other behavior changed — same extensions, same auto-save, same selection tracking.

### `vite.config.ts`
- Fixed `manualChunks` to match both `highlight.js/lib/languages/` and `highlight.js/es/languages/` paths, since Vite resolves to the ESM entry. Without this fix, all language grammars were bundled into the monolithic `editor-highlight` chunk instead of being split into lazy chunks.

## Build Outcome

`npm run build` — **success** (tsc + vite, 1.83s).

Key chunk sizes:
| Chunk | Size | Gzip |
|---|---|---|
| `editor-highlight` (core + plaintext) | 46.36 KB | 14.91 KB |
| `hljs-css` | 13.20 KB | 4.32 KB |
| `hljs-typescript` | 7.76 KB | 3.06 KB |
| `hljs-javascript` | 6.49 KB | 2.60 KB |
| `hljs-sql` | 6.49 KB | 2.41 KB |
| `hljs-python` | 3.46 KB | 1.47 KB |
| `hljs-bash` | 3.16 KB | 1.57 KB |
| `hljs-rust` | 2.88 KB | 1.41 KB |
| `hljs-markdown` | 2.08 KB | 0.87 KB |
| `hljs-xml` | 1.90 KB | 0.77 KB |
| `hljs-json` | 0.42 KB | 0.32 KB |

The `editor-highlight` chunk shrank from 95 KB to 46 KB. Language grammars are now loaded on demand as separate chunks only when a codeBlock uses that language.
