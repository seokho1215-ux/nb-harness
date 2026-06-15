#!/usr/bin/env node
// NB Harness installer (script-install fallback; plugin install is preferred — see README).
//
// Safety (blueprint 11.3): shows the plan first, writes nothing without --apply, and even with
// --apply asks you to type "yes". --yes skips the confirm (CI only).
//
// What it does: copies the tool-neutral SOT + scripts, wires .claude (agents/hooks/settings),
// maps root commands/ and skills/ into .claude with an `nb-` prefix (so they don't collide and
// read as /nb-setup etc.), lays down the .nb skeleton, creates nb.config.json, and installs
// AGENTS.md ONLY if absent (otherwise writes AGENTS.nb.md — never overwrites the target's).
//
// Usage:
//   node scripts/install.mjs <targetDir>                # dry-run
//   node scripts/install.mjs <targetDir> --apply        # integrate (asks "yes")
//   node scripts/install.mjs <targetDir> --apply --yes  # CI only
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const NB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const assumeYes = args.includes('--yes');
const targetArg = args.find((a) => !a.startsWith('--'));
if (!targetArg) { console.error('usage: node scripts/install.mjs <targetDir> [--apply] [--yes]'); process.exit(1); }
const target = resolve(targetArg);
if (target === NB_ROOT) { console.error('Refusing to install NB into its own repo. Pass a target project dir.'); process.exit(1); }

// packs/ is REQUIRED at the install target: close.mjs loads every pack's close_contract from the installed
// packs/ (loadPackData). Without it the completion firewall has no contracts — pack proofs are never enforced
// and a normal change escalates as "unknown_impact". (Found by dogfood; release-check now guards it.)
const COPY_DIRS = ['core', 'modules', 'presets', 'agents', 'packs', 'scripts', 'workflows', 'docs']; // tool-neutral SOT + scripts
const CLAUDE_DIRS = ['.claude/agents', '.claude/hooks'];              // script wiring
const NB_SKELETON = ['state.example.json', 'README.md'];
const NB_RUNTIME_DIRS = ['sessions', 'evidence', 'reviews', 'briefs', 'decisions', 'logs'];

const rel = (p) => p.slice(NB_ROOT.length + 1).split('\\').join('/');

// Files NB must NOT copy into a consumer project (matched by repo-relative path):
//  - scripts/test-*.mjs : NB's own dev tests — a bare `node --test` (a common verify command) would
//    otherwise discover and FAIL them, breaking the user's own test run.
//  - docs/RELEASE.md    : maintainer-only release checklist — irrelevant to a consumer install.
// Consumers still get the runtime scripts (doctor/status/harness-score) and the usage docs.
const excludeFromTarget = (relPath) => /(^|\/)test-[^/]*\.mjs$/.test(relPath) || relPath === 'docs/RELEASE.md';

function copyTree(src, dst, skip) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name); const d = join(dst, e.name);
    if (skip && skip(rel(s))) continue;
    if (e.isDirectory()) copyTree(s, d, skip); else copyFileSync(s, d);
  }
}
function walk(dir) {
  const o = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) o.push(...walk(p)); else o.push(p);
  }
  return o;
}

// --- plan ---
const planned = [];
for (const d of [...COPY_DIRS, ...CLAUDE_DIRS]) { const s = join(NB_ROOT, d); if (existsSync(s)) for (const f of walk(s)) { const r = rel(f); if (excludeFromTarget(r)) continue; planned.push(r); } }
for (const f of readdirSync(join(NB_ROOT, 'commands'))) if (f.endsWith('.md')) planned.push(`commands/${f}  ->  .claude/commands/nb-${f}`);
for (const d of readdirSync(join(NB_ROOT, 'skills'), { withFileTypes: true })) if (d.isDirectory()) planned.push(`skills/${d.name}/  ->  .claude/skills/nb-${d.name}/`);
planned.push('.nb/ (state.example.json, README.md, 6 runtime dirs with .gitkeep)');
planned.push('nb.config.json  (from nb.config.example.json if absent)');
planned.push('.claude/settings.json  (statusLine + hooks merged; never overwritten)');
planned.push('AGENTS.md  (copied if absent; otherwise AGENTS.nb.md — never overwrites)');

