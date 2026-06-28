#!/usr/bin/env node
// NB close — the completion firewall (CLI). Thin wrapper: it GATHERS the real inputs from the trusted
// installed root and calls the pure lib/close-engine.mjs. It loads contract rules ONLY from the trusted
// packs/ — it refuses any env contract-source override (that would let someone swap the firewall's own
// rules = a backdoor). It fails CLOSED: any read/parse error => CHECK ERROR (exit 2), never a quiet pass.
//
// Exit: 0 = READY / READY WITH RISKS · 1 = NOT READY · 2 = CHECK ERROR. Set NB_DIR to point at a test .nb.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreTask } from './lib/score.mjs';
import { loadEvents } from './lib/proof.mjs';
import { resolveActivation } from './lib/activation.mjs';
import { closeEngine } from './lib/close-engine.mjs';
import { verifyDecision } from './lib/decision.mjs';
import { slugify, stripBom } from './lib/proof.mjs';
import { requiredFor } from './lib/workflow.mjs';
import { statePresetGates } from './lib/preset.mjs';
import { deriveModelPolicy, belowFloor } from './lib/model-policy.mjs';
import { deriveReviewFloor, reviewRequirements, belowFloor as reviewBelowFloor } from './lib/review-budget.mjs';
import { securityFloorOn, modelSecurityFloorOn } from './lib/security-floor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const projectRoot = process.env.NB_DIR ? resolve(nb, '..') : ROOT;
const line = (r) => `${r.v}${r.note ? ` (${r.note})` : ''}`;

// A MISSING state.json is fine (no task yet -> {} -> NOT_READY on the core five). A PRESENT-but-corrupt
// state.json is a trust problem for a "judgment" command: let JSON.parse throw -> top-level catch -> CHECK
// ERROR (fail closed). We must not silently treat a garbled state as empty and proceed.
function readState(nbDir) {
  const p = join(nbDir, 'state.json');
  if (!existsSync(p)) return {};
  return JSON.parse(stripBom(readFileSync(p, 'utf8'))); // corrupt existing state -> throws -> CHECK ERROR
}
// An activation rule is a substring matcher by default; a /pattern/flags-delimited string compiles to a
// RegExp (activation.mjs accepts either). A non-compiling /.../ falls back to substring (validate-packs
// rejects those at build time, so this is just runtime safety).
const compileRule = (r) => { const m = /^\/(.*)\/([a-z]*)$/.exec(String(r)); if (!m) return r; try { return new RegExp(m[1], m[2]); } catch { return r; } };
const compileRules = (ar) => ({ paths: (ar.paths || []).map(compileRule), commands: (ar.commands || []).map(compileRule) });

// Contract data comes ONLY from the trusted installed packs/ — never from an env override.
function loadPackData(root) {
  const dir = join(root, 'packs'); const rules = {}, contracts = {}, stable = new Set();
  if (!existsSync(dir)) return { rules, contracts, stable };
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mf = join(dir, e.name, 'nb-pack.json');
    if (!existsSync(mf)) continue;
    const m = JSON.parse(stripBom(readFileSync(mf, 'utf8'))); // throws on bad manifest -> caught -> CHECK ERROR
    const cc = m.close_contract;
    if (cc?.activation_rules) rules[m.id] = compileRules(cc.activation_rules);
    if (cc) contracts[m.id] = cc;
    if (m.status === 'stable') stable.add(m.id);
  }
  return { rules, contracts, stable };
}
function loadProofs(nbDir, slug) {
  const out = {}; const dir = join(nbDir, 'proofs');
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const rec = JSON.parse(stripBom(readFileSync(join(dir, f), 'utf8'))); // bad proof JSON -> caught -> CHECK ERROR
    if (slug && rec.task && slugify(rec.task) !== slugify(slug)) continue; // exact task scope, not substring
    if (rec.pack && rec.proof_type) out[`${rec.pack}:${rec.proof_type}`] = rec;
  }
  return out;
}
// A decision counts only with the real SHAPE of a decision (lib/decision.mjs) — not just "approved_by" + a
// date. Bad-shape content => ok:false => NOT_READY (the user fixes it). An UNREADABLE file throws => caught by
// the top-level handler => CHECK ERROR (fail closed): we never silently skip a decision we can't read.
function loadDecisions(nbDir, slug, now) {
  const out = {}; const dir = join(nbDir, 'decisions');
  if (!slug || !existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || !f.startsWith(slug + '.')) continue;
    const kind = f.slice(slug.length + 1, -3);
    const txt = readFileSync(join(dir, f), 'utf8'); // read error -> throws -> CHECK ERROR (fail closed)
    out[kind] = verifyDecision(txt, { kind, taskSlug: slug, now });
  }
  return out;
}
// Review artifacts are project-side EVIDENCE (not a contract — no backdoor). Keyed by both the path an
// analytical proof would reference (.nb/reviews/<f>) and the bare filename. A read error throws => CHECK ERROR.
function loadReviews(nbDir) {
  const out = {}; const dir = join(nbDir, 'reviews');
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const txt = readFileSync(join(dir, f), 'utf8'); // read error -> throws -> CHECK ERROR (fail closed)
    out[f] = txt; out[`.nb/reviews/${f}`] = txt;
  }
  return out;
}

