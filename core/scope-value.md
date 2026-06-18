# Scope & Core Value (core)

> NB stops scope **creep** (more than asked). This stops the opposite — scope **shrink**: the AI quietly
> moving the *point* of the thing out of the first cut, so "it ships" becomes "it's a soulless skeleton".
> Pairs with [`intent-lock.md`](intent-lock.md) (which now captures `core_value`) and the planner/plan-reviewer gate.

## The one rule
**The AI may not move a user's core value out of the MVP / first cut silently.** Deferring it, splitting it
into a later phase, or demoting it to "optional/stretch" is a **scope decision** — to do it you must either
(a) **ask the user**, or (b) record a **`scope-change` decision**. Phasing IS a scope decision.

## Why this exists (the felt failure)
A planner split work into "phase 1 / phase 2" on its own, pushed the core interactions into phase 2 without
asking, and **never explained the split** — so the user couldn't catch it. Three failures, one root: opacity.
A gate alone can't fix it; the design reasoning has to be **shown** so the human can decide the boundary.

## What the planner must surface (transparency)
At design time, in plain language (no jargon), the planner states — in a **`## Design Decisions`** section of
`01-architecture.md` or `meta.md`:
- **What's in the first cut vs. what's deferred — and *why* each deferral.**
- **Why the phases are split this way** (if split at all).
- **Traceability:** each `core_value` → which architecture element + which task acceptance covers it. A core
  value with no acceptance is a silent drop — flag it, don't bury it.

**Deterministic floor:** the planner prompt requires this section always; `validate-state` enforces it where a
silent shrink is even possible — if a `core_value` is captured in `.nb/state.json`, `implement` is blocked until
the `## Design Decisions` heading exists. No `core_value` (light/non-product work) → not required (proportionality).
The heading presence is machine-checked; the *substance* (is a core value actually preserved?) is the
plan-reviewer's call — determinism for the cheap part, cross-family judgment for the semantic part.

## How MVP is judged (not "smallest shippable")
- **MVP = "is there still a reason to reopen it?"** — repeat-use, not bare ship-ability. A demo that runs but
  no one comes back to is **demoware**, not an MVP. (Product work only — bugfix/security/docs use utility/
  risk-reduction instead. Proportionality: don't force this on light work.)
- **The boundary is the human's.** The AI proposes the MVP line with risks/omissions/over-reach noted; the
  user sets the final boundary. The AI is the *reviewer* of scope/value, not the decider.

## Backlog isolation
New ideas found mid-task do **not** get merged into the current scope. Record them in `meta.md`'s
`Backlog / Deferred` section only. No backlog section yet → don't invent one (proportionality).

## Judgment consistency
Reversing an earlier conclusion on the same inputs: **say what changed first.** Inputs unchanged → don't flip
without a reason.

## Absolute
**Never overwrite the user's input.** Their words are the primary source; preserve the intent and feel even if
a cleaner phrasing exists. Improvements are *separate proposals*, never a silent rewrite of what they said.
