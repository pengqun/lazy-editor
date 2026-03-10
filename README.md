# Lazy Editor

AI-native writing workspace for desktop — a rich text editor with multi-provider AI assistance and a local knowledge base.

Built with **Tauri v2 (Rust)** + **React 19 (TypeScript)**.

## Features

- **Rich text editor** powered by TipTap
- **AI assistance** with a unified provider interface (currently: Claude, OpenAI, Ollama)
- **Streaming responses** (chunks + completion events)
- **Local knowledge base**
  - chunking + local embeddings (fastembed)
  - SQLite storage
  - semantic search / retrieval to inject context into prompts
  - **citation traceability** — AI outputs that use KB context automatically append a compact "Sources: [1] Doc Title" block so you can trace which knowledge base documents informed each response
  - **retrieval controls** — configure how many KB results are injected into AI prompts (1–10) and scope retrieval to all documents or only pinned documents
- **Workspace file management** (open/save + file tree)
- **Find & Replace** — document-level search with match highlighting, next/prev navigation, case-sensitive toggle, replace one or all (`⌘F`)
- **Document Outline** — toggleable sidebar listing H1–H3 headings for quick navigation; click to jump (`⌘⇧O`)
- **Export** — Markdown, HTML (standalone document), and PDF (via native print dialog). Accessible from the toolbar export menu or keyboard shortcuts (`⌘⇧E` / `⌘⇧H` / `⌘⇧P`)

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

## Roadmap (ideas)

- Add formatter/linter (Biome/ESLint + Prettier)
- Add basic tests
- CI for builds/releases
- Additional export formats (DOCX, EPUB)
- More retrieval controls (collections, filters, citation click-to-view)

## License

See [LICENSE](./LICENSE).
