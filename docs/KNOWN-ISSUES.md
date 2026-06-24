# Known Issues — NB Classifier False Positives

## Issue 1: Read Pollution — Reads Counted as Task Changes

**Severity:** Medium-low (fail-safe direction; blocks legitimate close but doesn't allow bad close)
**Status:** Open (improvement candidate, separate task)
**Component:** `scripts/lib/activation.mjs`

### Symptom

A pure markdown curation tool (zero auth/security code) was blocked by `/nb:close` with:

```
Active packs: security · Risk categories: auth
Blocking:
 - security: objective proof "security-report-check" missing
 - security: analytical proof "red-blue-covered" missing
 - floor: category "auth" needs a valid acknowledgment
 - model tier below floor (… < strongest; family cross-family < two-family)
 - review budget below floor (single < two_round)
```

Plan · Intent · Evidence · Review · Brief were all satisfied. Setting `task_base_ref` to a clean baseline raised `baseline_confidence` to `high`, but **the security/auth classification remained** — even with an empty git diff (no actual changes), security flags persisted.

### Root Cause

`scripts/lib/activation.mjs`:

```js
const files = [...new Set([...logPaths, ...git.files])];
const categories = detectCategories(changes);
const execScan = scanContent(root, files); // scans file contents too
```

`logPaths` (paths collected from session tool-event logs) **includes Read/grep access**. When the developer reads NB's own security sources (`security-floor.mjs`, `close-engine.mjs`, `attack-gate.md`, `decision.mjs`, etc.) to debug a close failure, those paths land in `files`, and `detectCategories`/`scanContent` classifies them as auth · security · code-execution → security pack implied + floor raised to `strongest`/`two-round`.

**Read ≠ Write. A read is not a task change.**

Aggravating factor: when NB is **script-installed inside the project** (not plugin-only), the harness's own security sources live inside the repo. Reading them to debug trips NB into self-referential false positives. Plugin-only installs don't have this problem.

Secondary factor: a project whose **content is security-themed** (e.g., docs/fixtures mentioning "security-hardened", "sandbox", "auth") can also trigger `scanContent`/`detectCategories` — common in learning tools and documentation projects.

### Proposed Fixes (pick one or combine)

1. **Exclude reads from `logPaths`:** When collecting paths from PostToolUse logs, include only write-type events (Write/Edit/create/delete, mutating Bash). Pure Read/Grep/query events are not task changes. *(Most direct fix.)*
2. **Exclude harness files from classification:** When the harness is script-installed, exclude the harness's own paths (`core/ scripts/ modules/ packs/ agents/ .claude/` etc.) from the category scan. Only classify the consuming project's changes.
3. **Narrow `scanContent` to executable code:** Don't raise `code-execution`/`auth` from `.md`/`.json`/fixture keyword hits — limit to actual executable code files.

→ Fix 1 is the core. Fixes 2 and 3 add extra false-positive suppression.

### Workaround (no code change required)

- Set a clean baseline commit + `state.task_base_ref` **before** the work session.
- Do harness-internal debugging reads in a **separate session** — keep the task session log clean.
- Or run `/nb:close` in a fresh session that hasn't read harness internals.

---

## Issue 2: "data" Content False Positive — Contracted Pack, No Escape Route

**Severity:** High (false positive → permanently unclosable without lying)
**Status:** Open (improvement candidate, linked to Issue 1 root cause)
**Component:** `scripts/lib/activation.mjs` + pack contract enforcement in `scripts/lib/close-engine.mjs`

### Symptom

A pure Python backtesting/research project (no database, no deployment, no auth) was blocked by `/nb:close`:

```
Active packs: data · Risk categories: data, supply-chain
Blocking:
 - data: objective proof "migration-up" missing
 - data: objective proof "migration-down" missing
 - data: analytical proof "rollback-safety" missing
 - floor: category "data" needs a valid acknowledgment
 - floor: category "supply-chain" needs a valid acknowledgment
 - off-limits files changed (must_not_change): nb.config.json
 - cannot trust the change baseline (no git/base_ref)
 - model tier below floor (… < strongest; family single < two-family)
```

Plan · Intent · Evidence (66 tests + real data) · Brief all satisfied. Project is not a git repo.

### Root Cause

Three compounding causes:

1. **"data" content false positive:** `data_loader.py` filename + content causes `detectCategories`/`scanContent` to classify as **database-type data category**, implying the `data` pack. But this project's "data" = read-only market data fetch, not a database. Same family as Issue 1's content scanner over-reach.

2. **★ New dimension — contracted pack objective proofs have no escape route:** The `data` pack carries `objective_proofs` (`migration-up`/`migration-down`, `rollback-safety`) in its `close_contract`. `close-engine.mjs` §3a enforces: *if an active pack has a contract, objective proofs are mandatory* — even if the pack is implied-only (not declared). The "implied-only packs are covered by the floor" comment in docs does not match the code for contracted packs. And:
   - Objective proofs can only be satisfied by real `nb-run --proof` records.
   - There is no database, so migration/rollback proofs **cannot exist**.
   - Result: **close is structurally impossible without fabricating fake DB proofs** — directly contradicting the firewall's "no false done" principle.

3. **`supply-chain` category:** Triggered by `pip install` (finance-datareader/yfinance/matplotlib) — this is reasonable (install-safety was run); an `ack` decision resolves it. Issues 1 and 2 are the real blockers.

### Why This Is Worse Than Issue 1

- The auth/security false positive (Issue 1) is *in principle* resolvable via ack decisions + producing a security artifact.
- The **data pack objective proofs are not resolvable through any honest path** when the project has no database. A false-positive implication directly causes `permanently unclosable`. The cost of the false positive is higher.

### Proposed Fixes

4. **Tighten "data" category trigger to DB-specific signals:** Replace general "data" / `data_loader` signals with DB-specific signals: migration files, `schema.sql`, ORM models, `ALTER TABLE`, DDL keywords. Market data, CSV files, and analysis pipelines are not databases.

5. **★ Provide an N/A decision path for implied + contracted pack objective proofs:** Or: *implied-only* packs should not force objective proofs — treat them like the floor (ack decision). Current code comment says "implied-only covered by floor" but code enforces objective proofs for contracted packs regardless of implied vs declared (comment/code mismatch). A false-positive implication must not make close permanently impossible.

6. **Research/analysis (no-ship) workflow type:** A lightweight contract set that does not apply DB/deploy/security contracts by default.

### Workaround

The "separate session / baseline commit" workaround from Issue 1 is **weak here** — the false positive is triggered by the project's own legitimate files (`data_loader.py`), not by session log pollution. It reappears in any session.

Honest handling: do not fabricate DB proofs. Record independent evidence (tests passing + real data results + integration report + plain-language brief) and treat as **verified-complete** manually. NB green close is on hold until these issues are fixed.

### One-liner

Same root as Issue 1 (classifier over-detection), but **the contracted pack's objective proofs can't be resolved via a decision, so a false-positive implication directly causes "permanently unclosable"** — the new critical dimension. Priority: Fix 5 (N/A path) ≥ Fix 4 (tighter trigger).

---

## Priority Summary

| Fix | Issue | Impact |
|-----|-------|--------|
| 1 — Exclude reads from logPaths | Issue 1 | Core fix; eliminates the root cause of read pollution |
| 4 — DB-specific "data" trigger | Issue 2 | Prevents market-data/CSV projects from hitting data pack |
| 5 — N/A path for implied+contracted proofs | Issue 2 | Prevents false-positive implication → unclosable |
| 2 — Exclude harness files from classification | Issue 1 | Extra guard for script-install mode |
| 3 — Narrow scanContent to executable code | Both | Reduces content-keyword false positives in docs/fixtures |
| 6 — Research/analysis workflow type | Issue 2 | Lightweight contract set for no-ship research work |
