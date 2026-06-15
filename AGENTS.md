# AGENTS.md — NB Harness

> Entry point for every AI collaborator (tool-agnostic source of truth).
> Standard: `AGENTS.md` — auto-loaded by OpenAI Codex, Cursor, GitHub Copilot, Google tools.
> Claude Code reads this too; its `CLAUDE.md` is a thin pointer here.

This file is what any AI collaborator sees first. Tool-specific wrappers (`.claude/`, `.codex/`) only point back here.

---

## 1. What this is

NB Harness = a **low-floor, high-ceiling** AI coding harness. **Low floor:** simple entry, fewer decisions, a plain-language brief, automatic strength judgment. **High ceiling:** structured workflows, presets, an evidence ledger, intent lock, cross-family review, and gates. For vibe builders, solo builders, AI-first developers, and non-developers who want structure without becoming syntax operators. The workflow: **Design → Implement → Review → Security (when risky) → Brief**. Security is one strong module plus a safety floor — not the whole product.

- The user is the **human checkpoint and intent owner.** AI proposes; the user decides. Syntax optional, structure serious.
- No solo AI decisions on anything irreversible or outward-facing.
- NB pins **no stack** — it adapts to the target project through variables (§8).

---

## 2. AI tool stack (recommended adapter pairing — not the identity)

NB Core is tool-agnostic (§7); the tools below are **adapters**, not a hard requirement. Core's discipline runs in any AI app (Generic mode); these adapters automate it. See `docs/PORTABILITY.md`.

**Recommended: Claude (Anthropic) as the build/brief adapter + Codex (OpenAI) as the cross-family reviewer.** Why two families: cross-family review catches blind spots a single family shares (Panickssery, NeurIPS 2024 — same-family self-preference bias).

- **Claude** = build (design, implement) + the plain-language briefing (§6 / `modules/`).
- **Codex** = cross-family review (`codex exec`, read-only sandbox).

Definitions are tool-agnostic; only the **call** differs — Claude via the Task tool, Codex via `codex exec` in bash. The `.md` is the script, the call is the courier (Codex is invoked from bash because a Claude session can't call OpenAI directly — that's normal).

**Single-family fallback:** if only one family is available, the security module *degrades* — it splits agents by perspective (OWASP item / attacker type / 3 layers) instead of true cross-family. Works, but honestly weaker than heterogeneous (stated plainly, never hidden).

---

## 3. The pipeline (Design → Implement → Security)

Stages are **sequential** (causal: no design → no implement). Within a stage, work can run **in parallel**. Routing is **fixed rules, not per-task judgment** — no orchestrator deciding each time.

| Stage | Build | Review direction | Module |
|-------|-------|------------------|--------|
| Design | planner | one-way — Codex verifies | `modules/design` |
| Implement | implementer (new session per task) | one-way — Codex verifies | `modules/implement` |
| Security | red / blue (both families) | **two-way, 2 rounds, roles swap** | `modules/security` |

**Why only security is two-way:** verification has a fixed answer ("built as designed?") → one reviewer is enough. Attack has no fixed answer (it can break anywhere) → the attacker's mind sets the attack angle, so *both* families must attack to surface both imaginations. This only matters with heterogeneous models.

**3-tier design docs** (the contract that makes synergy work):
- `01-architecture.md` — macro structure; the security stage's answer key for structural flaws.
- `02-module.md` — the contract (signatures, types, paths, schema). **Every implement session reads it** → cross-task consistency.
- `03-tasks/` — one task = one session at ≤ 40% of the model's context window. Over 40% → split further.

---

## 4. Strength is auto-judged (no switches)

The AI reads each task and sets **strength / mode / rounds / workflow itself** (the workflow comes from `workflows/`, auto-selected from intent) — light work (UI text, colors) → lighter; risky work (auth, payment, DB, secrets, external API, encryption) → full. The user flips nothing.

