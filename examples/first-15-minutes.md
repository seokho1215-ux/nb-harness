# First 15 Minutes with NB

A mini transcript — one real task, start to finish.

## Install (2 min)
```bash
node scripts/install.mjs /path/to/your/project --apply   # type "yes"
```
Open `nb.config.json`, set `VERIFY_CMD` (e.g. `npm run build && npm test`).

## The session

```
you ▸ /nb:setup
nb  ▸ inspected the repo, created .nb/state.json (mode: idle). doctor --target: all checks pass.

you ▸ Add a settings page that saves a display name.
nb  ▸ /nb:plan
      strength: writes to storage + a form  →  not trivial  →  FULL
      lane: build. 3-tier plan written to nb-workspace/pipeline/settings-name/
      gates that will apply: self-check, input validation
      go?
you ▸ go
nb  ▸ /nb:work
      implemented 1 task. ran `npm run build && npm test`:
        ✓ build ok    ✓ 12 passed
      evidence → .nb/evidence/settings-name.md
nb  ▸ /nb:review
      cross-family review (codex): PASS with 1 note — trim very long names
      saved → .nb/reviews/settings-name.md (with provenance)
nb  ▸ touched a form input, not auth/secrets → security module: Analysis only, no findings

you ▸ /nb:grill
nb  ▸ "Added a settings page where someone can save their display name.
       I ran it and the tests pass. One small cleanup — very long names get trimmed.
       Nothing risky left open."
```

## What just happened
You made **two decisions** — the task, and "go". NB judged strength, picked the lane, planned, implemented with **shown** test output (not a claim), had a second AI family review it, checked security, and explained it in plain language. Everything it did is in `.nb/`.

Want proof it intervenes even when you push for speed? See [trigger-proof.md](trigger-proof.md).
