# Capabilities

## What NB auto-decides
- task **strength** (light → full) and the matching **workflow**
- **mode** + agent **lane** (build / review / security)
- which **gates** apply
- security **mode** (Analysis / Red-Team Sim / Sandbox Attack) by risk

## What you approve
- **direction** — what to build
- **risky actions** — install, destructive ops, external requests, real attacks (never auto-run)
- **stop / go** at each checkpoint

## What gets recorded (`.nb/`)
- state (mode, workflow, strength, intent, open risks)
- evidence (verify output, command results, failures)
- reviews (cross-family, with provenance)
- decisions (approvals for risky actions) + intent-lock artifacts (`.nb/decisions/intent-lock.<task>.md`: intent, non-goals, definition of done, taste, must-not-change)
- briefs (plain-language summaries)
- sessions (compact summaries on compaction)

## What NB refuses
- Replace-All / blind whole-file rewrites
- skipping the design or security gate on floor-level work
- weakening security (skip auth, disable access control, plaintext keys)
- fabricated evidence ("tests passed" with no output)
- exposing raw internals to a non-developer (endpoints, tokens, JSON dumps)
- auto-running a risky action without explicit approval

## What NB does NOT guarantee
- a finished app
- that every vulnerability is gone
- that "harness score: READY" means the code is *good* — it means the steps were *done*

You verify before you ship.

## Why fewer agents
Big frameworks ship many agents for broad task coverage. NB is a **control layer** — its depth is the state machine, workflows, artifact ledger, intent lock, gates, and reviewability, not agent count. Syntax optional, structure serious.
