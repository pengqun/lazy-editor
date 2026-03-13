# Round 1 Summary

## Weighted Final Score
- A total: 755 / 800 (avg 94.4)
- B total: 647 / 800 (avg 80.9)

## Per-Task Winners

| Task | Difficulty | Winner | A Score | B Score | Delta |
|------|-----------|--------|---------|---------|-------|
| T1   | small     | **B**  | 91      | 93      | -2    |
| T2   | small     | **A**  | 94      | 79      | +15   |
| T3   | small     | **A**  | 96      | 75      | +21   |
| T4   | medium    | **A**  | 97      | 80      | +17   |
| T5   | medium    | **A**  | 94      | 79      | +15   |
| T6   | medium    | **A**  | 95      | 82      | +13   |
| T7   | hard      | **A**  | 95      | 78      | +17   |
| T8   | hard      | **A**  | 93      | 81      | +12   |

## Speed
- All tasks ran in parallel from baseline `e0dcf7e`
- A agents completed autonomously (no manual intervention needed)
- B (Codex CLI) required manual `git commit` and `npm test` workarounds due to sandbox EPERM on every task
- Avg estimated duration: A ~8.5 min, B ~11.9 min

## Quality
- Acceptance pass rate: A 8/8 (100%), B 8/8 (100%)
- New tests added (total): A +171 across 7 tasks, B +30 across 7 tasks (5.7x ratio)
- Defect count total: A 0, B 0
- A consistently produced dedicated test files, structured result types, and reusable abstractions
- B produced working solutions but with minimal test coverage

## Engineering Hygiene
- Commit quality: A 5/5 (clean autonomous commits), B 3/5 (required manual commits due to sandbox)
- Docs/constraints compliance: A clean scope on all tasks, B modified README and vitest.config.ts in T8 (minor scope creep)
- Codex CLI sandbox (`workspace-write`) systematically cannot: (1) write to parent node_modules/.vite-temp/ for Vitest, (2) create git index.lock for commits. This affected all B runs.

## Decision
- Winner: **A (Claude Code + Opus 4.6)**
- Confidence: **high**
- Why: A won 7/8 tasks with an average margin of +15.7 points. The single B win (T1) was narrow (-2 points) and predated the batch run. A's key advantages: dramatically more comprehensive test suites (5.7x more new tests), cleaner architectural abstractions (reusable hooks, structured result types, dedicated utilities), and fully autonomous operation requiring zero manual intervention. B (Codex gpt-5.3-codex) produced functionally correct code in every case, but with consistently thinner test coverage and sandbox infrastructure issues that prevented autonomous completion.

## Follow-up
- Tasks to rerun: None — all 8 tasks completed successfully for both agents
- Benchmark improvements for Round 2:
  - Resolve Codex sandbox limitations (use `--dangerously-auto-approve` or host-level workaround for fair comparison)
  - Add precise wall-clock timing per task instead of batch parallel execution
  - Consider blind review (reviewer doesn't know which agent produced which output)
  - Add code review scoring from independent reviewer
