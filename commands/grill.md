---
description: Produce a plain-language, zero-jargon human briefing of what changed, what was verified, and what's still risky. Use after a stage or review.
---

# /nb:grill

**When:** after any stage or review, when you want a plain-language brief.

**NB does automatically:**
- summarizes completed work as "problem → fix → result", no jargon (`core/grill-me.md`)
- checks the result against the **intent lock** (`core/intent-lock.md`): scope drift? a different problem solved? what should you inspect? **Drift it finds is recorded to `state.drift_risks`, and `/nb:close` blocks an unaccepted drift** (resolve it, or accept via `.nb/decisions/<task>.drift-accepted.md`) — same binding as open risks (audit P-c/#16).
- states what was verified (with evidence) and what risk remains open
- includes the **harness score** in plain language (plan / intent / evidence / review / brief / open risks — ready to claim done?)

**Your approval:** none.

**Produces:** `.nb/briefs/<timestamp>.md`.
