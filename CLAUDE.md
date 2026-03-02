# CLAUDE.md

## Project Overview

Lazy Editor is an AI-native writing workspace built as a desktop application. It combines a rich text editor with multi-provider AI assistance (Claude, OpenAI, Ollama) and a local knowledge base with semantic search. Built with Tauri v2 (Rust backend) and React 19 (TypeScript frontend).

## Tech Stack

**Frontend:** React 19, TypeScript 5.6, TipTap 2.11 (rich text editor), Zustand 5 (state management), Tailwind CSS 3.4, Vite 6

**Backend:** Rust (edition 2021), Tauri 2.x, SQLite (rusqlite), fastembed (local embeddings), reqwest (HTTP), Tokio (async runtime)

**Tauri Plugins:** fs, dialog, http, store

## Development Commands

```bash
npm run dev              # Start Vite dev server (port 1420)
npm run build            # TypeScript compile (tsc -b) + Vite production build
npm run tauri dev        # Run full Tauri desktop app in dev mode
npm run tauri build      # Build production desktop binary
cd src-tauri && cargo check   # Rust type checking only
cd src-tauri && cargo build   # Rust compilation
```

## Project Structure

```
src/                          # React/TypeScript frontend
├── components/
│   ├── editor/               # Editor.tsx, AIToolbar.tsx, Toolbar.tsx, StatusBar.tsx
│   ├── panels/               # CommandPalette.tsx, SettingsPanel.tsx
│   └── sidebar/              # FileTree.tsx, KnowledgePanel.tsx
├── hooks/                    # useAI.ts (streaming), useAutoSave.ts
├── stores/                   # Zustand: editor.ts, files.ts, ai.ts, knowledge.ts
├── lib/                      # cn.ts (classnames), tauri.ts (IPC bindings)
├── App.tsx                   # Root layout component
└── main.tsx                  # React DOM mount

src-tauri/src/                # Rust/Tauri backend
├── commands/                 # Tauri command handlers: ai.rs, files.rs, kb.rs, web.rs
├── ai/                       # provider.rs (trait + implementations), prompts.rs
├── knowledge/                # db.rs, embedder.rs, chunker.rs, search.rs
├── web/                      # extractor.rs (content extraction)
├── lib.rs                    # App setup, state initialization, command registration
└── main.rs                   # Entry point
```

## Architecture

**Frontend → Backend communication:** Tauri IPC via `invoke()` for request/response. Streaming AI responses use Tauri events (`ai-stream-chunk`, `ai-stream-done`, `ai-stream-error`).

**AI Provider pattern:** Unified `AiProvider` trait in `src-tauri/src/ai/provider.rs` with implementations for Claude, OpenAI, and Ollama. Factory function `create_provider()` selects the implementation based on settings.

**State management:** Four Zustand stores — `useEditorStore` (UI state, TipTap instance), `useFilesStore` (workspace, file I/O), `useAiStore` (provider settings, actions), `useKnowledgeStore` (documents, search).

**Knowledge base:** Documents are chunked (`chunker.rs`), embedded locally via fastembed (`embedder.rs`), stored in SQLite (`db.rs`), and retrieved via vector similarity search (`search.rs`). Results are injected into AI prompts as context.

**Shared backend state:** `AppState` struct with `Arc<Mutex<>>` wrapping database, embedder, workspace path, and cancellation flag. Managed via Tauri's `.manage()`.

## Code Conventions

- **Components:** PascalCase filenames (`.tsx`), one component per file
- **Hooks:** `use` prefix, camelCase filenames (`.ts`)
- **Stores:** `use{Feature}Store` naming convention (Zustand `create()`)
- **Tauri commands:** snake_case in Rust, called via `invoke("command_name")` from frontend
- **Imports:** `@/` path alias maps to `src/` directory
- **Styling:** Tailwind utility classes with custom color tokens — `surface-0` through `surface-3`, `accent`, `text-primary`/`secondary`/`tertiary`, `border`
- **TypeScript:** Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)

## Key Patterns

- AI streaming: Rust spawns a Tokio task, sends chunks via `mpsc` channel, emits Tauri events. Frontend listens in `useAI.ts` hook and inserts content into editor.
- Auto-save: `useAutoSave.ts` debounces content changes with a 1-second delay before calling `invoke("save_file")`.
- Command palette: Triggered by Cmd/Ctrl+K, dispatches AI actions (draft, expand, rewrite, research, summarize) with selected text context.

## Important Notes

- No test framework is configured yet
- No linter or formatter (ESLint, Prettier, Biome) is configured yet
- No CI/CD pipelines exist
- No `.env.example` — API keys are stored via Tauri's plugin-store (persistent settings)
- HTTP permissions are scoped to: Anthropic API, OpenAI API, localhost:11434 (Ollama), and generic HTTPS/HTTP
