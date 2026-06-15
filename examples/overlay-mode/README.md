# Overlay mode — NB Core in any AI app

Use NB's discipline **next to whatever AI tool you already use** (ChatGPT, Gemini, Cursor, a local
model, or Claude without the plugin). No `/nb:*` commands, no install — just the five Core steps,
driven by hand with the templates here.

> **What this is (honestly):** a **portable discipline mode**, not full automation. NB does not judge
> strength, route agents, or fire hooks for you here. It gives you the *structure* — the same
> intent → evidence → review → brief → score loop — so AI work stays traceable and hard to overclaim,
> in any tool. For the automated version, use Native mode (the Claude adapter — see the README).

## How to use

1. Copy this folder's templates into your project (e.g. into a `.nb-overlay/` or `docs/nb/` folder).
2. For each task, fill them in **in order**. Each step is a gate: don't move on until its artifact exists.
3. Optionally, record the artifact paths in a small `state.json` and run NB's
   `node scripts/harness-score.mjs` for a READY / NOT READY signal (Core scripts work without the plugin).

## The five steps

| # | Step | Template | Gate |
|---|------|----------|------|
| 1 | **Intent Lock** | [`intent-lock.template.md`](intent-lock.template.md) | Don't start until intent + definition of done + non-goals are written. |
| 2 | **Evidence Ledger** | [`evidence.template.md`](evidence.template.md) | "Done" needs the **real** verify output pasted, not a claim. |
| 3 | **Review Gate** | [`review.template.md`](review.template.md) | A second, separate pass (ideally a different model family) reviews against the intent. Blocking findings stop "done". |
| 4 | **Human Brief** | [`brief.template.md`](brief.template.md) | If you can't explain it plainly, it isn't done. |
| 5 | **Harness Score** | (check) | All four artifacts exist and match this task → READY. |

**The rule, in any mode:** if it cannot be recorded, reviewed, and briefed, it does not belong in NB.

See [`../../docs/PORTABILITY.md`](../../docs/PORTABILITY.md) for the Core / Packs / Adapters model, and
[`../sample-run/`](../sample-run/) for a filled-in example (Native mode, but the artifacts are the same).
