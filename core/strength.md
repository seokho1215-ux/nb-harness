# Strength Auto-Judge (core)

> NB has **no strength switches for the user to flip.** The AI reads each task and sets
> strength / mode / round-count itself. User input = 0 by default.
> This generalizes the effort auto-recommendation a coding assistant already does
> ("this task needs the deep setting because it touches DB + API + UI at once").

## Why auto, not a switch
Many NB users (syntax optional, structure serious) find "configuring something" itself a chore — editing config, or stating the level every time. The goal: say "build it" and it runs at the right strength. So strength leaves the user's hands and becomes an AI judgment.

## What the AI auto-sets (from the task's nature)
- **Light work** (UI text/color, a setting value, a filename): security 1 round or Analysis Mode, lighter cross-check.
- **Risky work** (auth/login, payment, DB schema, external API, encryption): full 2-round security, attack mode prepared/recommended (real attack only after approval — see the boundary), strict cross-check.
- **One family only** (no cross-family available): degrade by splitting agents by perspective (see the security module).

## Default = safe (when unsure, go stronger)
- Default = full set + 2 rounds. Lower only when the AI is confident the work is clearly light.
- When risk is in doubt, never lower. Security is priority one.

## Safety floor — can't be lowered even on "go fast"
Even if the user says "do it quick this time", strength can't drop below the minimum gate when the work touches:

> auth/login · payment · DB (schema/query/migration) · secrets/keys/tokens · external API calls · file delete/move · deploy

Floor = the minimum security gate + self-check (`core/self-check.md`). Nothing below that.

## The boundary (this is the core rule)
The AI auto-judges **strength**. The AI does NOT auto-run a **risky action**.
- Auto scope: strength / mode / round-count decisions.
- Approval scope: anything that reaches outside, attacks, installs, or can destroy — explicit user approval **right before it runs** (manifest `requires_approval: true` / `safety_gates`).

> "The AI auto-judges strength, but never auto-runs a risky action."

The "big-decision re-check" (a verifyself-style pause) is also not a switch — if the AI judges a decision expensive-to-reverse, it triggers the re-check itself.

## Workflow selection (automatic)

The strength judge also maps the task's intent to a workflow (`workflows/`):

| Task intent | Workflow |
|---|---|
| trivial edit (text / color / config) | `light-change` |
| normal feature, no floor risk | `standard-feature` |
| multi-task / cross-cutting feature | `full-feature` |
| fix a defect | `bugfix` |
| restructure, no behavior change | `refactor` |
| docs / comments only | `docs-only` |
| touches the safety floor | `security-sensitive` |
| publish / deploy | `release` |

The user does **not** pick a workflow by default — NB selects and records it (`state.current_workflow`, `state.workflow_reason`). Escalation is automatic when the work outgrows the current workflow (`state.escalation_reason`). An advanced user can inspect or override in plain words ("treat this as a full feature").

## User override (optional, never required)
AI-auto is the default. The user can still steer in plain words — "do it quick" / "go hard on security". Not required; if they say nothing, the AI decides. **Zero-input is the default experience.**
