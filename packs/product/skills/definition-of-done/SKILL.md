---
name: product-definition-of-done
description: Write a testable definition-of-done, real non-goals, and an acceptance checklist before product work can close.
---

# definition-of-done — product pack skill

**Strengthens proof:** `dod-covered` — the product pack's close-proof this skill makes more accurate.
**When to read:** At /nb:plan for product-scoped work, before the dod-covered proof is claimed.
**Output / checkpoint:** state.definition_of_done (verifiable, not vague), state.non_goals (real exclusions), an acceptance checklist with every item checked.

## How
- Phrase the DoD as something testable: "X works when Y is observable", not "X is done".
- List non-goals explicitly — what this task will NOT do (scope-guard, folded here).
- Turn the DoD into an acceptance checklist; the dod-covered proof needs every item checked.

> Pack-scoped: this loads only when the **product** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
