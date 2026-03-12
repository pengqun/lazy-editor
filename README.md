# Lazy Editor

AI-native writing workspace for desktop — a rich text editor with multi-provider AI assistance and a local knowledge base.

Built with **Tauri v2 (Rust)** + **React 19 (TypeScript)**.

## Product Scope (Current Phase)

- **Single-user first**: this phase is focused on personal writing workflows.
- **Out of scope for now**: multi-user collaboration features (shared editing, team workspaces, real-time co-authoring, comment/review workflows).
- Collaboration may be revisited in a later phase after core personal-writing stability is fully validated.

## Features

- **Rich text editor** powered by TipTap
- **AI assistance** with a unified provider interface (currently: Claude, OpenAI, Ollama)
- **Streaming responses** (chunks + completion events)
- **Local knowledge base**
  - chunking + local embeddings (fastembed)
  - SQLite storage
  - semantic search / retrieval to inject context into prompts
  - **citation traceability** — AI outputs that use KB context automatically append a compact "Sources: [1] Doc Title" block so you can trace which knowledge base documents informed each response
  - **clickable source recall** — click any citation link in AI output to view the original source chunk in the Knowledge Base panel, with surrounding context (previous/next chunks), navigation, relevance score badge, and matched-term highlighting showing why the chunk was retrieved
  - **retrieval quality** — score threshold filtering (removes low-relevance noise), document diversity limits (max 2 chunks per document in results), and XML-safe prompt injection
  - **retrieval controls** — configure how many KB results are injected into AI prompts (1–10) and scope retrieval to all documents or only pinned documents
  - **retrieval presets** — switch between Writing (balanced, 5 results), Research (maximum context, 8 results), and Precision (focused, 3 results from pinned docs) modes; manual overrides are preserved, and the active preset is persisted across restarts. Retrieval settings are remembered per document — switching files automatically restores each file's last-used preset/config
  - **KB source integrity** — scan file-sourced KB documents for stale references (moved/deleted source files). Detects move candidates by filename + content hash matching within the workspace. One-click relink, batch relink for obvious moves, and remove stale entries — all user-triggered, no silent destructive actions. Export scan results as JSON (machine-readable) or Markdown (human-readable summary with per-document table)
  - **citation notes** — after an AI action with KB sources, click "Insert references" in the status bar to append a formatted, deduplicated reference block (horizontal rule + numbered list with document titles, chunk positions, and relevance scores) at the end of your document. Toggle "Chunk" and "Rel%" buttons to show/hide chunk labels and relevance scores per entry; preferences are persisted across restarts
- **Workspace file management** (open/save + file tree)
- **Find & Replace** — document-level search with match highlighting, next/prev navigation, case-sensitive toggle, replace one or all (`⌘F`)
- **Document Outline** — toggleable sidebar listing H1–H3 headings for quick navigation; click to jump (`⌘⇧O`)
- **Export** — Markdown, HTML (standalone document), and PDF (via native print dialog). Accessible from the toolbar export menu or keyboard shortcuts (`⌘⇧E` / `⌘⇧H` / `⌘⇧P`)
- **Version History** — automatic local snapshots captured on save (deduplicated, rate-limited to every 5 minutes), with manual snapshot creation and restore-with-confirmation. Up to 50 snapshots per file, oldest pruned automatically (`⌘⇧V`)
- **Crash Recovery** — unsaved editor content is periodically checkpointed to local storage while you type. If the app exits unexpectedly, a recovery dialog offers to restore or discard the draft on next file open. Recovery drafts are bounded (max 20, auto-expired after 7 days) and cleared on successful save
- **Writing Metrics** — live word count, estimated reading time (based on 200 WPM), and configurable per-file writing goals with progress tracking. Click the word count in the status bar to set a target; progress is shown as a compact bar + percentage. Goals persist across sessions via local storage
- **Large document performance** — debounced word count, find/replace search, and outline extraction for smooth editing in long documents; memoized status bar calculations to reduce unnecessary re-renders
- **Diagnostics & Health Check** — in-app diagnostics panel (`⌘⇧D`) with subsystem health checks (workspace access, KB database, embedder, settings store), app/runtime info display, and one-click export to a local Markdown report. No secrets or API keys are collected
- **Update UX** — clear state progression for update checking/downloading/applying with actionable error messages; expected dev/staging failures are silenced gracefully

