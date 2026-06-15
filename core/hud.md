# HUD — Status Line (core, low-floor reassurance)

> NB keeps a low floor — a user may not be watching logs. If they can't see "what's happening / what happened", they get anxious. The HUD is the **visual** half; grill-me (`core/grill-me.md`) is the **spoken** half. One pair.

## What it is
A one-line status line that shows, in real time, where the harness is:
- current **stage** (design / implement / security)
- active **agent** (planner / implementer / red-team / ...)
- **context %** (how full the window is)
- **progress** (task N of M)

So the user sees "ah, it's on security now" without reading any logs.

## Why it's in NB (not "too much for a beginner")
This was almost cut as "overkill for a non-developer" — that was backwards. A beginner *can't* read logs, so a visual "is it on security now?" is **more** needed, not less. Judged on value → kept. (A single-status-line HUD: branch / phase / skill / ctx% / agents at a glance.)

## Shape (reference — the implementer fills the exact rendering)
```
[nb] design ▸ planner        ·  ctx 32%  ·  task 1/4
[nb] security ▸ red-team (round 2/2)  ·  ctx 51%  ·  task 4/4
```

## Rules
- One line. Real-time. **Visual only** — narration is grill-me's job (different timing: HUD = in-progress, grill-me = on completion).
- No jargon in what's surfaced (stage/agent names are fine; internal codes are not).
- It reflects state; it never asks for input.
