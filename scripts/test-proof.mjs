#!/usr/bin/env node
// Tests for lib/proof.mjs — the deterministic proof floor under /nb:close. Dependency-free.
// The point of these: a proof passes ONLY when it's real (logged) and well-shaped (not a stub).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProof, loadEvents, isStub,
  verifyAnalytical, parseProvenance, reviewBodyHash, canonicalBody, REVIEW_BODY_START, REVIEW_BODY_END,
  reviewBinding, verifyTddRedGreen } from './lib/proof.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

const ctx = { task_slug: 'settings-name', pack: 'data' };
const events = [{ ts: '2026-06-10T00:00:00Z', tool: 'Bash', ok: true, cmd: 'npm test' }];
const base = { task: 'settings-name', pack: 'data', command: 'npm test', exit_code: 0, output_excerpt: '# tests 4\n# pass 4', timestamp: '2026-06-10T00:00:00Z' };

// 1) valid, logged, well-shaped -> passes
check('valid+logged proof passes', verifyProof({ ...base }, ctx, events).ok === true);

// 2) stub output -> blocked
{ const r = verifyProof({ ...base, output_excerpt: 'TODO: run later' }, ctx, events);
  check('stub output blocked', !r.ok && /stub/i.test(r.reasons.join())); }

// 3) empty output -> blocked
check('empty output blocked', verifyProof({ ...base, output_excerpt: '   ' }, ctx, events).ok === false);

// 4) missing exit_code -> blocked
check('missing exit_code blocked', verifyProof({ ...base, exit_code: undefined }, ctx, events).ok === false);

// 5) non-zero exit -> blocked
{ const r = verifyProof({ ...base, exit_code: 1 }, ctx, events);
  check('non-zero exit blocked', !r.ok && /exit 1/.test(r.reasons.join())); }

// 6) task mismatch -> blocked
check('task mismatch blocked', verifyProof({ ...base, task: 'other-task' }, ctx, events).ok === false);

// 7) pack mismatch -> blocked
check('pack mismatch blocked', verifyProof({ ...base, pack: 'frontend' }, ctx, events).ok === false);

// 8) no command -> blocked
check('no command blocked', verifyProof({ ...base, command: '' }, ctx, events).ok === false);

// 9) ① FABRICATION: claims a run that was never logged -> blocked
{ const r = verifyProof({ ...base }, ctx, []);
  check('fabricated (no log) blocked', !r.ok && /tool log/i.test(r.reasons.join())); }

// 10) ① outcome mismatch: claims pass but the logged run failed -> blocked
{ const r = verifyProof({ ...base }, ctx, [{ tool: 'Bash', ok: false, cmd: 'npm test' }]);
  check('log says failed but proof claims pass -> blocked', !r.ok); }

// 11) redaction consistency: a secret-bearing command still reconciles against the redacted log event.
//     Build the fake token at runtime so this source file holds no real-looking secret (release-check scans it).
{ const fakeKey = 'sk-' + 'k'.repeat(24);
  const secretCmd = `curl -H "Authorization: Bearer ${fakeKey}" https://api.x`;
  const loggedRedacted = [{ tool: 'Bash', ok: true, cmd: 'curl -H "Authorization: Bearer [redacted]" https://api.x' }];
  const r = verifyProof({ ...base, command: secretCmd }, ctx, loggedRedacted);
  check('secret command reconciles via redaction', r.ok === true); }

// 12) isStub helper
check('isStub catches TODO/empty, allows real', isStub('TODO') && isStub('') && !isStub('# pass 4'));
// counter-strip must not turn a pure-counter placeholder into "real output" (Codex security re-check):
check('isStub: bare "TODO 0" is still a stub (collapses to empty)', isStub('TODO 0') && isStub('skipped 0\npending 0'));
check('isStub: a real run with a "todo 0" counter is NOT a stub', !isStub('✔ sum adds\n# tests 1\n# pass 1\n# fail 0\n# todo 0'));

