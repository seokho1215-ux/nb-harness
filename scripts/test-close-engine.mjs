#!/usr/bin/env node
// Tests for lib/close-engine.mjs — the pure /nb:close decision logic. Dependency-free.
// Contracts are INJECTED (never via env) — this is exactly how production stays un-backdoorable.
import { closeEngine } from './lib/close-engine.mjs';
import { reviewBodyHash, REVIEW_BODY_START, REVIEW_BODY_END } from './lib/proof.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

const coreOK = () => ({ ready: true, plan: 'yes', intent: 'yes', evidence: { v: 'yes' }, review: { v: 'yes' }, brief: { v: 'yes' }, openRisks: 0 });
const actNone = () => ({ active_packs: [], explicit_packs: [], implied_packs: [], observed_categories: [], floor_strength: 'light', unknown_impact: false, baseline_confidence: 'high' });
const events = [{ tool: 'Bash', ok: true, cmd: 'npm test' }];
const goodProof = { task: 'settings-name', pack: 'data', command: 'npm test', exit_code: 0, output_excerpt: '# pass 4', timestamp: '2026-06-10T00:00:00Z' };
const run = (over = {}) => closeEngine({ core: coreOK(), activation: actNone(), taskSlug: 'settings-name', taskStrength: 'standard', ...over });

// 1) clean -> READY
check('clean -> READY', run().verdict === 'READY');

// 2) core missing evidence -> NOT_READY
check('missing evidence -> NOT_READY', run({ core: { ...coreOK(), evidence: { v: 'missing' } } }).verdict === 'NOT_READY');

// 3) env override -> CHECK_ERROR (exit 2)
{ const r = run({ envOverride: true }); check('env override -> CHECK_ERROR exit2', r.verdict === 'CHECK_ERROR' && r.exit === 2); }

// 4) explicit stable pack with no contract -> CHECK_ERROR
{ const r = run({ activation: { ...actNone(), active_packs: ['data'], explicit_packs: ['data'] }, stablePacks: new Set(['data']) });
  check('explicit stable pack, no contract -> CHECK_ERROR', r.verdict === 'CHECK_ERROR'); }

// 5) implied-only pack with no contract -> NOT a CHECK_ERROR (floor handles it)
{ const r = run({ activation: { ...actNone(), active_packs: ['security'], explicit_packs: [], implied_packs: ['security'] }, stablePacks: new Set(['security']) });
  check('implied-only uncontracted pack -> not CHECK_ERROR', r.verdict !== 'CHECK_ERROR'); }

// 6) contracted pack, objective proof MISSING -> NOT_READY
{ const r = run({ activation: { ...actNone(), active_packs: ['data'], explicit_packs: ['data'] },
    contracts: { data: { objective_proofs: [{ proof_type: 'rollback', strength: 'standard' }] } } });
  check('contract proof missing -> NOT_READY', r.verdict === 'NOT_READY' && /rollback.*missing/.test(r.blockers.join())); }

// 7) contracted pack, valid logged proof -> READY
{ const r = run({ activation: { ...actNone(), active_packs: ['data'], explicit_packs: ['data'] },
    contracts: { data: { objective_proofs: [{ proof_type: 'rollback', strength: 'standard' }] } },
    proofs: { 'data:rollback': goodProof }, events });
  check('contract proof valid+logged -> READY', r.verdict === 'READY'); }

// 8) proof required only at full, effective=light -> skipped -> READY
{ const r = run({ taskStrength: 'light', activation: { ...actNone(), active_packs: ['data'], explicit_packs: ['data'], floor_strength: 'light' },
    contracts: { data: { objective_proofs: [{ proof_type: 'rollback', strength: 'full' }] } } });
  check('proof above effective strength is skipped -> READY', r.verdict === 'READY'); }

// 9) observed category, no acknowledgment -> NOT_READY (floor)
{ const r = run({ activation: { ...actNone(), observed_categories: ['secret'] } });
  check('category floor unmet -> NOT_READY', r.verdict === 'NOT_READY' && /secret/.test(r.blockers.join())); }

// 10) observed category WITH a VALID acknowledgment -> READY (decision must carry ok:true now)
{ const r = run({ activation: { ...actNone(), observed_categories: ['secret'] }, decisions: { secret: { ok: true } } });
  check('category floor acknowledged -> READY', r.verdict === 'READY'); }

// 10b) observed category with an INVALID (ok:false) decision -> still NOT_READY (existence no longer enough)
{ const r = run({ activation: { ...actNone(), observed_categories: ['secret'] }, decisions: { secret: { ok: false, reasons: ['thin'] } } });
  check('invalid decision does not satisfy floor -> NOT_READY', r.verdict === 'NOT_READY'); }

// 11) unknown_impact -> NOT_READY
check('unknown_impact -> NOT_READY', run({ activation: { ...actNone(), unknown_impact: true } }).verdict === 'NOT_READY');

