# Security Gate Flow

`/nb:security` (or a task touching auth / secrets / external services) runs the gate.

## 1. Mode picked by risk (auto)
- read-only review → **Analysis** (default, safe)
- "find how it breaks" → **Red-Team Sim** (scenarios, no real hit)
- "actually attack it" → **Sandbox Attack** (real, owned copy only) — needs approval

## 2. Cross-family, two rounds (roles swap)
- **Round 1: Claude attacks / Codex defends**
- **Round 2: Codex attacks / Claude defends** (roles swap — both families' attack imagination surfaces)
- one family only → degrades to a perspective split, and **says so** (weaker than a genuine cross-family swap)

This is not a prompt suggestion — it's **enforced**. The run writes a machine-checkable report and
`/nb:close` requires it to pass `scripts/security-report-check.mjs` (the security pack's objective proof).

## 3. The pins (always, before any real attack)
- **explicit consent** ("really attack? Y/N")
- **ownership proof** (you can only attack a copy you can clone)
- **no real payment / mail / API**, **no destructive ops**, **secrets redacted**

## 4. Output — a machine-checkable report (the enforced contract)
The gate writes `.nb/reviews/<task>.security-report.json` (secrets redacted) and `/nb:close` runs
`node scripts/security-report-check.mjs .nb/reviews/<task>.security-report.json --cross-review .nb/reviews/<task>.cross-review.md`
(exit 0 = the security pack's `security-report-check` objective proof). The `--cross-review` arg lets the
checker reject a single-family **degraded** claim when a real cross-family review provably ran. Contract:

```json
{
  "task": "add-auth",
  "mode": "red_team_sim",                          // analysis | red_team_sim | sandbox_attack
  "round_1_attacker_family": "claude",
  "round_1_defender_family": "codex",
  "round_2_attacker_family": "codex",              // SWAP: round-2 attacker = round-1 defender
  "round_2_defender_family": "claude",
  "findings":   [{ "id": "f1", "severity": "medium", "title": "loose session check", "round": 1 }],
  "defenses":   [{ "for_finding": "f1", "summary": "tightened the check" }],
  "unresolved_findings": [],                        // {id} must reference a finding; high|critical (own or
                                                    //   inherited severity) => check FAILS
  "degraded_single_family": false,                  // true (one family) REQUIRES the two fields below
  "degraded_limitations_acknowledged": false,       // must be true when degraded — explicit "weaker than cross-family"
  "degraded_reason": "",
  "timestamp": "2026-06-11T00:00:00Z"
}
```

The checker fails (non-zero) if round 2 doesn't swap roles, if a family attacks both rounds, if an unresolved
high/critical remains (own or inherited severity), if a finding is unaccounted (no defense and not unresolved)
or listed as both, on duplicate/unknown/badly-formed ids, or if a secret leaked into the report (exit 2 =
fail-closed). **Degraded** (single-family) only passes with `degraded_single_family:true` +
`degraded_limitations_acknowledged:true` + a reason — and is REJECTED if the round fields name ≥2 families or
if a real cross-family review provenance exists (you can't claim single-family when two were available).

Also produced: a recorded decision in `.nb/decisions/`, and `/nb:grill` translates the findings ("login was a
bit loose → blocked → fine now").

The AI auto-judges strength/mode; it **never auto-runs a real attack**.
