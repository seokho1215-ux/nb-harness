---
name: strength-judge
description: NB strength auto-judge. Use at the start of any coding task to set strength / mode / rounds automatically — no user switches. Light work (UI text, colors, settings) → lighter; risky work (auth, payment, DB, secrets, external API, file delete, deploy) → full, and these can't be lowered even on "go fast / quickly". The AI auto-judges strength but never auto-runs a risky action.
---

# nb-strength-judge — Claude Code wrapper

> Thin wrapper. The full rule is `core/strength.md` (tool-agnostic SOT).
> **Your first action MUST be `Read` on `core/strength.md`**, then set strength / mode / rounds from the task's nature.

- Default safe: full set + 2 rounds. Lower only when the work is clearly light.
- **Safety floor** (auth / payment / DB / secrets / external API / file-delete / deploy) never drops, even on a "go fast" request.
- The AI auto-judges *strength*; *risky actions* still need explicit approval right before they run (manifest `requires_approval` / `safety_gates`).
