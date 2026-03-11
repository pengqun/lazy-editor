# Round 2 Summary

## Objective
Calibrate for CLI/runtime parameter effects with no hard time cap. Round 1 identified potential confounds: Codex sandbox EPERM issues, parallel batch execution masking timing, and no per-task wall-clock measurement. Round 2 addresses these by running tasks sequentially with precise timing, using `codex exec` (full-auto, no sandbox restrictions), and setting `reasoning_effort=high` for Codex.

## Candidates
- **A:** Claude Code + Claude Opus 4.6 (interactive agent)
- **B:** Codex CLI + gpt-5.3-codex (reasoning_effort=high, full-auto approval)

## Final Scores

| Task | Difficulty | Winner | A Score | B Score | Delta |
|------|-----------|--------|---------|---------|-------|
| R2-T1 | small | **B** | 3.35 | 4.15 | -0.80 |
| R2-T2 | medium | **B** | 3.55 | 3.80 | -0.25 |
| R2-T3 | hard | **B** | 3.50 | 4.25 | -0.75 |

- **A average:** 3.47
- **B average:** 4.07
- **B wins all 3 tasks**

## Timing & Intervention
- Avg duration: A = 3.7 min, B = 5.0 min
- Manual interventions: A = 0, B = 0
- Manual intervention minutes: A = 0, B = 0
- B was ~35% slower on average but delivered higher-quality output

## Quality
- Acceptance pass rate: A = 2/3 full + 1 partial, B = 3/3 (100%)
- Post-run defects: A = 3 total (2 in T1, 1 critical in T2), B = 0
- A's critical defect in R2-T2: routing condition omitted `viewChunkError`, making the error UI unreachable for first-navigation scenarios
- B consistently delivered more thorough implementations: OutlinePanel async integration (R2-T3 bonus), progressive decoration updates, race condition protection, proper cleanup on unmount

## Engineering Hygiene
- A: Clean code but thinner on type safety (no explicit `SearchPluginMeta`, `Partial<SearchPluginState>` workaround), non-idiomatic React patterns (side effects in `setState` updater)
- B: Proper interface types (`SearchPluginMeta`), idiomatic `useEffect` cleanup, `options bag` API pattern, DRY constant reuse across modules

## Conclusion
- **Winner: B (Codex gpt-5.3-codex with reasoning_effort=high)**
- **Confidence: moderate-to-high**
- **Is Round 1 conclusion stable after calibration?** No — Round 1 conclusion is **reversed**.

### Analysis
Round 1 found A winning 7/8 tasks by an average margin of +15.7 points. Round 2 finds B winning 3/3 tasks by an average margin of +0.60 points (on a 0–5 scale).

Key factors explaining the reversal:
1. **Sandbox elimination:** Round 1's Codex runs hit EPERM errors on every task (couldn't write git index.lock, couldn't run vitest), requiring manual intervention and affecting B's test coverage scores. Round 2 used `codex exec` with full-auto approval, removing this confound entirely.
2. **Reasoning effort:** Round 2 set `reasoning_effort=high` for Codex, compared to Round 1's default. This likely contributed to B's more thorough implementations (bonus features, better edge case handling, proper cleanup).
3. **Sequential execution with timing:** Round 2 measured wall-clock time per task. B is slower (~35%) but uses that time to deliver more robust code.
4. **Scoring recalibration:** Round 1 used a 0–100 scale with different weight distribution. Round 2 uses a 0–5 scale with quality=50%, efficiency=30%, hygiene=20%, which better rewards correctness over speed.

### Caveats
- Small sample size (3 tasks vs Round 1's 8)
- Tasks were different between rounds (not direct reruns)
- The scoring methodology changed between rounds
- A is faster on average (3.7 min vs 5.0 min) — for time-sensitive work, A may still be preferred
- A had zero manual interventions in both rounds — operational simplicity advantage remains

### Recommendation
The evidence suggests that **with optimized parameters** (reasoning_effort=high, full-auto mode), Codex produces higher-quality code than Claude Code for this codebase. However, the margin is narrow and the sample size small. A Round 3 with larger task count and consistent scoring methodology would increase confidence.
