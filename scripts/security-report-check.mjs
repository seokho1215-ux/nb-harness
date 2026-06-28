#!/usr/bin/env node
// NB security-report checker — turns the security module's *documented* promise ("cross-family, two attack
// rounds with roles swapped") into an ENFORCED, machine-checkable gate. The exit code is meant to be used as
// an objective proof for the security pack's close_contract.
//
// Report = a JSON file (default `.nb/reviews/<task>.security-report.json`) with the contract in §FIELDS below.
// Exit: 0 = OK · 1 = report present but FAILS a rule (structure / role-swap / unresolved high|critical) ·
//       2 = cannot trust (unreadable/malformed JSON, or secrets leaked into the report = result_redaction
//       violation). 2 is fail-closed. Usage: node scripts/security-report-check.mjs [report.json]
//
// FIELDS (the formalized contract):
//   mode: "analysis" | "red_team_sim" | "sandbox_attack"
//   round_1_attacker_family, round_1_defender_family, round_2_attacker_family, round_2_defender_family
//   findings: [{ id, severity: low|medium|high|critical, title, round? }]
//   defenses: [{ for_finding, summary }]
//   unresolved_findings: [{ id, severity, title }]
//   degraded_single_family: bool   degraded_reason: string (required when degraded)
//   task?, timestamp?
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripBom, isStub, parseProvenance, slugify, sha256, loadEvents } from './lib/proof.mjs';

