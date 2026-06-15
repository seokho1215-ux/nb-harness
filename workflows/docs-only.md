---
required_artifacts: evidence
---

# Workflow: docs-only

**When NB selects it:** documentation or comment changes with no code behavior. (strength: light)

**Command surface:** `/nb:work`.

**Agents:** implementer (or just the main session).

**Skills / gates:** self-check Gate A (read the source you're documenting). No build gate unless docs are built.

**Expected artifacts:** the docs diff.

**Minimum evidence:** links/anchors valid; examples match the current code.

**Exit criteria:** docs accurate and consistent; no code touched.

**Escalate when:** the change edits code or config alongside docs → `light-change` / `standard-feature`.
