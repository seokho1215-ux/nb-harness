# 🐣 NB Harness (Newbie Harness)

## Who is this for?

🔰 Non-developers → Start here: [examples/first-15-minutes.md](examples/first-15-minutes.md)
⚙️ Developers → Jump to: [Install](#install)

> **A low-floor, high-ceiling, portable AI work harness.** Starts simple — fewer decisions, a plain-language brief, automatic strength judgment — and scales into structured, reviewable, evidence-driven workflows. You decide direction, approval, and stop/go; NB handles strength judgment, planning discipline, agent routing, safety gates, cross-family review, evidence capture, state, and the brief.

**The kick — a completion firewall:** NB doesn't just ask before risky actions; it **blocks false "done" claims.** A task can't be called done until *its own* evidence, review, and brief exist — `/nb:close` enforces it, and rejects another task's stale files. [See it in 10 seconds →](examples/fake-done-firewall/)

> **Honest scope:** NB's evidence logs are **tamper-evident, not tamper-proof.** `/nb:close` prevents accidental and agentic overclaim — it reconciles every "done" against records the AI did not author (a hook-written tool log, a hash-bound cross-family review). It is **not** a cryptographic attestation system against a malicious user with write access to `.nb/`. Analytical (review-coverage) proofs are *provenance-bound* — NB verifies the review genuinely ran and is unmodified — **not** *correctness-proven*; whether the review's conclusions are right is what cross-family review is for.

**Portable by design:** NB **Core** is a tool-agnostic control layer — intent lock, evidence ledger, review gate, harness score, human brief. **Claude Code is the recommended *adapter*, not the product.** Run Core's discipline in any AI app (Generic mode), or add the Claude adapter for the fully automated `/nb:*` flow. See **[Portability](docs/PORTABILITY.md)**.

**Status: 🚧 release candidate** — Core + Claude adapter are in place, real-use smoke tested (install → loop → fixes), and gated by `release-check`. Still early; verify before production use.

For **vibe builders, solo builders, AI-first developers, and non-developers** who want serious structure without becoming syntax operators. NB = nobody_builder = Newbie — that's the origin story, not the ceiling. You own intent and taste; NB handles structure, evidence, and review.

---

## Why NB exists

Vibe-coding failures are usually not logic bugs — they're **structural**: context drifts, dependencies get installed silently, risky changes ship unreviewed, and "it works" gets claimed with no evidence. NB doesn't promise to make those impossible. It **reduces** them by turning the safety steps into automation you don't have to remember.

NB reduces: **drift · overclaiming · silent installs · weak planning · missing verification · unsafe execution · unclear handoff.**

The workflow: **Design → Implement → Review → Security (when risky) → Grill/Brief.** You step in for direction and approval; NB runs the rest.

## What makes it different

- **Low floor.** Strength is auto-judged — no switches. NB makes more of the calls so you face **fewer decisions, not more buttons**. A status line shows what's running; a plain-language brief says what got done, in zero jargon.
- **High ceiling.** Structured workflows, presets, an **evidence ledger**, an **intent lock**, cross-family review, and state/artifacts — depth that scales with the work, not buttons you must flip.
- **Planned and verified.** Every task runs Design → Implement → Review, with evidence before "done" (your `VERIFY_CMD` output, not a claim) and install-safety on dependencies.
- **Heterogeneous cross-check.** Claude *and* Codex review each other. A single-family tool shares its own blind spots; two different families don't.
- **Security when it matters.** One strong module (3 layers + verify/attack, two-round red/blue) plus a safety floor for risky work — not the whole product.

---

## 60-second example

```
you ▸ Add a settings page that saves a display name.
nb  ▸ strength: FULL (writes to storage). lane: build.
nb  ▸ planned → implemented → ran tests (✓ 12 passed, output shown) → cross-family review: PASS.
nb  ▸ not auth/secrets → security: Analysis, clean.
you ▸ /nb:grill
nb  ▸ "Added the settings page, tests pass, one small cleanup, nothing risky left."
```

Two decisions from you (the task, and "go"). NB did the rest — and wrote it all to `.nb/`. Full walk-through: [`examples/first-15-minutes.md`](examples/first-15-minutes.md).

## What the firewall actually does

Real `/nb:close` output. Claim "done" with nothing to show, and it refuses — and tells you exactly what's missing:

```text
✗ NOT READY — cannot close this task as done.
  Blocking:
   - core: evidence missing
   - core: review missing
   - core: brief missing
   - testing: objective proof "verify" missing
```

Do the work — run the real test, capture the output, write the review and brief — and it passes:

```text
✓ READY — plan, intent, task-matched evidence, review, brief, and all active-pack/floor proofs are present.
```

Now try to fake it: write a proof that claims a test command which never actually ran. NB reconciles every
proof against an **independent, hook-written tool log**, so a fabricated "done" is caught:

```text
✗ NOT READY — cannot close this task as done.
  Blocking:
   - testing.verify: command not found in tool log — not observed to actually run (fabrication guard)
```

That's the difference from a checklist: the proof has to match what actually happened. (These are the exact
verdicts from driving a real task through NB — see [`examples/fake-done-firewall/`](examples/fake-done-firewall/).)

