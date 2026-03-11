# Round 2 Tasks (Calibration Subset)

Use 3 representative tasks to isolate parameter/runtime effects.

**Baseline commit:** `5e26f1c`

For each task:
- Fill baseline commit.
- Run A then B (or ABBA if preferred).
- No time limit; run until done.
- Record manual interventions and elapsed time.

---

## R2-T1 (Small) — Citation field-toggle behavior lock

**Context:** When a built-in reference profile is active, manually toggling Chunk/Relevance field options deviates from the profile's saved settings but the UI doesn't reflect this.

**Requirements:**
1. When a built-in profile is active and the user toggles Chunk or Relevance, auto-switch the profile selector to "Manual" (empty value).
2. Show a brief visual indicator (e.g., 1.5s highlight flash on the profile `<select>`) when this auto-switch happens.
3. Add an `aria-live="polite"` region that announces "Switched to manual mode" for screen readers when auto-switch fires.
4. Custom (user-saved) profiles should NOT auto-switch — they can be edited in place since the user can re-save.
5. Existing profile load/save/delete behavior must remain unchanged.

**Acceptance criteria:**
- [ ] Toggling Chunk/Relevance while a built-in profile is active switches profile to Manual
- [ ] Visual flash on profile selector on auto-switch
- [ ] Screen reader announcement via aria-live
- [ ] Custom profiles are not affected by field toggles
- [ ] New tests cover auto-switch behavior (≥3 test cases)
- [ ] All tests pass: `npm test` and `cd src-tauri && cargo test -q`

---

## R2-T2 (Medium) — Citation deep-link robustness

**Context:** Citation deep-links (`navigateToCitationSource`) work for the happy path but lack error handling for edge cases around deleted KB documents and stale references.

**Requirements:**
1. When `get_kb_chunk` fails (e.g., chunk/document was deleted from KB), show a user-friendly message in the ChunkViewer area instead of silently failing. Message: "Source not found — the document may have been removed from the knowledge base."
2. Add a "Dismiss" button to close the error state and return to normal KB panel view.
3. Old citation links in the editor (from previous AI actions) must still attempt navigation — they should show the error message if the source is gone, not silently fail.
4. When `viewChunk` is called with an invalid `chunkId`, the store should set an error state (`viewChunkError: string | null`) rather than leaving `viewChunkLoading` stuck as true.
5. Add a Rust-side test for `get_kb_chunk` with a non-existent chunk ID returning an appropriate error.

**Acceptance criteria:**
- [ ] Deleted-source click shows friendly error message in ChunkViewer area
- [ ] Dismiss button clears error and returns to default KB panel
- [ ] `viewChunkError` state added to knowledge store
- [ ] Rust `get_kb_chunk` returns error for non-existent chunk (new Rust test)
- [ ] Frontend tests cover: error display, dismiss, stale citation click (≥4 test cases)
- [ ] All tests pass: `npm test` and `cd src-tauri && cargo test -q`

---

## R2-T3 (Hard) — Find/replace search cancellation and yield

**Context:** `findMatches()` traverses the entire document synchronously. For very large documents (200K+ chars), this can block the main thread for noticeable periods. The search cannot be cancelled if the user changes the query mid-search.

**Requirements:**
1. Make `findMatches` cancellable: accept an `AbortSignal` parameter. When aborted, stop traversal early and return partial results with a `cancelled: boolean` flag.
2. Add cooperative yielding: after every N text nodes (e.g., 500), yield to the event loop via a microtask/setTimeout(0) so the UI stays responsive. This means `findMatches` becomes async.
3. Update the `SearchAndReplace` TipTap extension to use the async/cancellable API: when the query changes, abort the previous search before starting a new one.
4. Show the match count incrementally — update the displayed count as partial results come in during long searches.
5. Similarly make `extractHeadings` in `outline.ts` accept an `AbortSignal` and yield cooperatively.
6. Existing behavior for small documents (< 50K chars) should remain fast — skip yielding for small docs.

**Acceptance criteria:**
- [ ] `findMatches` accepts `AbortSignal`, returns `{ matches, cancelled }`, yields every 500 nodes for large docs
- [ ] `extractHeadings` accepts `AbortSignal`, yields for large docs
- [ ] Query change aborts previous in-flight search
- [ ] Match count updates progressively during long searches
- [ ] Small documents (< 50K) still search synchronously (no yielding overhead)
- [ ] New tests: cancellation mid-search, progressive results, yield behavior (≥5 test cases)
- [ ] Existing find/replace and outline tests still pass
- [ ] All tests pass: `npm test` and `cd src-tauri && cargo test -q`
