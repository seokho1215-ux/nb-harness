---
name: frontend-screenshot-evidence
description: Capture a real before/after screenshot of the changed view as evidence — an image, not a description.
---

# screenshot-evidence — frontend pack skill

**Strengthens proof:** `spec-fidelity` — the frontend pack's close-proof this skill makes more accurate.
**When to read:** After a UI change, before close.
**Output / checkpoint:** before + after images saved; their paths recorded in the evidence artifact.

## How
- Capture the view BEFORE and AFTER the change at the same size/state.
- Save both; reference the paths in .nb/evidence so the proof points at real images.
- A described screenshot is not evidence — the file must exist.

> Pack-scoped: this loads only when the **frontend** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
