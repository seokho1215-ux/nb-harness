#!/usr/bin/env node
// Validate presets/*.yaml (audit M1). A gate PROFILE (starter/balanced/strict/...) must parse and match the
// schema in lib/preset.mjs — same bar apply-preset enforces (no drift). The full.yaml PIPELINE preset is a
// different kind (sequence/cross_family/defaults, not gate config); it is shape-checked lightly, not held to the
// profile schema. FAILS (exit 1) on any malformed preset; exit 2 on an unexpected I/O error. Dependency-free.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset, validatePreset, isProfileText } from './lib/preset.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'presets');

const workflows = (() => {
  try { return readdirSync(join(ROOT, 'workflows')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')); }
  catch { return []; }
})();

let files;
try { files = readdirSync(dir).filter((f) => f.endsWith('.yaml')); }
catch (e) { console.error(`validate-presets: cannot read presets/ (${e && e.message ? e.message : e})`); process.exit(2); }

let pass = 0; const failures = [];
for (const f of files.sort()) {
  const id = f.replace(/\.yaml$/, '');
  let text;
  try { text = readFileSync(join(dir, f), 'utf8'); }
  catch (e) { failures.push(`${f}: unreadable (${e && e.message ? e.message : e})`); continue; }

  if (!isProfileText(text)) {
    // Only full.yaml is allowed to be a pipeline preset (a different kind: design->implement->security). ANY
    // OTHER file with no review_strictness is a malformed gate profile, NOT a pipeline — fail it, so a profile
    // can't masquerade as a pipeline (drop review_strictness + add a fake `sequence:`) to dodge schema validation
    // (Codex GATE-2 revision: validate-presets was too permissive even though apply-preset already refuses it).
    if (f !== 'full.yaml') {
      failures.push(`${f}: not a gate profile (no review_strictness) and only full.yaml may be a pipeline preset`);
      continue;
    }
    // Pipeline preset (full.yaml): light shape check only — it must declare an id and a sequence.
    const errs = [];
    if (!/^\s*id\s*:/m.test(text)) errs.push('missing id');
    if (!/^\s*sequence\s*:/m.test(text)) errs.push('pipeline preset must declare a sequence');
    if (errs.length) failures.push(`${f} (pipeline): ${errs.join('; ')}`);
    else pass++;
    continue;
  }

  const { ok, errors: parseErrors, preset } = parsePreset(text);
  const errors = [...(ok ? [] : parseErrors), ...validatePreset(preset, { workflows })];
  if (preset.id && preset.id !== id) errors.push(`id "${preset.id}" does not match filename "${id}"`);
  if (errors.length) failures.push(`${f}: ${errors.join('; ')}`);
  else pass++;
}

if (failures.length) {
  console.log(`presets INVALID — ${pass} OK, ${failures.length} FAIL:`);
  for (const x of failures) console.log(`   - ${x}`);
  process.exit(1);
}
console.log(`presets OK — ${pass}/${files.length} valid (gate profiles + pipeline)`);
process.exit(0);
