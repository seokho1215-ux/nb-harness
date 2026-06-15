#!/usr/bin/env node
// NB model-policy — derive the portable model TIER per lane from the task's strength/workflow/preset and persist
// it to .nb/state.json (audit: the model-tier axis). NB does NOT name a vendor model; it derives a tool-agnostic
// tier (fast/balanced/strong/strongest + family single/cross-family/two-family) the adapter maps to a real model.
// The human does NOT pick a model per task — NB derives it. RAISE-ONLY: re-derive never lowers a raised policy;
// LOWERING a lane below the derived floor needs a `.nb/decisions/<task>.model-degrade.md` decision first.
//
//   node scripts/model-policy.mjs                              # derive + persist the floor (raise-only)
//   node scripts/model-policy.mjs --show                       # print the derived floor + current policy
//   node scripts/model-policy.mjs --degrade implement=balanced # lower a lane (REQUIRES a model-degrade decision)
// Exit: 0 ok · 1 degrade refused (no decision) · 2 bad input / corrupt state.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom, slugify } from './lib/proof.mjs';
import { verifyDecision } from './lib/decision.mjs';
import { statePresetGates } from './lib/preset.mjs';
import { deriveModelPolicy, raiseOnly, belowFloor, validateModelPolicy, TIERS } from './lib/model-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const show = args.includes('--show');

function loadState() {
  const sp = join(nb, 'state.json'); const ep = join(nb, 'state.example.json');
  if (existsSync(sp)) { try { return JSON.parse(stripBom(readFileSync(sp, 'utf8'))); } catch (e) { console.error(`model-policy: .nb/state.json is corrupt (${e && e.message ? e.message : e}) — refusing to overwrite.`); process.exit(2); } }
  if (existsSync(ep)) { try { const s = JSON.parse(stripBom(readFileSync(ep, 'utf8'))); delete s.$comment; return s; } catch (e) { console.error(`model-policy: state.example.json unreadable (${e && e.message ? e.message : e})`); process.exit(2); } }
  return {};
}

const state = loadState();
const pg = statePresetGates(state);
const floor = deriveModelPolicy({ strength: state.strength_level, workflow: state.current_workflow, preset: { min_strength: pg.min_strength, cross_family: pg.cross_family } });

const fmt = (p) => `planner ${p.planner} · implement ${p.implement} · review ${p.review} · security ${p.security || 'none'} · family ${p.family}`;
if (show) {
  console.log(`Derived floor:  ${fmt(floor)}`);
  console.log(`  (${floor.reason})`);
  if (state.model_policy) {
    console.log(`Current policy: ${fmt(state.model_policy)}`);
    const bel = belowFloor(state.model_policy, floor);
    if (bel.length) console.log(`  ⚠ below floor: ${bel.join('; ')} — needs a model-degrade decision`);
  } else console.log('Current policy: (none set — run without --show to derive)');
  process.exit(0);
}

// --degrade lane=tier (repeatable): a deliberate lowering. NB does not apply it silently — a valid
// model-degrade decision MUST exist first (the human owns lowering the model bar on a risky task).
const degrades = args.reduce((acc, a, i) => (a === '--degrade' && args[i + 1] ? acc.concat(args[i + 1]) : acc), []);
let policy = raiseOnly(floor, state.model_policy);
if (degrades.length) {
  for (const d of degrades) {
    const m = /^(planner|implement|review|security)=(\w+)$/.exec(d);
    if (!m) { console.error(`model-policy: bad --degrade "${d}" (use lane=tier, lane ∈ planner|implement|review|security)`); process.exit(2); }
    if (!TIERS.includes(m[2])) { console.error(`model-policy: bad tier "${m[2]}" (one of ${TIERS.join('|')})`); process.exit(2); }
    policy[m[1]] = m[2];
  }
  const bel = belowFloor(policy, floor);
  if (bel.length) {
    const slug = state.current_task_slug || slugify(state.current_task || '');
    const dp = slug ? join(nb, 'decisions', `${slug}.model-degrade.md`) : null;
    let ok = false;
    if (dp && existsSync(dp)) { try { ok = verifyDecision(readFileSync(dp, 'utf8'), { kind: 'model-degrade', taskSlug: slug, now: Date.now() }).ok; } catch { ok = false; } }
    if (!ok) {
      console.error('model-policy: REFUSED to lower the model tier below the derived floor without a decision.');
      for (const b of bel) console.error(`   - ${b}`);
      console.error(`\nRecord a human-approved .nb/decisions/${slug || '<task>'}.model-degrade.md (kind: model-degrade) explaining why a weaker model is acceptable, then re-run.`);
      process.exit(1);
    }
  }
}

const errs = validateModelPolicy(policy);
if (errs.length) { console.error('model-policy: derived policy is malformed:'); for (const e of errs) console.error(`   - ${e}`); process.exit(2); }

state.model_policy = policy;
state.updated_at = new Date().toISOString();
try { writeFileSync(join(nb, 'state.json'), JSON.stringify(state, null, 2) + '\n'); }
catch (e) { console.error(`model-policy: could not write state.json: ${e && e.message ? e.message : e}`); process.exit(2); }

console.log(`model_policy: ${fmt(policy)}`);
console.log(`  ${floor.reason}; raise-only (lowering a lane needs a model-degrade decision).`);
console.log('state -> .nb/state.json');
process.exit(0);
