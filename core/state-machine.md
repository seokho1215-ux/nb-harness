# State Machine (core)

NB tracks a task through a lifecycle. `state.current_mode` is the state. The flow below is the intended path; what is **machine-enforced** is the closing end of it — `/nb:close` refuses to certify "done" without the steps' *evidence*, not by replaying an edge-by-edge transition log (NB keeps no transition history). Concretely, enforcement is: the required artifacts for the workflow (plan + intent always; evidence/review/brief as the workflow declares), the Core category/security floors, AND a state-gate that refuses to close from a pre-work or blocked state (`idle`/`design`/`blocked`). That combination is what makes NB a control layer, not just a prompt bundle — the literal arrows below are the recommended flow, not each individually-verified at runtime.

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
