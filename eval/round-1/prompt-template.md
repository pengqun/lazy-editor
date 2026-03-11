# Prompt Template (Use unchanged for both A/B)

You are working in /Users/adrian/code/mine/lazy-editor.

Task ID: <TASK_ID>
Baseline Commit: <COMMIT>
Time Budget: <N minutes>

## Task
<Paste task card verbatim>

## Constraints
- Keep scope tight; no broad refactor.
- Preserve existing behavior outside acceptance criteria.
- Follow existing style.
- Add/adjust tests where feasible.
- Update README/docs only if task requires it.

## Required final output
1) Summary of files changed
2) Test commands run + outcomes
3) Final commit hash

After fully done, run:
openclaw system event --text "Done: <TASK_ID> by <agent>" --mode now
