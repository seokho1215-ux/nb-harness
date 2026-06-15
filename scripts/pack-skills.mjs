#!/usr/bin/env node
// NB pack-scoped skill loader/guide. Pack skills are NOT auto-loaded like core skills — they live at
// packs/<pack>/skills/<skill>/SKILL.md and apply ONLY when their pack is ACTIVE. "Active" is the same set the
// firewall uses: declared ∪ observed ∪ implied (Codex GATE: this must match the docs, not just declared_packs).
// This prints the exact SKILL.md paths to READ for the active packs, so the skill-description budget isn't
// blown by exposing all of them at once, and so it works in portable/Generic mode too (real paths, not a
// Claude-only auto-skill). `--pack <id>` adds a pack manually (e.g. to preview before /nb:plan).
//   node scripts/pack-skills.mjs                 # active = declared ∪ observed ∪ implied (from .nb + working tree)
//   node scripts/pack-skills.mjs --pack data     # + force-include a pack
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom } from './lib/proof.mjs';
import { resolveActivation } from './lib/activation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nbDir = process.env.NB_DIR || join(ROOT, '.nb');
const projectRoot = process.env.NB_DIR ? resolve(nbDir, '..') : ROOT; // working tree (mirror of close.mjs)

const argPacks = [];
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--pack' && process.argv[i + 1]) argPacks.push(process.argv[++i]);

// Compile each pack's activation_rules the same way close.mjs does (a /regex/ string -> RegExp, else substring),
// so observed/implied activation is computed identically to the firewall. Contracts come ONLY from trusted ROOT.
const compileRule = (r) => { const m = /^\/(.*)\/([a-z]*)$/.exec(String(r)); if (!m) return r; try { return new RegExp(m[1], m[2]); } catch { return r; } };
function loadPackRules(root) {
  const dir = join(root, 'packs'); const rules = {};
  if (!existsSync(dir)) return rules;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mf = join(dir, e.name, 'nb-pack.json');
    if (!existsSync(mf)) continue;
    let m; try { m = JSON.parse(stripBom(readFileSync(mf, 'utf8'))); } catch { continue; }
    const ar = m.close_contract && m.close_contract.activation_rules;
    if (ar) rules[m.id] = { paths: (ar.paths || []).map(compileRule), commands: (ar.commands || []).map(compileRule) };
  }
  return rules;
}

let state = {};
try { const sp = join(nbDir, 'state.json'); if (existsSync(sp)) state = JSON.parse(stripBom(readFileSync(sp, 'utf8'))); } catch { /* no/!readable state */ }

// Real active set: declared ∪ observed(pack rules) ∪ implied(category). Same engine the firewall uses at close.
let active = [];
try { active = resolveActivation({ nbDir, root: projectRoot, state, packRules: loadPackRules(ROOT) }).active_packs || []; }
catch { active = Array.isArray(state.declared_packs) ? state.declared_packs : []; } // degrade to declared if activation can't run
const packs = [...new Set([...active, ...argPacks])];

// Read the "Strengthens proof:" line from a SKILL.md (the pack proof it serves) for a useful one-liner.
function strengthens(file) {
  try { const m = /\*\*Strengthens proof:\*\*\s*`([^`]+)`/.exec(readFileSync(file, 'utf8')); return m ? m[1] : '?'; }
  catch { return '?'; }
}

const lines = [];
for (const p of packs) {
  const mf = join(ROOT, 'packs', p, 'nb-pack.json');
  if (!existsSync(mf)) continue;
  let m; try { m = JSON.parse(stripBom(readFileSync(mf, 'utf8'))); } catch { continue; }
  for (const sk of m.adds_skills || []) {
    const rel = `packs/${p}/skills/${sk}/SKILL.md`;
    if (existsSync(join(ROOT, rel))) lines.push(`  ${rel}  (strengthens: ${strengthens(join(ROOT, rel))})`);
  }
}

if (!packs.length) {
  console.log('No active pack (declared ∪ observed ∪ implied is empty, no --pack). Core skills always apply; no pack skill to read.');
  process.exit(0);
}
if (!lines.length) {
  console.log(`Active packs: ${packs.join(', ')} — these packs add no pack-scoped skill. Core skills + the pack close-proof apply.`);
  process.exit(0);
}
console.log(`Active-pack skills to READ (active packs: ${packs.join(', ')}):`);
for (const l of lines) console.log(l);
console.log('\nRead each SKILL.md before producing that pack\'s close-proof. (Pack skills load only for active packs: declared ∪ observed ∪ implied.)');
process.exit(0);
