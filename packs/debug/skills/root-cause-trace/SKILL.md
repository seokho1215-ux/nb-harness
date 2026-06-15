---
name: debug-root-cause-trace
description: Reproduce the failure before the fix, confirm it passes after, and link the root cause to the fix.
---

# root-cause-trace — debug pack skill

**Strengthens proof:** `root-cause` — the debug pack's close-proof this skill makes more accurate.
**When to read:** When fixing a bug, before root-cause is claimed.
**Output / checkpoint:** a failing reproduction (before), a passing reproduction (after), and a note linking cause to fix.

## How
- Build a minimal reproduction that fails on the current code.
- Find the actual cause — not the symptom; state why the symptom appeared.
- Show the same reproduction passing after the fix; link cause -> fix in the note.

> Pack-scoped: this loads only when the **debug** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
