// NB proof verifier (shared, dependency-free). The deterministic floor under /nb:close: it decides
// whether an OBJECTIVE proof record is real, without judging "is this enough" (that's analytical/review).
//
// Two locks it enforces (the difference between a firewall and a checklist):
//   ① reconcile against the tool log — a proof's command must match an event the PostToolUse hook
//      recorded independently (.nb/logs/tool-events.jsonl). A fabricated "tests passed" with no real
//      run has no matching event and is rejected.
//   ② shape, not prose — a stub (empty / TODO / "not run" / missing command|exit|output) is rejected
//      even if the file exists. Existence alone never passes.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// --- Canonical review-body hashing (the analytical proof's provenance binding) -------------------------
// A cross-family review artifact is bound to the run that produced it by hashing ONLY a delimited canonical
// body block — not the whole file (provenance/timestamp drift would break it) and not raw stdout (subprocess
// noise / truncation would break it). The producer (cross-review.mjs) wraps the reviewer output in these
// markers; the hook and /nb:close both extract the SAME region and hash it. Three-way agreement
// (hook log == artifact provenance == close-recomputed) is what makes the analytical proof provenance-bound.
// HONEST LIMIT: this proves the review output is genuine and unmodified — NOT that the review is correct.
export const REVIEW_BODY_START = '<!-- nb:review-body:start -->';
export const REVIEW_BODY_END = '<!-- nb:review-body:end -->';

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
// Survive non-semantic drift (CRLF, surrounding blank lines) but nothing inside the body.
export const normalizeBody = (s) => String(s).replace(/\r\n/g, '\n').trim();

// Extract the canonical body between the markers, normalized. null if markers absent/malformed.
export function canonicalBody(text) {
  const s = String(text || '');
  const i = s.indexOf(REVIEW_BODY_START);
  if (i === -1) return null;
  const j = s.indexOf(REVIEW_BODY_END, i + REVIEW_BODY_START.length);
  if (j === -1) return null;
  return normalizeBody(s.slice(i + REVIEW_BODY_START.length, j));
}
// Hash of the canonical body found anywhere in `text`. null if no well-formed body block. The single
// function the producer, the hook test, and close all share, so the three hashes can't drift apart.
export function reviewBodyHash(text) {
  const b = canonicalBody(text);
  return b == null ? null : sha256(b);
}

// Keep the same redaction the hook applies, so a record's command can match a redacted log event.
export const redact = (s) => String(s)
  .replace(/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g, '[redacted]')
  .replace(/((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:@/]+:)[^\s:@/]+@/gi, '$1[redacted]@')
  .replace(/(Bearer|token|password|secret|api[_-]?key)\s*[:=]?\s*\S+/gi, '$1 [redacted]');

const norm = (c) => redact(c).trim().replace(/\s+/g, ' ');
const STUB = /\b(TODO|TBD|FIXME|not\s*run|will\s*run|assume[ds]?|later|pending|n\/?a)\b/i;

export const isStub = (text) => {
  const t = String(text || '').trim();
  return t.length === 0 || STUB.test(t);
};

