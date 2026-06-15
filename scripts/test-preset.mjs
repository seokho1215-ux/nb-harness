#!/usr/bin/env node
// Tests for lib/preset.mjs — parsing, schema validation, the raise-only gate mapping, and the read-side
// re-validation of a persisted state.preset block. The invariant under test: a preset can only TIGHTEN the
// firewall (add a required artifact / raise the strength floor); "low"/"floor" add nothing, and a malformed
// persisted block contributes nothing rather than lowering a gate.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset, validatePreset, presetGates, statePresetGates, isProfileText } from './lib/preset.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const STRICT = `id: strict
name: Strict
description: Maximum traceability — review and evidence on everything.
default_workflow_bias: full-feature
review_strictness: high         # inline comment is stripped
evidence_strictness: high
security_strictness: high
cross_family_required: true
human_brief_depth: detailed
`;
const STARTER = `id: starter
name: Starter
description: Lightest touch.
default_workflow_bias: light-change
review_strictness: low
evidence_strictness: low
security_strictness: floor
cross_family_required: false
human_brief_depth: short
`;

// --- parse ---
const ps = parsePreset(STRICT);
check('parse ok', ps.ok && ps.preset.id === 'strict');
check('inline comment stripped', ps.preset.review_strictness === 'high');
check('isProfileText true for a profile', isProfileText(STRICT));
check('isProfileText false for a pipeline preset', !isProfileText('id: full\nsequence:\n  - design\n'));
check('parse flags a non key:value line', !parsePreset('id: x\njustgarbage\n').ok);
check('parse flags a duplicate key', !parsePreset('id: x\nid: y\n').ok);

// --- validate ---
const WORKFLOWS = ['light-change', 'standard-feature', 'full-feature', 'security-sensitive'];
check('valid strict passes', validatePreset(ps.preset, { workflows: WORKFLOWS }).length === 0);
check('unknown field rejected', validatePreset({ ...ps.preset, bogus: 'x' }, { workflows: WORKFLOWS }).some((e) => /unknown field/.test(e)));
check('bad strictness enum rejected', validatePreset({ ...ps.preset, review_strictness: 'extreme' }).some((e) => /review_strictness/.test(e)));
check('bad security enum rejected', validatePreset({ ...ps.preset, security_strictness: 'paranoid' }).some((e) => /security_strictness/.test(e)));
check('non-bool cross_family rejected', validatePreset({ ...ps.preset, cross_family_required: 'yes' }).some((e) => /cross_family_required/.test(e)));
check('missing id rejected', validatePreset({ ...ps.preset, id: '' }).some((e) => /id is required/.test(e)));
check('unknown workflow bias rejected', validatePreset({ ...ps.preset, default_workflow_bias: 'nope' }, { workflows: WORKFLOWS }).some((e) => /default_workflow_bias/.test(e)));
check('security_strictness max accepted', validatePreset({ ...ps.preset, security_strictness: 'max' }, { workflows: WORKFLOWS }).length === 0);

// --- gate mapping (raise-only) ---
const gStrict = presetGates(ps.preset);
check('strict requires review+evidence+brief', eq(gStrict.require_artifacts.sort(), ['brief', 'evidence', 'review']));
check('strict min_strength = full', gStrict.min_strength === 'full');
check('strict cross_family true', gStrict.cross_family === true);

const gStarter = presetGates(parsePreset(STARTER).preset);
check('starter adds NO required artifacts (low adds nothing)', eq(gStarter.require_artifacts, []));
check('starter min_strength = null (floor decides)', gStarter.min_strength === null);

check('floor+module -> standard', presetGates({ ...ps.preset, security_strictness: 'floor+module' }).min_strength === 'standard');
check('max -> full', presetGates({ ...ps.preset, security_strictness: 'max' }).min_strength === 'full');
check('only evidence=high adds evidence only', eq(presetGates({ ...ps.preset, review_strictness: 'medium', evidence_strictness: 'high', human_brief_depth: 'short' }).require_artifacts, ['evidence']));

// --- statePresetGates: read-side re-validation (raise-only, garbage ignored) ---
check('no preset -> empty gates', eq(statePresetGates({}).require_artifacts, []));
check('valid persisted gates read back', eq(statePresetGates({ preset: { id: 'x', gates: { require_artifacts: ['review'], min_strength: 'full' } } }).require_artifacts, ['review']));
check('garbage artifact kinds dropped (cannot lower/forge)', eq(statePresetGates({ preset: { id: 'x', gates: { require_artifacts: ['review', 'rm -rf', 'evidence'] } } }).require_artifacts.sort(), ['evidence', 'review']));
check('bogus min_strength dropped to null', statePresetGates({ preset: { id: 'x', gates: { min_strength: 'ludicrous' } } }).min_strength === null);
check('non-object gates -> empty', eq(statePresetGates({ preset: { id: 'x', gates: 'nope' } }).require_artifacts, []));

// --- every shipped profile preset is valid + maps cleanly (guards against a real preset drifting) ---
const presetDir = join(ROOT, 'presets');
for (const f of readdirSync(presetDir).filter((x) => x.endsWith('.yaml'))) {
  const txt = readFileSync(join(presetDir, f), 'utf8');
  if (!isProfileText(txt)) continue; // full.yaml pipeline preset — not a gate profile
  const id = f.replace(/\.yaml$/, '');
  const r = parsePreset(txt);
  const errs = [...(r.ok ? [] : r.errors), ...validatePreset(r.preset, { workflows: WORKFLOWS.concat(['bugfix', 'refactor', 'docs-only', 'release']) })];
  check(`shipped preset ${id} is valid`, errs.length === 0 && r.preset.id === id);
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
