# Attack Execution Gate (security safety pins)

> Sandbox Attack Mode runs a **real attack**. "A copy + a README warning" is not enough for a
> public tool. These pins are **core, not optional.** They pair with the strength boundary
> (`core/strength.md`): the AI auto-judges strength, but **never auto-runs a real attack.**

## Safe by construction — attack a copy, never the original

```
original app → clone → attack the copy → only the copy breaks (original untouched)
```
= the standard "staging penetration test".

- Risk "I nuked my own DB" → only the copy breaks. ✓
- Risk "attacking someone else's server" → cloning = proof of ownership; you can't clone what isn't yours, so you can't attack it. The structure enforces "your systems only". ✓

## Hard pins (must hold — non-negotiable core) — **code-enforced**
- **explicit_consent** — a human-approved `attack-consent` decision before any real attack. No silent attack.
- **ownership_proof** — ability to clone = ownership; the target must be a registered CLONE, never the original.
- **no_real_payment** — block real payment / mail / external API even on the copy.
- **no_destructive** — no real delete/drop even on the copy.
- **result_redaction** — never put real secrets/tokens in the attack report / authorization.

(These map 1:1 to `safety_gates` in the security `nb-module.json`.)

**Enforcement (audit N8):** the pins are enforced in code, not prose — `scripts/sandbox-attack.mjs` (pure logic
in `scripts/lib/attack-gate.mjs`) is the **gate**: it REFUSES (fail-closed) unless every pin passes, and writes a
redacted `.nb/attack/authorization.<task>.json` only when all five hold. It ships **no exploit code** — it is the
safety interlock the red-team must clear before running a real attack:
```
node scripts/sandbox-attack.mjs --task <slug> --target <host|url> --action "<planned action>" ...
```
Inputs (fail-closed if absent): `.nb/decisions/<slug>.attack-consent.md` (human-approved) · `.nb/attack/ownership.json`
(`{ "is_copy": true, "clone_of": "<source>", "target": "<clone host>" }`) · optional `.nb/attack/allowlist.json`.
Local/clone hosts are always in-scope; any other host needs an explicit allowlist entry.

## Module options (AI auto-tunes — `core/strength.md`)
- allowlist of permitted domains / local addresses
- rate limit (no attack-request floods)

## Honest limits (don't oversell)
- Someone can fork the harness and misuse it — that can't be prevented (open-source nature; same as any knife). Response = an acceptable-use policy + a liability-limitation notice + "your own systems only". This is the standard structure for security tooling (Metasploit, Nmap, Burp).
- Protect good-faith users and state the policy clearly. Exact legal wording → get legal review; avoid hard "the author is not liable" claims (see top-level `README.md` tone).

## Clone difficulty (when implementing Sandbox Attack Mode)
code copy → easy (git clone) · DB copy → medium (snapshot/seed) · env/secrets → tricky (fake keys for the copy) · external APIs → hard (a real payment API on a copy?).

Implementation order follows this: Analysis Mode works first, Sandbox Attack lands later. This is **build-order, not a feature cut** — all three modes are in the design.
