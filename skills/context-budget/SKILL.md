---
name: context-budget
description: Keep tasks small and context honest. Use when a task looks large, spans many files, or risks pulling in hidden context — split it so one session stays within ~40% of the model window.
---

# context-budget — skill

NB inherits the 40% context rule: one task should fit in ≤ ~40% of the model window. This skill fires when a task is at risk of bloat.

- Estimate the input: source excerpts + the design contract (`02-module.md`) + the task body.
- If it would exceed ~40% of the window, **split the task** before implementing (planner's job).
- Don't pull whole files when an excerpt will do; don't carry context the task doesn't need.

Bloated tasks lose the thread and hide risk. Small tasks + a shared contract keep work consistent across sessions.
