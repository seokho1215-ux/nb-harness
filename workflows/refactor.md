---
required_artifacts: evidence, review, brief
---

# Workflow: refactor

**When NB selects it:** restructuring without changing behavior. (strength: medium → full by blast radius)

**Command surface:** `/nb:plan` → `/nb:work` → `/nb:review`.

**Agents:** explore (map usages) → planner → implementer → code-reviewer.

**Skills / gates:** self-check (behavior must be preserved — tests are the evidence), intent-lock (no scope creep), context-budget.

**Expected artifacts:** a before/after note, the diff, passing tests as evidence.

**Minimum evidence:** the same tests pass before and after; behavior unchanged. `{VERIFY_CMD}` green.

**Exit criteria:** structure improved, behavior identical, no API drift unless intended.

**Escalate when:** behavior must actually change → it's a feature, use `standard-feature` / `full-feature`.
