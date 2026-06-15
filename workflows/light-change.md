---
required_artifacts: evidence
---

# Workflow: light-change

**When NB selects it:** trivial edits with no logic risk — UI text/colors, a config value, a filename, a comment. (strength: light)

**Command surface:** `/nb:work` (often skips a full `/nb:plan`).

**Agents:** implementer. No cross-family review unless requested.

**Skills / gates:** self-check (Gate A read; Gate B verify if a build applies). The safety floor still applies — if the edit turns out to touch a floor area, escalate.

**Expected artifacts:** the diff; an evidence line if a build/test ran.

**Minimum evidence:** it compiles / the page renders (if applicable). For pure text, a visual confirm.

**Exit criteria:** change made, nothing on the safety floor touched, brief optional.

**Escalate when:** the edit actually touches logic, auth, data, or external calls → `standard-feature` or `security-sensitive`.
