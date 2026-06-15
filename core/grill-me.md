# Grill-Me — Human Decision Brief (core, plain-language briefing)

> The **spoken** half of the beginner-reassurance pair (HUD = the visual half, `core/hud.md`).
> Turns the flow + the work record into plain language: "here's what got done."
> (Public-facing name: Human Decision Brief.)

## Three rules (from real beginner use)
1. **No jargon.** Not "BOLA vulnerability" or "row-level-security policy". A beginner doesn't want a glossary — it just makes things harder.
2. **Completed work only.** Not a live play-by-play. Finished things: "this was the issue, this is what I did, this is the result." (In-progress = the HUD shows it visually. Grill-me summarizes what's *done*.)
3. **Always keep the work record — "problem → fix → result" as a set.** Not just "the flow"; what actually happened has to be recorded so it's traceable later.
   e.g. "login was a bit loose (problem) → I locked it down (fix) → it's fine now (result)".

## Examples (zero jargon, completion-based, problem→fix recorded)
```
design done:    "Figured out what to build — scoped it to 3 screens and 1 save feature."
implement done: "Code's written, and it runs when I tried it."
security done:  "Checked the security — login was a bit loose, so I locked it down. It's fine now."
```

> Analogy: a mechanic saying "the belt was worn, I replaced it, runs fine now." No engine theory
> (jargon), no live commentary — just what got done.

## Where it fires
- After each stage completes (design / implement / security).
- After a cross-family review — translate the verdict into the user's language + compress to 1–3 decision points.
- **Not during work** (that's the HUD).

## Note
Separate from any public build-log. Grill-me = real-time per-stage translation; a build-log = an end-of-session record — different timing, different purpose. (NB does not ship a build-log; that was project-specific to the harness's ancestor.)
