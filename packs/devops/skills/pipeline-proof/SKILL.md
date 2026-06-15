---
name: devops-pipeline-proof
description: Capture green CI/pipeline output and note the rollback/revert path.
---

# pipeline-proof — devops pack skill

**Strengthens proof:** `pipeline` — the devops pack's close-proof this skill makes more accurate.
**When to read:** After a deploy/pipeline change, before close.
**Output / checkpoint:** CI/pipeline output (green) and an explicit rollback/revert path.

## How
- Capture the real pipeline run output showing green.
- Write down how to roll back / revert this deploy if it goes wrong.
- A deploy without a stated rollback path is not done.

> Pack-scoped: this loads only when the **devops** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
