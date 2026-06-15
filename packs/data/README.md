# Data Pack

**Unique close-proof:** a data change is "done" only when it is **reversible and loses no data** — proven, not claimed.

Migrations and schema edits are the highest-blast-radius changes an AI makes, and "the migration ran" is not
the same as "the migration is safe." The Data Pack's `close_contract` requires:

- **objective `migration-up`** (full) — the forward migration actually ran (reconciled against the tool log).
- **objective `migration-down`** (full) — the **rollback** actually ran. A migration you can't undo is not done.
- **analytical `rollback-safety`** (full) — a cross-family review whose `covers_claims` resolve `reversible`
  and `no-data-loss` against that evidence.

The Core **`data` category floor** (full strength) fires independently on any migration/schema/`.sql` change,
so even an undeclared data change still requires acknowledgment. Destructive migrations (drop/truncate) need
an explicit approval.

> Status: `experimental` — the close_contract ships and runs through `/nb:close`; the declared agent/skills/
> workflow are not yet implemented.
