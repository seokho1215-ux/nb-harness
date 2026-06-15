---
name: self-check
description: NB evidence gate. Use when writing or modifying code that carries logic or risk — API/route handlers, DB schema/migrations, auth, secrets, external calls, anything on the safety floor — and whenever the user pushes "quickly / just this one / real fast / 10 minutes". Enforces opening the source before coding and showing verify output before claiming done.
---

# nb-self-check — Claude Code wrapper

> Thin wrapper. The full rule is `core/self-check.md` (tool-agnostic SOT).
> **Your first action MUST be `Read` on `core/self-check.md`**, then apply both gates:
>
> - **Gate A** — open the real source (Read tool) before writing. Cite with a one-line excerpt; a bare or paraphrased citation doesn't count.
> - **Gate B** — run `{VERIFY_CMD}` and **show the output** before claiming done. A green claim with no output is not evidence.

Skip only for: UI-only edits (no logic), prose docs, type-only refactors, dependency-free pure functions.
