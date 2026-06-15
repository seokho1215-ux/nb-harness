# Product Pack

> **Status: scaffold.** The manifest ([`nb-pack.json`](nb-pack.json)) and this README prove the
> architecture. **No behavior is implemented yet** — the agents/skills/workflows below are *planned*,
> not shipped. This pack exists to show how a domain pack stays subordinate to NB Core.

## What it demonstrates
The **Intent Lock → definition-of-done → scope control** path. Product work fails when "done" drifts
from what was agreed. This pack pins intent up front and refuses to call work done until every
acceptance item is checked.

## What it will add later (planned)
- **Agent** `product-scoper` — turns a fuzzy ask into a written `definition_of_done` + `non_goals`.
- **Skills** `definition-of-done` (records the DoD into `.nb/state`), `scope-guard` (flags work drifting past it).
- **Workflow** `product-spec` — a spec-first task flow that still runs every Core gate.

## How it connects to Core
| Core rule | How this pack uses it |
|---|---|
| **Intent Lock** *(required)* | Records `intent_summary`, `definition_of_done`, `non_goals` before work starts. |
| **Intent Drift Report** | Flags any change that moves past the recorded DoD as drift. |
| **Evidence Ledger** *(required)* | Writes an acceptance checklist artifact (`intent` / `decision`). |
| **Review Gate** *(required)* | `cross_family` — plan and result reviewed by Claude + Codex. |
| **Harness Score** *(required)* | Feeds `plan` / `intent` / `review`. |
| **Done Claim Firewall** | "Done" is blocked while any acceptance item is unchecked. |
| **Human Brief** *(required)* | Ends in a plain-language brief: what shipped, what's verified, what scope was deferred. |

**Approvals:** any scope change beyond the recorded `definition_of_done`.
**Exit:** DoD met, every acceptance item checked, no open scope-drift, brief written.

This pack adds **no root agents or skills** — everything is namespaced under the pack and rides Core.
