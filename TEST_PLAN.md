Here's the full content for `TEST_PLAN.md`:

---

# Test Plan

Automation-first testing strategy for Lazy Editor. Every test described here must run without human interaction, in CI or locally via a single command.

## Goals

1. **Catch regressions before merge** — every PR must pass CI.
2. **Fast inner loop** — unit tests finish in seconds; only the self-test needs a desktop build.
3. **Grow incrementally** — start from the existing self-test smoke test and expand layer by layer.

## Test Layers

### 1. Rust unit tests (`cargo test`)

Pure-logic tests inside `src-tauri/`. No Tauri runtime, no window, no IPC.

| Area | What to test | Location |
|---|---|---|
| Knowledge chunker | Splitting, edge cases (empty, huge) | `src-tauri/src/knowledge/chunker.rs` |
| Knowledge search | Cosine similarity, ranking | `src-tauri/src/knowledge/search.rs` |
| AI prompts | Template rendering, context injection | `src-tauri/src/ai/prompts.rs` |
| File commands | Path validation, workspace boundary check | `src-tauri/src/commands/files.rs` |
| Web extractor | HTML → text extraction | `src-tauri/src/web/extractor.rs` |

Convention: add `#[cfg(test)] mod tests { ... }` at the bottom of each module. Keep tests next to the code they exercise.

```bash
cd src-tauri && cargo test          # run all
cd src-tauri && cargo test chunker  # run one module
```

### 2. TypeScript unit tests (Vitest)

Fast, JSDOM-based tests for stores, hooks, and utilities. No Tauri runtime — mock `invoke()` and event listeners.

| Area | What to test | Location |
|---|---|---|
| Zustand stores | State transitions, actions, selectors | `src/stores/*.test.ts` |
| Hooks | `useAutoSave` debounce, `useAI` event wiring | `src/hooks/*.test.ts` |
| Utilities | `cn()`, any pure helpers | `src/lib/*.test.ts` |

Convention: co-locate test files as `<module>.test.ts` next to the source file.

```bash
npx vitest run        # run all
npx vitest run stores # filter by path
```

### 3. Tauri self-tests (end-to-end, in-process)

Full desktop app tests using the existing `--self-test` / `window.__LAZY_TEST__` harness. Each test is identified by a name string passed via `--self-test <name>`.

**Current test:**
- `editor` — create file, open, apply formatting (heading + bold), save, validate saved HTML.

**How to add a new self-test:**

1. Add a branch in `runSelfTestFromCli()` (`src/main.tsx`) keyed on `params.self_test`.
2. Use `window.__LAZY_TEST__` API methods (extend `LazyTestApi` in `src/lib/testHarness.ts` as needed).
3. Exit with code 0 on success, code 1 on failure.
4. Add a CI job step that invokes the new test name.

```bash
npm run tauri:dev:ws -- /tmp/test-workspace --self-test editor
```

**Extending the test harness API:** add methods to `LazyTestApi` for any new capability a self-test needs (e.g., `openCommandPalette()`, `typeInEditor()`, `getFileTree()`).

### 4. Component tests (optional, P2)

If Vitest + JSDOM proves insufficient for TipTap editor interactions, add `@testing-library/react` with a real DOM. This is explicitly lower priority — prefer self-tests for anything involving the editor.

## Conventions

- **File naming:** `foo.test.ts` next to `foo.ts`; Rust tests inline via `#[cfg(test)]`.
- **No snapshots.** Assert on specific values. Snapshots rot and hide intent.
- **No mocking what you own.** Mock external boundaries (Tauri IPC, HTTP, filesystem) but not internal modules.
- **Self-tests are deterministic.** Use a fresh temp workspace per run. Clean up with `fs::remove_dir_all` or let CI handle ephemeral workspace cleanup.
- **Timeout:** self-tests must complete within 60 seconds or be considered failed.

## Roadmap

### P0 — Foundation (do first)

- [ ] Add Vitest + JSDOM to devDependencies, configure in `vite.config.ts`.
- [ ] Add `"test": "vitest run"` script to `package.json`.
- [ ] Write first Rust unit tests for `chunker.rs` (split logic) and `files.rs` (workspace boundary validation).
- [ ] Write first Vitest tests for `useFilesStore` (open/save state transitions with mocked `invoke`).
- [ ] CI: add `cargo test` job to `.github/workflows/ci.yml`.
- [ ] CI: add `npx vitest run` job to `.github/workflows/ci.yml`.

### P1 — Coverage of core paths

- [ ] Rust tests for `search.rs` cosine similarity and `prompts.rs` template output.
- [ ] Rust tests for `extractor.rs` HTML-to-text.
- [ ] Vitest tests for `useAiStore` (provider switching, action dispatch).
- [ ] Vitest tests for `useAutoSave` hook (debounce timing with fake timers).
- [ ] Add a second self-test: `file-tree` — create nested files via `save_file`, verify `list_files` returns them.
- [ ] Add a self-test: `knowledge` — add document, run search, verify results (requires embedding model in CI; skip if model download is too slow, gate behind env var).

### P2 — Hardening

- [ ] Vitest tests for `useKnowledgeStore`.
- [ ] Component test for `CommandPalette.tsx` action dispatch (if Vitest + JSDOM is insufficient, use Playwright component testing).
- [ ] Self-test for AI streaming with a mock provider (Ollama-shaped HTTP server returning canned chunks).
- [ ] Measure and enforce Rust test coverage with `cargo-tarpaulin` (target: 60%+ on `knowledge/` and `commands/`).
- [ ] Measure and enforce TS coverage with Vitest's `--coverage` (target: 50%+ on `stores/` and `hooks/`).

## CI Notes

**Current workflow:** `.github/workflows/ci.yml` runs `smoke-desktop-editor` on `macos-14`.

**Target CI pipeline (three jobs, all required to merge):**

```
┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐
│ cargo test   │  │ vitest run   │  │ tauri self-test     │
│ (ubuntu)     │  │ (ubuntu)     │  │ (macos-14)          │
│ ~1 min       │  │ ~30 sec      │  │ ~5 min (cached)     │
└─────────────┘  └──────────────┘  └─────────────────────┘
```

- `cargo test` and `vitest run` run on Ubuntu (cheaper, faster). They don't need a windowing system.
- Self-tests stay on macOS because Tauri needs a real window.
- Rust and JS jobs can share the existing cargo/npm caches.
- All three jobs are required status checks for PR merge.

**Keeping CI fast:**
- Cargo: cache `~/.cargo/registry`, `~/.cargo/git`, and `src-tauri/target` (already done).
- npm: use `npm ci` with Node 20 cache (already done).
- Self-test: pre-build with `npm run build` then run `tauri dev` (already done).
- If self-test wall time exceeds 10 minutes, investigate; it should stay under 5.

---

It looks like the file write needs your approval. Would you like to allow writing `TEST_PLAN.md`? The content above is the complete file.
