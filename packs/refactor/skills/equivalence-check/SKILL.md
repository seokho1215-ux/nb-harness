---
name: refactor-equivalence-check
description: Capture the test suite result before and after the refactor and confirm identical behavior.
---

# equivalence-check — refactor pack skill

**Strengthens proof:** `equivalence` — the refactor pack's close-proof this skill makes more accurate.
**When to read:** After a refactor, before close.
**Output / checkpoint:** test output BEFORE and AFTER (same result) and a no-behavior-change note.

## How
- Run the suite before refactoring and capture the result.
- Refactor without changing behavior; run the suite again.
- Confirm the results match; note that no observable behavior changed.

> Pack-scoped: this loads only when the **refactor** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