const MODES = ['analysis', 'red_team_sim', 'sandbox_attack'];
const SEV = ['low', 'medium', 'high', 'critical'];
const BLOCKING_SEV = new Set(['high', 'critical']);
const SECRET = /(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;
const ID_OK = /^[A-Za-z0-9._:-]+$/; // finding ids: single token, no whitespace (kills dedup-by-spacing tricks)
const fam = (v) => String(v || '').trim().toLowerCase();
// The "family" of the running harness — every Claude alias is the SAME side of the swap (it is the harness
// that ran), so it needs no subprocess proof. Codex GATE A: without canonicalizing, `claude` vs `opus` read as
// two distinct families and faked a cross-family swap with ZERO codex runs. canonFam collapses Claude aliases
// to one identity so a real swap requires a genuinely different family (-> a real codex run, see verifyRedblueRuns).
// Prefix-match so real model IDs canonicalize too (Codex GATE: `claude-sonnet-4`, `opus-4.8` are still the
// Claude harness). Anchored at the start + a word boundary so `gpt`/`codex`/`gemini` are NOT swept in.
const CLAUDE_FAM_RE = /^(claude|anthropic|opus|sonnet|haiku)\b/;
const canonFam = (v) => (CLAUDE_FAM_RE.test(fam(v)) ? 'claude' : fam(v));

// Pure structural check. opts.crossFamilyReviewRan = a real cross-family review provably ran (from the
// cross-review provenance, passed by the CLI) — if so, a single-family DEGRADE claim is a lie.
// Returns { ok, reasons:[] }. Exported for unit tests (the CLI adds file IO + secrets + provenance).
export function checkSecurityReport(report, opts = {}) {
  const reasons = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) return { ok: false, reasons: ['no security report object'] };

  if (!MODES.includes(report.mode)) reasons.push(`mode must be one of ${MODES.join('|')} (got "${report.mode}")`);

  const degraded = report.degraded_single_family === true;
  if (degraded) {
    // One family only: the cross-family edge is gone. Allowed ONLY with a STRUCTURED attestation that it is
    // weaker (a boolean you must explicitly set — not gameable prose) PLUS a human reason. The boolean is the
    // gate; keyword-matching the reason text would be brittle and bypassable.
    if (report.degraded_limitations_acknowledged !== true)
      reasons.push('degraded_single_family:true requires degraded_limitations_acknowledged:true (an explicit attestation that single-family is weaker than a genuine cross-family swap)');
    if (!String(report.degraded_reason || '').trim())
      reasons.push('degraded_single_family:true requires degraded_reason (why only one family ran)');
    // S2 fix (the differentiator-evasion): you cannot CLAIM single-family while the evidence says otherwise.
    //  (a) naming >=2 distinct families in the round fields is a skipped swap, not single-family.
    const named = [report.round_1_attacker_family, report.round_1_defender_family, report.round_2_attacker_family, report.round_2_defender_family].map(fam).filter(Boolean);
    if (new Set(named).size >= 2) reasons.push('degraded_single_family:true but the round_*_family fields name >=2 families — that is a skipped cross-family swap, not single-family');
    //  (b) a real cross-family review provably ran ⇒ two families WERE available ⇒ the two-round swap is required.
    if (opts.crossFamilyReviewRan) reasons.push('degraded_single_family:true but a real cross-family review ran (provenance) — two families were available, so the two-round role swap is required');
  } else {
    // The strong path: two distinct families, BOTH attack, roles swapped between rounds.
    // Compare CANONICAL families: two Claude aliases (claude/opus/sonnet/...) are the SAME side, not a swap.
    const r1a = canonFam(report.round_1_attacker_family), r1d = canonFam(report.round_1_defender_family);
    const r2a = canonFam(report.round_2_attacker_family), r2d = canonFam(report.round_2_defender_family);
    if (!r1a || !r1d || !r2a || !r2d) reasons.push('all four round_*_family fields are required (or set degraded_single_family:true)');
    else {
      if (r1a === r1d) reasons.push('round 1: attacker and defender must be different families (Claude aliases like claude/opus are the same family)');
      if (r2a === r2d) reasons.push('round 2: attacker and defender must be different families (Claude aliases like claude/opus are the same family)');
      // the decisive swap: round 2 must swap roles, so BOTH families' attack imagination surfaces.
      if (!(r2a === r1d && r2d === r1a)) reasons.push('round 2 must SWAP roles (round_2 attacker = round_1 defender, round_2 defender = round_1 attacker) — both families must attack');
    }
  }

  // Index findings by id first — severity for unresolved entries INHERITS from the original finding, so a
  // high/critical can't dodge the block by being listed unresolved with the severity omitted.
  const findingsArr = Array.isArray(report.findings) ? report.findings : null;
  const byId = new Map();
  if (findingsArr == null) reasons.push('findings must be an array');
  else findingsArr.forEach((f, i) => {
    if (!f || !f.id) reasons.push(`findings[${i}] needs an id`);
    else if (!ID_OK.test(f.id)) reasons.push(`findings[${i}].id "${f.id}" has invalid characters (use [A-Za-z0-9._:-], no spaces)`);
    else if (byId.has(f.id)) reasons.push(`findings[${i}] duplicate id "${f.id}" — finding ids must be unique (a duplicate could downgrade an inherited severity)`);
    if (!f || !SEV.includes(f.severity)) reasons.push(`findings[${i}].severity must be one of ${SEV.join('|')}`);
    if (f && f.id && !byId.has(f.id)) byId.set(f.id, f); // keep the FIRST; duplicate already flagged above
  });

  // defenses must reference a real finding AND carry a non-empty summary (an empty {for_finding} can't launder).
  const defensesArr = Array.isArray(report.defenses) ? report.defenses : null;
  const seenDef = new Set();
  if (defensesArr == null) reasons.push('defenses must be an array');
  else defensesArr.forEach((d, i) => {
    if (!d || !d.for_finding) reasons.push(`defenses[${i}] needs a for_finding`);
    else if (byId.size && !byId.has(d.for_finding)) reasons.push(`defenses[${i}].for_finding "${d.for_finding}" does not reference a known finding`);
    else if (seenDef.has(d.for_finding)) reasons.push(`defenses[${i}] duplicate for_finding "${d.for_finding}" — one defense per finding`);
    else seenDef.add(d.for_finding);
    if (isStub(d && d.summary)) reasons.push(`defenses[${i}] needs a non-empty summary`);
  });

  // unresolved: each must reference a real finding (unique); blocking severity = its own OR the finding's.
  const unresolved = Array.isArray(report.unresolved_findings) ? report.unresolved_findings : null;
  const seenOpen = new Set();
  if (unresolved == null) reasons.push('unresolved_findings must be an array (use [] if none)');
  else unresolved.forEach((u, i) => {
    const id = u && u.id;
    if (!id) { reasons.push(`unresolved_findings[${i}] needs an id`); return; }
    if (byId.size && !byId.has(id)) reasons.push(`unresolved_findings[${i}].id "${id}" does not reference a known finding`);
    if (seenOpen.has(id)) reasons.push(`unresolved_findings[${i}] duplicate id "${id}"`); else seenOpen.add(id);
    const sev = fam((u && u.severity) || byId.get(id)?.severity);
    if (BLOCKING_SEV.has(sev)) reasons.push(`unresolved ${sev} finding "${id}" — must be fixed or explicitly accepted before close`);
  });

  // Every finding must be ACCOUNTED FOR: matched by a VALID defense (real for_finding + non-empty summary) or
  // explicitly listed in unresolved_findings. A silently-dropped finding is not an honest report.
  if (findingsArr && defensesArr && unresolved) {
    const defended = new Set(defensesArr.filter((d) => d && d.for_finding && !isStub(d.summary)).map((d) => d.for_finding));
    const openIds = new Set(unresolved.map((u) => u && u.id).filter(Boolean));
    for (const f of findingsArr) {
      if (!f || !f.id) continue;
      if (!defended.has(f.id) && !openIds.has(f.id)) reasons.push(`finding "${f.id}" has no matching defense and is not listed in unresolved_findings`);
      // a finding is EITHER fixed (defended) OR carried open (unresolved) — never both (contradictory).
      if (defended.has(f.id) && openIds.has(f.id)) reasons.push(`finding "${f.id}" is listed as BOTH defended and unresolved — it must be one or the other`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// C1: bind the cross-family CLAIM to real runs. For every round/role whose family is NOT the Claude harness,
// require a logged security-redblue codex run for that round+role (codexRounds = Set of "<round>:<attack|defend>",
// derived by the CLI from the trusted-execution log). This is what makes "two families attacked" TRUE rather
// than four typed strings — you cannot claim codex attacked/defended without a real codex run. A genuinely
// single-family report must instead set degraded_single_family:true (checkSecurityReport gates that path).
// Returns { ok, reasons:[] }. Exported for unit tests.
export function verifyRedblueRuns(report, codexRounds = new Set()) {
  const reasons = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) return { ok: false, reasons: ['no security report object'] };
  // No degraded short-circuit (Codex GATE F): a degraded report that still NAMES a non-Claude family (e.g. a
  // "codex-only" single-family review) must also prove that family ran. A genuinely Claude-only degrade names
  // only Claude aliases -> need() requires nothing.
  const cr = codexRounds instanceof Set ? codexRounds : new Set();
  const need = (val, round, role) => {
    const f = fam(val);
    if (!f || canonFam(val) === 'claude') return; // the Claude harness side is attested (it ran); only external claims need proof
    if (!cr.has(`${round}:${role}`)) reasons.push(`round_${round} ${role} claims family "${f}" but no real cross-family (codex) run was logged for round ${round} ${role} — run scripts/security-redblue.mjs for it, or set degraded_single_family:true (a typed family name is not cross-family evidence)`);
  };
  need(report.round_1_attacker_family, 1, 'attack');
  need(report.round_1_defender_family, 1, 'defend');
  need(report.round_2_attacker_family, 2, 'attack');
  need(report.round_2_defender_family, 2, 'defend');
  return { ok: reasons.length === 0, reasons };
}

// --- CLI (fail-closed file IO + secret scan) -------------------------------------------------------------
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const nb = process.env.NB_DIR || join(resolve(HERE, '..'), '.nb');
  // args: <report.json> [--cross-review <artifact>]. The cross-review provenance lets us reject a
  // degraded(single-family) claim when a real cross-family review provably ran.
  const args = process.argv.slice(2);
  let reportArg = null, crPath = null, task = null, writeProof = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cross-review') crPath = args[++i];
    else if (args[i] === '--task') task = args[++i];
    else if (args[i] === '--proof') writeProof = true;
    else if (!args[i].startsWith('--') && !reportArg) reportArg = args[i];
  }
  const path = reportArg ? resolve(reportArg) : join(nb, 'reviews', 'security-report.json');
  const out = (m) => console.log(m);
  try {
    if (!existsSync(path)) { out(`‼ CHECK ERROR — security report not found: ${path}`); process.exit(2); }
    const raw = stripBom(readFileSync(path, 'utf8'));
    if (SECRET.test(raw)) { out('‼ CHECK ERROR — a secret/token appears in the security report (result_redaction violated). Redact and re-run.'); process.exit(2); }
    let report; try { report = JSON.parse(raw); } catch (e) { out(`‼ CHECK ERROR — security report is not valid JSON: ${e.message}`); process.exit(2); }
    // derive crossFamilyReviewRan from the cross-review artifact's provenance (a real other-family run)
    let crossFamilyReviewRan = false;
    if (crPath && existsSync(crPath)) {
      const prov = parseProvenance(stripBom(readFileSync(crPath, 'utf8')));
      crossFamilyReviewRan = !!(prov && prov.reviewer && String(prov.exit_status || '').trim() === '0');
    }
    // C1: derive which (round:role) actually ran through Codex (security-redblue trusted-execution log), so a
    // non-Claude family claim in the report must be backed by a real codex run for that round+role.
    const slug = task ? slugify(task) : (report.task ? slugify(report.task) : null);
    const codexRounds = new Set();
    for (const e of loadEvents(nb)) {
      // Require an exact task match (Codex GATE C): a redblue event with no task, or another task's, does not
      // count — the courier always stamps task, so this only rejects legacy/forged log lines.
      if (e && e.source === 'security-redblue' && e.ok === true && e.redblue_round && e.redblue_role && slug && e.task && slugify(e.task) === slug) {
        codexRounds.add(`${e.redblue_round}:${e.redblue_role}`);
      }
    }
    const struct = checkSecurityReport(report, { crossFamilyReviewRan });
    const runs = verifyRedblueRuns(report, codexRounds);
    const ok = struct.ok && runs.ok;
    const reasons = [...struct.reasons, ...runs.reasons];
    out(`NB security-report check — ${path}`);
    out(`mode: ${report.mode}  ${report.degraded_single_family ? '(degraded: single-family)' : '(cross-family, 2 rounds)'}`);
    if (ok) {
      out('✓ OK — two-round cross-family role-swap (or explicitly-degraded) report with no unresolved high/critical findings.');
      // C2: the proof is MINTED ONLY by this checker, ONLY when the report passes. It is a strong-bound
      // (run_id + source: security-report-check) record, so /nb:close's security objective proof can no longer
      // be satisfied by an arbitrary exit-0 command labeled security-report-check — the real content gate
      // (checkSecurityReport above) must have run and passed. Mirrors publish-check -> publish-file-list.
      if (writeProof) {
        if (!task) { out('‼ CHECK ERROR — --proof requires --task <slug> (the proof is task-scoped).'); process.exit(2); }
        if (report.task && slug && slugify(report.task) !== slug) { out(`‼ CHECK ERROR — report task "${report.task}" does not match --task "${slug}".`); process.exit(2); }
        const cmd = 'node scripts/security-report-check.mjs --proof';
        const runId = randomUUID();
        const outputSha = sha256(raw); // bind the proof to THIS exact report content (tamper -> hash mismatch)
        const ts = new Date().toISOString();
        try {
          for (const d of ['proofs', 'logs']) mkdirSync(join(nb, d), { recursive: true });
          appendFileSync(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ ts, tool: 'Bash', source: 'security-report-check', ok: true, cmd, run_id: runId, output_sha256: outputSha }) + '\n');
          writeFileSync(join(nb, 'proofs', `${slug}.security.security-report-check.json`), JSON.stringify({
            task: slug, pack: 'security', proof_type: 'security-report-check',
            command: cmd, exit_code: 0, run_id: runId, output_sha256: outputSha,
            output_excerpt: `security report OK: mode ${report.mode}, ${(report.findings || []).length} finding(s), 0 unresolved high/critical`,
            timestamp: ts,
          }, null, 2) + '\n');
          out(`  proof -> .nb/proofs/${slug}.security.security-report-check.json (run_id ${runId})`);
        } catch (e) { out(`‼ CHECK ERROR — could not write the security proof (${e && e.message ? e.message : e})`); process.exit(2); }
      }
      process.exit(0);
    }
    if (writeProof) out('  (not writing a proof — the report failed the gate)');
    out('✗ FAIL — security report does not satisfy the gate:');
    for (const r of reasons) out(`   - ${r}`);
    process.exit(1);
  } catch (e) {
    out(`‼ CHECK ERROR — could not check the security report (fails closed): ${e && e.message ? e.message : e}`);
    process.exit(2);
  }
}
