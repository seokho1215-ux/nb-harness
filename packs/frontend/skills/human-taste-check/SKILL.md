---
name: frontend-human-taste-check
description: Judge the UI against taste and spec — layout, hierarchy, empty/loading/error states, responsiveness — what an automated build/a11y check cannot see.
---

# human-taste-check — frontend pack skill

**Strengthens proof:** `spec-fidelity` — the frontend pack's close-proof this skill makes more accurate.
**When to read:** After a UI change, before spec-fidelity is claimed.
**Output / checkpoint:** taste_notes recorded in .nb/state; each acceptance item visually confirmed (not assumed).

## How
- Check the changed view at the real breakpoints; confirm hierarchy and spacing read correctly.
- Exercise empty / loading / error states, not just the happy path.
- Record taste_notes: what you judged and any residual rough edges.

> Pack-scoped: this loads only when the **frontend** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