try {
  const envOverride = !!(process.env.NB_PACKS_DIR || process.env.NB_CONTRACT_ROOT);
  const core = scoreTask(nb);
  const slug = core.slug;
  const state = readState(nb);
  const { rules, contracts, stable } = loadPackData(ROOT); // trusted root, NOT projectRoot/env
  const activation = resolveActivation({ nbDir: nb, root: projectRoot, state, packRules: rules });
  const now = Date.now();
  const events = loadEvents(nb);
  const proofs = loadProofs(nb, slug);
  const decisions = loadDecisions(nb, slug, now);
  const reviewArtifacts = loadReviews(nb);
  // Native (strict, fail-closed binding) by default; an overlay adapter sets state.mode='generic' to allow a
  // clearly-labeled low-strength manual review path. Default native => the firewall never silently degrades.
  const mode = (state.mode === 'generic' || state.adapter === 'generic') ? 'generic' : 'native';
  const activeContracts = {};
  for (const p of activation.active_packs) if (contracts[p]) activeContracts[p] = contracts[p];

  // A workflow-forced pack (audit #20: security-sensitive -> security) MUST carry a close_contract: a forced
  // pack with no contract means the firewall can't verify the domain the workflow declared in play, so it has
  // to fail CHECK_ERROR (the engine errors on an explicit+stable pack with no contract) — never silently skip.
  const stablePacks = new Set(stable);
  for (const p of activation.forced_packs || []) stablePacks.add(p);

  // must_not_change: the plan's off-limits list (intent-lock). Compile each entry the same way activation
  // rules are (plain substring, or a /regex/), so close-engine can match them against the observed changes.
  const mustNotChange = (Array.isArray(state.must_not_change) ? state.must_not_change : []).map(compileRule);
  // which core artifacts THIS workflow requires (audit #35) — from the trusted installed workflows/ frontmatter.
  // An applied preset (audit M1) can only RAISE this: UNION its always-required artifacts and MAX the strength
  // against the floor (statePresetGates re-validates the persisted block, so a hand-edited state.preset can only
  // add VALID requirements — never lower a gate). A preset's "low"/"floor" adds nothing.
  const pg = statePresetGates(state);
  const requiredArtifacts = [...new Set([...requiredFor(ROOT, state.current_workflow), ...pg.require_artifacts])];
  const RANK = { light: 1, standard: 2, full: 3 };
  let taskStrength = state.strength_level || 'standard';
  if (pg.min_strength && (RANK[pg.min_strength] || 0) > (RANK[taskStrength] || 0)) taskStrength = pg.min_strength;

  // review-budget axis: derive the floor from the OBSERVED workflow/categories/security, then honor the recorded
  // budget. requiresReview -> review is a required artifact; requiresTwoRound (two_round) -> force the security
  // pack's 2-round security-report-check (raise to full + add security to the active+stable set). A budget BELOW
  // the floor needs a review-degrade decision (the engine blocks otherwise). Raise-only: it can only ADD review.
  const securityActive = activation.active_packs.includes('security');
  const secFloor = securityFloorOn({ workflow: state.current_workflow, categories: activation.observed_categories, securityActive });
  const reviewFloor = deriveReviewFloor({ workflow: state.current_workflow, categories: activation.observed_categories, securityActive });
  const reviewLevel = (state.review_budget && state.review_budget.level) || reviewFloor;
  const reviewBudgetBelowFloor = reviewBelowFloor(reviewLevel, reviewFloor);
  const rbReqs = reviewRequirements(reviewLevel);
  if (rbReqs.requiresReview && !requiredArtifacts.includes('review')) requiredArtifacts.push('review');
  // two_round splits by CONTEXT: a SECURITY floor forces the 2-round security-report-check (force the security
  // pack + full); a GENERAL two_round just requires a 2nd review round (engine checks core.reviewCount >= 2).
  let generalTwoRound = false;
  if (rbReqs.requiresTwoRound) {
    if (secFloor) {
      if (!activation.active_packs.includes('security')) activation.active_packs.push('security');
      if (contracts.security) activeContracts.security = contracts.security;
      stablePacks.add('security');
      if (RANK.full > RANK[taskStrength]) taskStrength = 'full';
    } else {
      generalTwoRound = true;
    }
  }

  // model-tier axis: derive the floor from strength/workflow/preset; a present-but-below-floor policy is a
  // degrade (needs a model-degrade decision); a missing policy blocks once a task is in flight (implement..done).
  const modelSecFloor = modelSecurityFloorOn({ workflow: state.current_workflow, categories: activation.observed_categories, securityActive });
  const modelFloor = deriveModelPolicy({ strength: state.strength_level, workflow: state.current_workflow, preset: { min_strength: pg.min_strength, cross_family: pg.cross_family }, securityFloor: modelSecFloor });
  const inFlight = ['implement', 'review', 'security', 'brief', 'done'].includes(state.current_mode);
  const modelPolicyMissing = inFlight && !state.model_policy;
  const modelBelowFloor = state.model_policy ? belowFloor(state.model_policy, modelFloor) : [];

  const result = closeEngine({
    core, activation, contracts: activeContracts, stablePacks,
    proofs, events, decisions, reviewArtifacts, mode, now, mustNotChange, requiredArtifacts,
    taskSlug: slug, taskStrength, envOverride, driftRisks: state.drift_risks,
    modelPolicyMissing, modelBelowFloor, reviewBudgetBelowFloor, generalTwoRound,
    currentMode: state.current_mode, currentWorkflow: state.current_workflow, presetCrossFamily: pg.cross_family,
  });

  console.log('NB close — can this task be closed as done?');
  console.log(`Task: ${core.task || 'unknown'}\n`);
  console.log(`Plan: ${core.plan}`);
  console.log(`Intent: ${core.intent}`);
  console.log(`Evidence: ${line(core.evidence)}`);
  // H2: state the review's provenance strength honestly (cross-family/manual/unverified), not a bare yes/no.
  const revStr = core.review.v === 'yes' && core.review.strength ? ` [${core.review.strength}]` : '';
  console.log(`Review: ${line(core.review)}${revStr}`);
  console.log(`Brief: ${line(core.brief)}`);
  console.log(`Open risks: ${core.openRisks}`);
  if (state.preset && state.preset.id) {
    const extra = pg.require_artifacts.length ? `+${pg.require_artifacts.join('/')}` : 'no extra artifacts';
    console.log(`Preset: ${state.preset.id} (${extra}${pg.min_strength ? `, min strength ${pg.min_strength}` : ''})`);
  }
  if (state.model_policy) console.log(`Model tier: implement ${state.model_policy.implement} · review ${state.model_policy.review} · family ${state.model_policy.family}${modelBelowFloor.length ? ` (⚠ below floor: ${modelBelowFloor.join('; ')})` : ''}`);
  console.log(`Review budget: ${reviewLevel}${reviewLevel !== reviewFloor ? ` (floor ${reviewFloor}${reviewBudgetBelowFloor ? ', ⚠ BELOW floor' : ''})` : ''}`);
  if (activation.active_packs.length) console.log(`Active packs: ${activation.active_packs.join(', ')}`);
  if (activation.observed_categories.length) console.log(`Risk categories: ${activation.observed_categories.join(', ')}`);
  const exrep = activation.exec_scan || { hits: [], skipped: [] };
  if (exrep.hits.length) {
    console.log(`Dangerous sinks (code-execution): ${exrep.hits.length} — ${[...new Set(exrep.hits.map((h) => `${h.file}:${h.line} ${h.sink}`))].slice(0, 8).join('; ')}`);
  }
  if (exrep.skipped.length) console.log(`Sink scan skipped ${exrep.skipped.length} file(s): ${exrep.skipped.map((s) => `${s.file} (${s.reason})`).slice(0, 8).join(', ')}`);
  const cirep = activation.ci_scan || { hits: [] };
  if (cirep.hits.length) {
    console.log(`CI workflow risks (ci-security): ${cirep.hits.length} — ${[...new Set(cirep.hits.map((h) => `${h.file}:${h.line} ${h.signal.split(' —')[0].split(' (')[0]}`))].slice(0, 6).join('; ')}`);
  }
  if (activation.baseline_confidence === 'low') console.log('Baseline: low confidence (git diff unavailable)');
  console.log('');

  if (result.verdict === 'CHECK_ERROR') {
    console.log('‼ CHECK ERROR — cannot determine readiness (firewall fails closed):');
    for (const e of result.errors) console.log(`   - ${e}`);
    process.exit(2);
  }
  if (result.verdict === 'NOT_READY') {
    console.log('✗ NOT READY — cannot close this task as done.');
    console.log('  Blocking:');
    for (const b of result.blockers) console.log(`   - ${b}`);
    process.exit(1);
  }
  // low-strength notices (e.g. a Generic-mode manual review that was NOT machine-verified) — never silent.
  const warn = () => { for (const w of result.warnings || []) console.log(`   ⚠ ${w}`); };
  if (result.verdict === 'READY_WITH_RISKS') {
    console.log('⚠ READY WITH RISKS — requirements met; open risks were accepted via a decision artifact.');
    for (const r of core.openRiskList) console.log(`   - ${r}`);
    warn();
    process.exit(0);
  }
  console.log('✓ READY — plan, intent, task-matched evidence, review, brief, and all active-pack/floor proofs are present.');
  warn();
  process.exit(0);
} catch (e) {
  // fail closed: if we cannot read/parse what we need, we cannot certify done.
  console.log('NB close — can this task be closed as done?\n');
  console.log('‼ CHECK ERROR — the firewall could not complete its checks (fails closed):');
  console.log(`   - ${e && e.message ? e.message : e}`);
  process.exit(2);
}
