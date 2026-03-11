# Round 2 Report Addendum

## Why Round 1 and Round 2 differ

Round 1 and Round 2 reached different conclusions. This is expected because key experimental conditions changed:

1. **Codex execution mode changed**
   - Round 1 had repeated sandbox/permission friction for Codex, which required manual workaround.
   - Round 2 used a calibrated Codex setup (`reasoning_effort=high` + full-auto flow), eliminating most runtime friction.

2. **Timing policy changed**
   - Round 2 removed hard time caps and scored time as a weighted efficiency factor.
   - This better reflects real-world "quality vs speed" tradeoffs for long tasks.

3. **Task subset changed**
   - Round 2 is a 3-task calibration subset, not a full 8-task repeat.
   - Strong signal, but still smaller sample size.

---

## Reliability interpretation

- **Round 1 is reliable for the original toolchain conditions** (including runtime friction).
- **Round 2 is reliable for calibrated Codex conditions** (optimized parameters and smoother execution path).
- Therefore, report conclusions should be read as **context-dependent operational results**, not absolute model rankings.

---

## Recommended operating policy (current)

### Default strategy
- For quality-critical medium/hard coding tasks in this repo, prefer:
  - **Codex gpt-5.3-codex with high reasoning**
- For quick-turn small tasks where speed matters more than depth, Claude remains a good fallback.

### Suggested routing matrix
1. **Small/UI polish/fast bugfix**
   - First pass: Claude (faster)
   - If edge cases or regressions appear: escalate to Codex high-reasoning

2. **Medium features (state + tests + integration)**
   - First pass: Codex high-reasoning

3. **Hard tasks (perf, async/race, deep refactor)**
   - First pass: Codex high-reasoning
   - Optional second-pass adversarial review: Claude

---

## Scoring caveats to include in final narrative

- Round 2 score differences are moderate, not overwhelming.
- Codex was slower on average but produced stronger correctness and robustness in this calibration set.
- Final strategy should optimize for your objective function:
  - **speed-first** vs **robustness-first**.

---

## Round 3 proposal (to lock confidence)

Run a confirmation round with:

1. 6 tasks (2 small, 2 medium, 2 hard)
2. Same scoring rubric as Round 2
3. Same baseline discipline and per-task A/B resets
4. Blind review for maintainability score
5. Explicit metric: post-merge defects in 48h

If Round 3 still shows Codex > Claude under calibrated settings, promote Codex to primary by default in this project and keep Claude as speed-oriented challenger.
