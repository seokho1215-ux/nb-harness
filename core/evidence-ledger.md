# Evidence Ledger (core)

> NB records what actually happened — not what the AI claims. The ledger is the running list of evidence behind a task; the **harness score** reads it to answer one question: *is this ready to claim done?*

## What's tracked
- **plan exists** — a design/plan was produced
- **intent locked** — intent + non-goals + definition of done captured (intent-lock)
- **workflow selected** — a workflow was chosen and recorded
- **evidence recorded** — verify output / command results captured (`.nb/evidence`)
- **review completed** — a cross-family review with provenance (`.nb/reviews`)
- **risky actions approved** — any install / destructive / external action got explicit approval (`.nb/decisions`)
- **brief generated** — a plain-language brief exists (`.nb/briefs`)
- **open risks listed** — unresolved risks are named, not hidden

## The harness score
`scripts/harness-score.mjs` reads `.nb/` and prints a checklist-style readiness signal. It is **not** a quality score — green doesn't mean "good code", it means "the harness steps were actually done". A task with everything missing can still *run*; the score's job is to stop "it runs" from masquerading as "it's done".

Example:
```
NB Harness Score
Plan: yes
Intent: yes
Evidence: partial
Review: missing
Brief: yes
Open risks: 2
Status: NOT READY TO CLAIM DONE
```

## Where it shows
- the **status view** surfaces the score.
- the **human brief** includes it in plain language ("review still missing — don't call this done yet").
- the `release` workflow requires it to clear.

(How each surfaces is adapter-specific — see [`../docs/PORTABILITY.md`](../docs/PORTABILITY.md) for the adapter command mapping.)
