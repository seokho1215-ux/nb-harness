# Cross-Review Flow

NB's reviews are cross-family on purpose: a same-family review shares its own blind spots (Panickssery et al., NeurIPS 2024).

## How it runs
`/nb:review` after a task:
```bash
node scripts/cross-review.mjs <bundle.md> .nb/reviews/task-01.md
```
- bundles the diff + task spec + module contract
- pipes it into the **other** family: `codex exec --sandbox read-only -`
- records provenance at the top of the result:
```
<!-- NB_REVIEW_PROVENANCE
reviewer: codex
command: codex exec --sandbox read-only -
exit_status: 0
manual_fallback: false
-->
```

## Why provenance, not header-parsing
We record **how** the review ran, not whether the model printed its own name. If `codex` isn't installed, the script stops and tells you to install it (`npm i -g @openai/codex && codex login`) or paste manually — and then a human marks `manual_fallback: true`.

## Verdict
PASS / PASS with revisions / FAIL. **Environment-deferred** items (live DB, production calls, manual UI) are not Critical — they're verified by you after merge, so the review doesn't loop forever on things it structurally can't check.