## Install

What you need depends on **how** you run NB (full model: [Portability](docs/PORTABILITY.md)):

- **Core / Generic mode** — **Node.js** + Markdown. Run NB's discipline by hand in *any* AI app (ChatGPT, Gemini, Cursor, a local model, or Claude without the plugin). No Claude required. Start with [`examples/overlay-mode/`](examples/overlay-mode/).
- **Claude adapter (recommended)** — **Claude Code**, for the automated `/nb:*` flow below.
- **Cross-family review** — **Codex**, optional but recommended, as the heterogeneous reviewer.

**As a plugin — recommended native adapter.** Commands appear namespaced as `/nb:setup`, `/nb:plan`, …

Load it from a local clone (works today):
```bash
claude --plugin-dir /path/to/nb-harness
```
Or install from the marketplace — `claude plugin marketplace add seokho1215-ux/nb-harness` then `claude plugin install nb@nb-harness`.

**Or script install — fallback.** Copies NB into a project's `.claude/`; commands appear as `/nb-setup` (hyphen, no namespace). The installer shows the plan and writes nothing without `--apply`; even then it asks you to type "yes" (`--yes` skips the confirm — CI only).
```bash
node scripts/install.mjs /path/to/your/project           # dry-run — shows the plan, writes nothing
node scripts/install.mjs /path/to/your/project --apply   # integrate — asks "yes" first
```

Then open `nb.config.json` and fill the variables (`VERIFY_CMD`, `PROJECT_DOCS`, `SECURITY_GATE`, ...). For cross-family review: `npm i -g @openai/codex && codex login` — Codex CLI is the one global tool NB documents (an authenticated CLI used as the reviewer); your project's own dependencies still follow NB's install-safety rule (show the plan, approve, pin, prefer local).

## First 15 Minutes

See **[`examples/first-15-minutes.md`](examples/first-15-minutes.md)** — install → `/nb:setup` → give one task → `/nb:status` + `/nb:grill`. More: [trigger-proof](examples/trigger-proof.md) · [security-gate-flow](examples/security-gate-flow.md) · [cross-review-flow](examples/cross-review-flow.md).

## Architecture

```
You: direction · approval · stop/go
   │
   ▼  commands (small human surface)
   /nb:setup /nb:plan /nb:work /nb:review /nb:security /nb:grill /nb:close /nb:status /nb:doctor
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ NB automation                                                 │
│   hooks   : detect → guide → record (conservative)            │
│   skills  : self-check · strength · install · security · grill │
│                                                               │
│   Build lane      Review lane        Security lane            │
│   explore         plan-reviewer      red-team                 │
│   planner         code-reviewer      blue-team                │
│   implementer     (cross-family)     (cross-family, 2 rounds) │
│                                                               │
│   modules : design → implement → security                     │
│   state + evidence + reviews + briefs → .nb/                  │
└──────────────────────────────────────────────────────────────┘
```

