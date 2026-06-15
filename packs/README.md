# NB Packs

**NB Core stays small and portable. Packs add domain capability without weakening the control layer.**

A **pack** is an NB-native domain module (product, frontend, testing, …). It can ship pack-scoped
agents, skills, workflows, templates, validators, and examples — but it is **subordinate to Core**.
Every pack passes through **Intent Lock, Evidence Ledger, Review Gate, and Harness Score**. If a pack's
work cannot be recorded, reviewed, and briefed, it does not belong in NB.

Packs are why NB grows **without becoming agent-count soup**: Core is a fixed, portable surface; domain
depth lives in optional packs you add only when your work needs them. Full rationale and lifecycle:
[`../docs/PACKS.md`](../docs/PACKS.md).

## The contract
Every pack ships a `nb-pack.json` validated against [`../core/pack-manifest.schema.json`](../core/pack-manifest.schema.json).
It must declare which Core rules it depends on, the workflows it adds, the artifacts it produces, the
evidence it requires, the review gate it applies, how it updates `.nb/state`, the approvals it may
require, and how it feeds the Harness Score. Run the validator:

```bash
node scripts/validate-packs.mjs
```

(`validate-packs` also runs inside `doctor --source`, `release-check`, and CI. Packs are optional — an
empty `packs/` passes.)

## Sample packs (scaffolds)
These three are **thin, honest scaffolds** — manifest + README only, `status: scaffold`, **no
implemented behavior**. They exist to prove the architecture, each highlighting a different Core rule:

| Pack | Demonstrates | Review gate |
|---|---|---|
| [`product/`](product/) | Intent Lock · definition-of-done · scope control | `cross_family` |
| [`frontend/`](frontend/) | Human Taste Check · screenshot evidence · UX drift | `cross_family_plus_human` |
| [`testing/`](testing/) | Evidence Ledger · verify output · regression guard | `cross_family` |

## Adding a pack
See [`../docs/EXTENDING.md`](../docs/EXTENDING.md) for the decision rule (Core vs Workflow vs Skill vs
Agent vs Pack) and the step-by-step. The short version: a pack is the right shape when you're adding
**domain capability**, not changing how all work behaves.
