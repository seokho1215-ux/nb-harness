#!/usr/bin/env node
// NB claim -> enforcement map check (the honesty guard). Reads core/claims.json and verifies that every
// headline guarantee's enforced_by + proven_by references still RESOLVE: the named file exists and contains the
// named anchor (a function/marker/test string). A dangling reference => FAIL (exit 1), so a gate cannot be
// deleted or renamed while its doc claim survives — the exact "docs promise more than the code enforces"
// regression the honesty audit was about. Dependency-free; greps literal substrings (no regex surprises).
//
// This does NOT prove the gate is CORRECT (the tests do that) — it proves the claim is still WIRED to real,
// tested code. `kind` records the honest STRENGTH of each claim (enforced / surfaced / advisory / floor); a
// claim with no enforced_by or no proven_by is itself a failure (every claim must point at code AND a test).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP = join(ROOT, 'core', 'claims.json');
const KINDS = new Set(['enforced', 'surfaced', 'advisory', 'floor']);

let fail = 0;
const bad = (m) => { fail++; console.log(`FAIL ${m}`); };
const ok = (m) => console.log(`OK   ${m}`);

// cache file reads; a missing file is a hard fail surfaced per-reference.
const cache = new Map();
const fileText = (rel) => {
  if (cache.has(rel)) return cache.get(rel);
  const p = join(ROOT, rel);
  const v = existsSync(p) ? readFileSync(p, 'utf8') : null;
  cache.set(rel, v);
  return v;
};

let doc;
try { doc = JSON.parse(readFileSync(MAP, 'utf8')); }
catch (e) { console.log(`FAIL cannot read/parse core/claims.json: ${e.message}`); process.exit(1); }

const claims = Array.isArray(doc.claims) ? doc.claims : null;
if (!claims || !claims.length) { console.log('FAIL core/claims.json has no claims[]'); process.exit(1); }

const seenIds = new Set();
const checkRefs = (claimId, refs, label) => {
  if (!Array.isArray(refs) || refs.length === 0) { bad(`${claimId}: ${label} is empty (a claim must point at ${label})`); return; }
  for (const r of refs) {
    if (!r || typeof r.file !== 'string' || typeof r.contains !== 'string' || !r.contains) {
      bad(`${claimId}: ${label} entry malformed (need {file, contains})`); continue;
    }
    const txt = fileText(r.file);
    if (txt == null) { bad(`${claimId}: ${label} file not found: ${r.file}`); continue; }
    if (!txt.includes(r.contains)) bad(`${claimId}: ${label} anchor not found in ${r.file}: "${r.contains}" (gate moved/renamed? update the code or the map)`);
    else ok(`${claimId}: ${label} ${r.file} ✓ "${r.contains.slice(0, 40)}"`);
  }
};

for (const c of claims) {
  if (!c || typeof c.id !== 'string' || !c.id) { bad('a claim has no id'); continue; }
  if (seenIds.has(c.id)) bad(`duplicate claim id: ${c.id}`); else seenIds.add(c.id);
  if (typeof c.claim !== 'string' || !c.claim.trim()) bad(`${c.id}: missing claim text`);
  if (!KINDS.has(c.kind)) bad(`${c.id}: kind must be one of ${[...KINDS].join('|')} (got ${c.kind})`);
  checkRefs(c.id, c.enforced_by, 'enforced_by');
  checkRefs(c.id, c.proven_by, 'proven_by');
}

console.log(`\n${claims.length} claim(s), ${fail} broken reference(s).`);
process.exit(fail ? 1 : 0);
