---
required_artifacts: evidence, review, brief
---

# Workflow: full-feature

**When NB selects it:** a feature spanning multiple tasks, or with cross-cutting structure. (strength: full)

**Command surface:** `/nb:plan` → (`/nb:work` per task) → `/nb:review` per task → `/nb:grill`.

**Agents:** explore → planner → implementer (one session per task) → code-reviewer; security agents if any task is risky.

**Skills / gates:** everything in `standard-feature`, plus the security gate when any task is risky.

**Expected artifacts:** 3-tier docs with multiple tasks, per-task evidence + reviews, a security report if applicable, a final brief.

**Minimum evidence:** every task green on `{VERIFY_CMD}`; every diff reviewed; intent checked at the end.

**Exit criteria:** all tasks complete + reviewed, intent matched, open risks listed, brief generated.

**Escalate when:** publishing or deploying → `release`.
