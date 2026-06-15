---
name: intent-lock
description: Capture and protect the builder's intent. Use at the start of a task (capture intent / non-goals / definition of done / taste / what-must-not-change) and at completion (check the result didn't drift from the original intent).
---

# intent-lock — skill

> Full rule: `core/intent-lock.md`. **First Read it**, then:
>
> - **At plan:** capture intent, non-goals, definition of done, taste/UX constraints, risk tolerance, and what-must-not-change into `.nb/state.json`. Ask if unclear — don't guess.
> - **At grill / self-check:** check the result against that intent — scope drift? a different problem solved? unnecessary complexity? what should the human inspect?

Report drift honestly even when the code is otherwise correct. The user owns intent and taste; your job is to protect it.
