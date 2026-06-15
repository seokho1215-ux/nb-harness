---
required_artifacts: evidence, review, brief
---

# Workflow: security-sensitive

**When NB selects it:** the task touches the safety floor — auth, payment, DB schema/queries, secrets, external API, file delete, deploy. (strength: full, never lowered)

**Command surface:** `/nb:plan` → `/nb:work` → `/nb:review` → `/nb:security`.

**Agents:** planner → implementer → code-reviewer → red-team + blue-team (cross-family, two rounds).

**Skills / gates:** security-gate, install-safety, self-check, intent-lock. The safety floor cannot be lowered, even on "go fast".

**Expected artifacts:** design docs, code + reviews, a security report (secrets redacted), recorded approvals for any risky action.

**Minimum evidence:** `{SECURITY_GATE}` steps present and in order; review PASS; risky actions explicitly approved; security report produced.

**Exit criteria:** no Critical/High open; approvals recorded; intent matched; brief generated.

**Escalate when:** a real attack is needed → Sandbox Attack mode (owned copy + explicit consent); publishing → `release`.
