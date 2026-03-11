# Round 1 Task Cards (lazy-editor)

> Fill `Baseline Commit` before each run.

---

## T1 (Small) — Citation UX toggle polish
**Type:** UI + state

**Goal**
Improve citation settings panel micro-UX (labels/help text/keyboard focus order) without changing behavior.

**Acceptance**
- Existing citation insertion/copy behavior unchanged.
- Accessibility/focus order improved and verified.
- Tests pass.

**Must not change**
- Retrieval logic, backend commands.

**Baseline Commit:** ______

---

## T2 (Small) — Diagnostics export filename strategy
**Type:** utility + tests

**Goal**
Make diagnostics export filenames deterministic and readable (date/time + app version).

**Acceptance**
- Filename format documented and covered by tests.
- Existing diagnostics content unchanged.
- Tests pass.

**Must not change**
- Include sensitive keys.

**Baseline Commit:** ______

---

## T3 (Small) — Status bar render optimization
**Type:** perf

**Goal**
Reduce unnecessary StatusBar re-renders in typing loop.

**Acceptance**
- No UI regression.
- Demonstrable reduction in re-render triggers (code-level reasoning + micro evidence).
- Tests pass.

**Baseline Commit:** ______

---

## T4 (Medium) — Retrieval presets per-workspace override
**Type:** store + UX

**Goal**
Add workspace-level preset defaults that coexist with per-document memory.

**Acceptance**
- Correct precedence: per-doc > workspace default > global default.
- UI indicates active source (doc/workspace/global).
- Tests for precedence and persistence.

**Must not change**
- Existing preset names and meanings.

**Baseline Commit:** ______

---

## T5 (Medium) — Citation source deep-link consistency
**Type:** retrieval explainability

**Goal**
Make citation click deep-link robust across panel open/close and document switch.

**Acceptance**
- Clicking citation always opens source viewer correctly.
- Query and highlight state restored appropriately.
- Tests for edge cases.

**Baseline Commit:** ______

---

## T6 (Medium) — Health check expansion
**Type:** reliability

**Goal**
Extend health check with one additional meaningful subsystem and actionable error messages.

**Acceptance**
- New check integrated in panel and export.
- Failure path has clear action hint.
- Tests pass.

**Baseline Commit:** ______

---

## T7 (Hard) — Large-doc find/outline stress hardening
**Type:** perf + correctness

**Goal**
Harden find/outline behavior for very large markdown files.

**Acceptance**
- No freeze/crash in common operations.
- Reasonable responsiveness retained.
- Tests for parsing/find edge cases.

**Baseline Commit:** ______

---

## T8 (Hard) — End-to-end feature slice
**Type:** full-stack feature

**Goal**
Implement “Reference block profile presets” (e.g., compact/academic/custom profile save) with persistence and tests.

**Acceptance**
- UI + logic + persistence complete.
- Backward-compatible defaults.
- Tests and docs updated.

**Baseline Commit:** ______
