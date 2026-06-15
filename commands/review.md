---
description: Run or prepare a cross-family review (the other AI family) with provenance, and store the verdict. Use after implementing.
---

# /nb:review

**When:** after a task is implemented, before merge.

**NB does automatically:**
- bundles the diff + task spec + module contract
- runs the cross-family review via `scripts/cross-review.mjs` (the *other* family, e.g. Codex), recording provenance
- stores the verdict in `.nb/reviews/`

**Your approval:** none to run the review — you decide on its findings. (Cross-family is the point: a same-family review shares the blind spots.)

**Produces:** `.nb/reviews/<task>.md` (with an `NB_REVIEW_PROVENANCE` header), updated `.nb/state.json` (`last_review`).
