# Hook Policy Profiles (core)

Low floor by default, high ceiling when you want stronger enforcement. Hooks stay conservative — the default **asks**, it doesn't fight you.

## Profiles (`hooks/profiles/`)
| Profile | Installs (pinned+local) | Installs (unpinned/global) | Destructive | Network | Secrets / env / key | Refusal patterns¹ | Stop requires evidence |
|---|---|---|---|---|---|---|---|
| `advisory` | advise | advise | advise | advise | advise | advise | no |
| `approval` *(default)* | ask | ask (+ pin/local remediation) | ask | ask | ask | ask | no |
| `strict` | ask | **block** | **block** | ask | **block** | **block** | **yes** |

¹ **Refusal patterns** (AGENTS §10, audit M3): a Replace-All / blind whole-file rewrite (`Edit`/`MultiEdit`
with `replace_all`), and a command that dumps raw internals to output (`cat .env`, `printenv`, bare `env`,
`echo $…KEY/TOKEN/SECRET`, reading `.pem`/`.key`). User-facing *text* exposure stays AI-discipline — a hook
can't see assistant output, only tool calls.

**Install pin/local (audit P-d #24):** the hook classifies an install as pinned+local vs unpinned/global
(`npm i pkg` unpinned, `npm i pkg@1.2.3` pinned, `npm ci`/lockfile install pinned, `-g`/`curl|sh`/`brew` global).
An unpinned or global install is denied under `strict` and asked-with-remediation under `approval` — enforcing
"show plan → approve → pin → local" (core/INSTALL.md) rather than only nudging.

**Supply-chain / slopsquatting gate (`scripts/lib/package-risk.mjs`):** on an `npm`/`pip` install the hook does
a LIVE registry **existence** check of each package (separate from pin/local). A registry **404 = a hallucinated
/ slopsquatted name** → `deny` under `strict`, `ask` otherwise. A **brand-new** package (< 30 days) is low-trust
→ `ask` + a decision. A **network/lookup error** can't confirm existence → fails **closed** under `strict`
(`deny`), `ask` under `approval`, `warn` under `advisory` — a flaky network can't wave an unknown package through.
This is a completion-firewall **trigger, not a reputation system**: it blocks the direct vector (404) and routes
the ambiguous (new/unverifiable) to a human. At `/nb:close` a dependency change trips the `supply-chain` Core
category → a vetted-deps **decision** is required (`.nb/decisions/<task>.supply-chain.md`). `NB_HOOK_NO_NETWORK=1`
forces the network half off for offline/CI runs (every offline gate still enforces). `scripts/package-risk-check.mjs`
runs the same check manually. Live-network check needs Node ≥ 18 (global `fetch`); absent → treated as "error".

## Default
**approval** — approval-first, not hostile. `strict` is opt-in for risk-laden work; `advisory` is for trusted, fast loops. `strict` is **not** the default.

## How to select
Set `NB_HOOK_PROFILE=advisory|approval|strict` for the session — the hooks read it (default `approval`). Profiles are conservative guidance + records; they never claim guarantees beyond what a hook can actually do.

- **advisory** → hooks add context but never prompt or block.
- **approval** → risky actions surface an "ask" before running.
- **strict** → destructive / secret-touching actions, an **unpinned-or-global install**, and the **refusal patterns** (Replace-All, raw-internals dump) are denied; a pinned+local install and network still ask; Stop nudges if no evidence was recorded.

## No string execution (runtime invariant)
NB's own runtime — `scripts/`, `.claude/hooks/`, the libs and validators they load — **must never execute
JavaScript from a string**: no `eval(`, `new Function(`/`Function(`, `vm.runIn*`, `runInNewContext`, or
`runInThisContext`. If the harness, a hook, or the `/nb:close` path could eval string code, a crafted
state/proof/manifest could smuggle executable code into the very tool that judges it — the firewall would be
bypassable. This is enforced statically: `scripts/no-eval-check.mjs` scans the runtime tree and **fails
`release-check`** on any hit (docs/examples are not scanned). Current repo: 0 findings. Intentional, reviewed
shell callsites (e.g. `nb-run`, the Windows `codex.cmd` shim) live in an explicit `ALLOWLIST` keyed by exact
file + construct + reason; removing an entry re-fails the scan.

### User projects: a trigger, not a ban
A dangerous sink in the **user's** code is not hard-banned (that would block legitimate work) — it raises a
risk floor. `scripts/lib/exec-detect.mjs` scans changed files for dynamic-execution / unsafe-deserialization /
command-execution sinks across ~20 languages (JS `eval`/`new Function`/`child_process`, Python
`pickle`/`yaml.load`/`subprocess(shell=True)`, PowerShell `iex`, shell `curl|sh`, Java `readObject`, C#
`BinaryFormatter`, C `system`, SQL `EXEC(@sql)`, …). A hit raises the **`code-execution`** category →
**security pack + full strength + a required acknowledgment**, so `/nb:close` stays NOT_READY until a security
proof exists. Docs/data files and binary/large files are skipped (skips are reported, not silently dropped).
This is a completion-firewall trigger, not a full SAST: direct sinks are caught (incl. destructured/chained
`child_process`, `spawn/execFile('sh',['-c'])`, Deno/Bun shell exec, secret-file readers like `cat/grep/gc/
xxd/base64/tee/diff` and redirects `< .env`), while aliasing (`const run=exec`), heavy obfuscation, interactive
editors, and multiline option objects are documented out-of-scope limits (the human checkpoint backstops them).

### CI-workflow detector (`scripts/lib/ci-workflow-scan.mjs`)
A changed `.github/workflows/*.yml` already trips the `deploy` category (devops). A *dangerous* GitHub Actions
pattern raises it harder to **`ci-security`** (full strength + **security** pack implied + a required
acknowledgment). Flagged shapes (GitHub's own hardening / `pull_request_target` guidance): `pull_request_target`
(or `workflow_run`) that checks out/uses the **untrusted PR head** (the "pwn request" — attacker code runs with
repo secrets); `permissions: write-all` or a broad `contents/actions/packages/id-token/…: write`; `secrets:
inherit`; an **unpinned action** (`@v4`/`@main` instead of a full 40-char commit SHA); and an inline `run:`
interpolating **untrusted context** (`${{ github.event.* }}` / `github.head_ref`) = shell injection. Trigger,
not SAST — it routes the documented dangerous shapes to a security review; a hardened workflow stays clean.

### Supply-chain category at close
A dependency change (`package.json`/lockfiles, or an install command in the log) trips the **`supply-chain`**
category → standard floor + a vetted-deps acknowledgment. The live registry-existence check is the
pre-tool-use hook's job (above); this is its close-time half.

### Publish artifact hygiene (`scripts/lib/publish-hygiene.mjs` + `scripts/publish-check.mjs`)
Before an `npm publish` the hook flags the command (ask / **deny** under `strict`) with a pointer to
`node scripts/publish-check.mjs`. publish-check runs `npm pack --dry-run --json` and **STOPS** (exit 1) if the
actual published file list includes a secret / key / `.npmrc` / source map / raw source / internal-notes path,
and warns when the package has no `files` allow-list and no `.npmignore` (so the whole dir would ship). Basis:
npm publish docs + the "VibeGuard" finding (arXiv 2604.01052) that AI-assisted publishes routinely leak `.env`
/ keys. When the list is clean it writes the release pack's `publish-file-list` objective proof (bound to the
real `npm pack` run), which the release pack's `close_contract` requires at full strength — so a real release
can't close as done without a hygiene-checked publish set. Trigger, not SAST: it blocks the clear leaks and
routes the rest to the human.
