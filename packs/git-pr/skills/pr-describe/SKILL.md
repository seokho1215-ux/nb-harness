---
name: git-pr-pr-describe
description: Write a PR description that matches the actual diff and links the task/intent.
---

# pr-describe — git-pr pack skill

**Strengthens proof:** `pr-covers-diff` — the git-pr pack's close-proof this skill makes more accurate.
**When to read:** When opening/updating a PR, before close (PR is where "done" is claimed).
**Output / checkpoint:** a PR description checked line-for-intent against the diff, with the task/intent linked.

## How
- Read the actual diff; make the description match what changed (no more, no less).
- Link the task / intent so the PR is traceable.
- Call out risk and how it was verified.

> Pack-scoped: this loads only when the **git-pr** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
