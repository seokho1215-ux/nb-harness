---
name: release-changelog-check
description: Confirm every user-facing change has a changelog entry and the version is bumped. (Core release-readiness covers the gate; this covers the changelog discipline.)
---

# changelog-check — release pack skill

**Strengthens proof:** `release-notes-cover-changes` — the release pack's close-proof this skill makes more accurate.
**When to read:** Before a release closes.
**Output / checkpoint:** a changelog entry per user-facing change and a confirmed version bump.

## How
- List the user-facing changes in this release.
- Confirm each has a changelog entry written for a human reader.
- Confirm the version is bumped to match the change scope.

> Pack-scoped: this loads only when the **release** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
