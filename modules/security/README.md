# Security Module — NB's standout differentiator

> Manifest: `nb-module.yaml`. Agents: `../../agents/red-team.md`, `../../agents/blue-team.md`.
> Execution safety pins: `attack-gate.md` — read it before any real attack.

The security stage is what NB does that a single-family tool structurally can't:
**heterogeneous cross-family + verify AND attack + two attack rounds with roles swapped.**

## Why a separate security stage
Vibe-coding failures are usually not logic errors — they're **structural**: a whole security layer is missing, because the AI does what it's told and skips the "unspoken security assumptions". Standard code review misses it (the code looks "correct"). So security is its own stage, not a checkbox inside implement. (Incident data + sources: top-level `README.md`.)

## Scope — code/config level only (3 layers)

### Layer 1 — surface (one spot in the code; verify is enough)
- secrets exposed (hardcoded keys, client/git exposure)
- input validation (injection, XSS)
- error handling leaks (stack traces, sensitive logging)

### Layer 2 — config (deploy/env; verify + light attack)
- DB access control (row-level rules / permissions) ← the #1 real-world incident
- dependency vulnerabilities

### Layer 3 — structure (multiple spots + compare to the design; ATTACK is the point) ★
- auth consistency (checked here, not there)
- authorization bypass (BOLA / IDOR — put someone else's id, get in)
- trust-boundary violations
→ a single AI is weak here. Only cross-check + attack catches it = NB's edge.

### Out of scope (not code — NB doesn't claim it)
monitoring systems, firewall / DDoS, server hardening.
Rule of thumb: "if an AI can read a file and point at it, it's in scope."

## Verify + attack
- **blue-team (verify):** "is it well-built?" — reads code, reasons.
- **red-team (attack):** "how does it break?" — proves it by hitting it.

Weighting by layer: surface → verify-led; structure → attack-led (verify alone is just a guess).

Why attack catches structural flaws — the BOLA example:
- verify: `/api/user/123` and `/api/user/456` each look fine line by line → "no problem?"
- attack: log in as me → call `/api/user/456` (not mine) → someone else's data comes back → confirmed.
→ you have to hit it to see it.

## Cross-family, two rounds (the core)
- **Round 1:** family A attacks / family B defends
- **Round 2:** family B attacks / family A defends (roles swap)
→ 4 viewpoints. Each model imagines different attacks.

**Why the swap is decisive:** the *attacker's* mind sets the attack angle; the defender only reacts. If only A attacks, only A's angles surface — B's attack scenarios never come out. So *both* must attack. "Two rounds" isn't "do it twice" — it's "pull out both models' attack imagination." This only means anything with heterogeneous models (same model twice = same mind = same angle).

The builder never reviews their own work — whoever implemented sits out (objectivity).

**Two rounds = the default** (security is "breached = over", so the default is safe). The AI drops to 1 round only for clearly light work (`core/strength.md`) — never for floor-level work.

## One family only — graceful degrade (don't block)
If only one family is available, the edge (heterogeneous cross) is gone. Degrade, don't refuse: split agents by perspective — OWASP item + attacker type (external / insider / bot) + the 3 layers above. Coverage stays broad; the root blind spot is shared (same mind). State it plainly:

> "Two families is strongest. One family still checks by splitting perspectives, but it's not the same as a genuine cross between different AIs."

The rest of NB (stages, self-check, the 3-layer scope) works fine on one family.

## Enforced, not just prompted (the report contract)
The two-round role swap is **machine-checked**, so it can't quietly degrade to a single prompt. The gate
writes `.nb/reviews/<task>.security-report.json` and `/nb:close` runs `scripts/security-report-check.mjs`
over it as the security pack's **objective proof** (`security-report-check`, strength `full`). The checker
requires: a valid `mode`, round 2 swaps roles (round-2 attacker = round-1 defender — so **both** families
attack), no unresolved high/critical findings, and — for single-family runs — an explicit
`degraded_single_family: true` + reason. Malformed/unreadable reports or a leaked secret fail **closed**
(exit 2). Template + field contract: [`../../examples/security-gate-flow.md`](../../examples/security-gate-flow.md).

## Execution modes (strength, not product tiers) — see `attack-gate.md`
- **Analysis** — read & analyze risks, no attack. Lightest, the default.
- **Red-Team Sim** — generate attack scenarios (BOLA/IDOR/priv-escalation), no real hit.
- **Sandbox Attack** — real attack on an owned COPY only. Strongest; `requires_approval`.

The AI picks the mode by risk (`core/strength.md`); the user can override in words. The three are not separate product versions — they're strength levels of the same layer.
