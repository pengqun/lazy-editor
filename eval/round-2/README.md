# Round 2 Calibration — Parameter/Runtime Fairness Check

## Purpose
Validate whether Round 1 disadvantage for Codex was mainly caused by CLI/runtime constraints rather than core model capability.

## Key Policy
- **No hard time cap** (both candidates run to completion).
- Still record full timing and intervention metrics; time cost counts in final comparison.

## Candidates
- A: Claude Code + Opus 4.6
- B: Codex CLI + gpt-5.3-codex (`reasoning_effort=high`)

## Core Fairness Controls
1. Same baseline commit per task.
2. Same task card and acceptance criteria.
3. Same required tests:
   - `npm test`
   - `cd src-tauri && cargo test -q`
4. Same tool permissions and repo state.
5. Track manual intervention minutes and count explicitly.

## Required Metrics (per candidate run)
- start_time / end_time / duration_min
- time_to_first_green_min
- acceptance_passed
- tests_passed
- defects_found_post_run
- rework_loops
- manual_intervention_count
- manual_intervention_minutes
- commit_quality_score
- test_depth_score
- scope_discipline_score
- total_score

## Scoring Adjustment (No time cap)
- Time is **not a gate**, but a weighted efficiency factor.
- Include a normalized `duration_penalty` in scoring rather than fail-by-timeout.

## Deliverables
- `tasks.md`
- `scorecard.csv`
- `results.md`
- `summary.md`
