# .nb/ — NB runtime state & artifacts

NB writes what it does here. Inspect it any time — this is how the harness stays honest (evidence over claims).

| Path | What |
|------|------|
| `state.json` | current harness state. Created by `/nb:setup`. **Git-ignored.** |
| `state.example.json` | the documented shape of `state.json` (committed). |
| `artifacts.jsonl` | the artifact ledger (evidence / review / brief / decision rows). Git-ignored; `artifacts.example.jsonl` is committed. |
| `sessions/` | compact session summaries (written on pre-compact). |
| `evidence/` | captured verify output, command results, failed-command logs. |
| `reviews/` | cross-family review artifacts (with provenance). |
| `briefs/` | plain-language human briefs (grill-me output). |
| `decisions/` | recorded approvals for risky actions + **intent-lock artifacts** (`intent-lock.<task>.md`). |
| `logs/` | tool-outcome logs (post-tool-use). |

## `state.json` shape

| Field | Meaning |
|---|---|
| `harness_version` | NB version in use |
| `current_mode` | `idle` / `design` / `implement` / `security` |
| `current_workflow` | the auto-selected workflow (or `null`) |
| `workflow_reason` | why that workflow was chosen |
| `escalation_reason` | why the workflow escalated, if it did |
| `current_task` | short label of the active task (or `null`) |
| `current_task_slug` | stable slug for `current_task`; used by harness-score to match artifacts to the current task |
| `strength_level` | `light` / `full` (auto-judged, `core/strength.md`) |
| `active_agent_lane` | `build` / `review` / `security` / `human` |
| `active_gates` | safety gates currently in force |
| `intent_summary` | the captured intent (intent-lock) |
| `non_goals` | what this task is explicitly not doing |
| `definition_of_done` | the concrete "finished when…" |
| `taste_notes` | taste / UX constraints the human owns |
| `drift_risks` | ways the work could drift from intent |
| `last_review` | path to the **current task's** review artifact (not a stale older task's) |
| `last_evidence` | path to the **current task's** evidence artifact (not a stale older task's) |
| `last_brief` | path to the current task's most recent brief artifact |
| `open_risks` | unresolved risks the user should know |
| `updated_at` | ISO timestamp of the last update |

## Rules
- **Secrets are redacted** from the machine output NB writes (tool logs, `nb-run` evidence/proofs, attack authorization) using a shared scrubber (`scripts/lib/proof.mjs` `redact`). Tamper-evident, not a guarantee — a novel secret format or a hash-bound cross-review body can slip through; don't keep real secrets in tracked files.
- Runtime contents are git-ignored; only `.gitkeep` and `.example` files are committed.
- If `state.json` is missing (fresh clone), the harness treats it as `idle` until `/nb:setup` runs.
