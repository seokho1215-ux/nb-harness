# State Machine (core)

NB tracks a task through a lifecycle. `state.current_mode` is the state; transitions are constrained so "done" can't be claimed without the steps behind it. This is what makes NB a control layer, not just a prompt bundle.

## States
`idle` · `design` · `implement` · `review` · `security` · `brief` · `done` · `blocked`

## Transitions
```
idle      → design
design    → implement | blocked
implement → review | security | blocked
security  → review
review    → implement | brief
brief     → done
(any active state) → blocked
```

## Rules
- **done** requires evidence + review + brief (the harness score must read READY).
- **security-sensitive** workflows must pass through `security` before `done`. *Enforced (audit #20):* `/nb:close` forces the security pack's `security-report-check` proof (and a full floor) whenever this workflow is set — even if no auth/secret pattern was auto-detected — and `validate-state` requires `last_security` once the task reaches `brief`/`done`.
- **blocked** must include `open_risks` or `blocked_reason`.
- `current_workflow` must be one of `workflows/*.md`.
- `current_task_slug` should exist when `current_task` exists.
- `last_evidence` / `last_review` / `last_brief` must match the current task if present (not a stale older task).

`scripts/validate-state.mjs` checks these against the live `.nb/state.json` (or the committed `.nb/state.example.json`). It is dependency-free; `.nb/state.schema.json` documents the field shape for editors/reference.
