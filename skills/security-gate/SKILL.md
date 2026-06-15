---
name: security-gate
description: NB security gate. Use when running the security module — any review / attack / red-team / blue-team / sandbox — or when a task touches a real attack, an external request, or a destructive action. Enforces no auto-run of risky actions, explicit consent, ownership proof, no real payment/mail/API, no destructive ops, and secret redaction.
---

# nb-security-gate — Claude Code wrapper

> Thin wrapper. SOT: `modules/security/attack-gate.md` (the execution pins) + `modules/security/README.md` (the 3-layer + red/blue two-round method).
> **Your first action MUST be `Read` on `modules/security/attack-gate.md`**, then honor every pin before any real attack:
>
> - **explicit_consent** — "really attack? Y/N" before any real attack.
> - **ownership_proof** — only systems you can clone (= own).
> - **no_real_payment / no_destructive** — even on a copy.
> - **result_redaction** — no real secrets/tokens in the report.

Real attacks run only against a copy you own, after explicit consent. The AI auto-judges strength / mode but **never auto-runs a real attack**.
