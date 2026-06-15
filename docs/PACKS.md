# NB Core + Packs

> **NB Core stays small and portable. Packs add domain capability without weakening the control layer.**

NB grows by **packs**, not by piling more agents and skills into the root. This keeps the entry simple
and the ceiling high: a small, stable Core you can run anywhere, plus optional domain packs you add only
when your work needs them.

> **Every pack must pass through Intent Lock, Evidence Ledger, Review Gate, Harness Score, and Human Brief.**
> **If it cannot be recorded, reviewed, and briefed, it does not belong in NB.**

---

## Why packs instead of many root agents/skills

A common way to show breadth is a large catalog of agents and skills — frontend, backend, docs, testing,
PM, research, deployment, and so on. That's a valid shape, but it makes the *control surface* grow with
the *capability surface*: more workers, more entry points, more ways for a session to drift or overclaim.

NB separates the two:

- **Core is the control surface.** It is small, fixed, and portable. It does not grow when you take on a
  new domain.
- **Packs are the capability surface.** Domain depth lives in packs that sit *on top of* Core and obey
  its rules. Add a pack and you get more capability; you do **not** get a weaker control layer.

The value NB defends is not "more agents." It is that **any AI work stays attached to intent, evidence,
review, state, and human judgment.** Packs are how we add capability while keeping that promise intact.

---

## Core vs Pack boundary

**NB Core** is a portable AI coding control layer. It is the part that travels and never bends:

| Core rule | What it guarantees |
|---|---|
| **Intent Lock** | The agreed intent, definition-of-done, and non-goals are recorded before work starts. |
| **Intent Drift Report** | Work that moves away from the locked intent is surfaced, not silently absorbed. |
| **Evidence Ledger** | What happened is recorded as artifacts in `.nb/`, not asserted in chat. |
| **Harness Score** | A task-aware readiness signal (plan/intent/evidence/review/brief/risks). |
| **Done Claim Firewall** | "Done" cannot be claimed without the evidence/review/brief for *this* task. |
| **Risk Receipt** | Open risks are written down and carried, not dropped. |
| **Install Safety** | Dependencies follow show-plan → approve → pin → prefer-local. |
| **Self-Check** | Each stage verifies its own result (shown `VERIFY_CMD` output, not a claim). |
| **Review Gate** | Changes are reviewed before done — cross-family by default. |
| **State Machine** | `.nb/state.json` is the single source of truth for mode/task/gates/risks. |
| **Artifact Registry** | The artifact ledger matches every artifact to a task and ages stale ones out. |
| **Human Brief** | Every pack's work ends in a plain-language brief — what changed, what's verified, what's risky. |

**A Pack** is an NB-native domain module. It may add pack-scoped **agents, skills, workflows, templates,
validators, and examples** — but it cannot touch the Core rules above except to *depend on* them.

The boundary, stated plainly:

- Core decides **how all work behaves** (intent, evidence, review, state, judgment).
- A Pack decides **how one domain's work flows** (what to build, what evidence the domain needs, which
  extra gate applies).
- A Pack can **stack** discipline on top of Core (e.g. a human taste sign-off after cross-family review).
  It can **never remove or weaken** a Core rule or the safety floor.

If a capability would change *all* work, it belongs in Core — not a pack. (See the decision rule in
[`EXTENDING.md`](EXTENDING.md).)

---

## Two ways to use Core

Core is usable on its own or inside the full harness. (For the full Core / Packs / **Adapters** model —
how a tool like Claude Code wires in — see [`PORTABILITY.md`](PORTABILITY.md).)

### Overlay Mode (a.k.a. Generic mode) — attach Core to what you already have
Use NB Core *next to* an existing AI coding setup or your own personal harness. You keep your tools and
workflow; Core adds the control layer: lock the intent, capture evidence, run a review gate, track state,
and refuse to overclaim done. Nothing about your stack has to change — Core overlays on top.

Reach for Overlay Mode when you already have a way of working and want the **discipline** without
adopting the whole harness.

### Native Mode — Core inside full NB Harness
Run Core inside NB itself, with the full machinery around it: workflows, hooks, validators, presets,
state, and **packs**. This is the high-ceiling path — the Core rules are enforced by the harness, and
domain packs plug in cleanly.

Reach for Native Mode when you want NB to drive the whole `intent → workflow → execution → evidence →
review → brief → done/blocked` loop.

> Packs are a **Native Mode** feature. In Overlay Mode you get Core's rules; packs assume the full
> harness (workflows, state, validators) to plug into.

---

## Pack lifecycle

A pack moves through three honest states, declared in its manifest's `status` field:

