# Upgrading, uninstalling, migrating

NB is conservative about touching an installed project. These flows never overwrite your `AGENTS.md` or merged settings, and never delete your `.nb/` runtime artifacts without explicit action.

## Update
Re-apply NB files from the NB repo into a target. The installer is non-destructive on `AGENTS.md` and `.claude/settings.json`, and leaves `.nb/` runtime artifacts alone.
```bash
node scripts/update.mjs /path/to/project            # dry-run — shows the plan + any cleanup
node scripts/update.mjs /path/to/project --apply --yes
```
`update` also reports (and, with `--apply`, removes) any **leaked NB dev test scripts** — see below.

## Cleanup: leaked `scripts/test-*.mjs` (pre-fix installs)
**Who this affects:** projects installed with an **older `install.mjs`** (before the install-hygiene fix). Those versions copied NB's own dev test scripts — `scripts/test-hooks.mjs`, `scripts/test-harness-score.mjs`, `scripts/test-install-fixtures.mjs` — into your project's `scripts/`.

**Why it matters:** a bare `node --test` (a common verify command) auto-discovers `test-*.mjs` and runs them; `test-install-fixtures.mjs` then **fails** in your project, breaking your own test run. New installs no longer copy these.

**Fix it automatically (safe):**
```bash
node scripts/update.mjs /path/to/project            # scans, removes nothing (remove / conflict / kept)
node scripts/update.mjs /path/to/project --apply --yes   # removes only content-identical leaks
```
`update` removes a `scripts/test-*.mjs` **only when its content is byte-identical (SHA-256) to NB's own original dev test**. A file with the same name but different content — one *you* authored — is reported as a conflict and **left untouched**, never deleted on a name match alone. (A leak from a *different* NB version whose content has since changed also won't match, so it's kept too — remove it manually if needed, see below.)

**Or remove manually** — delete just these from your project's `scripts/` (keep any you wrote yourself):
```
scripts/test-hooks.mjs
scripts/test-harness-score.mjs
scripts/test-install-fixtures.mjs
```

## Uninstall
Lists NB-owned paths. By default it removes nothing. It never removes your `AGENTS.md`, your merged `settings.json`, or `.nb/`.
```bash
node scripts/uninstall.mjs /path/to/project          # dry-run — lists what NB added
node scripts/uninstall.mjs /path/to/project --apply --yes
```
> Limitation (current): precise per-file ownership tracking isn't implemented. `--apply` removes only clearly NB-created files (`AGENTS.nb.md`, `nb.config.json`); shared-name directories (`core/`, `agents/`, …) are **listed for manual removal** so we never delete something you authored. **Archive `.nb/` first** if you want to keep evidence/reviews/briefs.

## Migrate state
Bring an older `.nb/state.json` up to the current shape (adds missing keys from `state.example.json`, keeps your values), then validates.
```bash
node scripts/migrate-state.mjs            # dry-run — shows keys it would add
node scripts/migrate-state.mjs --apply
```
