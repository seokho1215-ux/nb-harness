# Fake-done firewall (NB's kick)

**NB does not just ask before risky actions. It also blocks false completion claims.**

AI coding agents say "done" as part of their output pattern — whether or not the work is actually
finished or verified. NB's completion firewall (`/nb:close`) refuses to let "done" through unless the
evidence for *this* task is actually there.

## Run it
```bash
node examples/fake-done-firewall/demo.mjs
```
It writes only to a temp dir and cleans up. You'll see:

- **Scene 1** — the AI claims "done" with intent locked but no evidence recorded → `/nb:close` →
  **NOT READY**, exit `1`. "Done" does not get through.
- **Scene 2** — real evidence (test output) + review + brief recorded for this task → `/nb:close` →
  **READY**, exit `0`. Now "done" is backed by proof.

## Why it matters
The firewall checks the artifacts against the **current task**, so it also catches **stale** evidence —
an older task's files can't be reused to wave a new task through. Missing or stale evidence is an
objective hard block (exit `1`); open risks are surfaced for **your** sign-off (NB never auto-closes
over a risk).

This is the engine behind `/nb:close` and the `NB Harness Score` — see
[`../../docs/PORTABILITY.md`](../../docs/PORTABILITY.md) (Core rules: `evidence_ledger`, `harness_score`,
`done_claim_firewall`) and the worked artifacts in [`../sample-run/`](../sample-run/).