Layers: **commands** (human surface) · **skills** (auto-firing rules) · **agents** (who works) · **modules** (what stage) · **hooks** (detect/record) · **.nb/** (state & artifacts). Tool-neutral SOT lives in `core/`, `agents/`, `modules/`, `presets/`; `.claude/` and `scripts/` are the Claude Code activation layer.

## Commands

| Command | Use it to |
|---------|-----------|
| `/nb:setup` | inspect the repo, init `.nb/` state, run doctor |
| `/nb:plan` | judge strength, pick mode/lane, produce a plan + the gates |
| `/nb:work` | implement under self-check / install / security rules, record evidence |
| `/nb:review` | run the cross-family review with provenance |
| `/nb:security` | run the security gate (Analysis / Red-Team Sim / Sandbox Attack) |
| `/nb:grill` | plain-language brief: what changed, what's verified, what's risky |
| `/nb:close` | **completion firewall** — refuse "done" unless this task's evidence/review/brief exist (not stale) |
| `/nb:status` | summarize current harness state from `.nb/` |
| `/nb:doctor` | validate the install (files, manifests, skills, agents, hooks, scripts) |

## Workflows

NB maps each task to a workflow **automatically** — you don't pick one:

| Intent | Workflow |
|---|---|
| trivial edit | `light-change` |
| normal feature | `standard-feature` |
| multi-task feature | `full-feature` |
| defect | `bugfix` |
| restructure | `refactor` |
| docs only | `docs-only` |
| safety-floor touch | `security-sensitive` |
| publish / deploy | `release` |

The chosen workflow (and why) is recorded in `.nb/state.json`, and it escalates on its own when work outgrows it. Advanced users can override in plain words. Details: [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) · [`workflows/`](workflows/).

## Automation flow

```
your prompt        → UserPromptSubmit: risky-language hints (quick/install/delete/security/sandbox)
a tool runs        → PreToolUse: install/destructive/network → ask  →  PostToolUse: record to .nb/logs
a stage finishes   → self-check (shown VERIFY_CMD output)  →  cross-review (provenance)
you try to finish  → Stop: nudge if mid-task with nothing recorded
context compacts   → PreCompact: write a session summary to .nb/sessions
```

Hooks are **conservative** — they guide and record, they don't hard-enforce. They're no-ops in a project without `.nb/`, and fail open (a hook bug never stalls your session).

## Artifacts & state (`.nb/`)

NB writes what it does into `.nb/` so the harness stays honest (evidence over claims): `state.json` (mode, task, strength, gates, risks), `evidence/`, `reviews/` (with provenance), `briefs/`, `decisions/` (approvals), `sessions/`, `logs/`. Runtime contents are git-ignored, and NB **redacts known secret patterns** (API keys, tokens, DB URLs, Bearer/`password`/`api_key`) from the machine output it writes — tool logs, `nb-run` evidence/proofs, and the attack authorization. It's **tamper-evident, not a guarantee**: a novel secret format, or a secret inside a hash-bound cross-review body, can still slip through — so don't keep real secrets in tracked files. See [`.nb/README.md`](.nb/README.md). On a fresh clone with no `state.json`, NB treats the project as `idle` until `/nb:setup`.

## Safety model

- **Safety floor** — auth · payment · DB · secrets · external API · file delete · deploy can't drop below the minimum gate, even on "go fast".
- **The boundary** — the AI auto-judges *strength/mode*, but **never auto-runs a risky action** (external request, real attack, install, destructive op). Those need explicit approval right before they run.
- **Gates** — self-check (evidence before "done"), install-safety (show → approve → pin → local), security pins (consent, ownership proof, no real payment/API, no destructive, redaction).

NB **reduces** drift, silent installs, unreviewed risky changes, and unverifiable completion claims. It does **not guarantee safety** — you verify before you ship.

## What NB does automatically vs what you decide

| NB does automatically | You decide |
|---|---|
| detection · strength judgment · gate selection · agent routing · cross-review · evidence capture · state tracking · briefing | direction (what to build) · approval (risky actions) · stop/go |

The goal: NB feels powerful because you have **fewer decisions**, not more buttons.

## How NB compares

NB is **not** a speed-first framework and not a clone. Many single-family tools optimize for **speed** within one model family and are excellent at that. NB optimizes for **planned, verified, reviewable** AI coding sessions — via heterogeneous cross-check, gates, and evidence-before-done. Different goals — pick whichever fits your work, or run NB's discipline alongside another workflow.

## Why not more agents?

Big frameworks ship many agents/skills because they optimize for **broad task coverage** — frontend, backend, docs, testing, debugging, research, deployment, PM, design. That's a valid shape.

NB is a different shape: a **control layer** over AI coding work — `intent → workflow → execution → evidence → review → brief → done/blocked`. Its depth isn't agent count; it's the **state machine, workflows, artifact ledger, intent lock, gates, cross-family review, and harness score** — the things that make a session traceable and hard to overclaim. Seven agents are enough because NB's job is control, not covering every task type. **Syntax optional, structure serious.**

## Why packs, not agent count?

Many frameworks show breadth through a large number of agents and skills — a valid shape. NB grows a different way, so capability can expand without the control surface expanding with it:

- **Core stays small and portable.** The control layer — Intent Lock, Evidence Ledger, Review Gate, Harness Score, State Machine, and the rest — is a fixed, stable surface.
- **Domain capability grows through Packs.** A pack (product, frontend, testing, …) adds domain agents/skills/workflows *on top of* Core.
- **Packs are optional and subordinate to Core.** Every pack passes through Intent Lock, Evidence Ledger, Review Gate, Harness Score, and Human Brief. If its work can't be recorded, reviewed, and briefed, it doesn't belong in NB.
- **Simple entry, high ceiling.** You start with a small Core and add only the packs your work needs.

Two ways to run Core:
- **Overlay Mode** — attach NB Core to an existing AI coding setup or your own harness; keep your stack, gain the control layer.
- **Native Mode** — run Core inside full NB Harness with workflows, hooks, packs, validators, and state.

Details: [`docs/PACKS.md`](docs/PACKS.md).

## Not promised

- NB does **not** guarantee a finished app.
- NB does **not** guarantee every vulnerability is removed.
- Before any real deployment, **you verify.**

NB is not a replacement for a developer — it's an operating layer that lowers the risk of solo AI coding. See [`ACCEPTABLE_USE.md`](ACCEPTABLE_USE.md) for the security tooling's use policy.

## The security module (and why it earns a place)

NB is a general harness, but security gets its own module because vibe-coding failures are often *structural* — a whole security layer goes missing when the AI does what it's told and skips unspoken security assumptions. The module runs when work is risky and stays out of the way otherwise. Real incidents show why it earns the spot:

- [1] TechRadar — coverage of an AI-built social app's security exposure (misconfigured DB access).
- [2] NVD — CVE-2025-48757 (access-control flaw, AI app-builder).
- Veracode — *2025 GenAI Code Security Report*.
- OWASP — *Citizen Development Top 10* security risks.

> Specific percentages from mixed reports are intentionally not quoted; figures differ by report. See the sources.

## Learn more
- [Portability](docs/PORTABILITY.md) — Core / Packs / Adapters; Claude Code is an adapter, not the product
- [Capabilities](docs/CAPABILITIES.md) — what NB auto-decides, what you approve, what it refuses
- [Workflows](docs/WORKFLOWS.md) — selection + escalation logic
- [Core + Packs](docs/PACKS.md) — small portable Core, optional domain packs, Overlay vs Native mode
- [Extending](docs/EXTENDING.md) — the five shapes: Core / workflow / skill / agent / pack
- [Sample run](examples/sample-run/) — a finished task with real artifacts (intent, evidence, review, brief, score)

---
*Extracted from a private working harness. MIT licensed. Built for people who decide direction, not syntax.*
