#!/usr/bin/env node
// NB sandbox-attack — the code-enforced gate for Sandbox Attack Mode (modules/security/attack-gate.md, audit N8).
// It does NOT run an attack; it is the SAFETY INTERLOCK that decides whether a planned real attack is permitted,
// enforcing the five hard pins (lib/attack-gate.mjs) and writing a redacted authorization ONLY when every pin
// passes. Fail-closed: a missing consent / ownership / allowlist input means the pin fails and the attack is
// REFUSED. The red-team runs a real attack ONLY after this authorizes it.
//
//   node scripts/sandbox-attack.mjs --task <slug> --target <host|url> [--action "<cmd>"]... [--plan-file <f>] [--rate N]
// Inputs (under .nb/): decisions/<slug>.attack-consent.md (human-approved) · attack/ownership.json
// ({ "is_copy": true, "clone_of": "<source>", "target": "<clone host>" }) · attack/allowlist.json (["host", ...]).
// Exit: 0 authorized (.nb/attack/authorization.<slug>.json written) · 1 REFUSED (pins failed) · 2 bad input.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, stripBom } from './lib/proof.mjs';
import { verifyDecision } from './lib/decision.mjs';
import { evaluateAttack } from './lib/attack-gate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const flagAll = (n) => args.reduce((acc, a, i) => (a === n && args[i + 1] ? acc.concat(args[i + 1]) : acc), []);

const task = flag('--task');
const target = flag('--target');
if (!task || !target) { console.error('usage: node scripts/sandbox-attack.mjs --task <slug> --target <host|url> [--action "<cmd>"]... [--plan-file <f>] [--rate N]'); process.exit(2); }
const slug = slugify(task);

// actions: --action (repeatable) ∪ a --plan-file (one action per non-empty, non-# line, or a JSON {actions:[]}).
const actions = flagAll('--action');
const planFile = flag('--plan-file');
if (planFile) {
  if (!existsSync(planFile)) { console.error(`sandbox-attack: --plan-file not found: ${planFile}`); process.exit(2); }
  let txt; try { txt = stripBom(readFileSync(planFile, 'utf8')); } catch (e) { console.error(`sandbox-attack: cannot read --plan-file (${e && e.message ? e.message : e})`); process.exit(2); }
  let added = false;
  try { const j = JSON.parse(txt); if (Array.isArray(j.actions)) { actions.push(...j.actions.map(String)); added = true; } } catch { /* not JSON; fall through to lines */ }
  if (!added) for (const ln of txt.split(/\r?\n/)) { const t = ln.trim(); if (t && !t.startsWith('#')) actions.push(t); }
}
let rate;
if (flag('--rate') != null) {
  rate = Number(flag('--rate'));
  if (!Number.isInteger(rate) || rate < 1) { console.error('sandbox-attack: --rate must be a positive integer'); process.exit(2); }
}

// explicit_consent — a human-approved attack-consent decision (fail-closed if absent/unreadable/invalid).
let consent = { ok: false };
const consentPath = join(nb, 'decisions', `${slug}.attack-consent.md`);
if (existsSync(consentPath)) {
  try {
    const v = verifyDecision(readFileSync(consentPath, 'utf8'), { kind: 'attack-consent', taskSlug: slug, now: Date.now() });
    consent = { ok: v.ok, approvedBy: v.fields && v.fields.approved_by };
  } catch { consent = { ok: false }; }
}

// ownership_proof — the registered clone (fail-closed if absent/unreadable).
let ownership = {};
const ownPath = join(nb, 'attack', 'ownership.json');
if (existsSync(ownPath)) {
  try { const o = JSON.parse(stripBom(readFileSync(ownPath, 'utf8'))); ownership = { isCopy: o.is_copy === true, cloneOf: o.clone_of, target: o.target }; }
  catch { ownership = {}; }
}

// allowlist (optional; local/clone hosts are always allowed even with no file).
let allowlist = [];
const alPath = join(nb, 'attack', 'allowlist.json');
if (existsSync(alPath)) { try { const a = JSON.parse(stripBom(readFileSync(alPath, 'utf8'))); if (Array.isArray(a)) allowlist = a.map(String); } catch { /* ignore */ } }

const plan = { target, actions, rate };
const { allowed, denials, authorization } = evaluateAttack(plan, { consent, ownership, allowlist, task: slug, now: new Date().toISOString() });

console.log(`NB sandbox-attack gate — task ${slug}, target ${targetHost(target)}`);
if (!allowed) {
  console.log('✗ REFUSED — real attack NOT authorized. Failed pins:');
  for (const d of denials) console.log(`   - ${d}`);
  console.log('\nFix the failed pins (record consent / register the clone / scope the target / drop destructive+payment actions), then re-run.');
  process.exit(1);
}
try {
  mkdirSync(join(nb, 'attack'), { recursive: true });
  writeFileSync(join(nb, 'attack', `authorization.${slug}.json`), JSON.stringify(authorization, null, 2) + '\n');
} catch (e) { console.error(`sandbox-attack: could not write the authorization (${e && e.message ? e.message : e})`); process.exit(2); }
console.log('✓ AUTHORIZED — all five pins passed (explicit_consent, ownership_proof, allowlist, no_destructive, no_real_payment).');
console.log(`   ${actions.length} action(s) cleared against the clone. Authorization -> .nb/attack/authorization.${slug}.json`);
console.log('   Reminder: attack the COPY only; redact secrets in the report.');
process.exit(0);

// tiny local helper to avoid leaking a full URL into the header line
function targetHost(t) { const m = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(String(t)); return (m ? m[1] : String(t)).replace(/^[^@]*@/, ''); }
