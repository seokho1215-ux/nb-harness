# Testing Pack

> **Status: scaffold.** The manifest ([`nb-pack.json`](nb-pack.json)) and this README prove the
> architecture. **No behavior is implemented yet** — the agents/skills/workflows below are *planned*,
> not shipped. This pack exists to show how a domain pack stays subordinate to NB Core.

## What it demonstrates
The **Evidence Ledger → verify output → regression guard** path. "Tests pass" is a claim until the
output is captured. This pack records the real `VERIFY_CMD` output and surfaces what's still untested
as a risk rather than letting green hide it.

## What it will add later (planned)
- **Agent** `test-author` — writes/strengthens tests for the change under work.
- **Skills** `verify-capture` (captures full `VERIFY_CMD` output into `.nb/evidence`), `regression-guard` (compares against the prior captured run and flags new failures).
- **Workflow** `test-hardening` — a flow that closes coverage gaps before done, on top of the Core gates.

## How it connects to Core
| Core rule | How this pack uses it |
|---|---|
| **Intent Lock** *(required)* | Ties the captured run to the current task so stale evidence reads as stale. |
| **Evidence Ledger** *(required)* | Stores full `VERIFY_CMD` output + pass/fail counts as `evidence`. |
| **Review Gate** *(required)* | `cross_family` — the new tests and results are cross-reviewed. |
| **Harness Score** *(required)* | Feeds `evidence` / `review` / `risks`. |
| **Done Claim Firewall** | "Done" is blocked while the captured run has a failing test. |
| **Human Brief** *(required)* | Ends in a plain-language brief: what was tested, the pass/fail counts, what regression risk remains. |

**Approvals:** none required (read/run/record only).
**Exit:** `VERIFY_CMD` output captured as evidence, no failing tests in the captured run, regression note in the brief.

The point is **evidence over claims**: this pack never lets "I ran the tests" stand in for the output.
It adds **no root agents or skills** — all additions are namespaced under the pack and ride Core.
