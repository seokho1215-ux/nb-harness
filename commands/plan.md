---
description: Judge task strength, pick the mode and agent lane, and produce a plan plus the safety gates before any code. Use at the start of a new task.
---

# /nb:plan

**When:** starting a new task or feature, before implementing.

**NB does automatically:**
- judges strength + selects the workflow via `node scripts/strength-judge.mjs --task <slug> [--strength light|standard|full] [--workflow <name>] [--packs a,b] [--categories auth,data]` — it persists `strength_level`, `current_workflow`, and any risk-implied packs to `.nb/state.json` (mode `design`), with the **safety floor enforced**: strength can only be RAISED to what the task's risk demands (auth · payment · DB · secrets · external API · delete · deploy), never lowered on "go fast". `validate-state` then requires a judged strength to proceed past plan.
- chooses the agent lane (build / review / security)
- **derives the model tier** (`strength-judge` writes `model_policy` from the judged strength/workflow/preset; re-derive / inspect / lower via `node scripts/model-policy.mjs [--show] [--degrade implement=balanced]`). NB does **not** name a vendor model — it derives a portable tier (`fast`/`balanced`/`strong`/`strongest` + family `single`/`cross-family`/`two-family`) the adapter maps to a real model. **You don't pick a model per task; you only intervene to LOWER one** — a tier below the derived floor needs a `model-degrade` decision (raising is free). `/nb:close` blocks a missing or below-floor policy.
- **seeds the review budget** (`strength-judge` writes `review_budget` from the workflow/risk floor: `none`/`single`/`two_round`). Steer it in plain language — `node scripts/review-budget.mjs --intent "빡쎄게"` (→ `two_round`) / `"1회만"` (→ `single`) / `"넘어가"` (→ `none`). Raising is free; a budget below the risk floor needs a `review-degrade` decision. `/nb:close` enforces it (`single`/`two_round` → `review` required; `two_round` → the 2-round security-report-check).
- captures the **intent lock** via `node scripts/intent-lock.mjs --task <slug> --intent "<outcome>" --dod "<done when…>" [--non-goals "a; b"] [--must-not-change "src/auth/; /\.lock$/"] [--taste "…"]` — persists intent / definition-of-done / non-goals / off-limits patterns to `.nb/state.json` with **deep-shape validation** (rejects stub / one-word placeholders; a guessed intent is not a locked intent). `validate-state` requires a locked intent once implementing, and `/nb:close` **blocks if any `must_not_change` area was actually changed** (unless you accept it via a decision). See `core/intent-lock.md`.
- produces 3-tier design docs (planner) into the workspace — `01-architecture.md` + `02-module.md` + `03-tasks/NN.md` (each task declaring its `## Context Budget`). These must **exist before implement**: `validate-state` blocks a POST_PLAN task whose `pipeline/<slug>/` docs are missing or whose tasks declare no budget (audit P-e/#9 + M2). Override the location with `state.design_docs`.
- lists the safety gates that will apply during implementation

**Your approval:** direction only — you confirm the plan / pick GO. NB never lowers the floor on auth / payment / DB / secrets / external-API / delete / deploy, even if you say "go fast".

**Produces:** design docs in `{WORKSPACE}/pipeline/<feature>/`, updated `.nb/state.json` (mode: `design`; strength, workflow, and implied packs set; intent lock captured).
