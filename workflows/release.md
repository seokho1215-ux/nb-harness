---
required_artifacts: evidence, review, brief
---

# Workflow: release

**When NB selects it:** publishing or deploying. (strength: full + the release-readiness gate)

**Command surface:** `/nb:status` (read the harness score) → `/nb:security` (if shipping code) → run the deploy/publish command.

**Agents:** code-reviewer + security agents as needed.

**Skills / gates:** release-readiness, security-gate, self-check. The **harness score must clear**.

**Expected artifacts:** a passing harness score, an up-to-date brief, an open-risks list, a security sign-off if code is shipping.

**Minimum evidence:** plan + intent + evidence + review + brief all present (harness score), no unapproved risky actions, no unresolved Critical/High.

**Exit criteria:** harness score READY, risks acknowledged by the human, deploy/publish run with approval.

**Escalate when:** the score is NOT READY → **STOP**; go back to the workflow that's missing evidence/review (`standard-feature`, `bugfix`, `security-sensitive`, …).
