#!/usr/bin/env node
// Tests for validate-state.mjs — drives the real validator against temp .nb/state.json via NB_DIR.
// Focus: the audit #20 binding (a security-sensitive workflow can't reach brief/done without last_security)
// plus the core done-state pointers. Dependency-free.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VS = join(ROOT, 'scripts', 'validate-state.mjs');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

// A fully-valid post-plan task state; tests override fields to probe a single rule at a time. model_policy is
// set to the strongest/two-family ceiling so it's at or above every workflow floor (so model-tier rules don't
// fire unless a test lowers it).
const base = (over = {}) => ({
  harness_version: '0.1.0', current_mode: 'done', current_workflow: 'standard-feature',
  current_task: 'add-thing', current_task_slug: 'add-thing', strength_level: 'standard',
  intent_summary: 'Add the thing the user asked for, wired end to end and verified.',
  definition_of_done: 'The thing works, is covered by a test, and the brief explains it.',
  non_goals: ['no refactor'],
  model_policy: { planner: 'strongest', implement: 'strongest', review: 'strongest', security: 'strongest', family: 'two-family' },
  review_budget: { level: 'two_round', source: 'auto', floor: 'two_round' },
  last_evidence: '.nb/evidence/add-thing.md', last_review: '.nb/reviews/add-thing.md',
  last_brief: '.nb/briefs/add-thing.md', last_security: null, updated_at: '2026-06-14',
  ...over,
});

// Create the planner's 3-tier docs at pipeline/<slug>/ (P-e/#9 + M2) so a POST_PLAN state can validate.
function writeDesignDocs(projectRoot, slug) {
  const dir = join(projectRoot, 'pipeline', slug, '03-tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(projectRoot, 'pipeline', slug, '01-architecture.md'), '# Architecture\n');
  writeFileSync(join(projectRoot, 'pipeline', slug, '02-module.md'), '# Module contract\n');
  writeFileSync(join(dir, '01.md'), '# Task 01\n\n## Context Budget\n02-module + task = ~20% of the window.\n');
}

function runState(state, { skipDocs = false, decision = null } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'nb-vs-'));
  mkdirSync(join(t, '.nb', 'decisions'), { recursive: true });
  if (!skipDocs) writeDesignDocs(t, state.current_task_slug || 'add-thing');
  writeFileSync(join(t, '.nb', 'state.json'), JSON.stringify(state));
  if (decision) writeFileSync(join(t, '.nb', 'decisions', decision.name), decision.body);
  const r = spawnSync('node', [VS], { encoding: 'utf8', env: { ...process.env, NB_DIR: join(t, '.nb') } });
  rmSync(t, { recursive: true, force: true });
  return r;
}
const ok = (state, opts) => runState(state, opts).status === 0;
const bad = (state, needle, opts) => { const r = runState(state, opts); return r.status === 1 && (!needle || r.stdout.includes(needle)); };

// baseline: a valid standard-feature done state passes
check('valid standard-feature done -> OK', ok(base()));

// #20: security-sensitive at done/brief REQUIRES last_security
check('security-sensitive done w/o last_security -> INVALID',
  bad(base({ current_workflow: 'security-sensitive' }), 'last_security'));
check('security-sensitive brief w/o last_security -> INVALID',
  bad(base({ current_workflow: 'security-sensitive', current_mode: 'brief' }), 'last_security'));
check('security-sensitive done WITH last_security -> OK',
  ok(base({ current_workflow: 'security-sensitive', last_security: '.nb/reviews/add-thing.security-report.md' })));
// the requirement only bites past the security step
check('security-sensitive implement (pre-security) w/o last_security -> OK',
  ok(base({ current_workflow: 'security-sensitive', current_mode: 'implement', last_security: null })));
// a normal workflow is unaffected by the security pointer rule
check('standard-feature done w/o last_security -> OK', ok(base({ last_security: null })));
// last_security present but pointing at another task -> task-match catch
check('last_security for a different task -> INVALID',
  bad(base({ current_workflow: 'security-sensitive', last_security: '.nb/reviews/other-task.security-report.md' }), 'last_security'));

// core done pointers still enforced (regression)
check('done w/o last_review -> INVALID', bad(base({ last_review: null }), 'last_review'));

// P-e/#9 + M2: design docs must exist (with a Context Budget) in POST_PLAN
check('implement w/o design docs -> INVALID', bad(base({ current_mode: 'implement' }), 'design docs', { skipDocs: true }));
check('implement WITH design docs -> OK', ok(base({ current_mode: 'implement' })));

// model-tier axis: in-flight needs a valid model_policy; a below-floor policy needs a model-degrade decision
check('done w/o model_policy -> INVALID', bad(base({ model_policy: null }), 'model_policy'));
check('done with malformed model_policy -> INVALID', bad(base({ model_policy: { planner: 'turbo', implement: 'strong', review: 'strong', family: 'single' } }), 'model_policy'));
// security-sensitive floor is strongest/two-family — a 'fast' implement is below it -> needs a decision
const degradeBody = 'task: add-thing\nkind: model-degrade\ndecision: Run implement on a balanced model to save cost; risk is low for this slice.\nrationale: The change is small and well-scoped; a balanced model is sufficient and a human reviewed the choice.\napproved_by: Maintainer\ntimestamp: 2026-06-14\n';
const lowSec = base({ current_workflow: 'security-sensitive', last_security: '.nb/reviews/add-thing.security-report.md', model_policy: { planner: 'strongest', implement: 'fast', review: 'strongest', security: 'strongest', family: 'two-family' } });
check('security-sensitive with implement below floor, no decision -> INVALID', bad(lowSec, 'below the derived floor'));
check('security-sensitive below floor WITH model-degrade decision -> OK', ok(lowSec, { decision: { name: 'add-thing.model-degrade.md', body: degradeBody } }));

// review-budget axis: in-flight needs a valid review_budget; a budget below the risk floor needs review-degrade
check('done w/o review_budget -> INVALID', bad(base({ review_budget: null }), 'review_budget'));
check('done with malformed review_budget -> INVALID', bad(base({ review_budget: { level: 'triple', source: 'auto' } }), 'review_budget'));
// standard-feature floor=single; a hand-edited 'none' is below floor -> needs review-degrade
check('standard-feature review_budget none (below floor) no decision -> INVALID', bad(base({ current_workflow: 'standard-feature', review_budget: { level: 'none', source: 'user_degrade', floor: 'single' } }), 'below the risk floor'));
const rdBody = 'task: add-thing\nkind: review-degrade\ndecision: Skip the second review round for this small, low-risk slice.\nrationale: The change is tiny and well-scoped; one review is enough and a human signed off on fewer rounds.\napproved_by: Maintainer\ntimestamp: 2026-06-14\n';
check('standard-feature review_budget none (below floor) WITH review-degrade -> OK', ok(base({ current_workflow: 'standard-feature', review_budget: { level: 'none', source: 'user_degrade', floor: 'single' } }), { decision: { name: 'add-thing.review-degrade.md', body: rdBody } }));
// security-sensitive floor=two_round; 'single' is below -> needs review-degrade
check('security-sensitive review_budget single (below floor) no decision -> INVALID', bad(base({ current_workflow: 'security-sensitive', last_security: '.nb/reviews/add-thing.security-report.md', review_budget: { level: 'single', source: 'user_degrade', floor: 'two_round' } }), 'below the risk floor'));

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
