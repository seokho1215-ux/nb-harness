---
name: docs-doc-sync
description: Check each doc claim against the current code/behavior and remove stale instructions.
---

# doc-sync — docs pack skill

**Strengthens proof:** `doc-accuracy` — the docs pack's close-proof this skill makes more accurate.
**When to read:** After a docs change, before close.
**Output / checkpoint:** a per-claim check against the code and a list of corrected/removed stale lines.

## How
- For each instruction/claim in the changed docs, verify it against the actual code.
- Fix or delete anything stale for the changed area.
- Note the claims you checked so doc-accuracy is grounded.

> Pack-scoped: this loads only when the **docs** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