// 12b) run_id strong binding (nb-run proofs): match the SPECIFIC logged run by run_id + output_sha256
{ const ev = [{ tool: 'Bash', source: 'nb-run', ok: true, cmd: 'node x', run_id: 'r1', output_sha256: 'abc' }];
  const p = { task: 'settings-name', pack: 'data', command: 'node x', exit_code: 0, output_excerpt: 'ok', timestamp: '2026-06-10T00:00:00Z', run_id: 'r1', output_sha256: 'abc' };
  check('run_id+hash matched proof passes', verifyProof(p, ctx, ev).ok === true);
  check('run_id not in log blocked', !verifyProof({ ...p, run_id: 'r2' }, ctx, ev).ok);
  check('output_sha256 mismatch blocked', !verifyProof({ ...p, output_sha256: 'xyz' }, ctx, ev).ok);
  // laundering guard: a real run_id+hash can't be reused for a proof claiming a DIFFERENT command
  check('run_id reuse with mismatched command blocked', !verifyProof({ ...p, command: 'rm -rf /' }, ctx, ev).ok);
  // STRICT binding: run_id proof missing output_sha256 must NOT pass on just an id match
  { const noHash = { ...p }; delete noHash.output_sha256; check('run_id proof w/o output_sha256 blocked', !verifyProof(noHash, ctx, ev).ok); }
  // a run_id bound to a non-nb-run event (no source) must NOT be treated as a trusted record
  { const evNoSrc = [{ tool: 'Bash', ok: true, cmd: 'node x', run_id: 'r1', output_sha256: 'abc' }];
    check('run_id bound to non-nb-run event blocked', !verifyProof(p, ctx, evNoSrc).ok); } }

// 12c) STRONG_BIND proofs (publish-file-list) MUST be run_id-bound — Codex GATE blocker: a hand-written proof
// relying on the command-log fallback (just a matching `npm pack` event) must be REJECTED; only a real
// publish-check run (source: publish-check + run_id + output_sha256) mints it.
{ const cmd = 'npm pack --dry-run --json';
  const handwritten = { task: 'settings-name', pack: 'release', proof_type: 'publish-file-list', command: cmd, exit_code: 0, output_excerpt: 'published 3 files, 0 risky', timestamp: '2026-06-10T00:00:00Z' };
  const logOnly = [{ tool: 'Bash', ok: true, cmd }]; // a plain npm pack log line (no run_id binding)
  check('publish-file-list w/o run_id (command-log fallback) BLOCKED', !verifyProof(handwritten, { ...ctx, pack: 'release' }, logOnly).ok);
  const ev = [{ tool: 'Bash', source: 'publish-check', ok: true, cmd, run_id: 'pc1', output_sha256: 'deadbeef' }];
  const real = { ...handwritten, run_id: 'pc1', output_sha256: 'deadbeef' };
  check('publish-file-list with publish-check run_id binding PASSES', verifyProof(real, { ...ctx, pack: 'release' }, ev).ok === true);
  // a forged run_id event with an untrusted source must NOT pass
  const evBad = [{ tool: 'Bash', source: 'hook', ok: true, cmd, run_id: 'pc1', output_sha256: 'deadbeef' }];
  check('publish-file-list run_id bound to untrusted source BLOCKED', !verifyProof(real, { ...ctx, pack: 'release' }, evBad).ok); }

// 13) loadEvents skips garbage lines
{ const t = mkdtempSync(join(tmpdir(), 'nb-proof-')); mkdirSync(join(t, 'logs'), { recursive: true });
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'), '{"tool":"Bash","ok":true,"cmd":"npm test"}\nNOT JSON\n{"tool":"Write","ok":true,"path":"a.js"}\n');
  check('loadEvents parses valid, skips garbage', loadEvents(t).length === 2);
  rmSync(t, { recursive: true, force: true }); }

// 13b) loadEvents tolerates a leading UTF-8 BOM on the log (the PowerShell footgun, surfaced by dogfood)
{ const t = mkdtempSync(join(tmpdir(), 'nb-proof-')); mkdirSync(join(t, 'logs'), { recursive: true });
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'), String.fromCharCode(0xFEFF) + '{"tool":"Bash","ok":true,"cmd":"npm test"}\n');
  const ev = loadEvents(t);
  check('loadEvents strips a leading BOM', ev.length === 1 && ev[0].cmd === 'npm test');
  rmSync(t, { recursive: true, force: true }); }

