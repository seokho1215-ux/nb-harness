# Artifact Ledger (core)

NB records artifacts as a ledger (`.nb/artifacts.jsonl`), not just loose files — so evidence / review / brief / decision can be tracked, matched to a task, and aged out. The harness score reads the ledger when present, and falls back to `state` pointers when it isn't.

## Row shape (JSONL — one object per line)
```json
{"id":"ev-1","task_slug":"settings-page","type":"evidence","path":".nb/evidence/settings-page.md","created_at":"2026-06-10T00:00:00Z","provenance":"VERIFY_CMD","status":"current"}
```

## Valid types
`intent` · `evidence` · `review` · `brief` · `decision` · `session` · `log`

## `status`
- `current` — counts toward the current task's readiness
- `superseded` — kept for history, not counted

## Rules (`scripts/validate-artifacts.mjs`)
- `path` exists
- `type` is valid
- `current` rows' `task_slug` matches `state.current_task_slug`
- when state is `done`, the current task has at least `evidence` + `review` + `brief`
- no obvious secrets in artifact paths or contents

The committed `.nb/artifacts.example.jsonl` is shape-only (validated for structure, not path existence). A live `.nb/artifacts.jsonl` is git-ignored runtime state.
