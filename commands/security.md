---
description: Trigger the security gate (3-layer + red/blue cross-family). Risky, destructive, external, or real-attack actions require explicit approval. Use for a security pass.
---

# /nb:security

**When:** for a security pass on existing code, or when a task touches auth / access / secrets / external services.

**NB does automatically:**
- picks a mode by risk: **Analysis** (read-only) by default; **Red-Team Sim** (scenarios); **Sandbox Attack** (highest)
- runs blue-team (verify) + red-team (attack); two-round cross-family if both families are available, else degrades by perspective (and says so)
- redacts secrets in the report

**Your approval:** REQUIRED before any real attack (Sandbox) — explicit consent + ownership proof. Real payment / mail / external API and destructive ops are blocked even on a copy.

**Produces:** `{WORKSPACE}/reviews/security-report.md`, a recorded decision in `.nb/decisions/`, updated `.nb/state.json` (**sets `last_security`** to the report path — a `security-sensitive` workflow can't reach `brief`/`done` without it; audit #20).
