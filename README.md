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
  - **KB source integrity** — scan file-sourced KB documents for stale references (moved/deleted source files). Detects move candidates by filename + content hash matching within the workspace. One-click relink, batch relink for obvious moves, and remove stale entries — all user-triggered, no silent destructive actions. Export scan results as JSON (machine-readable) or Markdown (human-readable summary with per-document table). Scan history is persisted locally (last 20 scans) with trend indicators showing deltas between consecutive scans; history is included in exports. **Scan reminders** — enable configurable reminders (daily / every 3 days / weekly) to prompt integrity scans; a subtle banner appears when a scan is due with "Scan now" and "Snooze 24h" actions. Settings persist locally
  - **scan health panel** — compact coverage dashboard showing 7-day/30-day scan counts, latest scan age, consecutive-day streak, and a tiered status indicator (Good / Fair / Poor) with configurable thresholds (min scans for Good, max age for Good/Poor tiers); thresholds can be set per workspace (overriding global defaults) with save/reset actions; settings persist locally with reset-to-defaults; toggleable from the integrity report header
  - **one-click health check** — single-action workflow that runs an integrity scan, computes health metrics, and generates prioritized recommendations (relink moved files, remove stale entries, adjust reminder frequency) with quick-action buttons; results are shown in a compact card with overall status, key counts, and export to JSON/Markdown (including estimated batch impact summary)
  - **batch fix plan** — compose a multi-step fix plan from current recommendations with preview before execution; auto-executable steps (high-confidence relinks, stale removal, settings changes) run in sequence after explicit confirm, while high-risk/unsupported steps are marked manual-only and skipped; per-step status is explicit (`pending/running/success/failed/skipped`), failed steps can be retried one-by-one in-session, and execution log keeps compact before/after impact summaries
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

### 批处理执行结果怎么看

- **执行前（Fix Plan Preview）**：先看「预计影响」，会按建议类型给出预计条目数（如 relink/remove/reminder/frequency），方便判断这次批处理会动到多少内容。
- **执行中**：每个步骤都有状态（`pending/running/success/failed/skipped`），高风险或不支持动作仍是 `manual-only`，不会自动执行。
- **执行后（Execution Results）**：先看顶部紧凑摘要（成功/失败/跳过 + items changed），再看每步明细（耗时、错误信息、重试次数）。若某步失败，可直接点 **Retry** 单步重试。

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

### 偶发测试失败：一键采集诊断信息

当 CI 或本地出现“偶发失败 / 难以复现”时，优先运行（CI 可在 GitHub Actions 手动触发 `CI Diagnose` workflow）：

```bash
npm run test:diagnose
```

手动触发 `CI Diagnose` 时可按需选择参数（仅影响该手动诊断任务，不影响常规 push/tag/release 流程）：

- `run_frontend_tests`（默认 `true`）：是否执行前端诊断测试组
- `run_rust_tests`（默认 `true`）：是否执行 Rust 诊断测试组
- `vitest_verbose`（默认 `false`）：是否额外执行 verbose vitest
- `repeat_count`（默认 `1`，上限 `5`）：重复执行选中测试组次数

示例：

- 只跑前端并启用 verbose：
  - `run_frontend_tests=true`
  - `run_rust_tests=false`
  - `vitest_verbose=true`
  - `repeat_count=2`
- 只跑 Rust：
  - `run_frontend_tests=false`
  - `run_rust_tests=true`
  - `vitest_verbose=false`
  - `repeat_count=1`

该命令会一次性执行并记录：

- Node / npm / Vitest / Rust(cargo, rustc) 版本
- 当前 git 分支与提交哈希
- 复现矩阵：
  - `npm test`
  - `npm test -- --no-file-parallelism --maxWorkers=1`（Vitest 串行模式；用于替代不兼容的 Jest `--runInBand`）
  - `npx vitest run --reporter=verbose`
  - `cd src-tauri && cargo test -q`
- 每个命令的独立日志与退出码

> 说明：本项目测试框架是 Vitest，`--runInBand` 为 Jest 参数，在 Vitest 下会报 `Unknown option`。`test:diagnose` 已改为使用 Vitest 支持的串行参数，默认不再产生该固定噪音失败。

输出会落盘到：

- `.artifacts/test-diagnose/<timestamp>/meta.log`
- `.artifacts/test-diagnose/<timestamp>/summary.log`
- `.artifacts/test-diagnose/<timestamp>/index.md`（人类可读索引）
- `.artifacts/test-diagnose/<timestamp>/summary.json`（结构化索引）
- `.artifacts/test-diagnose/<timestamp>/*.log`
- `.artifacts/test-diagnose/history.json`（最近 20 次诊断的滚动稳定性基线）

#### 如何阅读诊断产物索引

1. 先打开 `index.md`：快速查看本次执行参数、环境版本、每条测试命令状态。
2. 再看 `index.md` 的“稳定性基线”：这里会汇总最近 20 次诊断运行的 overall pass rate、分命令 pass rate，以及常见失败类型计数，用来判断是单次偶发，还是长期不稳定。
3. `summary.json` 里会同步暴露 `stabilityBaseline` 字段，便于后续脚本或 CI 做结构化分析。
4. 如果有失败，直接看 `index.md` 的“失败日志清单”，按路径打开对应 `*.log`。
5. 需要自动化分析或二次处理时，读取 `summary.json`：其中包含同样信息的结构化字段（`parameters` / `versions` / `commands` / `failedLogs` / `stabilityBaseline`）。

若有失败，请打包对应时间戳目录并附在 issue / PR 中，便于稳定复现与定位。

#### 在 CI 中查看稳定性基线摘要（常规非 release 流程）

常规 `CI` workflow 现在会额外运行一个**非阻塞**的 `CI stability baseline summary (non-blocking)` job：

- 在 **Actions → 对应 CI 运行 → Summary** 中可直接看到「Stability Baseline」摘要（workflow summary）。
- 同时会上传 `ci-stability-baseline-<run_id>` artifact，包含：
  - `.artifacts/test-diagnose/ci-baseline/stability-baseline.md`
  - `.artifacts/test-diagnose/ci-baseline/stability-baseline.json`

说明：该 job 仅做可观测输出，不影响常规开发通过/失败判定；release 流程逻辑不变。

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

### 发布前版本一致性检查（建议）

在打 `vX.Y.Z` 标签前，先执行：

```bash
npm run version:check
```

若准备从 tag 触发 release，可额外校验 tag 与清单版本一致：

```bash
npm run version:check -- --expect-from-tag vX.Y.Z
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

The CI/release workflows run `version:check` as an early gate. Tag releases also validate `vX.Y.Z` against manifest version, and fail fast with actionable errors on mismatch.

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
