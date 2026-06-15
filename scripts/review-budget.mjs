#!/usr/bin/env node
// NB review-budget — record how many review rounds a task gets (audit: the review-budget user-trigger axis).
// NB auto-derives a floor from the workflow/risk; the user steers it in plain language. Raising is free; a budget
// BELOW the risk floor needs a human review-degrade decision. /nb:close enforces the recorded budget.
//
//   node scripts/review-budget.mjs --intent "빡쎄게"          # parse a plain-language review intent
//   node scripts/review-budget.mjs --request single           # set an explicit level (none|single|two_round)
//   node scripts/review-budget.mjs --show                     # print the floor + current budget
// Exit: 0 ok · 1 degrade refused (no review-degrade decision) · 2 bad input / corrupt state.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom, slugify } from './lib/proof.mjs';
import { verifyDecision } from './lib/decision.mjs';
import { deriveReviewFloor, parseReviewIntent, resolveReviewBudget, validateReviewBudget, LEVELS } from './lib/review-budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const show = args.includes('--show');

function loadState() {
  const sp = join(nb, 'state.json'); const ep = join(nb, 'state.example.json');
  if (existsSync(sp)) { try { return JSON.parse(stripBom(readFileSync(sp, 'utf8'))); } catch (e) { console.error(`review-budget: .nb/state.json is corrupt (${e && e.message ? e.message : e}) — refusing to overwrite.`); process.exit(2); } }
  if (existsSync(ep)) { try { const s = JSON.parse(stripBom(readFileSync(ep, 'utf8'))); delete s.$comment; return s; } catch (e) { console.error(`review-budget: state.example.json unreadable (${e && e.message ? e.message : e})`); process.exit(2); } }
  return {};
}

const state = loadState();
const declared = Array.isArray(state.declared_packs) ? state.declared_packs : [];
// Plan-time floor: workflow + declared security pack (close re-derives from OBSERVED categories at close).
const floor = deriveReviewFloor({ workflow: state.current_workflow, categories: [], securityActive: declared.includes('security') });

if (show) {
  console.log(`Review floor:   ${floor}  (workflow ${state.current_workflow || 'none'}${declared.includes('security') ? ', security pack' : ''})`);
  console.log(`Current budget: ${state.review_budget ? `${state.review_budget.level} (source ${state.review_budget.source})` : '(none set — run without --show to derive)'}`);
  process.exit(0);
}

// requested level: --request <level> OR --intent "<natural language>" (parsed). No flag => derive the floor.
let request = null;
const reqFlag = flag('--request');
const intent = flag('--intent');
if (reqFlag != null) {
  if (!LEVELS.includes(reqFlag)) { console.error(`review-budget: --request must be one of ${LEVELS.join('|')}`); process.exit(2); }
  request = reqFlag;
} else if (intent != null) {
  request = parseReviewIntent(intent);
  if (request == null) { console.error(`review-budget: no review intent recognized in "${intent}" — say e.g. "빡쎄게" / "1회만" / "넘어가", or use --request.`); process.exit(2); }
}

const res = resolveReviewBudget({ floor, request });
if (res.belowFloor) {
  // a deliberate degrade below the risk floor — NB does not apply it silently; require a human decision first.
  const slug = state.current_task_slug || slugify(state.current_task || '');
  const dp = slug ? join(nb, 'decisions', `${slug}.review-degrade.md`) : null;
  let ok = false;
  if (dp && existsSync(dp)) { try { ok = verifyDecision(readFileSync(dp, 'utf8'), { kind: 'review-degrade', taskSlug: slug, now: Date.now() }).ok; } catch { ok = false; } }
  if (!ok) {
    console.error(`review-budget: REFUSED to set review budget "${res.level}" below the risk floor "${floor}" without a decision.`);
    console.error(`Record a human-approved .nb/decisions/${slug || '<task>'}.review-degrade.md (kind: review-degrade) explaining why less review is acceptable, then re-run.`);
    process.exit(1);
  }
}

const budget = { level: res.level, source: res.source, floor };
const errs = validateReviewBudget(budget);
if (errs.length) { console.error('review-budget: derived budget is malformed:'); for (const e of errs) console.error(`   - ${e}`); process.exit(2); }

state.review_budget = budget;
state.updated_at = new Date().toISOString();
try { writeFileSync(join(nb, 'state.json'), JSON.stringify(state, null, 2) + '\n'); }
catch (e) { console.error(`review-budget: could not write state.json: ${e && e.message ? e.message : e}`); process.exit(2); }

console.log(`review_budget: ${budget.level} (source ${budget.source}, floor ${floor})`);
console.log('state -> .nb/state.json');
process.exit(0);
