---
name: nb-close
description: Check whether the current task can be closed as done — NB's completion firewall.
---

# /nb:close

**When** you (or the AI) think a task is finished and want to claim "done". `/nb:close` is the **completion firewall**: it refuses to let "done" through unless the evidence for *this* task is actually there. NB does not just ask before risky actions — it also blocks false completion claims.

**NB does automatically:** runs the shared readiness engine (`scripts/close.mjs` → `scripts/lib/score.mjs`) over `.nb/state.json` + the artifact ledger and checks, for the **current task**:
- plan + intent locked
- evidence present and **task-matched** (not a stale older task's file)
- cross-family review present and task-matched
- a plain-language brief present and task-matched
- **no `must_not_change` (off-limits) area was changed** — or the change was explicitly accepted via a decision
- open risks surfaced

Verdict:
- **NOT READY** — something is missing or stale → close is **blocked** and the blocking items are listed.
- **READY** — everything present for this task, no open risks → safe to close.
- **READY WITH RISKS** — everything present, but open risks remain → close needs your explicit sign-off.

**Your approval** — accepting open risks is *your* judgment: NB lists them, you decide. NB never auto-closes over an unacknowledged risk, and it cannot be argued past missing or stale evidence.

**Produces** — read-only: prints the verdict and reads `.nb/` state + artifacts; writes **nothing**. (Use `/nb:work` / `/nb:review` / `/nb:grill` to produce the evidence / review / brief it checks for.)
