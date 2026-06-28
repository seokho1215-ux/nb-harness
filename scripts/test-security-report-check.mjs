#!/usr/bin/env node
// Tests for checkSecurityReport (scripts/security-report-check.mjs) — the two-round cross-family role-swap
// gate, NB's security differentiator made enforceable. Dependency-free.
import { checkSecurityReport, verifyRedblueRuns } from './security-report-check.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

// a valid two-family, role-swapped report (Claude attacks/Codex defends, then Codex attacks/Claude defends)
const base = () => ({
  task: 'add-auth', mode: 'red_team_sim',
  round_1_attacker_family: 'claude', round_1_defender_family: 'codex',
  round_2_attacker_family: 'codex', round_2_defender_family: 'claude',
  findings: [{ id: 'f1', severity: 'medium', title: 'loose session check', round: 1 }],
  defenses: [{ for_finding: 'f1', summary: 'tightened the check' }],
  unresolved_findings: [],
  degraded_single_family: false,
  timestamp: '2026-06-11T00:00:00Z',
});

// 1) valid swapped report passes
check('valid two-family swapped report passes', checkSecurityReport(base()).ok === true);

// 2) missing round 2 fails
{ const r = base(); delete r.round_2_attacker_family; delete r.round_2_defender_family;
  const v = checkSecurityReport(r);
  check('missing round 2 fails', !v.ok && /round_\*_family fields are required|SWAP/.test(v.reasons.join())); }

// 3) same family attacks BOTH rounds fails (no real swap)
{ const r = base(); r.round_2_attacker_family = 'claude'; r.round_2_defender_family = 'codex';
  const v = checkSecurityReport(r);
  check('same family both attack rounds fails', !v.ok && /SWAP/.test(v.reasons.join())); }

// 3b) attacker == defender within a round fails
{ const r = base(); r.round_1_defender_family = 'claude';
  check('attacker==defender in a round fails', checkSecurityReport(r).ok === false); }

// 3c) Codex GATE A — Claude-alias aliasing: claude vs opus are the SAME family, so a "swap" between them is NOT
//     a cross-family swap (it would otherwise pass the swap with ZERO codex runs).
{ const r = { ...base(), round_1_attacker_family: 'claude', round_1_defender_family: 'opus', round_2_attacker_family: 'opus', round_2_defender_family: 'claude' };
  const v = checkSecurityReport(r);
  check('claude/opus alias swap is NOT cross-family (fails)', !v.ok && /different families/.test(v.reasons.join())); }

// 3d) real model IDs canonicalize: `claude-sonnet-4` is still the Claude harness (so a swap vs another claude
//     ID fails), and it needs no codex run; a genuine claude-sonnet-4 vs codex swap is fine.
{ const sameId = { ...base(), round_1_attacker_family: 'claude-sonnet-4', round_1_defender_family: 'opus-4.8', round_2_attacker_family: 'opus-4.8', round_2_defender_family: 'claude-sonnet-4' };
  check('two claude model-IDs are the same family (fails swap)', checkSecurityReport(sameId).ok === false);
  check('claude model-ID needs no codex run', verifyRedblueRuns({ ...base(), round_1_attacker_family: 'claude-sonnet-4', round_2_defender_family: 'claude-sonnet-4' }, new Set(['1:defend', '2:attack'])).ok === true); }

// 4) unresolved high/critical fails
{ const r = base(); r.unresolved_findings = [{ id: 'f9', severity: 'high', title: 'IDOR on /api/user' }];
  const v = checkSecurityReport(r);
  check('unresolved high/critical fails', !v.ok && /unresolved high/.test(v.reasons.join())); }

// 4b) unresolved low/medium is allowed (not a hard block) — f3 IS a real finding, carried open at low sev
{ const r = base(); r.findings = [{ id: 'f1', severity: 'medium', title: 'loose session' }, { id: 'f3', severity: 'low', title: 'verbose log' }];
  r.defenses = [{ for_finding: 'f1', summary: 'tightened' }]; r.unresolved_findings = [{ id: 'f3', severity: 'low' }];
  check('unresolved low is allowed', checkSecurityReport(r).ok === true); }

