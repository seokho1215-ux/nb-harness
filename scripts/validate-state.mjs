#!/usr/bin/env node
// Validate .nb/state.json (or the committed state.example.json) against the state-machine rules.
// Dependency-free. Set NB_DIR to point at a different .nb (tests).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom } from './lib/proof.mjs';
import { checkIntentText } from './lib/intent.mjs';
import { checkDesignDocs, designDocsDir } from './lib/design-docs.mjs';
import { statePresetGates } from './lib/preset.mjs';
import { deriveModelPolicy, belowFloor, validateModelPolicy } from './lib/model-policy.mjs';
import { deriveReviewFloor, belowFloor as reviewBelowFloor, validateReviewBudget } from './lib/review-budget.mjs';
import { modelSecurityFloorOn } from './lib/security-floor.mjs';
import { verifyDecision } from './lib/decision.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const projectRoot = process.env.NB_DIR ? resolve(nb, '..') : ROOT; // the project the docs live in (mirror of close.mjs)
const statePath = existsSync(join(nb, 'state.json')) ? join(nb, 'state.json') : join(nb, 'state.example.json');

const STATES = ['idle', 'design', 'implement', 'review', 'security', 'brief', 'done', 'blocked'];

let s;
// stripBom: PowerShell `Set-Content -Encoding UTF8` prepends a BOM; a hand-edited state.json would otherwise
// fail JSON.parse here on Windows (a fail-closed annoyance, not a security hole). Tolerate the benign BOM.
try { s = JSON.parse(stripBom(readFileSync(statePath, 'utf8'))); }
catch (e) { console.error(`cannot read ${statePath}: ${e.message}`); process.exit(1); }

const errs = [];
if (!STATES.includes(s.current_mode)) errs.push(`current_mode "${s.current_mode}" is not a valid state`);

