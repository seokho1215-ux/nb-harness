---
name: testing-regression-guard
description: Ensure the change is covered by a new or changed test that would fail without the fix.
---

# regression-guard — testing pack skill

**Strengthens proof:** `verify` — the testing pack's close-proof this skill makes more accurate.
**When to read:** When adding or fixing behavior.
**Output / checkpoint:** the guarding test, plus confirmation it fails on the old code and passes on the new.

## How
- Add/modify a test that targets exactly the changed behavior.
- Confirm it FAILS against the pre-change code (otherwise it guards nothing).
- Confirm it passes after the change; include it in the verify run.

> Pack-scoped: this loads only when the **testing** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