console.log(`NB Harness install plan -> ${target}`);
console.log(`  source: ${NB_ROOT}\n`);
for (const p of planned) console.log(`   - ${p}`);

if (!apply) { console.log('\nDry-run. Nothing written. Re-run with --apply to integrate.'); process.exit(0); }

if (!assumeYes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((r) => rl.question('\nType "yes" to apply (anything else aborts): ', (a) => { rl.close(); r(a); }));
  if (ans.trim().toLowerCase() !== 'yes') { console.log('Aborted. Nothing written.'); process.exit(0); }
}

// --- apply ---
for (const d of [...COPY_DIRS, ...CLAUDE_DIRS]) copyTree(join(NB_ROOT, d), join(target, d), excludeFromTarget);

// commands -> .claude/commands/nb-*.md
const cmdDst = join(target, '.claude', 'commands');
mkdirSync(cmdDst, { recursive: true });
for (const f of readdirSync(join(NB_ROOT, 'commands'))) if (f.endsWith('.md')) copyFileSync(join(NB_ROOT, 'commands', f), join(cmdDst, 'nb-' + f));

// skills -> .claude/skills/nb-*/
const skDst = join(target, '.claude', 'skills');
mkdirSync(skDst, { recursive: true });
for (const d of readdirSync(join(NB_ROOT, 'skills'), { withFileTypes: true })) if (d.isDirectory()) copyTree(join(NB_ROOT, 'skills', d.name), join(skDst, 'nb-' + d.name));

// .nb skeleton (no runtime state.json)
const nbDst = join(target, '.nb');
mkdirSync(nbDst, { recursive: true });
for (const f of NB_SKELETON) if (existsSync(join(NB_ROOT, '.nb', f))) copyFileSync(join(NB_ROOT, '.nb', f), join(nbDst, f));
for (const d of NB_RUNTIME_DIRS) { mkdirSync(join(nbDst, d), { recursive: true }); const k = join(nbDst, d, '.gitkeep'); if (!existsSync(k)) writeFileSync(k, ''); }

// nb.config.json (from example, if absent)
const cfg = join(target, 'nb.config.json');
if (!existsSync(cfg)) { copyFileSync(join(NB_ROOT, 'nb.config.example.json'), cfg); console.log('\ncreated nb.config.json — fill VERIFY_CMD / PROJECT_DOCS / SECURITY_GATE.'); }

// settings: merge statusLine + hooks, never overwrite an existing one
const setDst = join(target, '.claude', 'settings.json');
const nbSet = JSON.parse(readFileSync(join(NB_ROOT, '.claude', 'settings.json'), 'utf8'));
const nbHooks = JSON.parse(readFileSync(join(NB_ROOT, '.claude', 'hooks', 'hooks.json'), 'utf8')).hooks;
let ex = {};
if (existsSync(setDst)) { try { ex = JSON.parse(readFileSync(setDst, 'utf8')); } catch { ex = {}; } }
if (!ex.statusLine) { ex.statusLine = nbSet.statusLine; console.log('statusLine merged.'); } else console.log('! target already has a statusLine — left as-is.');
if (!ex.hooks) { ex.hooks = nbHooks; console.log('hooks merged.'); } else console.log('! target already has hooks — merge .claude/hooks/hooks.json manually.');
mkdirSync(dirname(setDst), { recursive: true });
writeFileSync(setDst, JSON.stringify(ex, null, 2) + '\n');

// AGENTS.md — copy if absent; never overwrite an existing one
const agDst = join(target, 'AGENTS.md');
if (!existsSync(agDst)) { copyFileSync(join(NB_ROOT, 'AGENTS.md'), agDst); console.log('AGENTS.md copied.'); }
else { copyFileSync(join(NB_ROOT, 'AGENTS.md'), join(target, 'AGENTS.nb.md')); console.log('! target already has AGENTS.md — wrote AGENTS.nb.md instead (no overwrite). Point to it if you want NB as the entry.'); }

console.log('\nDone. Next: open nb.config.json and fill the variables, then start a Claude Code session in the project.');