## Tech Stack

**Frontend**
- React 19 + TypeScript
- TipTap 2.11
- Zustand
- Tailwind CSS
- Vite

**Backend (Tauri)**
- Rust 2021
- Tauri 2.x
- reqwest + tokio
- SQLite (rusqlite)
- fastembed (local embeddings)

## Project Structure

```
src/              # React/TypeScript frontend
src-tauri/        # Rust/Tauri backend
```

Key backend modules:
- `src-tauri/src/ai/` — provider trait + implementations
- `src-tauri/src/knowledge/` — chunking/embedding/db/search
- `src-tauri/src/commands/` — Tauri command handlers

## Getting Started

### Prerequisites

- Node.js + npm
- Rust toolchain
- Tauri prerequisites for your OS

### Install

```bash
npm install
```

### Run (web dev server)

```bash
npm run dev
```

### Run (desktop app)

```bash
npm run tauri dev
```

### Build

```bash
npm run build
npm run tauri build
```

## Configuration (AI Providers)

Provider settings (API keys, endpoints, model choices) are stored via **Tauri plugin-store** (persistent local settings). There is no `.env` workflow by default.

- **Claude**: requires an Anthropic API key
- **OpenAI**: requires an OpenAI API key
- **Ollama**: expects a local Ollama server at `http://localhost:11434`

Network access is typically scoped to provider endpoints + generic HTTP/HTTPS used by the built-in web extractor.

## Testing

```bash
npm test                           # Frontend unit tests (Vitest)
cd src-tauri && cargo test         # Rust unit tests
```

## Development Notes

Useful commands:

```bash
npm run dev
npm run build
npm run tauri dev
npm run tauri build

cd src-tauri && cargo check
cd src-tauri && cargo build
```

## Versioning

The app version lives in three files that must stay in sync:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

**Check consistency:**

```bash
npm run version:check
```

**Bump all files at once:**

```bash
npm run version:bump -- 0.1.6
```

Then commit and tag:

```bash
git add -A && git commit -m "chore: bump version to 0.1.6"
git tag v0.1.6
git push origin main --tags
```

The CI release workflow runs `version:check` before building, so a mismatch will fail the job early with an actionable message.

## CI Release Packaging (macOS Apple Silicon)

This repo ships a dedicated workflow at `.github/workflows/release.yml`.

### Recommended release flow (best practice)

Use **version tags** as the source of truth for official releases:

```bash
git tag vX.Y.Z
git push origin main --tags
```

When a tag matching `v*.*.*` is pushed, GitHub Actions will:

- build the app for `aarch64-apple-darwin` on `macos-14`
- collect `.dmg` / updater artifacts
- publish a GitHub Release and attach bundles for download

### Pre-release branch builds

Push to `release/**` to build candidate packages without creating a GitHub Release.
Artifacts are uploaded to the workflow run for QA/internal testing.

### Manual builds

`workflow_dispatch` is enabled, so you can trigger packaging manually from Actions.

### Signing / notarization caveat

By default, builds can be unsigned unless Apple signing/notarization secrets are configured.
Unsigned apps are fine for internal testing but may show macOS security warnings on end-user machines.

## Privacy

- Knowledge base data is stored locally (SQLite).
- Embeddings are generated locally via fastembed.
- AI requests are sent only to the provider you configure (Claude/OpenAI/Ollama).

## Release Readiness

- In-app diagnostics panel with health checks and exportable reports
- Subsystem validation: workspace, KB database, embedder, settings store
- Update flow with clear state progression and error handling
- 295 frontend unit tests (Vitest) + 52 Rust unit tests (cargo test)
- CI release packaging for macOS Apple Silicon via GitHub Actions

## Roadmap (ideas)

- Additional export formats (DOCX, EPUB)
- More retrieval controls (collections, filters)
- Keep prioritizing single-user workflow polish; defer multi-user collaboration to a future phase

## License

See [LICENSE](./LICENSE).
