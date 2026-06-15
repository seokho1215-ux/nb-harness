#!/usr/bin/env node
// NB apply-preset — applies an advanced/team gate PROFILE (presets/*.yaml) into .nb/state.json so /nb:close and
// harness-score actually honor it (audit M1). Before this, scaffold-preset.mjs CREATED a preset but nothing
// APPLIED or VERIFIED its gate config — it was unenforced prose. This records the profile's enforceable gates as
// MINIMUMS; close/score then UNION the required artifacts and MAX the strength against the safety floor, so the
// preset can only TIGHTEN the firewall (raise-only), never loosen it. It does NOT live inside setup.mjs or
// strength-judge (kept a standalone, testable step); those can later wrap it.
//
// usage:
//   node scripts/apply-preset.mjs <preset-id>            # apply presets/<id>.yaml into .nb/state.json
//   node scripts/apply-preset.mjs <preset-id> --dry-run  # show what would be applied; write nothing
//   node scripts/apply-preset.mjs --clear                # remove the applied preset (floor still holds)
// Exit: 0 ok · 2 bad input / malformed preset / corrupt state (fails loud — never a silent partial apply).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom } from './lib/proof.mjs';
import { parsePreset, validatePreset, presetGates, isProfileText } from './lib/preset.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const clear = args.includes('--clear');
const id = args.find((a) => !a.startsWith('--'));

const workflows = (() => {
  try { return readdirSync(join(ROOT, 'workflows')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')); }
  catch { return []; }
})();

// Load existing state — FAIL LOUD on a corrupt foundation (a broken state.json is a trust problem; mirror
// strength-judge). A MISSING state is fine (seed from the example), but we never paper over a garbled one.
function loadState() {
  const sp = join(nb, 'state.json');
  const ep = join(nb, 'state.example.json');
  if (existsSync(sp)) {
    try { return JSON.parse(stripBom(readFileSync(sp, 'utf8'))); }
    catch (e) { console.error(`apply-preset: .nb/state.json is corrupt (${e && e.message ? e.message : e}) — refusing to overwrite a broken foundation. Fix or remove it, then re-run.`); process.exit(2); }
  }
  if (existsSync(ep)) {
    try { const s = JSON.parse(stripBom(readFileSync(ep, 'utf8'))); delete s.$comment; return s; }
    catch (e) { console.error(`apply-preset: .nb/state.example.json is unreadable (${e && e.message ? e.message : e}) — is NB installed correctly?`); process.exit(2); }
  }
  return {};
}

function write(state) {
  state.updated_at = new Date().toISOString();
  if (dryRun) { console.log('(dry run — nothing written)'); return; }
  try { writeFileSync(join(nb, 'state.json'), JSON.stringify(state, null, 2) + '\n'); }
  catch (e) { console.error(`apply-preset: could not write state.json: ${e && e.message ? e.message : e}`); process.exit(2); }
}

if (clear) {
  const state = loadState();
  if (!state.preset) { console.log('no preset applied — nothing to clear (the safety floor always holds).'); process.exit(0); }
  const was = state.preset.id;
  delete state.preset;
  write(state);
  console.log(`cleared preset "${was}" — back to the automatic default (floor unchanged). state -> .nb/state.json`);
  process.exit(0);
}

if (!id) {
  console.error('usage: node scripts/apply-preset.mjs <preset-id> [--dry-run] | --clear');
  try {
    const profiles = readdirSync(join(ROOT, 'presets')).filter((f) => f.endsWith('.yaml'))
      .filter((f) => { try { return isProfileText(readFileSync(join(ROOT, 'presets', f), 'utf8')); } catch { return false; } })
      .map((f) => f.replace(/\.yaml$/, ''));
    if (profiles.length) console.error(`gate profiles: ${profiles.join(', ')}`);
  } catch { /* ignore listing failure */ }
  process.exit(2);
}

const file = join(ROOT, 'presets', `${id}.yaml`);
if (!existsSync(file)) { console.error(`apply-preset: presets/${id}.yaml not found`); process.exit(2); }
let text;
try { text = readFileSync(file, 'utf8'); }
catch (e) { console.error(`apply-preset: cannot read presets/${id}.yaml (${e && e.message ? e.message : e})`); process.exit(2); }

// full.yaml (and any pipeline preset) is NOT a gate profile — apply it would silently no-op. Refuse clearly.
if (!isProfileText(text)) {
  console.error(`apply-preset: presets/${id}.yaml is not a gate profile (no review_strictness) — it's a pipeline preset and can't be applied as gate config. Gate profiles declare review/evidence/security strictness.`);
  process.exit(2);
}

const { ok, errors: parseErrors, preset } = parsePreset(text);
const errors = [...(ok ? [] : parseErrors), ...validatePreset(preset, { workflows })];
if (preset.id && preset.id !== id) errors.push(`id "${preset.id}" does not match filename "${id}" (presets/${id}.yaml)`);
if (errors.length) {
  console.error(`apply-preset: presets/${id}.yaml is malformed — refusing to apply:`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(2);
}

const gates = presetGates(preset);
const state = loadState();
state.preset = {
  id: preset.id,
  name: preset.name,
  applied_at: new Date().toISOString(),
  strictness: {
    review: preset.review_strictness,
    evidence: preset.evidence_strictness,
    security: preset.security_strictness,
    cross_family: gates.cross_family,
    brief_depth: preset.human_brief_depth,
    workflow_bias: gates.workflow_bias,
  },
  gates, // the raise-only enforceable set: { require_artifacts, min_strength, cross_family, workflow_bias }
};

write(state);

console.log(`Applied preset "${preset.id}" (${preset.name}).`);
console.log(`  Raise-only — a preset can only tighten the firewall, never drop below the safety floor.`);
if (gates.require_artifacts.length) console.log(`  Always-required artifacts (added to every workflow): ${gates.require_artifacts.join(', ')}`);
else console.log('  Always-required artifacts: none added (the workflow + floor decide).');
console.log(`  Minimum strength: ${gates.min_strength || 'none (floor decides)'}`);
console.log(`  Cross-family review: ${gates.cross_family ? 'expected when a review runs' : 'not required'}`);
console.log(`  Workflow bias: ${gates.workflow_bias || 'none'}`);
console.log(dryRun ? '  (dry run — .nb/state.json unchanged)' : '  state -> .nb/state.json (honored by /nb:close + harness-score)');
process.exit(0);
