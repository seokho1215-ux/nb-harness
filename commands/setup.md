---
description: Inspect the repo, initialize NB state/artifacts, and run a health check. Use once when setting NB up in a project.
---

# /nb:setup

**When:** first time using NB in a project (or after pulling NB changes).

**NB does automatically:**
- runs `node scripts/setup.mjs` — the **deterministic scaffold**: ensures the `.nb/` runtime dirs, creates
  `.nb/state.json` from `.nb/state.example.json` (mode `idle`) if missing, then runs `doctor --target`
- inspects the repo (stack, existing docs) and notes which modules apply

`/nb:setup` does **not** hand-author `state.json` — it runs the script so the shape is always correct
(`status` / `hud` / `harness-score` / `/nb:close` all read it; a malformed state breaks them). An existing
`state.json` is **preserved** (pass `--force` to recreate from the example — that wipes live task state).
Use `--no-doctor` to scaffold without the health run.

**Your approval:** none for inspection/scaffold. If anything needs installing, the install-safety flow runs
first (show the plan → you approve → pin → local).

**Produces:** `.nb/state.json` (idle) + runtime dirs, and a doctor report.
