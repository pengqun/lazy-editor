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
- **Workspace file management** (open/save + file tree)

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

## Privacy

- Knowledge base data is stored locally (SQLite).
- Embeddings are generated locally via fastembed.
- AI requests are sent only to the provider you configure (Claude/OpenAI/Ollama).

## Roadmap (ideas)

- Add formatter/linter (Biome/ESLint + Prettier)
- Add basic tests
- CI for builds/releases
- Export formats (Markdown/PDF)
- More retrieval controls (collections, filters, citations)

## License

See [LICENSE](./LICENSE).
