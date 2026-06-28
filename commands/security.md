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

## How the two-round cross-family swap actually runs (it is ENFORCED, not attested)

The Claude side of the swap is this harness (the red-team / blue-team agents). The **other family's rounds run through Codex** — and the security gate will NOT accept a `codex` family claim unless a real Codex run is on record:

1. Write the structured report `.nb/reviews/<task>.security-report.json` (fields in `scripts/security-report-check.mjs`). Round 1: Claude attacks → Codex defends. Round 2 (swap): Codex attacks → Claude defends.
2. Run the **Codex rounds** through the courier (one call per Codex role):
   ```
   node scripts/security-redblue.mjs --task <slug> --round 1 --role defend --bundle <prompt.md>
   node scripts/security-redblue.mjs --task <slug> --round 2 --role attack --bundle <prompt.md>
   ```
   Each logs a trusted-execution event (`source: security-redblue`, run_id, body hash) for that round+role.
3. Mint the objective proof — it passes ONLY if the report is structurally valid AND every non-Claude family it names has a matching logged Codex run:
   ```
   node scripts/security-report-check.mjs .nb/reviews/<task>.security-report.json --task <slug> --proof
   ```
   No Codex available? Then you may NOT claim cross-family — set `degraded_single_family: true` + `degraded_limitations_acknowledged: true` + a reason. A typed `"codex"` with no real run is rejected (C1).

`/nb:close` requires this `security:security-report-check` proof (strong-bound to the `security-report-check` producer), so a security-sensitive change cannot close on a hand-written report.

**Produces:** `{WORKSPACE}/reviews/<task>.security-report.json` + per-round `…redblue-r<n>-<role>.codex.md`, the `security-report-check` objective proof, a recorded decision in `.nb/decisions/`, updated `.nb/state.json` (**sets `last_security`** to the report path — a `security-sensitive` workflow can't reach `brief`/`done` without it; audit #20).
