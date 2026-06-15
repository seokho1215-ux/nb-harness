---
name: data-rollback-proof
description: Run the migration up AND down, capture row-counts, and prove the change is reversible with no data loss.
---

# rollback-proof — data pack skill

**Strengthens proof:** `rollback-safety` — the data pack's close-proof this skill makes more accurate.
**When to read:** After writing a migration, before the data pack closes.
**Output / checkpoint:** migration up output, migration down (rollback) output, a row-count / no-data-loss check across both.

## How
- Apply the migration (up) and capture the output.
- Roll it back (down) and capture the output — it must fully revert.
- Compare row counts / key invariants before vs after to prove no data loss.

> Pack-scoped: this loads only when the **data** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