// 14) broad command must NOT launder onto an unrelated logged command (exact match, not substring)
{ const r = verifyProof({ ...base, command: 'test' }, ctx, events); // events has 'npm test'
  check('broad command does not match logged npm test', !r.ok && /tool log/.test(r.reasons.join())); }

// 15) task substring must NOT match — exact slug only ("settings-name" must not match "x-settings-name")
{ const r = verifyProof({ ...base, task: 'x-settings-name' }, ctx, events);
  check('task substring blocked (exact slug only)', !r.ok && /does not match/.test(r.reasons.join())); }

// 16) ③ command_match: a proof whose recorded command does not match the proof_type's contract pattern is
//     rejected — closes "proof_type is a decorative label" (an exit-0 `npm test` can't satisfy migration-down).
{ const mm = '/\\bmigrat/i';
  const ev = [{ tool: 'Bash', ok: true, cmd: 'npm test' }, { tool: 'Bash', ok: true, cmd: 'npm run migrate:down' }];
  const wrong = verifyProof({ ...base, proof_type: 'migration-down', command: 'npm test' }, { ...ctx, commandMatch: mm }, ev);
  check('command_match mismatch blocked (npm test != migration)', !wrong.ok && /command_match/.test(wrong.reasons.join()));
  const right = verifyProof({ ...base, proof_type: 'migration-down', command: 'npm run migrate:down' }, { ...ctx, commandMatch: mm }, ev);
  check('command_match match passes', right.ok === true);
  check('no command_match -> unbound (back-compat)', verifyProof({ ...base }, ctx, events).ok === true);
  // Codex GATE F: command_match runs on the REDACTED+normalized command, so a required keyword hidden inside a
  // secret-redacted segment (`... password <keyword>` -> `... [redacted]`) cannot satisfy it.
  const hidden = 'true password security-report-check';
  const fr = verifyProof({ ...base, pack: 'security', proof_type: 'security-report-check', command: hidden }, { ...ctx, pack: 'security', commandMatch: '/security-report-check/i' }, [{ tool: 'Bash', ok: true, cmd: 'true password [redacted]' }]);
  check('command_match keyword hidden in redacted segment BLOCKED', !fr.ok && /command_match/.test(fr.reasons.join()));
  // a malformed /regex/ command_match fails CLOSED (no silent substring downgrade)
  const mr = verifyProof({ ...base, command: 'npm run migrate:down' }, { ...ctx, commandMatch: '/(/i' }, [{ tool: 'Bash', ok: true, cmd: 'npm run migrate:down' }]);
  check('malformed /regex/ command_match fails closed (blocked)', !mr.ok && /command_match/.test(mr.reasons.join())); }

// 16b) PROOF_PRODUCERS: publish-file-list must come from publish-check, NOT nb-run (Codex ADDITIONAL — nb-run can
//      write an arbitrary --pack/--proof record, so accepting any trusted source let it launder the hygiene gate).
{ const cmd = 'npm pack --dry-run --json';
  const real = { task: 'settings-name', pack: 'release', proof_type: 'publish-file-list', command: cmd, exit_code: 0, output_excerpt: 'published 3 files, 0 risky', timestamp: '2026-06-10T00:00:00Z', run_id: 'x1', output_sha256: 'h1' };
  const evNbRun = [{ tool: 'Bash', source: 'nb-run', ok: true, cmd, run_id: 'x1', output_sha256: 'h1' }];
  check('publish-file-list via nb-run source BLOCKED (must be publish-check)', !verifyProof(real, { ...ctx, pack: 'release' }, evNbRun).ok);
  const evPc = [{ tool: 'Bash', source: 'publish-check', ok: true, cmd, run_id: 'x1', output_sha256: 'h1' }];
  check('publish-file-list via publish-check source PASSES', verifyProof(real, { ...ctx, pack: 'release' }, evPc).ok === true); }

