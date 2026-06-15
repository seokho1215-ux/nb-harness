# Frontend Pack

> **Status: scaffold.** The manifest ([`nb-pack.json`](nb-pack.json)) and this README prove the
> architecture. **No behavior is implemented yet** — the agents/skills/workflows below are *planned*,
> not shipped. This pack exists to show how a domain pack stays subordinate to NB Core.

## What it demonstrates
The **Human Taste Check → screenshot evidence → UX drift** path. UI work can pass every test and still
look wrong. This pack makes the evidence a real screenshot and the final gate a human's eye.

## What it will add later (planned)
- **Agent** `ui-implementer` — implements UI changes with a before/after capture step.
- **Skills** `human-taste-check` (stops "done" until a human signs off on the look), `screenshot-evidence` (captures the changed view into `.nb/evidence`).
- **Workflow** `ui-change` — a UI task flow that requires visual evidence, on top of the Core gates.

## How it connects to Core
| Core rule | How this pack uses it |
|---|---|
| **Intent Lock** *(required)* | Records what the UI change should achieve and the `taste_notes` to hold it to. |
| **Evidence Ledger** *(required)* | Stores before/after screenshots + `VERIFY_CMD` output as `evidence`. |
| **Review Gate** *(required)* | `cross_family_plus_human` — Claude + Codex review, then a human taste sign-off. |
| **Harness Score** *(required)* | Feeds `evidence` / `review`. |
| **Risk Receipt** | Records UX drift risks the screenshots surfaced. |
| **Human Brief** *(required)* | Ends in a plain-language brief: what changed visually, what's verified, what's risky. |

**Approvals:** visual sign-off before claiming done.
**Exit:** screenshots captured as evidence, human taste sign-off recorded as a decision, cross-family review PASS.

A passing build is **not** sufficient here — a human confirms the result looks right. The pack adds **no
root agents or skills**; the taste check is a pack skill that stacks on the Core Review Gate.
