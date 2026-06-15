# Extending NB

NB is meant to grow without bloating. Add depth only when it has a real job.

## When do I add a workflow, skill, agent, module, or pack?

NB grows in six shapes. Pick by **what the thing changes**, not by what's easiest to write:

| If it… | Make a… |
|---|---|
| changes **every task** (intent, evidence, review, state, judgment) | **Core** rule |
| changes the **task flow** for some kind of work | **Workflow** |
| adds **automatic intervention** (a rule that fires on its own) | **Skill** |
| adds a **worker role** that does a job | **Agent** |
| adds a **pipeline capability** with a manifest (design / implement / security) | **Module** |
| adds a **domain capability bundle** (product, frontend, testing, …) | **Pack** |

The first five extend NB's root surface and should stay small — see *No vanity agents/skills*. Domain
depth belongs in a **Pack**, which bundles its own agents/skills/workflows but stays subordinate to Core.
When in doubt between an agent and a pack: a single new worker role is an agent; a *domain's worth* of
roles + skills + flow is a pack. When in doubt between a module and a pack: a module is one pipeline
stage with a manifest; a pack is a domain that may bundle several stages, skills, and workflows.

## Scaffolders (fastest)
```bash
node scripts/scaffold-workflow.mjs <name>
node scripts/scaffold-skill.mjs <name>
node scripts/scaffold-module.mjs <name>
node scripts/scaffold-preset.mjs <name>
```
Each creates a minimal valid file and prints the validator to run next. They refuse to overwrite without `--force`.

## Add a workflow
1. Create `workflows/<name>.md` with: when NB selects it, command surface, agents, skills/gates, expected artifacts, minimum evidence, exit criteria, escalation.
2. Add the intent → workflow row in `core/strength.md` (and the README table).
3. `node scripts/validate-workflows.mjs` must pass.

## Add / apply a preset (gate profile)
Create `presets/<name>.yaml` with: `id`, `name`, `description`, `default_workflow_bias`, `review_strictness`, `evidence_strictness`, `security_strictness` (`floor`|`floor+module`|`high`|`max`), `cross_family_required`, `human_brief_depth` (`short`|`standard`|`detailed`). Presets are opt-in; the default stays automatic.

Validate the shape:
```
node scripts/validate-presets.mjs        # FAILS on a bad enum / unknown field / id↔filename mismatch
```

Apply a preset so `/nb:close` + harness-score actually honor it:
```
node scripts/apply-preset.mjs <id>            # records the profile's gates into .nb/state.json
node scripts/apply-preset.mjs <id> --dry-run  # preview; writes nothing
node scripts/apply-preset.mjs --clear         # remove it (the safety floor still holds)
```

**Raise-only — a preset can only tighten the firewall, never loosen it.** Applying records the profile's gates as *minimums*; close/score `union` the required artifacts and `max` the strength against the safety floor. So:
- `review_strictness: high` → `review` required on **every** workflow; `evidence_strictness: high` → `evidence`; `human_brief_depth: detailed` → `brief`. `medium`/`low`/`short` add nothing (they can't remove a gate the workflow or floor already requires).
- `security_strictness: high`/`max` → minimum strength `full`; `floor+module` → `standard`; `floor` → no raise.
- `cross_family_required` and `default_workflow_bias` are recorded (the AI leans on them) — a bias, never a floor drop.

`presets/full.yaml` is a different kind (a *pipeline* preset: design→implement→security), not a gate profile, so `apply-preset` refuses it.

## Add a skill
Create `skills/<name>/SKILL.md` with frontmatter (`name`, `description`). Add it only if it creates **automatic intervention not already covered** — no vanity skills. Point the body at a `core/` SOT.

## Add an agent
Create `agents/<name>.md` with frontmatter (`name`, `description`, `model`, `tools`). Add it only if it has a **real job** not covered by the existing seven. Don't inflate for count.

## Add a module
Create `modules/<id>/nb-module.json` validated against `core/module-manifest.schema.json` (plus a README for the body). Run `node scripts/validate-manifests.mjs`.

## Add a pack
A pack adds **domain capability** while staying subordinate to Core. Full rationale: [`PACKS.md`](PACKS.md).

1. Create `packs/<id>/nb-pack.json` validated against `core/pack-manifest.schema.json`, plus `packs/<id>/README.md`.
2. Set `status` honestly — `scaffold` (manifest + docs, no behavior yet), `experimental` (additions ship, contract may change), or `stable` (additions ship, contract settled).
3. `requires_core` **must** include `intent_lock`, `evidence_ledger`, `harness_score`, and `review_gate` (and should pass through `human_brief`). Produce only known artifact types; request only known permissions/gates; feed only known Harness Score dimensions.
4. Boundary rules: a pack may **stack** stricter discipline on Core (e.g. a human taste check on top of cross-family review); it may **never** remove a Core rule, weaken the safety floor, invent its own artifact/permission/score vocabulary, or keep hidden state (declare `state_updates`).
5. `node scripts/validate-packs.mjs` must pass. Packs are optional — an empty `packs/` passes.

The three sample packs (`packs/product`, `packs/frontend`, `packs/testing`) are scaffolds you can copy.

## When you extend, update the checks
- `scripts/doctor.mjs` — add the new file to `--source` (and `--target` if it installs).
- `scripts/release-check.mjs` — extend if it gates release readiness.
- `scripts/validate-workflows.mjs` — picks up new workflows automatically.
- `scripts/validate-packs.mjs` — picks up new packs automatically.
- Run `node scripts/release-check.mjs` and `claude plugin validate .` before publishing.