// 16c) security-report-check is strong-bound to its producer (C2): only the security-report-check checker (which
//      validated the report content) can mint it — `echo security-report-check` / nb-run cannot satisfy it.
{ const cmd = 'node scripts/security-report-check.mjs --proof';
  const rec = { task: 'settings-name', pack: 'security', proof_type: 'security-report-check', command: cmd, exit_code: 0, output_excerpt: 'security report OK', timestamp: '2026-06-10T00:00:00Z', run_id: 's1', output_sha256: 'h2' };
  const noRun = { ...rec }; delete noRun.run_id; delete noRun.output_sha256;
  check('security-report-check w/o run_id BLOCKED', !verifyProof(noRun, { ...ctx, pack: 'security', commandMatch: '/security-report-check/i' }, [{ tool: 'Bash', ok: true, cmd }]).ok);
  const ev = [{ tool: 'Bash', source: 'security-report-check', ok: true, cmd, run_id: 's1', output_sha256: 'h2' }];
  check('security-report-check via its checker PASSES', verifyProof(rec, { ...ctx, pack: 'security', commandMatch: '/security-report-check/i' }, ev).ok === true);
  const evNb = [{ tool: 'Bash', source: 'nb-run', ok: true, cmd, run_id: 's1', output_sha256: 'h2' }];
  check('security-report-check via nb-run source BLOCKED (wrong producer)', !verifyProof(rec, { ...ctx, pack: 'security' }, evNb).ok); }

// ---- Analytical proofs (provenance-bound coverage; NOT correctness-proven) ----------------------------

// Build a review artifact (provenance + canonical body block) and the matching hook hash.
function mkReview(bodyText, stampOverride) {
  const block = `${REVIEW_BODY_START}\n${bodyText}\n${REVIEW_BODY_END}\n`;
  const hash = reviewBodyHash(block);
  const stamp = stampOverride ?? hash;
  const art = `<!-- NB_REVIEW_PROVENANCE\nreviewer: codex\ncommand: codex exec --sandbox read-only -\nexit_status: 0\nmanual_fallback: false\noutput_sha256: ${stamp}\n-->\n${block}`;
  return { art, hash };
}
const refPath = '.nb/reviews/taska.cross-review.md';
const actx = { task_slug: 'taska', pack: 'testing' };
const mkRec = (over = {}) => ({ task: 'taska', pack: 'testing', proof_type: 'covers_claims', review_artifact: refPath, timestamp: '2026-06-11T00:00:00Z',
  covers_claims: [{ claim_id: 'alpha', verdict: 'pass', evidence_ref: 'review-body' }], ...over });

// canonical/provenance helpers
{ const { art, hash } = mkReview('Reviewed claim alpha and beta thoroughly.');
  check('canonicalBody extracts between markers', /Reviewed claim alpha/.test(canonicalBody(art)));
  check('parseProvenance reads output_sha256', parseProvenance(art).output_sha256 === hash);
  check('reviewBodyHash stable for same body', reviewBodyHash(art) === hash); }

// A1) valid analytical (3-way bound, claim in body) -> ok
{ const { art, hash } = mkReview('Reviewed claim alpha and beta thoroughly.');
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], verifiedProofs: new Set(), decisions: {}, mode: 'native' };
  check('valid analytical proof passes', verifyAnalytical(mkRec(), actx, inputs).ok === true); }

// A2) artifact altered: body hash != stamped output_sha256 -> NOT_READY (provenance mismatch)
{ const { art, hash } = mkReview('Reviewed claim alpha.', 'deadbeef'); // stamp doesn't match body
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('altered artifact -> NOT_READY mismatch', !r.ok && /mismatch/.test(r.reasons.join())); }

