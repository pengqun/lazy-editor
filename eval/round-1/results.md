# Round 1 Raw Results

## Legend
- A = Claude Code + Opus 4.6
- B = Codex CLI + gpt-5.3-codex (extra-high)

---

## T1 (Small) — Citation UX toggle polish
- A (Claude Opus 4.6): commit `0913952`; improved control labels/tooltips/accessibility and added +4 guard tests in `citation-notes.test.ts`. Tests: npm (299 pass), cargo (52 pass).
- B (Codex gpt-5.3-codex high): commit `887782d` (selected winner); improved semantic labels/help/focus order in `StatusBar` and added component-level keyboard-order test (`status-bar-citations.test.tsx`). Tests: npm (296 pass), cargo (52 pass).
- Verdict: **B wins** (better direct UX validation at component level while preserving behavior).

## T2 (Small) — Diagnostics export filename strategy
- A: commit `1c806f3`; added `buildExportFilename(version, now?)` with date-first sortable format `lazy-editor-diagnostics-YYYY-MM-DDTHH-MM-SS-vX.Y.Z.md`. 9 new tests covering format, sorting, edge cases. Tests: npm (305 pass), cargo (52 pass). Files: 2 changed (+120).
- B: commit `f00d8f4`; added `buildDiagnosticsExportFilename(appVersion, at?)` with format `lazy-editor-diagnostics-v{version}-{YYYY-MM-DDTHH-mm-ssZ}.md`. 2 new tests. Tests: npm (298 pass), cargo (52 pass). Files: 2 changed. Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (more comprehensive test coverage 9 vs 2, better date-first sortable filename format).

## T3 (Small) — Status bar render optimization
- A: commit `2a3df61`; created reusable `useDebouncedValue` hook (300ms), extracted 3 `React.memo` components (`WordCountSection`, `CitationControls`, `AiProgressIndicator`). 11 new tests. Tests: npm (307 pass), cargo (52 pass). Files: 4 changed (+220).
- B: commit `e58ff55`; debounced store subscription (180ms), extracted 1 `React.memo` component (`CitationReferenceControls`). 1 new test. Tests: npm (297 pass), cargo (52 pass). Files: 1 changed. Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (3x more memo components, reusable hook, 11x more tests).

## T4 (Medium) — Retrieval presets per-workspace override
- A: commit `be5403c`; full three-tier precedence with `resolveRetrievalSettings(filePath, workspacePath)`, `SettingsSourceBadge` UI component, `loadWorkspaceRetrievalSettings()`/`saveWorkspaceRetrievalSettings()`. 25 new tests covering precedence, persistence, workspace isolation. Tests: npm (321 pass), cargo (52 pass). Files: 7 changed (+432).
- B: commit `f47b43a`; `loadWorkspacePresetFromStorage()`/`saveWorkspacePresetToStorage()` with workspace source badge in `KnowledgePanel`. 6 new tests. Tests: npm (302 pass), cargo (52 pass). Files: 6 changed (+158). Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (4x more tests, cleaner abstraction with `resolveRetrievalSettings()`, dedicated badge component).

## T5 (Medium) — Citation source deep-link consistency
- A: commit `1421647`; `citationDataAttrs()`, `parseCitationElement()`, `navigateToCitationSource()` utilities, unified click handler for `.kb-source-link` and `.citation-link`. Dedicated test file `citation-deeplink.test.ts`. 23 new tests. Tests: npm (319 pass), cargo (52 pass). Files: 5 changed (+531).
- B: commit `32f935c`; `buildCitationMarker()` with `<a class="kb-source-link">` data attributes, `deepLinkQuery` parameter, `viewedChunkOwnerPath` for document-switch handling, `handleDocumentSwitch()`. 4 new tests. Tests: npm (300 pass), cargo (52 pass). Files: 9 changed (+157). Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (6x more tests, comprehensive deep-link refactoring with unified handler and dedicated utilities).

## T6 (Medium) — Health check expansion
- A: commit `6d137b2`; added `check_ai_provider()` (validates all 3 providers), `check_settings_store()` (checks app data dir + JSON validity), actionable error hints on all 5 subsystem failure paths, `AiSettingsPartial` struct, `tempfile` dev-dep for test isolation. 16 new Rust unit tests. Updated `DiagnosticsPanel.tsx` with human-friendly subsystem labels. Tests: npm (296 pass), cargo (68 pass). Files: 4 changed.
- B: commit `0a4fb36`; `SettingsValidation` enum, `load_settings_for_health()`, `validate_ai_provider_settings()`, 5 subsystems with actionable hints. 3 new Rust tests + 1 new frontend component test (`diagnostics-panel.test.tsx`). Tests: npm (297 pass), cargo (55 pass). Files: 3 changed (+308). Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (5x more Rust tests with proper tempfile isolation, more thorough provider validation covering all edge cases).

## T7 (Hard) — Large-doc find/outline stress hardening
- A: commit `e89da98`; `MATCH_LIMIT=1000` with structured `FindMatchesResult { matches, truncated }` and early termination, `HEADING_LIMIT=500` with `ExtractHeadingsResult { headings, truncated }`, `estimateDocSize()`, `adaptiveDebounce()` for both find and outline, virtual scrolling for large heading lists in `OutlinePanel`, "1000+" and truncation indicators. 25 new tests. Tests: npm (321 pass), cargo (52 pass). Files: 6 changed (+506).
- B: commit `5c209e0`; `MAX_FIND_MATCHES=1000` with early termination, 3-tier adaptive debounce in find, lazy rendering with `INITIAL_RENDERED_HEADINGS=250` batches in outline, "Searching..." indicator, `formatMatchCount()`. 5 new tests. Tests: npm (301 pass), cargo (52 pass). Files: 5 changed (+174). Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (5x more tests, virtual scrolling vs lazy render, structured result types, outline also hardened with limits).

## T8 (Hard) — End-to-end feature slice (reference profiles)
- A: commit `82e2126`; `ReferenceProfile` type, 3 `BUILTIN_PROFILES`, full CRUD (`saveCustomProfile`, `deleteCustomProfile`, `loadCustomProfiles`, `listProfiles`, `getProfileById`), profile-aware `loadCitationSettings()` with legacy fallback, profile selector + save/delete buttons in StatusBar. Dedicated test file `reference-profiles.test.ts`. 39 new tests. Tests: npm (335 pass), cargo (52 pass). Files: 4 changed (+734).
- B: commit `52096a3`; `ReferenceProfile` type, 3 `BUILTIN_REFERENCE_PROFILES`, full CRUD, `loadReferenceProfileSettings()` with backward compatibility, profile selector + save/delete in StatusBar. Updated README and vitest.config.ts. 11 new tests. Tests: npm (307 pass), cargo (52 pass). Files: 6 changed (+518). Codex sandbox required manual commit/test workaround.
- Verdict: **A wins** (3.5x more tests, dedicated test file, no scope creep to README/vitest.config.ts).
