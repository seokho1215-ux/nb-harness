---
description: Summarize the current NB harness state from .nb/. Use any time to see where you are.
---

# /nb:status

**When:** any time.

**NB does automatically:**
- runs `node scripts/status.mjs` (reads `.nb/state.json`)
- summarizes mode, workflow, task, strength, active gates, last review/evidence, and open risks
- shows the **harness score** (plan / intent / evidence / review / brief — ready to claim done?)

**Your approval:** none (read-only).

**Produces:** nothing — a read-only view.
