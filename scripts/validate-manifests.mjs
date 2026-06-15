#!/usr/bin/env node
// Validate every modules/**/nb-module.json against the core schema's key rules.
// Dependency-free: checks required fields, types, and enums by hand (no JSON Schema engine,
// to keep NB's zero-dependency / install-safety promise). Exits non-zero on any invalid manifest.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = join(ROOT, 'modules');

const PERMS = ['read', 'write', 'network', 'exec', 'install'];
const GATES = ['self_check', 'security_floor', 'explicit_consent', 'ownership_proof', 'no_real_payment', 'no_destructive', 'result_redaction', 'rate_limit', 'domain_allowlist'];
const ACTIONS = ['STOP', 'degrade', 'retry'];
const REQUIRED = ['id', 'required_in', 'outputs', 'verify_cmd', 'failure_states', 'exit', 'permissions', 'side_effects', 'requires_approval', 'safety_gates'];

function findManifests(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findManifests(p));
    else if (e.name === 'nb-module.json') out.push(p);
  }
  return out;
}

function validate(path) {
  const errs = [];
  let m;
  try { m = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { return [`invalid JSON: ${e.message}`]; }

  for (const fld of REQUIRED) if (!(fld in m)) errs.push(`missing required field: ${fld}`);
  if (m.id && !/^[a-z][a-z0-9_-]*$/.test(m.id)) errs.push(`id not lowercase kebab/snake: ${m.id}`);
  for (const fld of ['required_in', 'optional_in', 'side_effects', 'permissions', 'safety_gates', 'install_deps', 'modes', 'outputs', 'failure_states']) {
    if (fld in m && !Array.isArray(m[fld])) errs.push(`${fld} must be an array`);
  }
  if ('verify_cmd' in m && m.verify_cmd !== null && typeof m.verify_cmd !== 'string') errs.push('verify_cmd must be string or null');
  if ('requires_approval' in m && typeof m.requires_approval !== 'boolean') errs.push('requires_approval must be boolean');
  if (m.exit && (typeof m.exit !== 'object' || !m.exit.success || !m.exit.failure)) errs.push('exit must have success + failure');
  if (Array.isArray(m.outputs)) m.outputs.forEach((o, i) => { if (!o || !o.name || !o.artifact) errs.push(`outputs[${i}] needs name + artifact`); });
  if (Array.isArray(m.permissions)) m.permissions.forEach((p) => { if (!PERMS.includes(p)) errs.push(`permission not allowed: ${p}`); });
  if (Array.isArray(m.safety_gates)) m.safety_gates.forEach((g) => { if (!GATES.includes(g)) errs.push(`safety_gate not allowed: ${g}`); });
  if (Array.isArray(m.failure_states)) m.failure_states.forEach((fs, i) => {
    if (!fs.when) errs.push(`failure_states[${i}] needs 'when'`);
    if (!ACTIONS.includes(fs.action)) errs.push(`failure_states[${i}].action not allowed: ${fs.action}`);
  });
  return errs;
}

const manifests = findManifests(MODULES);
if (manifests.length === 0) { console.error('no nb-module.json found under modules/'); process.exit(1); }

let failed = 0;
for (const path of manifests) {
  const rel = path.slice(ROOT.length + 1).split('\\').join('/');
  const errs = validate(path);
  if (errs.length) { failed++; console.log(`FAIL ${rel}`); errs.forEach((e) => console.log(`   - ${e}`)); }
  else console.log(`OK   ${rel}`);
}
console.log(`\n${manifests.length} manifest(s), ${failed} invalid.`);
process.exit(failed ? 1 : 0);