**The boundary (pairs with §11.2 in the blueprint):** the AI auto-judges *strength*, but never auto-runs a *risky action*. Anything that reaches outside, attacks, installs, or destroys needs **explicit approval right before it runs** (see each module's `requires_approval` / `safety_gates`).

**Model tier (portable, auto-derived).** Separate from preset (preset = how strict the *gates* are; model tier = how strong a *model* runs each lane). NB **does not name a vendor model** — from the judged strength/workflow/preset it derives a tool-agnostic tier per lane (`fast` < `balanced` < `strong` < `strongest`) plus a family mode (`single` < `cross-family` < `two-family`), persisted as `state.model_policy` (`scripts/lib/model-policy.mjs`; `strength-judge` seeds it, `scripts/model-policy.mjs` re-derives / `--show` / `--degrade`). The adapter maps a tier to a concrete model (the Claude adapter's per-agent table in §5 is one such mapping). **You don't pick a model per task; you only intervene to LOWER one.** Raising a lane is free; lowering a lane below the derived floor needs a `model-degrade` decision — so risky work (`full` / `security-sensitive` / `release`) can't be quietly run on a weak or same-family model. `/nb:close` blocks a missing or below-floor policy.

**Review budget (auto + user-steerable).** A separate axis again — model_policy = which model; review budget = **how many review rounds**. NB derives a floor (`state.review_budget`, `scripts/lib/review-budget.mjs`): `none` < `single` (one review) < `two_round` (two review rounds). docs-only/light → `none`; standard/bugfix/refactor → `single`; a SECURITY context (security-sensitive/release, active security pack, or a security category auth/secret/payment/code-execution/ci-security) → `two_round`; any other risk category (data/deploy/network/mcp/supply-chain/…) forbids `none` (→ `single`). **You steer it in plain language** — "빡쎄게 / full review" → `two_round`; "1회만" → `single`; "넘어가 / 토큰 아껴" → `none` — via `node scripts/review-budget.mjs --intent "<…>"`. **Raising is free; a budget BELOW the risk floor needs a `review-degrade` decision.**
- **`two_round` splits by context (`scripts/lib/security-floor.mjs`):** in a **security** context it's the 2-round red/blue **`security-report-check`** (forced security pack + full); in a **general** context ("빡쎄게" on UI/docs/backend) it's just **two review rounds** (`/nb:close` requires ≥2 review artifacts) — no security report is over-fired.
- **Observed security raises model_policy too — but raised model scrutiny ≠ a security report.** There are two floors (`scripts/lib/security-floor.mjs`): the **model floor is BROAD** (the narrow security categories PLUS `supply-chain`/`deploy`) — it forces `model_policy` to `strongest` + `two-family` (a stronger model + two-family review), nothing more; the **`security-report-check` is forced only by the NARROW floor** (security-sensitive / an active security pack / a security category: auth/secret/payment/code-execution/ci-security). So an `npm install` (supply-chain) or a Dockerfile edit (deploy) gets **more model scrutiny**, but **not** the heavy red/blue security report (those keep their own gates — vetted-deps decision, devops proof). close re-derives both from the OBSERVED diff, so a "standard-feature" task that actually changes an auth file is held to the security model + review.

**Safety floor — can't drop even on "go fast":** auth · payment · DB (schema/query/migration) · secrets/keys/tokens · external API calls · file delete/move · deploy. A fast request never takes these below the minimum gate.

---

## 5. Agents (model fixed per role)

Agents fall into four lanes:
- **Build:** explore → planner → implementer
- **Review:** plan-reviewer, code-reviewer (cross-family, one-way)
- **Security:** red-team, blue-team (cross-family, two rounds with roles swapped)
- **Human:** self-check / grill / status — keeping you in the loop (these are skills & commands, not subagents)

Model routing is baked into the role, not decided each time (saves tokens, stays predictable).

| Agent | Role | Model tier | Family / call |
|-------|------|-----------|---------------|
| `planner` | design → 3-tier docs (read-only) | Opus-class | Claude / Task |
| `plan-reviewer` | verify the design (one-way) | — | Codex / `codex exec` |
| `implementer` | design → code (new session per task) | Sonnet-class | Claude / Task |
| `code-reviewer` | verify the code (one-way) | — | Codex / `codex exec` |
| `red-team` | attack ("how do I break in") | by round | both families |
| `blue-team` | defend ("how do I block it") | by round | both families |
| `explore` | cheap pre-read of the codebase | Haiku-class | Claude / Task |

Whoever built something doesn't review it (objectivity) — the builder sits out the cross-check.

**Agents do not grow per domain — packs do (via skills).** The 7 agents above are fixed. Domain depth lives in
the **14 proof-based packs**: each adds a unique `/nb:close` proof, and some add **pack-scoped skills** at
`packs/<pack>/skills/<skill>/SKILL.md`. Those skills apply ONLY when the pack is active (declared ∪ observed ∪
implied) — they are not loaded for every task. To see which to read for the current task:

```
node scripts/pack-skills.mjs        # lists active-pack SKILL.md paths (or pass --pack <id> ...)
```

Open each printed `SKILL.md` before producing that pack's proof. Same in Native and Generic mode — real file
paths, not an auto-loaded Claude skill. A pack with no scoped skill (e.g. `security`, covered by the core
security gate + `modules/security`) simply lists none.

---

## 6. Verification order (self → cross, cheap first)

Every stage, always:

1. **Self-check (evidence forced)** — did you actually run build/test/lint? Show the output. No "done" claim without evidence. The verify command runs **through `nb-run`** (`scripts/nb-run.mjs`, the trusted execution path) so the run is logged independently (`run_id` + `output_sha256`) and the objective proof `/nb:close` reconciles against is generated from the REAL run — **one path in both Native and Generic mode** (in Native the PostToolUse hook also observes the run; only nb-run auto-writes the proof; see `/nb:work` and `docs/PORTABILITY.md`). Catches the AI's "it works" lie. (Cheap — the model runs its own build.)
2. **Cross-check (Codex)** — quality, blind spots, structural flaws the builder couldn't see. (Costs tokens.)

Self-check is the gatekeeper; only what passes goes to the more expensive cross-check. Size doesn't change the path — evidence scales naturally (small task = one test, big task = several).

> **Honest scope of the firewall.** NB's evidence logs (`.nb/logs/`) are **tamper-evident, not tamper-proof.** `/nb:close` reconciles every "done" against records the AI did not merely narrate — the hook-written tool log **or nb-run's trusted-execution log** (`run_id` + `output_sha256` from the real run), plus a hash-bound cross-family review (artifact body hash == provenance == hook-logged hash). That stops accidental and agentic overclaim; it is **not** a cryptographic attestation system against a malicious user with write access to `.nb/`. Review-coverage ("analytical") proofs are **provenance-bound, not correctness-proven**: NB verifies the review genuinely ran and is unmodified, never that its conclusions are right. `approved_by` on a decision is **accountability friction, not proof a human approved.**

---

## 7. Tool-agnostic infra

SOT lives in tool-neutral places: this `AGENTS.md`, `core/`, `modules/`, `presets/`, `agents/`. Tool wrappers (`.claude/`, `.codex/`) are thin pointers. If any specific tool is deprecated or disappears, the harness survives.

---

## 8. Variables (filled at install)

| Variable | Meaning |
|----------|---------|
| `{PROJECT_ROOT}` | target project root |
| `{WORKSPACE}` | pipeline output folder |
| `{PROJECT_DOCS}` | project docs, if any (referenced, never required) |
| `{VERIFY_CMD}` | verify command (build / test / lint) |
| `{DEPLOY_CMD}` | deploy command |
| `{SECURITY_GATE}` | the project's own security rules |

NB forces no specific stack. The project fills these so the harness drops onto any toolchain.

---

## 9. Install safety

See `core/INSTALL.md`. Never silent-install: **show the plan → user approves → pin the version → prefer local over global.** Separate from strength auto-judge (§4) — install always shows-and-asks. *Enforced (audit P-d):* the PreToolUse hook classifies installs; an **unpinned or global** install is asked-with-remediation (`approval`) or **blocked** (`strict`) — see `core/hook-policy.md`.

---

## 10. Refusal patterns (stop + explain)

Auto-refuse and cite the reason:

- Replace-All / rewriting whole files blindly. *(Enforced, audit M3: PreToolUse asks/blocks `Edit`/`MultiEdit` `replace_all`.)*
- Skipping the design or security gate ("just go fast") on floor-level work (§4).
- Weakening security — skipping auth, disabling access control, plaintext keys.
- Fabricated evidence — "tests passed" with no output to show.
- Exposing raw internals to a non-developer user — endpoints, tokens, JSON dumps, API keys. *(Partly enforced, audit M3: PreToolUse asks/blocks commands that dump secrets/`.env`/keys to output; user-facing text exposure stays AI-discipline.)*

---

*Source of truth for all AI collaborators on NB Harness.*
*Tool-agnostic: even if a specific AI tool disappears, the infra survives here.*