1. **`scaffold`** — the manifest (`nb-pack.json`) and README exist and pass `validate-packs`, proving the
   pack obeys Core. Behavior is **not** implemented yet; the declared additions are intent, not files.
   *(The three sample packs in `packs/` are scaffolds.)*
2. **`experimental`** — some declared agents/skills/workflows ship and run, but the pack's contract may
   still change. Usable, with churn expected.
3. **`stable`** — the declared additions ship and the contract is settled.

Promotion is the work: scaffold → experimental → stable means building the declared additions, keeping
every Core dependency satisfied, and keeping `validate-packs` green.

---

## Pack manifest shape

Every pack ships `packs/<id>/nb-pack.json`, validated against
[`../core/pack-manifest.schema.json`](../core/pack-manifest.schema.json). Required fields:

| Field | Meaning |
|---|---|
| `id` | Pack identifier; **must match the folder name**. |
| `name` · `description` · `domain` | Human label, one-line summary, single-word domain. |
| `status` | `scaffold` / `experimental` / `stable` (maturity marker). |
| `requires_core` | Core rules the pack depends on (snake_case ids). **Must include `intent_lock`, `evidence_ledger`, `review_gate`, `harness_score`** (and should pass through `human_brief`). |
| `adds_agents` · `adds_skills` · `adds_workflows` | Pack-scoped additions (declared intent for scaffolds). |
| `produces_artifacts` | Artifact-ledger types it writes (`intent`/`evidence`/`review`/`brief`/`decision`/`session`/`log`). |
| `evidence_required` | What evidence must exist before its work is done. (Non-empty.) |
| `review_gate` | `cross_family` / `cross_family_plus_human` / `single_family` / `human_required`. |
| `approvals_required` | User approvals the pack may require (may be empty). |
| `state_updates` | `.nb/state.json` fields it reads/writes. |
| `harness_score_contribution` | `{ dimensions, note }` — which score dimensions it feeds. |
| `install_deps` | Dependencies (trigger Install Safety if non-empty). |
| `permissions` | `read`/`write`/`network`/`exec`/`install`. |
| `safety_gates` | Core gates that apply (cannot weaken the floor). |
| `exit_criteria` | What marks the pack's work complete. (Non-empty.) |

A minimal honest scaffold: see [`../packs/product/nb-pack.json`](../packs/product/nb-pack.json).

---

## Pack validation

`scripts/validate-packs.mjs` is dependency-free and enforces the contract. It:

- finds every `packs/*/nb-pack.json`;
- checks all required fields are present and correctly typed;
- ensures the pack `id` matches its folder name;
- ensures `requires_core` includes **`intent_lock`, `evidence_ledger`, `review_gate`, `harness_score`**;
- ensures `produces_artifacts` uses only known artifact types;
- ensures `permissions`, `safety_gates`, and `review_gate` use only known values;
- ensures `harness_score_contribution` feeds only known score dimensions;
- ensures `evidence_required` and `exit_criteria` are non-empty, and the folder has a README;
- exits **non-zero** on any invalid pack.

```bash
node scripts/validate-packs.mjs
```

It also runs inside `node scripts/doctor.mjs --source`, `node scripts/release-check.mjs`, and CI.
**Packs are optional** — an absent or empty `packs/` passes.

---

## How a pack stays subordinate to Core

This is the whole point, so it's worth stating as rules a pack cannot break:

1. **It rides the four mandatory Core rules.** Without `intent_lock`, `evidence_ledger`, `review_gate`,
   and `harness_score`, `validate-packs` rejects it — and every pack's work still ends in a Human Brief.
2. **It speaks Core's vocabularies.** It produces only known artifact types, requests only known
   permissions/gates, and feeds only known Harness Score dimensions — it cannot invent its own.
3. **It writes to the shared State Machine.** A pack declares the `.nb/state` fields it touches; it keeps
   no hidden state of its own.
4. **It can only add or stack, never weaken.** A pack may add a stricter gate (e.g. a human taste check on
   top of cross-family review). It cannot drop below the safety floor or remove a Core gate.
5. **It must be finishable and briefable.** Non-empty `evidence_required` and `exit_criteria` mean the
   pack's work can always be recorded, reviewed, and briefed — the price of belonging in NB.

The result: you can add as many packs as your domains require, and the control layer stays exactly as
small and exactly as strict as it was with none.

## See also
- [`PORTABILITY.md`](PORTABILITY.md) — the Core / Packs / Adapters model; where packs sit and how tools wire in.
- [`EXTENDING.md`](EXTENDING.md) — when to make a pack vs a workflow/skill/agent, and how.
- [`../packs/README.md`](../packs/README.md) — the packs directory and the three sample scaffolds.
- [`../core/pack-manifest.schema.json`](../core/pack-manifest.schema.json) — the full manifest schema.