// 12) low confidence + risk + no baseline decision -> NOT_READY; with decision -> READY
{ const a = { ...actNone(), observed_categories: ['data'], baseline_confidence: 'low' };
  check('low-confidence baseline unmet -> NOT_READY', run({ activation: a, decisions: { data: { ok: true } } }).verdict === 'NOT_READY');
  check('low-confidence baseline accepted -> READY', run({ activation: a, decisions: { data: { ok: true }, 'baseline-risk': { ok: true } } }).verdict === 'READY'); }

// 13) open risks unaccepted -> NOT_READY; accepted -> READY_WITH_RISKS
{ const core = { ...coreOK(), openRisks: 2 };
  check('open risks unaccepted -> NOT_READY', run({ core }).verdict === 'NOT_READY');
  check('open risks accepted -> READY_WITH_RISKS', run({ core, decisions: { 'risks-accepted': { ok: true } } }).verdict === 'READY_WITH_RISKS'); }

// ---- analytical proofs dispatched through the engine ----
const REF = '.nb/reviews/settings-name.cross-review.md';
const mkArt = (body, stamp) => { const block = `${REVIEW_BODY_START}\n${body}\n${REVIEW_BODY_END}\n`; const h = reviewBodyHash(block);
  return { art: `<!-- NB_REVIEW_PROVENANCE\noutput_sha256: ${stamp ?? h}\n-->\n${block}`, h }; };
const analyticalRec = (over = {}) => ({ task: 'settings-name', pack: 'testing', proof_type: 'covers_claims', review_artifact: REF, timestamp: '2026-06-10T00:00:00Z',
  covers_claims: [{ claim_id: 'a1', verdict: 'pass', evidence_ref: 'review-body' }], ...over });
const actTesting = () => ({ ...actNone(), active_packs: ['testing'], explicit_packs: ['testing'] });

// 14) analytical proof: valid 3-way binding -> READY
{ const { art, h } = mkArt('Covered claim a1.');
  const r = run({ activation: actTesting(),
    contracts: { testing: { analytical_proofs: [{ proof_type: 'covers_claims', strength: 'standard', required_claims: ['a1'] }] } },
    proofs: { 'testing:covers_claims': analyticalRec() }, events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }],
    reviewArtifacts: { [REF]: art }, mode: 'native' });
  check('analytical proof valid -> READY', r.verdict === 'READY'); }

// 15) record self-labels kind:objective but contract lists it as analytical -> verified ANALYTICALLY (engine
//     dispatches by the contract list, never by record.kind) -> still READY
{ const { art, h } = mkArt('Covered claim a1.');
  const r = run({ activation: actTesting(),
    contracts: { testing: { analytical_proofs: [{ proof_type: 'covers_claims', strength: 'standard', required_claims: ['a1'] }] } },
    proofs: { 'testing:covers_claims': analyticalRec({ kind: 'objective', command: 'echo gotcha', exit_code: 0 }) },
    events: [{ tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }], reviewArtifacts: { [REF]: art }, mode: 'native' });
  check('record.kind is ignored; contract dispatch wins -> READY', r.verdict === 'READY'); }

// 16) ordering: objective proof verified FIRST so analytical evidence_ref proof:testing.unit resolves -> READY
{ const { art, h } = mkArt('Covered a1 via the unit suite.');
  const r = run({ activation: actTesting(),
    contracts: { testing: { objective_proofs: [{ proof_type: 'unit', strength: 'standard' }],
      analytical_proofs: [{ proof_type: 'covers_claims', strength: 'standard', required_claims: ['a1'] }] } },
    proofs: {
      'testing:unit': { task: 'settings-name', pack: 'testing', command: 'npm test', exit_code: 0, output_excerpt: '# pass 4', timestamp: '2026-06-10T00:00:00Z' },
      'testing:covers_claims': analyticalRec({ covers_claims: [{ claim_id: 'a1', verdict: 'pass', evidence_ref: 'proof:testing.unit' }] }),
    },
    events: [{ tool: 'Bash', ok: true, cmd: 'npm test' }, { tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }],
    reviewArtifacts: { [REF]: art }, mode: 'native' });
  check('objective-before-analytical: evidence_ref resolves -> READY', r.verdict === 'READY'); }

// 17) analytical missing the matching hook hash -> NOT_READY (fabrication / not observed)
{ const { art } = mkArt('Covered claim a1.');
  const r = run({ activation: actTesting(),
    contracts: { testing: { analytical_proofs: [{ proof_type: 'covers_claims', strength: 'standard', required_claims: ['a1'] }] } },
    proofs: { 'testing:covers_claims': analyticalRec() }, events: [], reviewArtifacts: { [REF]: art }, mode: 'native' });
  check('analytical with no hook hash -> NOT_READY', r.verdict === 'NOT_READY'); }

// 18) generic mode -> READY but surfaces a low-strength warning (never silent)
{ const { art } = mkArt('Covered claim a1.');
  const r = run({ activation: actTesting(),
    contracts: { testing: { analytical_proofs: [{ proof_type: 'covers_claims', strength: 'standard', required_claims: ['a1'] }] } },
    proofs: { 'testing:covers_claims': analyticalRec() }, events: [], reviewArtifacts: { [REF]: art }, mode: 'generic' });
  check('generic analytical -> READY + low-strength warning', r.verdict === 'READY' && /not machine-verified/.test((r.warnings || []).join())); }

