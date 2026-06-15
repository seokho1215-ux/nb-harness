---
required_artifacts: evidence, review, brief
---

# Workflow: standard-feature

**When NB selects it:** a normal feature with some logic but no floor-level risk — a form, a list, a non-sensitive endpoint. (strength: medium → full)

**Command surface:** `/nb:plan` → `/nb:work` → `/nb:review`.

**Agents:** planner → implementer → code-reviewer (cross-family).

**Skills / gates:** strength-judge, intent-lock, self-check (Gate A + Gate B), context-budget.

**Expected artifacts:** 3-tier design docs, code diff, evidence, one cross-family review.

**Minimum evidence:** `{VERIFY_CMD}` output shown; review verdict recorded with provenance.

**Exit criteria:** acceptance criteria met, review PASS (or explicitly noted), intent matched, brief generated.

**Escalate when:** it touches auth/payment/DB/secrets/external → `security-sensitive`; or it grows beyond one task's 40% budget → `full-feature`.
