---
name: release-readiness
description: Gate before publishing or deploying. Use when about to release/deploy/publish — run the harness score and release checks; block if not ready.
---

# release-readiness — skill

The gate before any publish/deploy. It combines the `release` workflow, `scripts/release-check.mjs`, and the harness score.

Before shipping:
- run the harness score (`scripts/harness-score.mjs`) — plan / intent / evidence / review / brief must be present.
- if shipping code, run the security gate.
- confirm no unapproved risky actions and no unresolved Critical/High findings.

If the score is **NOT READY**, stop and name what's missing — don't ship to make the checklist happy.