// 5) single-family degraded passes ONLY with explicit degraded marker + reason
{ const sameFam = { ...base(), round_1_attacker_family: 'claude', round_1_defender_family: 'claude', round_2_attacker_family: 'claude', round_2_defender_family: 'claude' };
  // without the degraded marker -> fails (looks like a broken cross-family report)
  check('single-family WITHOUT degraded marker fails', checkSecurityReport(sameFam).ok === false);
  // with degraded + reason -> passes
  const degraded = { ...sameFam, degraded_single_family: true, degraded_limitations_acknowledged: true, degraded_reason: 'only Claude available today; split by perspective' };
  check('single-family degraded WITH attestation+reason passes', checkSecurityReport(degraded).ok === true);
  // degraded but no reason -> fails
  check('degraded without reason fails', checkSecurityReport({ ...degraded, degraded_reason: '' }).ok === false);
  // degraded WITHOUT the structured attestation -> fails (the boolean is the real gate, not prose length)
  check('degraded without acknowledged boolean fails', checkSecurityReport({ ...degraded, degraded_limitations_acknowledged: false }).ok === false); }

// 5b) finding↔defense matching: an undefended finding not listed unresolved fails
{ const r = base(); r.findings = [{ id: 'f2', severity: 'medium', title: 'open redirect' }]; r.defenses = []; r.unresolved_findings = [];
  const v = checkSecurityReport(r);
  check('undefended finding not in unresolved fails', !v.ok && /no matching defense/.test(v.reasons.join())); }

// 5c) a finding explicitly carried as unresolved (low) without a defense is OK (honest report)
{ const r = base(); r.findings = [{ id: 'f3', severity: 'low', title: 'verbose error' }]; r.defenses = []; r.unresolved_findings = [{ id: 'f3', severity: 'low', title: 'verbose error' }];
  check('unresolved-low finding without defense is accounted-for -> ok', checkSecurityReport(r).ok === true); }

// 5d) THE BYPASS Codex found: a high finding listed unresolved with severity OMITTED must STILL block
//     (severity inherits from the original finding) — not pass.
{ const r = base(); r.findings = [{ id: 'f1', severity: 'high', title: 'high vuln' }]; r.defenses = []; r.unresolved_findings = [{ id: 'f1', title: 'high vuln' }];
  const v = checkSecurityReport(r);
  check('high finding in unresolved w/o severity still blocks (no bypass)', !v.ok && /unresolved high/.test(v.reasons.join())); }

// 5d-2) THE round-3 bypass: a duplicate finding id (high then low) must NOT downgrade the inherited severity
{ const r = base();
  r.findings = [{ id: 'f1', severity: 'high', title: 'high vuln' }, { id: 'f1', severity: 'low', title: 'low dup' }];
  r.defenses = []; r.unresolved_findings = [{ id: 'f1' }];
  const v = checkSecurityReport(r);
  check('duplicate finding id cannot downgrade unresolved severity', !v.ok && /duplicate id/.test(v.reasons.join())); }

// 5d-3) a finding listed as BOTH defended and unresolved fails (contradictory)
{ const r = base();
  r.findings = [{ id: 'f1', severity: 'medium', title: 'x' }];
  r.defenses = [{ for_finding: 'f1', summary: 'fixed' }]; r.unresolved_findings = [{ id: 'f1', severity: 'medium' }];
  const v = checkSecurityReport(r);
  check('finding in both defended and unresolved fails', !v.ok && /BOTH defended and unresolved/.test(v.reasons.join())); }

// 5e) finding without an id fails (can't be matched/accounted)
{ const r = base(); r.findings = [{ severity: 'medium', title: 'no id here' }]; r.defenses = []; r.unresolved_findings = [];
  check('finding without id fails', checkSecurityReport(r).ok === false); }

// 5f) unresolved id that references no real finding fails
{ const r = base(); r.unresolved_findings = [{ id: 'ghost', severity: 'low' }];
  check('unresolved id not referencing a finding fails', checkSecurityReport(r).ok === false); }

// 5g) a defense with no summary does NOT count as a defense (finding then unaccounted) -> fails
{ const r = base(); r.findings = [{ id: 'f5', severity: 'medium', title: 'x' }]; r.defenses = [{ for_finding: 'f5' }]; r.unresolved_findings = [];
  const v = checkSecurityReport(r);
  check('defense without summary does not account a finding', !v.ok && /non-empty summary|no matching defense/.test(v.reasons.join())); }

// 5h) a defense for_finding that references no real finding fails
{ const r = base(); r.defenses = [{ for_finding: 'nope', summary: 'x' }, { for_finding: 'f1', summary: 'real' }];
  check('defense for_finding referencing unknown finding fails', checkSecurityReport(r).ok === false); }

