# Evaluation Plan — Claude Opus 4.6 vs Codex GPT-5.3-codex (extra-high)

## Goal
Compare two model+tool combinations on **real lazy-editor development tasks**:

- A: Claude Code + Opus 4.6
- B: Codex CLI + gpt-5.3-codex (extra-high thinking)

## Principles
- Same task cards, same baseline commit, same constraints.
- Isolated branch/worktree per run.
- Capture both quality and speed.
- Include failed runs (no cherry-picking).

## Suggested Round Size
- 8 tasks total:
  - 3 small
  - 3 medium
  - 2 hard

## Per-task Execution SOP
1. Checkout baseline commit.
2. Create branch: `eval/<task-id>/<agent>`
3. Run one model+tool combination only.
4. Keep full logs and timestamps.
5. Run required checks:
   - `npm test`
   - `cd src-tauri && cargo test -q`
6. Record outputs in `eval/round-1/results.md` and `eval/round-1/scorecard.csv`.
7. Compare A/B and **keep the winner commit in the main repo** (cherry-pick or fast-forward) instead of discarding both.

## Fairness Controls
- Use identical prompt template (`eval/round-1/prompt-template.md`).
- Same max time budget per task.
- Same allowed tools/commands.
- ABBA ordering to reduce sequence bias.

## Scoring (100 points)
- Quality: 60
  - acceptance pass rate (20)
  - tests green (15)
  - defects/regressions (15)
  - maintainability/readability (10)
- Efficiency: 25
  - time-to-first-pass (8)
  - total completion time (10)
  - rework loops (7)
- Engineering hygiene: 15
  - commit quality (5)
  - docs/notes completeness (5)
  - constraint compliance (5)

## Deliverables
- `eval/round-1/tasks.md`
- `eval/round-1/prompt-template.md`
- `eval/round-1/scorecard.csv`
- `eval/round-1/results.md`
- `eval/round-1/summary.md`
