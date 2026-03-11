# Round 2 Raw Results

## R2-T1 (Small): Citation field-toggle behavior lock

### Candidate A (Claude Opus 4.6)
- **Duration:** 2.0 min
- **Tests:** 445 passed
- **Acceptance:** Passed (all criteria met)
- **Defects found post-run:** 2
  1. Side effects inside `setState` updater function (non-idiomatic, potential for stale closures)
  2. `aria-live` region set on profile switch but never cleared — screen readers re-announce on every render
- **Quality:** 3.0 | **Efficiency:** 4.0 | **Hygiene:** 3.5 | **Total:** 3.35

### Candidate B (Codex gpt-5.3-codex) — WINNER
- **Duration:** 2.3 min
- **Tests:** 445 passed
- **Acceptance:** Passed
- **Defects found post-run:** 0
- **Key strengths:** Idiomatic `useEffect`-driven timer cleanup for flash; `aria-live` announcement clears after 2s timeout; `handleFieldToggle` computes `shouldAutoSwitchToManual` before updater with side effects outside; clean test assertions
- **Quality:** 4.5 | **Efficiency:** 3.5 | **Hygiene:** 4.0 | **Total:** 4.15

### Verdict
**Winner: B (Codex)** — Score 4.15 vs 3.35. B's React patterns were more idiomatic and free of post-run defects.

---

## R2-T2 (Medium): Citation deep-link robustness

### Candidate A (Claude Opus 4.6)
- **Duration:** 3.0 min
- **Tests:** 445 passed
- **Acceptance:** Partial — critical routing defect
- **Defects found post-run:** 1
  1. **Routing bug:** `KnowledgePanel` mount condition did not include `viewChunkError`, so the error UI never rendered for first-navigation scenarios (user sees blank panel instead of error message)
- **Quality:** 3.0 | **Efficiency:** 4.5 | **Hygiene:** 3.5 | **Total:** 3.55

### Candidate B (Codex gpt-5.3-codex) — WINNER
- **Duration:** 7.5 min
- **Tests:** 445 passed
- **Acceptance:** Passed
- **Defects found post-run:** 0
- **Key strengths:** Fixed the routing condition to include `viewChunkError`; added component rendering tests; polished error UI with `AlertCircle` icon and dismiss button; Rust test for non-existent chunk
- **Quality:** 4.5 | **Efficiency:** 2.5 | **Hygiene:** 4.0 | **Total:** 3.80

### Verdict
**Winner: B (Codex)** — Score 3.80 vs 3.55. A had a critical routing defect that would ship broken error handling. B was 2.5x slower but delivered a correct implementation.

---

## R2-T3 (Hard): Find/replace search cancellation & yield

### Candidate A (Claude Opus 4.6)
- **Duration:** 6.0 min
- **Tests:** 445 passed (after 1 rework loop for test mock issues)
- **Acceptance:** Passed (core criteria)
- **Defects found post-run:** 0
- **Weaknesses:**
  1. No `OutlinePanel.tsx` integration (still uses sync `extractHeadings`)
  2. `onProgress` only reports match count, not actual matches — no progressive decorations
  3. No cleanup (abort) on panel close or component unmount
  4. No request-ID race condition protection
  5. No pre-abort check at function entry for large-doc path
- **Quality:** 3.5 | **Efficiency:** 3.5 | **Hygiene:** 3.5 | **Total:** 3.50

### Candidate B (Codex gpt-5.3-codex) — WINNER
- **Duration:** 5.3 min
- **Tests:** 445 passed
- **Acceptance:** Passed (all criteria + bonus)
- **Defects found post-run:** 0
- **Key strengths:**
  1. `OutlinePanel.tsx` fully wired with `extractHeadingsAsync` + `AbortController` + request-ID tracking
  2. Progressive decoration updates during search via `dispatchMatches` in `onProgress`
  3. Defense-in-depth: both `AbortController` AND monotonic request-ID counter prevent stale results
  4. Thorough cleanup: aborts on close, unmount, and every query change
  5. Better API design: required `AbortSignal`, options bag, `FindMatchesResult` in `onProgress`
  6. Proper `SearchPluginMeta` interface for type safety
- **Minor issue:** Test used `Array.at(-1)` (ES2022) — fixed to `arr[arr.length - 1]` before merge
- **Quality:** 4.5 | **Efficiency:** 4.0 | **Hygiene:** 4.0 | **Total:** 4.25

### Verdict
**Winner: B (Codex)** — Score 4.25 vs 3.50. B delivered more complete functionality (progressive highlights, OutlinePanel integration, race protection) in less time.
