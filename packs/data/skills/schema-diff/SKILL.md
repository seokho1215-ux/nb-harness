---
name: data-schema-diff
description: Review the schema change for destructive operations (drop/rename/narrow-type) before applying it.
---

# schema-diff — data pack skill

**Strengthens proof:** `migration-up` — the data pack's close-proof this skill makes more accurate.
**When to read:** Before running a migration.
**Output / checkpoint:** a list of schema ops classified additive vs destructive; a recorded decision for any destructive op.

## How
- List every schema op in the migration.
- Flag destructive ones: DROP, column rename, type narrowing, NOT NULL on existing data.
- For each destructive op, require an explicit decision (and a backfill/rollback plan).

> Pack-scoped: this loads only when the **data** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
