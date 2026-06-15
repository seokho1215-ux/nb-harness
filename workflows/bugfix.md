---
required_artifacts: evidence, review, brief
---

# Workflow: bugfix

**When NB selects it:** fixing a defect or unexpected behavior. (strength: medium; higher when the cause is unknown)

**Command surface:** `/nb:plan` (root-cause first) → `/nb:work` → `/nb:review`.

**Agents:** explore (locate) → planner (root cause + fix plan) → implementer → code-reviewer.

**Skills / gates:** self-check, intent-lock (don't fix the wrong problem), context-budget.

**Expected artifacts:** a root-cause note, the fix diff, a regression check, evidence.

**Minimum evidence:** the bug reproduced before and gone after — shown, not claimed. `{VERIFY_CMD}` green.

**Exit criteria:** root cause addressed (not just the symptom), no new failures, intent intact.

**Escalate when:** 3+ fix attempts fail → suspect the architecture, stop and surface it; it touches a floor area → `security-sensitive`.
