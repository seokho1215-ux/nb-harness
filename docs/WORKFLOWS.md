# Workflows

NB selects a workflow **automatically** from task intent (`core/strength.md`). You don't pick one; you can override in plain words.

## Table
| Workflow | When | Strength | Cross-family review | Security |
|---|---|---|---|---|
| `light-change` | trivial edit (text/color/config) | light | on request | floor only |
| `standard-feature` | normal feature, no floor risk | medium→full | yes | floor + module if risky |
| `full-feature` | multi-task / cross-cutting | full | per task | module if risky |
| `bugfix` | fix a defect | medium+ | yes | floor + module if risky |
| `refactor` | restructure, no behavior change | medium→full | yes | floor |
| `docs-only` | docs / comments | light | no | none |
| `security-sensitive` | touches the safety floor | full (locked) | yes | full module, 2-round |
| `release` | publish / deploy | full + readiness | yes | sign-off if shipping code |

## Selection logic
`strength-judge` maps the task's intent to a workflow and records `current_workflow` + `workflow_reason` in `.nb/state.json`.

## Escalation logic
A workflow escalates automatically when the work outgrows it (recorded as `escalation_reason`):
- `light-change` → `standard-feature` / `security-sensitive` (touched logic or the floor)
- `standard-feature` → `full-feature` (over the 40% budget) or `security-sensitive` (floor)
- `bugfix` → `security-sensitive` (floor), or STOP (3+ failed fixes → suspect the architecture)
- any → `release` (publishing / deploying)

## Artifact expectations
Each `workflows/<name>.md` lists its expected artifacts and minimum evidence. The harness score (`scripts/harness-score.mjs`) checks they're present before "done".
