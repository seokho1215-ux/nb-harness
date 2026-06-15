---
name: testing-verify-capture
description: Capture the FULL verify-command output as the testing proof — the whole run, not a summary.
---

# verify-capture — testing pack skill

**Strengthens proof:** `verify` — the testing pack's close-proof this skill makes more accurate.
**When to read:** After running the test/verify command, before close.
**Output / checkpoint:** full VERIFY_CMD output and the real pass/fail counts from that run.

## How
- Run the verify command and capture its complete stdout/stderr (prefer nb-run).
- Keep the real pass/fail counts; never hand-write "all passed".
- The verify proof reconciles against the hook log — a summary will not pass.

> Pack-scoped: this loads only when the **testing** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
