---
name: grill-me
description: NB plain-language brief (Human Decision Brief). Use after a stage completes (design / implement / security) or after a cross-family review, to give a plain-language brief of what got done — "problem → fix → result", zero jargon, completed work only (not a live play-by-play).
---

# nb-grill-me — Claude Code wrapper

> Thin wrapper. The full rule is `core/grill-me.md` (tool-agnostic SOT).
> **Your first action MUST be `Read` on `core/grill-me.md`**, then summarize the finished work:
>
> 1. **No jargon** (no "BOLA", no "RLS policy").
> 2. **Completed work only** — finished things, not a live play-by-play (in-progress lives in the HUD).
> 3. **Keep the record** — "problem → fix → result" as a set, so it's traceable later.

Example: "login was a bit loose (problem) → I locked it down (fix) → it's fine now (result)."
