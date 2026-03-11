# Lazy Editor Benchmark Report — Round 1

## 1) Evaluation Objective

This round benchmarks two model+tool combinations on real development tasks in `lazy-editor`:

- **A**: Claude Code + Opus 4.6
- **B**: Codex CLI + gpt-5.3-codex (high/extra-high reasoning mode)

The comparison focuses on:

1. Delivery quality (acceptance fit, regressions, maintainability)
2. Execution efficiency (time, rework loops, intervention cost)
3. Engineering hygiene (test depth, commit quality, scope discipline)

---

## 2) Task Set

Round 1 includes 8 tasks (small/medium/hard):

- **T1** Citation UX toggle polish
- **T2** Diagnostics export filename strategy
- **T3** Status bar render optimization
- **T4** Retrieval presets per-workspace override
- **T5** Citation source deep-link consistency
- **T6** Health check expansion
- **T7** Large-doc find/outline stress hardening
- **T8** End-to-end reference profile presets

Task definitions are in: `eval/round-1/tasks.md`.

---

## 3) Overall Results

### Total Score

- **A total**: 755 / 800 (**94.4 avg**)
- **B total**: 647 / 800 (**80.9 avg**)

### Winners by Task

| Task | Winner | A Score | B Score | Delta |
|---|---:|---:|---:|---:|
| T1 | B | 91 | 93 | -2 |
| T2 | A | 94 | 79 | +15 |
| T3 | A | 96 | 75 | +21 |
| T4 | A | 97 | 80 | +17 |
| T5 | A | 94 | 79 | +15 |
| T6 | A | 95 | 82 | +13 |
| T7 | A | 95 | 78 | +17 |
| T8 | A | 93 | 81 | +12 |

**Outcome**: A wins **7/8** tasks.

---

## 4) Per-Task Comparative Notes

## T1 — Citation UX toggle polish (Small)

**Goal**: Improve labels/help/focus order without behavior changes.

- **A** (`0913952`): improved labels/tooltips/accessibility; +4 guard tests.
- **B** (`887782d`, selected winner commit): stronger component-level focus-order validation in UI tests.

**Verdict**: **B wins** (narrowly), due to stronger direct validation against task acceptance.

## T2 — Diagnostics export filename strategy (Small)

**Goal**: deterministic, readable, sortable filename format.

- **A** (`1c806f3`): date-first sortable naming (`YYYY-MM-DD...`) + 9 tests.
- **B** (`f00d8f4`): valid format but only 2 tests; less robust edge coverage.

**Verdict**: **A wins**.

## T3 — Status bar render optimization (Small)

**Goal**: reduce unnecessary renders while typing.

- **A** (`2a3df61`): reusable debounce hook + 3 memoized sections + 11 tests.
- **B** (`e58ff55`): local debounce and one memo extraction + 1 test.

**Verdict**: **A wins**.

## T4 — Retrieval presets per-workspace override (Medium)

**Goal**: add workspace-level defaults with precedence chain.

- **A** (`be5403c`): full precedence abstraction (`resolveRetrievalSettings`) + source badge + 25 tests.
- **B** (`f47b43a`): functionality delivered with lighter abstraction and 6 tests.

**Verdict**: **A wins**.

## T5 — Citation source deep-link consistency (Medium)

**Goal**: robust citation deep-link across panel/file state changes.

- **A** (`1421647`): dedicated deep-link utilities + unified click handling + 23 tests.
- **B** (`32f935c`): workable handling with fewer guards (4 tests).

**Verdict**: **A wins**.

## T6 — Health check expansion (Medium)

**Goal**: add meaningful subsystem check + actionable errors.

- **A** (`6d137b2`): broader provider/settings validation + actionable hints + 16 Rust tests.
- **B** (`0a4fb36`): correct direction, thinner validation depth (3 Rust + 1 frontend test).

**Verdict**: **A wins**.

## T7 — Large-doc find/outline stress hardening (Hard)

**Goal**: improve stability/responsiveness for large markdown docs.

- **A** (`e89da98`): bounded result models + adaptive debounce + outline virtualization + 25 tests.
- **B** (`5c209e0`): practical hardening with fewer guardrails and tests (5).

**Verdict**: **A wins**.

## T8 — Reference profile presets E2E (Hard)

**Goal**: complete profile preset feature slice with persistence and tests.

- **A** (`82e2126`): full CRUD + compatibility fallback + dedicated tests (39).
- **B** (`52096a3`): functional delivery with fewer tests (11), minor scope creep.

**Verdict**: **A wins**.

---

## 5) Engineering Observations

### Quality

- Acceptance pass rate: **A 8/8**, **B 8/8**
- Defect count: **A 0**, **B 0**
- New tests: **A +171**, **B +30** (A ~5.7x)

### Efficiency & Operational Stability

- A finished autonomously in this environment.
- B repeatedly needed manual workaround around sandbox/commit constraints in this setup.

### Hygiene

- A maintained tighter scope and stronger test discipline.
- B produced valid code but often lighter verification depth.

---

## 6) Final Conclusion

For `lazy-editor` in its current real-project workflow, the benchmark supports using:

- **Primary delivery engine: Claude Code + Opus 4.6**
- **Secondary challenger / cross-check: Codex GPT-5.3-codex**

Rationale: A demonstrates substantially better consistency in test depth, abstraction quality, and autonomous completion across small-to-hard tasks.

---

## 7) Recommended Next Step (Round 2)

To further improve fairness and signal quality:

1. Fix Codex sandbox friction in this environment (or run with a stable policy profile).
2. Capture precise wall-clock times per candidate run.
3. Add blind code review scoring from a second reviewer.
4. Re-run a focused subset of 3 tasks (small/medium/hard) to validate repeatability.
