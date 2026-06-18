# Intent Lock (core)

> NB's **human checkpoint**. You may not write syntax, but you own **intent and taste** — NB captures them up front and checks the result didn't drift.

## What it captures (at planning time)
- **user intent** — what you're actually trying to achieve (the outcome, not the code).
- **non-goals** — what this task is explicitly NOT doing.
- **definition of done** — the concrete "this is finished when…".
- **taste / UX constraints** — how it should feel; conventions to honor.
- **risk tolerance** — how cautious to be (also feeds strength).
- **what must not change** — files / behaviors / contracts that are off-limits.
- **core value** *(optional, product work)* — the *point* of what you're building (the "why / wow"). The planner may not move these out of the first cut without asking or a `scope-change` decision (`core/scope-value.md`). Captured via `--core-value`, with optional `--must-preserve` (experience that can't drop) and `--defer` (items you've OK'd to push later).

Captured into `.nb/state.json`: `intent_summary`, `non_goals`, `definition_of_done`, `taste_notes`, `drift_risks`, and (optional) `core_value`, `must_preserve`, `defer_candidates`.

## What it checks (at self-check and brief time)
- did the result match the **original intent**?
- did **scope drift** — more or less than asked?
- did the AI solve a **different problem** than the one stated?
- did it add **unnecessary complexity**?
- what should the **human inspect** (taste / UX calls only a person can make)?

## Why this is the differentiation
Most harnesses just run tasks. NB preserves the builder's intent and flags drift. The user owns intent and taste; NB protects that across a session — so "it runs" never quietly becomes "it's not what I asked for".

## Rules
- Capture intent **before** implementing (in plan). A guessed intent is not a locked intent — **ask if unclear**, don't assume.
- Keep it short and in the user's own words; no jargon.
- At grill time, report drift **honestly even when the code is otherwise correct**.
