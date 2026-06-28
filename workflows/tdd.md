---
required_artifacts: evidence, review, brief
---

# Workflow: tdd

**When NB selects it:** test-driven development — you (or the user) want the test written and seen FAILING before the implementation, then made to pass. Opt-in: name it with `--workflow tdd`. (strength: standard → full)

**Command surface:** `/nb:plan --workflow tdd` → write the failing test → run it (RED) → `/nb:work` (implement) → run it again (GREEN) → `/nb:review`.

**Agents:** planner → implementer (writes the test first, then the code) → code-reviewer (cross-family).

**Skills / gates:** strength-judge, intent-lock, self-check (Gate A + Gate B), the **testing pack** (forced active by this workflow) — its `verify` objective proof captures the GREEN run, and its opt-in **`tdd-red-green`** analytical proof requires the red→green pair: a `red_command` logged as a FAILED test run and a `green_command` logged as a PASSED one, both real test commands reconciled against the tool log. A claimed RED the hook never logged as failing does not pass.

**Expected artifacts:** the failing-then-passing test run captured as evidence, a `tdd-red-green` proof naming the red/green commands, one cross-family review, a brief.

**Minimum evidence:** the test command shown FAILING before the implementation and PASSING after (both in the tool log); `{VERIFY_CMD}` green; review verdict recorded with provenance.

**Exit criteria:** the new/changed test failed first and passes now, `tdd-red-green` proof present and log-reconciled, review PASS (or noted), intent matched, brief generated.

**Escalate when:** the change touches the safety floor (auth/secret/payment/DB/deploy) → `security-sensitive`; a feature spanning multiple tasks → `full-feature`.