// S2-a) THE round-4 bypass: degraded:true while naming TWO families in the round fields (skipped swap) -> FAIL
{ const r = { ...base(), round_2_attacker_family: 'claude', round_2_defender_family: 'codex',
    degraded_single_family: true, degraded_limitations_acknowledged: true, degraded_reason: 'pretend only one family ran' };
  const v = checkSecurityReport(r);
  check('degraded while naming 2 families (skipped swap) fails', !v.ok && /skipped cross-family swap/.test(v.reasons.join())); }

// S2-b) degraded:true but a real cross-family review provably ran (provenance) -> FAIL
{ const r = { mode: 'analysis', degraded_single_family: true, degraded_limitations_acknowledged: true, degraded_reason: 'only claude today',
    findings: [], defenses: [], unresolved_findings: [] };
  check('degraded ok when no cross-family review ran', checkSecurityReport(r, { crossFamilyReviewRan: false }).ok === true);
  check('degraded BLOCKED when a cross-family review ran', checkSecurityReport(r, { crossFamilyReviewRan: true }).ok === false); }

// S2-c) hygiene: duplicate defense for_finding / duplicate unresolved id / bad id chars -> FAIL
{ const r = base(); r.defenses = [{ for_finding: 'f1', summary: 'a' }, { for_finding: 'f1', summary: 'b' }];
  check('duplicate defense for_finding fails', checkSecurityReport(r).ok === false); }
{ const r = base(); r.findings = [{ id: 'f1', severity: 'low' }]; r.defenses = []; r.unresolved_findings = [{ id: 'f1' }, { id: 'f1' }];
  check('duplicate unresolved id fails', checkSecurityReport(r).ok === false); }
{ const r = base(); r.findings = [{ id: 'f 1', severity: 'low' }]; r.defenses = []; r.unresolved_findings = [{ id: 'f 1' }];
  check('finding id with space fails', checkSecurityReport(r).ok === false); }

// 6) bad mode fails
check('invalid mode fails', checkSecurityReport({ ...base(), mode: 'pentest' }).ok === false);

// 7) findings/unresolved must be arrays
check('non-array findings fails', checkSecurityReport({ ...base(), findings: 'none' }).ok === false);
check('missing unresolved_findings fails', checkSecurityReport((() => { const r = base(); delete r.unresolved_findings; return r; })()).ok === false);

// C1) verifyRedblueRuns — a non-Claude (codex) family claim must be backed by a real logged codex run for that
//     round+role; otherwise the "two families attacked" claim is just typed strings.
{ const r = base(); // claude attacks r1 / codex defends r1; codex attacks r2 / claude defends r2
  check('redblue: codex claims with NO runs -> FAIL', verifyRedblueRuns(r, new Set()).ok === false);
  check('redblue: codex claims WITH matching runs -> OK', verifyRedblueRuns(r, new Set(['1:defend', '2:attack'])).ok === true);
  check('redblue: partial codex runs -> FAIL', verifyRedblueRuns(r, new Set(['1:defend'])).ok === false);
  const deg = { ...base(), round_1_attacker_family: 'claude', round_1_defender_family: 'claude', round_2_attacker_family: 'claude', round_2_defender_family: 'claude', degraded_single_family: true };
  check('redblue: degraded single-family needs no codex run', verifyRedblueRuns(deg, new Set()).ok === true);
  check('redblue: all-claude families need no codex run', verifyRedblueRuns({ ...base(), round_1_defender_family: 'claude', round_2_attacker_family: 'claude' }, new Set()).ok === true);
  // a family other than claude/codex (e.g. gemini) still needs a logged run -> FAIL without one
  check('redblue: a non-claude family (gemini) also needs a real run', verifyRedblueRuns({ ...base(), round_1_defender_family: 'gemini', round_2_attacker_family: 'gemini' }, new Set()).ok === false);
  // Codex GATE F: a DEGRADED report that names codex (codex-only single-family) must still prove codex ran.
  const degCodex = { mode: 'analysis', degraded_single_family: true, degraded_limitations_acknowledged: true, degraded_reason: 'only codex ran today',
    round_1_attacker_family: 'codex', round_1_defender_family: 'codex', round_2_attacker_family: 'codex', round_2_defender_family: 'codex',
    findings: [], defenses: [], unresolved_findings: [] };
  check('redblue: degraded codex-only with NO run -> FAIL', verifyRedblueRuns(degCodex, new Set()).ok === false); }

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