// 19) must_not_change: an off-limits file was changed -> NOT_READY unless accepted; empty/no-match -> no-op.
{
  const act = { ...actNone(), changes: { files: ['src/auth/login.ts', 'src/ui/button.ts'], commands: [] } };
  const r = run({ activation: act, mustNotChange: ['src/auth/'] });
  check('must_not_change hit -> NOT_READY', r.verdict === 'NOT_READY' && /off-limits files changed/.test(r.blockers.join()));
  check('must_not_change accepted via decision -> READY', run({ activation: act, mustNotChange: ['src/auth/'], decisions: { 'must-not-change': { ok: true } } }).verdict === 'READY');
  check('must_not_change /regex/ hit -> NOT_READY', run({ activation: act, mustNotChange: [/\/auth\//] }).verdict === 'NOT_READY');
  check('must_not_change pattern not matched -> READY', run({ activation: act, mustNotChange: ['src/payments/'] }).verdict === 'READY');
  check('empty must_not_change -> no-op READY', run({ activation: act }).verdict === 'READY');
}

// 19b) must_not_change + LOW baseline (can't see the diff) -> NOT_READY unless baseline-risk accepted.
// "Can't verify off-limits" must fail toward blocked, not silently READY (Codex GATE).
{
  const blind = { ...actNone(), baseline_confidence: 'low', changes: { files: [], commands: [] } };
  check('must_not_change + baseline low + unseen -> NOT_READY', run({ activation: blind, mustNotChange: ['src/auth/'] }).verdict === 'NOT_READY');
  check('must_not_change + baseline low + baseline-risk accepted -> READY', run({ activation: blind, mustNotChange: ['src/auth/'], decisions: { 'baseline-risk': { ok: true } } }).verdict === 'READY');
  // no must_not_change + baseline low + nothing else in play -> still READY (low baseline alone isn't a blocker)
  check('no must_not_change + baseline low alone -> READY', run({ activation: blind }).verdict === 'READY');
}

// 20) workflow required_artifacts gates the core five (audit #35): a workflow that doesn't require review/brief
// closes without them; the strict default (unknown workflow) still requires all three; listed ones still hold.
{
  const noReviewBrief = { ...coreOK(), review: { v: 'missing' }, brief: { v: 'missing' } };
  check('requiredArtifacts=[evidence] closes w/o review+brief', run({ core: noReviewBrief, requiredArtifacts: ['evidence'] }).verdict === 'READY');
  check('default (unknown workflow) still requires review+brief', run({ core: noReviewBrief }).verdict === 'NOT_READY');
  check('explicit full set still requires review+brief', run({ core: noReviewBrief, requiredArtifacts: ['evidence', 'review', 'brief'] }).verdict === 'NOT_READY');
  check('a REQUIRED artifact still blocks when missing', run({ core: { ...coreOK(), evidence: { v: 'missing' } }, requiredArtifacts: ['evidence'] }).verdict === 'NOT_READY');
  check('plan + intent are ALWAYS required regardless of artifacts', run({ core: { ...coreOK(), intent: 'missing' }, requiredArtifacts: ['evidence'] }).verdict === 'NOT_READY');
  // Defense-in-depth (Codex GATE): an EMPTY array must NOT mean "require nothing" — it falls to the strict
  // default exactly like a non-array/absent value, so a missing review/brief still blocks.
  check('requiredArtifacts=[] falls to strict default (all three)', run({ core: noReviewBrief, requiredArtifacts: [] }).verdict === 'NOT_READY');
  check('requiredArtifacts=null falls to strict default (all three)', run({ core: noReviewBrief, requiredArtifacts: null }).verdict === 'NOT_READY');
}

// 21) code-execution risk (content detector): a dangerous sink raises the code-execution category + implies the
// security pack at full floor — close stays NOT_READY without BOTH the security proof AND the floor acknowledgment.
{
  const act = { ...actNone(), active_packs: ['security'], implied_packs: ['security'], observed_categories: ['code-execution'], floor_strength: 'full' };
  const contracts = { security: { objective_proofs: [{ proof_type: 'security-report-check', strength: 'full' }] } };
  const r = run({ taskStrength: 'full', activation: act, contracts });
  check('code-execution -> NOT_READY (no security proof)', r.verdict === 'NOT_READY' && /security-report-check/.test(r.blockers.join()));
  check('code-execution -> NOT_READY also cites the floor decision', /code-execution/.test(r.blockers.join()));
  // floor decision alone is not enough — the security proof is still required (defense in depth)
  const r2 = run({ taskStrength: 'full', activation: act, contracts, decisions: { 'code-execution': { ok: true } } });
  check('code-execution + floor decision but no proof -> still NOT_READY', r2.verdict === 'NOT_READY' && /security-report-check/.test(r2.blockers.join()));
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
