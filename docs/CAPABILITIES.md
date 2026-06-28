# Capabilities

## What NB auto-decides
*The AI proposes these; a script then enforces a **raise-only floor** (`strength-judge`/`model-policy`/
`review-budget`) and `/nb:close` re-derives the floor from the observed diff — so an under-judgment can be
raised by code, never silently lowered. There is no intent NLP classifier; the AI fills the flags, the floor binds.*
- task **strength** (light → full) and the matching **workflow**
- **mode** + agent **lane** (build / review / security)
- which **gates** apply
- security **mode** (Analysis / Red-Team Sim / Sandbox Attack) by risk *(the mode label is the AI's; whether a security floor is ON is code-derived)*

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
Two distinct mechanisms — be precise about which:

**The PreToolUse hook ASKS before (and only DENIES under the non-default `strict` profile; it fails *open* on error):**
- Replace-All / blind whole-file rewrites
- exposing raw internals (`cat .env`, printing keys/tokens) — pattern-matched on the tool call, best-effort
- an unpinned or global install

**`/nb:close` BLOCKS at completion (deterministic, fail-CLOSED) — this is the firewall:**
- fabricated evidence ("tests passed" with no matching run in the independent tool log)
- a proof whose command does not match its type, or a security report not produced by the real checker
- closing on floor-level work without the security/category proof the observed diff requires
- a risk category (auth/secret/payment/…) left unacknowledged

NB does **not** have a "skip-auth / disable-access-control" code detector — that class is caught (if at all) by the
security review stage, not a refusal rule. And the hook sees tool calls, not the assistant's chat text, so
user-facing exposure in prose is AI discipline, not a hard block.

## What NB does NOT guarantee
- a finished app
- that every vulnerability is gone
- that "harness score: READY" means the code is *good* — it means the steps were *done*

You verify before you ship.

## Why fewer agents
Big frameworks ship many agents for broad task coverage. NB is a **control layer** — its depth is the state machine, workflows, artifact ledger, intent lock, gates, and reviewability, not agent count. Syntax optional, structure serious.