// Canonical slug so task matching is EXACT, never substring — "task-a" must NOT match "not-task-a"
// (cross-task proof/review laundering). Used by every task-scope check.
export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Strip a leading UTF-8 BOM before JSON.parse. A BOM is benign encoding (PowerShell's `Set-Content -Encoding
// UTF8` adds one), NOT a trust problem — failing closed on it would false-positive every Windows/Generic
// user who hand-writes .nb JSON. Surfaced by the Codex Generic-mode dogfood.
export const stripBom = (s) => (typeof s === 'string' && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s;

// Load the harness-written event log.
// Fail-closed posture, two cases deliberately split:
//   - UNREADABLE file (IO/permission error): readFileSync throws and we let it propagate — close.mjs's
//     top-level handler turns it into CHECK ERROR. We cannot trust a log we cannot read.
//   - GARBLED individual lines (e.g. a crash-truncated tail): skipped. This is fail-SAFE, not a hole:
//     a proof passes only when a MATCHING event is found, so dropping lines can only REMOVE corroboration
//     (-> more NOT_READY), never manufacture a pass. An attacker can't garble their way to "done".
export function loadEvents(nbDir) {
  const p = join(nbDir, 'logs', 'tool-events.jsonl');
  if (!existsSync(p)) return [];
  const out = [];
  for (const ln of stripBom(readFileSync(p, 'utf8')).split(/\r?\n/)) { // unreadable file throws -> CHECK ERROR
    const t = ln.trim(); if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip bad line (fail-safe: only removes corroboration) */ }
  }
  return out;
}

// Trusted execution-path sources: scripts that write a run_id + output_sha256 binding from a REAL run (nb-run,
// publish-check). A run_id event from any other source is not a trusted-execution record.
export const TRUSTED_RUN_SOURCES = new Set(['nb-run', 'publish-check']);
// Proof types that MUST be strongly bound (run_id + trusted source). These are release-/supply-critical proofs
// whose value is that ONLY their producing script (which enforces the gate) can mint them — so the weak
// command-log fallback (forgeable by a hand-written proof referencing any matching log line) is NOT accepted.
export const STRONG_BIND_PROOFS = new Set(['publish-file-list']);

// Is the record's command corroborated by an independently-logged event with a consistent outcome?
// EXACT normalized match — NOT substring. A bidirectional includes let a broad proof command ("test")
// launder onto an unrelated logged "npm test", so the AI could pass an objective proof it never really ran.
// The only allowance: the PostToolUse hook caps logged commands at 500 chars, so a genuinely long command
// may be stored truncated — then the proof command must START WITH the logged (truncated) prefix.
function loggedRun(command, expectOk, events) {
  const want = norm(command);
  return events.some((e) => {
    if (!e || !e.cmd || e.ok !== expectOk) return false;
    const have = norm(e.cmd);
    return have === want || (String(e.cmd).length >= 500 && want.startsWith(have) && have.length > 0);
  });
}

// Parse the NB_REVIEW_PROVENANCE block a cross-review artifact carries. null if absent.
export function parseProvenance(text) {
  const m = /<!--\s*NB_REVIEW_PROVENANCE([\s\S]*?)-->/.exec(String(text || ''));
  if (!m) return null;
  const body = m[1];
  const get = (k) => (new RegExp(`^\\s*${k}\\s*:\\s*(.+?)\\s*$`, 'im').exec(body) || [])[1] || null;
  return {
    reviewer: get('reviewer'),
    command: get('command'),
    exit_status: get('exit_status'),
    manual_fallback: /^\s*manual_fallback\s*:\s*true\s*$/im.test(body),
    output_sha256: get('output_sha256'),
  };
}

// Verify one ANALYTICAL proof record (a cross-family review's coverage claim). Unlike an objective proof it
// is provenance-bound, NOT correctness-proven: the locks prove the referenced review artifact is the genuine,
// unmodified output of a real cross-review run and that its declared claims resolve to verified evidence —
// they do NOT prove the review's conclusions are right (that is what cross-family review is FOR).
//   ctx    = { task_slug, pack, now?, maxAgeMs? }
//   inputs = { events, reviewArtifacts:{path->text}, requiredClaims:[id], verifiedProofs:Set('pack:type'),
//              decisions:{kind->{ok}}, mode:'native'|'generic' }
// Returns { ok, reasons[] (->NOT_READY), errors[] (->CHECK_ERROR), strength, warnings[] }.
export function verifyAnalytical(record, ctx = {}, inputs = {}) {
  const reasons = [], errors = [], warnings = [];
  let strength = 'standard';
  const { task_slug, pack, now, maxAgeMs } = ctx;
  const { events = [], reviewArtifacts = {}, requiredClaims = [], verifiedProofs = new Set(), decisions = {}, mode = 'native' } = inputs;

  if (!record || typeof record !== 'object') return { ok: false, reasons: ['no analytical proof record'], errors, strength, warnings };

  if (task_slug && record.task && slugify(record.task) !== slugify(task_slug))
    reasons.push(`proof task "${record.task}" does not match current task "${task_slug}"`);
  if (!record.task) reasons.push('proof has no task');
  if (pack && record.pack && record.pack !== pack) reasons.push(`proof pack "${record.pack}" does not match "${pack}"`);

  if (!record.timestamp) reasons.push('no timestamp');
  else { const t = Date.parse(record.timestamp);
    if (Number.isNaN(t)) reasons.push('timestamp not parseable');
    else if (maxAgeMs && now && (now - t) > maxAgeMs) reasons.push('analytical proof is stale (older than this task window)'); }

  // --- Lock ①: bind the artifact to a real run by three-way body-hash agreement ---
  const refPath = record.review_artifact;
  const artifactText = refPath != null ? (reviewArtifacts[refPath] ?? reviewArtifacts[String(refPath).split('/').pop()]) : undefined;
  if (!refPath) reasons.push('no review_artifact referenced');
  else if (artifactText == null) reasons.push(`review artifact "${refPath}" not found — review missing`); // -> NOT_READY
  else if (mode === 'generic') {
    // No hook to bind against — accept ONLY as a clearly-labeled low-strength manual proof (never silent).
    strength = 'low';
    warnings.push('review provenance: manual (Generic mode) — not machine-verified, strength: low');
  } else {
    const prov = parseProvenance(artifactText);
    const closeHash = reviewBodyHash(artifactText);
    const crEvents = events.filter((e) => e && e.cross_review);       // any cross-review observed
    const crOk = crEvents.filter((e) => e.ok === true);               // ones that actually SUCCEEDED
    const okHashes = crOk.filter((e) => e.stdout_hash).map((e) => e.stdout_hash);
    // A FAILED review must never satisfy an analytical proof: check the artifact's stated exit_status AND
    // require a successful (ok:true), hook-logged run whose body hash matches. A hash match on a failed run
    // (exit != 0 / ok:false) is not evidence the review passed.
    if (closeHash == null) errors.push('review artifact has no canonical body block — review ran but is unverifiable (fail closed)');
    else if (!prov || !prov.output_sha256) errors.push('review artifact has no provenance output_sha256 — unverifiable (fail closed)');
    else if (prov.exit_status != null && String(prov.exit_status).trim() !== '0') reasons.push(`review provenance reports a failed run (exit_status ${prov.exit_status})`);
    else if (crEvents.length > 0 && crOk.length === 0) reasons.push('the logged cross-review did not succeed (no ok run) — a failed review is not evidence');
    else if (crOk.length > 0 && okHashes.length === 0) errors.push('a successful cross-review was logged but with no body hash — unverifiable (fail closed)');
    else if (prov.output_sha256 !== closeHash) reasons.push('review provenance mismatch (artifact body hash != stamped output_sha256 — artifact altered)');
    else if (!okHashes.includes(closeHash)) reasons.push('review provenance mismatch (no successful hook-logged run produced this body — not observed to run)');
  }

  // --- Lock ②: structured covers_claims resolved against ALREADY-verified evidence ---
  const claims = Array.isArray(record.covers_claims) ? record.covers_claims : null;
  if (!claims || claims.length === 0) reasons.push('covers_claims missing or empty');
  else {
    const seen = new Set();
    for (const c of claims) {
      if (!c || typeof c !== 'object' || !c.claim_id) { reasons.push('a covers_claims entry has no claim_id'); continue; }
      seen.add(c.claim_id);
      if (requiredClaims.length && !requiredClaims.includes(c.claim_id)) { reasons.push(`claim_id "${c.claim_id}" is not a contract-defined claim`); continue; }
      const verdict = String(c.verdict || '').toLowerCase();
      if (verdict === 'fail') { reasons.push(`claim "${c.claim_id}" verdict=fail`); continue; }
      if (verdict !== 'pass' && verdict !== 'na') { reasons.push(`claim "${c.claim_id}" has no valid verdict (pass|fail|na)`); continue; }
      if (verdict === 'na') { if (isStub(c.reason)) reasons.push(`claim "${c.claim_id}" verdict=na needs a reason`); continue; }
      const ref = String(c.evidence_ref || '');
      if (!ref) reasons.push(`claim "${c.claim_id}" has no evidence_ref`);
      else if (ref.startsWith('proof:')) { if (!verifiedProofs.has(ref.slice(6).replace('.', ':'))) reasons.push(`claim "${c.claim_id}" evidence_ref ${ref} does not resolve to a verified proof`); }
      else if (ref.startsWith('decision:')) { const k = ref.slice(9); if (!(decisions[k] && decisions[k].ok)) reasons.push(`claim "${c.claim_id}" evidence_ref ${ref} does not resolve to a valid decision`); }
      else if (ref === 'review-body') { const body = artifactText != null ? canonicalBody(artifactText) : null; if (!body || !body.includes(c.claim_id)) reasons.push(`claim "${c.claim_id}" evidence_ref review-body but claim_id is absent from the hash-bound review body`); }
      else reasons.push(`claim "${c.claim_id}" evidence_ref "${ref}" is not resolvable (use proof:/decision:/review-body)`);
    }
    for (const req of requiredClaims) if (!seen.has(req)) reasons.push(`required claim "${req}" not covered`);
  }

  return { ok: errors.length === 0 && reasons.length === 0, reasons, errors, strength, warnings };
}

// Verify one objective proof record. ctx = { task_slug, pack, maxAgeMs? }. events from loadEvents().
// Returns { ok, reasons: [] } — reasons are the deterministic blockers (empty => passes the floor).
export function verifyProof(record, ctx = {}, events = []) {
  const reasons = [];
  if (!record || typeof record !== 'object') return { ok: false, reasons: ['no proof record'] };

  const slug = ctx.task_slug;
  if (slug && record.task && slugify(record.task) !== slugify(slug)) {
    reasons.push(`proof task "${record.task}" does not match current task "${slug}"`);
  }
  if (!record.task) reasons.push('proof has no task');
  if (ctx.pack && record.pack && record.pack !== ctx.pack) reasons.push(`proof pack "${record.pack}" does not match "${ctx.pack}"`);

  if (!record.command || !String(record.command).trim()) reasons.push('no command recorded (proofs must name what ran)');
  if (typeof record.exit_code !== 'number') reasons.push('no exit_code recorded');
  else if (record.exit_code !== 0) reasons.push(`command failed (exit ${record.exit_code})`);

  if (isStub(record.output_excerpt ?? record.output)) reasons.push('output missing or a stub (empty / TODO / "not run" / "later")');

  if (!record.timestamp) reasons.push('no timestamp');
  else {
    const t = Date.parse(record.timestamp);
    if (Number.isNaN(t)) reasons.push('timestamp not parseable');
    else if (ctx.maxAgeMs && ctx.now && (ctx.now - t) > ctx.maxAgeMs) reasons.push('proof is stale (older than this task window)');
  }

  // ① the keystone: a real run must appear in the harness-written log with a matching outcome.
  //    STRONG binding (nb-run / Generic mode): when the proof carries a run_id, match that SPECIFIC logged
  //    run by run_id + output_sha256 — ties the proof to that exact execution (no stale-run reuse, no
  //    "same command, different run" laundering). Otherwise (hook-written proofs) fall back to the
  //    normalized-command + outcome match.
  // Release-/supply-critical proofs require the STRONG binding — a record with no run_id (i.e. relying on the
  // weak command-log fallback) is rejected outright, so only the producing script's real run can mint them.
  if (!record.run_id && STRONG_BIND_PROOFS.has(record.proof_type)) {
    reasons.push(`${record.proof_type} requires a run_id-bound trusted execution record (hand-written / command-log proofs are not accepted)`);
  }
  if (record.run_id) {
    const ev = events.find((e) => e && e.run_id === record.run_id);
    if (!ev) reasons.push('proof run_id not found in tool log — not observed to actually run (fabrication guard)');
    else {
      // STRONG binding — to call a run_id proof machine-verified, ALL of these are MANDATORY (a run_id claim
      // with a missing hash or command is NOT verified; it would degrade the binding to just "an id matched").
      if (!TRUSTED_RUN_SOURCES.has(ev.source)) reasons.push('run_id is bound to a non-trusted-execution event (not nb-run / publish-check)');
      if (!record.output_sha256 || !ev.output_sha256) reasons.push('run_id proof requires output_sha256 on both the proof and the logged run');
      else if (record.output_sha256 !== ev.output_sha256) reasons.push('proof output_sha256 does not match the logged run output');
      if (!record.command || !ev.cmd) reasons.push('run_id proof requires a command on both the proof and the logged run');
      else if (norm(record.command) !== norm(ev.cmd)) reasons.push('proof command does not match the logged run for this run_id');
      if (ev.ok !== (record.exit_code === 0)) reasons.push('logged run outcome does not match proof exit_code');
    }
  } else if (record.command && String(record.command).trim()) {
    if (!loggedRun(record.command, record.exit_code === 0, events)) {
      reasons.push('command not found in tool log — not observed to actually run (fabrication guard)');
    }
  }

  return { ok: reasons.length === 0, reasons };
}