// A3) no hook-logged run produced this body -> NOT_READY (not observed to run / fabrication)
{ const { art } = mkReview('Reviewed claim alpha.');
  const inputs = { events: [], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('no hook hash -> NOT_READY not-observed', !r.ok && /not observed to run|mismatch/.test(r.reasons.join())); }

// A4) cross-review ran but hook captured NO body hash -> CHECK_ERROR (fail closed footgun)
{ const { art } = mkReview('Reviewed claim alpha.');
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('hook ran but no hash -> CHECK_ERROR', !r.ok && r.errors.length > 0); }

// A5) review artifact missing -> NOT_READY (review missing)
{ const inputs = { events: [], reviewArtifacts: {}, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('missing artifact -> NOT_READY review-missing', !r.ok && /not found|review missing/.test(r.reasons.join()) && r.errors.length === 0); }

// A6) claim_id not contract-defined + required claim uncovered -> NOT_READY
{ const { art, hash } = mkReview('Reviewed claim gamma.');
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec({ covers_claims: [{ claim_id: 'gamma', verdict: 'pass', evidence_ref: 'review-body' }] }), actx, inputs);
  check('non-contract claim_id + uncovered required -> NOT_READY', !r.ok && /not a contract-defined claim/.test(r.reasons.join()) && /required claim "alpha" not covered/.test(r.reasons.join())); }

// A7) evidence_ref: proof resolves against a verified proof
{ const { art, hash } = mkReview('Covered alpha; see unit tests.');
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], verifiedProofs: new Set(['testing:unit']), mode: 'native' };
  const okRec = mkRec({ covers_claims: [{ claim_id: 'alpha', verdict: 'pass', evidence_ref: 'proof:testing.unit' }] });
  check('evidence_ref proof resolves -> ok', verifyAnalytical(okRec, actx, inputs).ok === true);
  const badRec = mkRec({ covers_claims: [{ claim_id: 'alpha', verdict: 'pass', evidence_ref: 'proof:testing.missing' }] });
  check('evidence_ref unverified proof -> NOT_READY', verifyAnalytical(badRec, actx, inputs).ok === false); }

// A8) claim verdict=fail -> NOT_READY
{ const { art, hash } = mkReview('alpha has a problem.');
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec({ covers_claims: [{ claim_id: 'alpha', verdict: 'fail', evidence_ref: 'review-body' }] }), actx, inputs);
  check('claim verdict=fail -> NOT_READY', !r.ok && /verdict=fail/.test(r.reasons.join())); }