const workflows = (() => {
  try { return readdirSync(join(ROOT, 'workflows')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')); }
  catch { return []; }
})();
if (s.current_workflow && workflows.length && !workflows.includes(s.current_workflow)) {
  errs.push(`current_workflow "${s.current_workflow}" is not a file in workflows/`);
}

if (s.current_task && !s.current_task_slug) errs.push('current_task is set but current_task_slug is missing');

// strength_level (set by /nb:plan -> scripts/strength-judge.mjs): a valid enum if present, and REQUIRED once a
// task is in flight (design..done). idle/blocked don't need it. This is the binding half of audit #7/N2 — a
// task can't sit in design+ with no judged strength, so the plan-time judgment can't be silently skipped.
if (s.strength_level && !['light', 'standard', 'full'].includes(s.strength_level)) {
  errs.push(`strength_level "${s.strength_level}" is not light|standard|full`);
}
// Both strength_level AND current_workflow are set by /nb:plan -> strength-judge and are REQUIRED once a task
// is in flight (design..done; idle/blocked exempt). The plan-time judgment can't be silently skipped — if
// either is absent past plan, the firewall fails closed here (audit #7/N2 binding).
const IN_FLIGHT = ['design', 'implement', 'review', 'security', 'brief', 'done'];
if (IN_FLIGHT.includes(s.current_mode)) {
  if (!s.strength_level) errs.push(`${s.current_mode} requires strength_level (run /nb:plan — strength-judge sets it)`);
  if (!s.current_workflow) errs.push(`${s.current_mode} requires current_workflow (run /nb:plan — strength-judge sets it)`);

  // model-tier axis: in-flight needs a derived model_policy (valid shape), and a policy LOWERED below the
  // derived floor needs a human-approved model-degrade decision. NB derives it; the user only intervenes to lower.
  if (!s.model_policy) {
    errs.push(`${s.current_mode} requires model_policy (run scripts/model-policy.mjs — it derives the model tier)`);
  } else {
    const mErrs = validateModelPolicy(s.model_policy);
    for (const e of mErrs) errs.push(e);
    if (!mErrs.length) {
      const pgz = statePresetGates(s);
      const secF = modelSecurityFloorOn({ workflow: s.current_workflow, categories: [], securityActive: Array.isArray(s.declared_packs) && s.declared_packs.includes('security') });
      const floor = deriveModelPolicy({ strength: s.strength_level, workflow: s.current_workflow, preset: { min_strength: pgz.min_strength, cross_family: pgz.cross_family }, securityFloor: secF });
      const below = belowFloor(s.model_policy, floor);
      if (below.length) {
        const mslug = s.current_task_slug || (s.current_task ? s.current_task.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null);
        const dp = mslug ? join(nb, 'decisions', `${mslug}.model-degrade.md`) : null;
        let ok = false;
        if (dp && existsSync(dp)) { try { ok = verifyDecision(readFileSync(dp, 'utf8'), { kind: 'model-degrade', taskSlug: mslug }).ok; } catch { ok = false; } }
        if (!ok) errs.push(`model_policy is below the derived floor (${below.join('; ')}) — raise it, or record a model-degrade decision`);
      }
    }
  }

  // review-budget axis: in-flight needs a valid review_budget; a budget BELOW the risk floor (fewer review
  // rounds than the change demands) needs a human review-degrade decision. NB derives it; the user only lowers.
  if (!s.review_budget) {
    errs.push(`${s.current_mode} requires review_budget (run /nb:plan — strength-judge seeds it)`);
  } else {
    const rbErrs = validateReviewBudget(s.review_budget);
    for (const e of rbErrs) errs.push(e);
    if (!rbErrs.length) {
      const secActive = Array.isArray(s.declared_packs) && s.declared_packs.includes('security');
      const rbFloor = deriveReviewFloor({ workflow: s.current_workflow, categories: [], securityActive: secActive });
      if (reviewBelowFloor(s.review_budget.level, rbFloor)) {
        const rslug = s.current_task_slug || (s.current_task ? s.current_task.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null);
        const dp = rslug ? join(nb, 'decisions', `${rslug}.review-degrade.md`) : null;
        let ok = false;
        if (dp && existsSync(dp)) { try { ok = verifyDecision(readFileSync(dp, 'utf8'), { kind: 'review-degrade', taskSlug: rslug }).ok; } catch { ok = false; } }
        if (!ok) errs.push(`review_budget "${s.review_budget.level}" is below the risk floor "${rbFloor}" — raise it, or record a review-degrade decision`);
      }
    }
  }
}

// intent lock (set by /nb:plan -> scripts/intent-lock.mjs): once a task is being IMPLEMENTED (past planning),
// a REAL intent + definition_of_done must be locked (non-stub) and non_goals must be a list. design is exempt
// (intent is still being captured during planning); implement..done require it. audit #8/N3 binding — "done"
// must be reconcilable against a real definition of done, never a blank or stub one.
const POST_PLAN = ['implement', 'review', 'security', 'brief', 'done'];
if (POST_PLAN.includes(s.current_mode)) {
  const iv = checkIntentText(s.intent_summary);
  if (!iv.ok) errs.push(`${s.current_mode} requires a locked intent_summary (${iv.reason}) — run /nb:plan (intent-lock)`);
  const dv = checkIntentText(s.definition_of_done);
  if (!dv.ok) errs.push(`${s.current_mode} requires a definition_of_done (${dv.reason}) — run /nb:plan (intent-lock)`);
  if (!Array.isArray(s.non_goals)) errs.push(`${s.current_mode} requires non_goals to be a list (run /nb:plan — intent-lock)`);
  // P-e/#9 + M2: the planner's 3-tier docs must EXIST and each task must DECLARE its context budget before a task
  // is implemented/closed. state.design_docs overrides the default pipeline/<slug> dir.
  const slug = s.current_task_slug || (s.current_task ? s.current_task.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null);
  if (slug) {
    const dd = checkDesignDocs(projectRoot, slug, s.design_docs);
    for (const e of dd.errors) errs.push(`${s.current_mode}: ${e}`);
    // Transparency floor (core/scope-value.md): if a core_value is declared, the planner must have EXPLAINED how
    // it's preserved — a `## Design Decisions` section (in 01-architecture.md or meta.md). The planner.md prompt
    // requires it always; this binds it DETERMINISTICALLY only where a silent scope-shrink is possible (a
    // core_value exists). No core_value (light/non-product work) → no requirement (proportionality).
    if (Array.isArray(s.core_value) && s.core_value.length) {
      const ddir = designDocsDir(projectRoot, slug, s.design_docs);
      const hasDecisions = ['01-architecture.md', 'meta.md'].some((f) => {
        const p = join(ddir, f);
        if (!existsSync(p)) return false;
        try { return /^#{1,6}\s*design\s+decisions\b/im.test(readFileSync(p, 'utf8')); } catch { return false; }
      });
      if (!hasDecisions) errs.push(`${s.current_mode}: a core_value is declared but no "## Design Decisions" section explains it (core/scope-value.md) — the planner must state what's deferred & why + core_value→acceptance traceability in 01-architecture.md or meta.md`);
    }
  }
}
// drift_risks (P-c/#16): if present it must be a list (the intent-drift signal grill records). close binds it —
// a non-empty drift_risks without a drift-accepted decision blocks, just like open_risks.
if (s.drift_risks != null && !Array.isArray(s.drift_risks)) errs.push('drift_risks must be a list (intent-drift signals)');
// scope & core-value (core/scope-value.md): all OPTIONAL (no hard-require — proportionality, non-product/light
// work carries none). If present each must be a list of strings, so the planner gate reads a real shape.
for (const k of ['core_value', 'must_preserve', 'defer_candidates']) {
  if (s[k] == null) continue;
  if (!Array.isArray(s[k])) { errs.push(`${k} must be a list (core/scope-value.md)`); continue; }
  if (s[k].some((v) => typeof v !== 'string')) errs.push(`${k} entries must be strings`);
}
// must_not_change is optional, but if present it must be a list of strings, and any /regex/ entry must
// compile (close would otherwise silently fall back to a substring match — a quiet weakening of the guard).
if (s.must_not_change != null) {
  if (!Array.isArray(s.must_not_change)) errs.push('must_not_change must be a list (off-limits file/area patterns)');
  else for (const p of s.must_not_change) {
    if (typeof p !== 'string') { errs.push('must_not_change entries must be strings'); continue; }
    const m = /^\/(.*)\/([a-z]*)$/.exec(p);
    if (m) { try { new RegExp(m[1], m[2]); } catch { errs.push(`must_not_change has an invalid /regex/: ${p}`); } }
  }
}

// preset is optional (an applied gate profile, scripts/apply-preset.mjs). If present, its gates must be the
// raise-only shape close/score read: require_artifacts a list of valid kinds, min_strength a valid enum/null.
// close re-validates on read (statePresetGates ignores garbage), but a malformed applied preset is a state-shape
// problem worth surfacing here rather than silently dropping.
if (s.preset != null) {
  if (typeof s.preset !== 'object' || Array.isArray(s.preset)) errs.push('preset must be an object (or null)');
  else {
    if (!s.preset.id) errs.push('preset is set but has no id');
    const g = s.preset.gates;
    if (g != null) {
      if (typeof g !== 'object' || Array.isArray(g)) errs.push('preset.gates must be an object');
      else {
        if (g.require_artifacts != null && (!Array.isArray(g.require_artifacts) || g.require_artifacts.some((k) => !['evidence', 'review', 'brief'].includes(k)))) {
          errs.push('preset.gates.require_artifacts must be a list of evidence|review|brief');
        }
        if (g.min_strength != null && !['light', 'standard', 'full'].includes(g.min_strength)) {
          errs.push(`preset.gates.min_strength "${g.min_strength}" is not light|standard|full`);
        }
      }
    }
  }
}

const slug = s.current_task_slug || (s.current_task ? s.current_task.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null);
const pointerMatches = (p) => {
  if (!p) return true;
  const base = String(p).split('/').pop().toLowerCase();
  if (slug && base.includes(slug)) return true;
  if (s.current_task && base.includes(s.current_task.toLowerCase())) return true;
  return false;
};
for (const k of ['last_evidence', 'last_review', 'last_brief', 'last_security']) {
  if (s[k] && !pointerMatches(s[k])) errs.push(`${k} does not match the current task`);
}

if (s.current_mode === 'done') {
  if (!s.last_evidence) errs.push('done requires evidence (last_evidence)');
  if (!s.last_review) errs.push('done requires review (last_review)');
  if (!s.last_brief) errs.push('done requires brief (last_brief)');
}

// security-sensitive workflow MUST pass through `security` before done (core/state-machine.md; audit #20).
// validate-state can't see history, so it binds the OUTCOME: once a security-sensitive task is past the
// security step (brief/done), the security artifact pointer (last_security, written by /nb:security) must be
// recorded. This is the state-shape half; close.mjs independently forces the security pack's proof (firewall).
if (s.current_workflow === 'security-sensitive' && ['brief', 'done'].includes(s.current_mode)) {
  if (!s.last_security) errs.push(`security-sensitive ${s.current_mode} requires a security artifact (last_security) — run /nb:security`);
}
if (s.current_mode === 'blocked') {
  const hasReason = (Array.isArray(s.open_risks) && s.open_risks.length > 0) || s.blocked_reason;
  if (!hasReason) errs.push('blocked requires open_risks or blocked_reason');
}

const rel = statePath.slice(ROOT.length + 1).split('\\').join('/');
if (errs.length) { console.log(`state INVALID (${rel})`); errs.forEach((e) => console.log(`   - ${e}`)); process.exit(1); }
console.log(`state OK (${s.current_mode}) — ${rel}`);
process.exit(0);