// A9) generic mode: accepted at LOW strength with a loud warning, no hook needed (lock ② still applies)
{ const { art } = mkReview('Manual review covered alpha.');
  const inputs = { events: [], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'generic' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('generic mode -> ok low strength + warning', r.ok === true && r.strength === 'low' && /not machine-verified/.test(r.warnings.join())); }

// A10) FAILED cross-review must NOT satisfy: body hash matches but the logged run failed (ok:false) -> block
{ const { art, hash } = mkReview('Covered claim alpha.');
  const inputs = { events: [{ tool: 'Bash', ok: false, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('failed cross-review (ok:false) does not satisfy', !r.ok && /did not succeed|not observed/.test(r.reasons.join())); }

// A11) provenance exit_status != 0 must NOT satisfy even if a hash matches -> block
{ const block = `${REVIEW_BODY_START}\nCovered claim alpha.\n${REVIEW_BODY_END}\n`; const hash = reviewBodyHash(block);
  const art = `<!-- NB_REVIEW_PROVENANCE\nexit_status: 1\noutput_sha256: ${hash}\n-->\n${block}`;
  const inputs = { events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: hash }], reviewArtifacts: { [refPath]: art }, requiredClaims: ['alpha'], mode: 'native' };
  const r = verifyAnalytical(mkRec(), actx, inputs);
  check('provenance exit_status!=0 does not satisfy', !r.ok && /failed run/.test(r.reasons.join())); }

// --- H2: reviewBinding (CORE review provenance strength) -----------------------------------------------
{
  const mkArt = (body, { manual = false, exit = 0, badHash = false } = {}) => {
    const block = `${REVIEW_BODY_START}\n${body}\n${REVIEW_BODY_END}\n`;
    const h = reviewBodyHash(block);
    const prov = `<!-- NB_REVIEW_PROVENANCE\nreviewer: codex\nexit_status: ${exit}\nmanual_fallback: ${manual}\noutput_sha256: ${badHash ? 'deadbeef' : h}\n-->\n`;
    return { art: prov + block, h };
  };
  const okEvent = (h) => [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }];

  const a = mkArt('Reviewed the diff.');
  check('reviewBinding: 3-way match -> cross-family (bound)', (() => { const r = reviewBinding(a.art, okEvent(a.h), 'native'); return r.bound === true && r.strength === 'cross-family'; })());
  check('reviewBinding: no hook-logged run -> unverified', reviewBinding(a.art, [], 'native').strength === 'unverified');
  check('reviewBinding: failed run event -> unverified', reviewBinding(a.art, [{ tool: 'Bash', ok: false, cross_review: true, stdout_hash: a.h }], 'native').strength === 'unverified');
  const altered = mkArt('Reviewed the diff.', { badHash: true });
  check('reviewBinding: provenance hash mismatch -> unverified', reviewBinding(altered.art, okEvent(altered.h), 'native').strength === 'unverified');
  const failed = mkArt('Reviewed the diff.', { exit: 1 });
  check('reviewBinding: provenance exit!=0 -> unverified', reviewBinding(failed.art, okEvent(failed.h), 'native').strength === 'unverified');
  const manual = mkArt('Human-pasted cross review.', { manual: true });
  check('reviewBinding: manual_fallback -> manual (low, not bound)', (() => { const r = reviewBinding(manual.art, [], 'native'); return r.strength === 'manual' && r.bound === false; })());
  check('reviewBinding: generic mode -> manual (low)', reviewBinding('any text', [], 'generic').strength === 'manual');
  check('reviewBinding: bare file (no body block) -> unverified', reviewBinding('just a note, no markers', [], 'native').strength === 'unverified');
}

// --- TDD: verifyTddRedGreen (log-reconciled red->green pair) --------------------------------------------
{
  const cm = '/\\bnpm test\\b/i';
  const tctx = { task_slug: 'add-parser', pack: 'testing', commandMatch: cm };
  const rec = (extra = {}) => ({ task: 'add-parser', pack: 'testing', proof_type: 'tdd-red-green', red_command: 'npm test parser', green_command: 'npm test parser', timestamp: '2026-06-28T00:00:00Z', ...extra });
  const evs = [{ tool: 'Bash', ok: false, cmd: 'npm test parser' }, { tool: 'Bash', ok: true, cmd: 'npm test parser' }];
  check('tdd: red(fail)+green(pass) both logged -> ok', verifyTddRedGreen(rec(), tctx, evs).ok === true);
  check('tdd: no failed red run logged -> NOT ok', verifyTddRedGreen(rec(), tctx, [{ tool: 'Bash', ok: true, cmd: 'npm test parser' }]).ok === false);
  check('tdd: no passed green run logged -> NOT ok', verifyTddRedGreen(rec(), tctx, [{ tool: 'Bash', ok: false, cmd: 'npm test parser' }]).ok === false);
  check('tdd: red_command not a test command (no test token) -> NOT ok', verifyTddRedGreen(rec({ red_command: 'echo done', green_command: 'echo done' }), tctx, [{ tool: 'Bash', ok: false, cmd: 'echo done' }, { tool: 'Bash', ok: true, cmd: 'echo done' }]).ok === false);
  check('tdd: missing red_command -> NOT ok', verifyTddRedGreen(rec({ red_command: '' }), tctx, evs).ok === false);
  check('tdd: task mismatch -> NOT ok', verifyTddRedGreen(rec({ task: 'other' }), tctx, evs).ok === false);
  check('tdd: distinct red/green commands both logged -> ok', verifyTddRedGreen(rec({ red_command: 'npm test a', green_command: 'npm test b' }), tctx, [{ tool: 'Bash', ok: false, cmd: 'npm test a' }, { tool: 'Bash', ok: true, cmd: 'npm test b' }]).ok === true);
  // Codex GATE finding 2 PoC: `echo npm test && false` (red) / `echo npm test` (green) contains the token but
  // LEADS with echo — the leader guard rejects it even though both are logged with the right outcomes.
  check('tdd: echo-leader forge (echo npm test && false) -> NOT ok', verifyTddRedGreen(rec({ red_command: 'echo npm test && false', green_command: 'echo npm test' }), tctx, [{ tool: 'Bash', ok: false, cmd: 'echo npm test && false' }, { tool: 'Bash', ok: true, cmd: 'echo npm test' }]).ok === false);
  // Codex security finding 3: GREEN logged BEFORE the RED fail is not test-first — order must be red -> green.
  check('tdd: green-before-red (wrong order) -> NOT ok', verifyTddRedGreen(rec(), tctx, [{ tool: 'Bash', ok: true, cmd: 'npm test parser' }, { tool: 'Bash', ok: false, cmd: 'npm test parser' }]).ok === false);
  check('tdd: red-then-green (correct order) -> ok', verifyTddRedGreen(rec(), tctx, [{ tool: 'Bash', ok: false, cmd: 'npm test parser' }, { tool: 'Bash', ok: true, cmd: 'npm test parser' }]).ok === true);
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
