#!/usr/bin/env node
// NB update — re-apply NB files into a target from this repo. Dry-run by default.
// Conservative: delegates to install.mjs, which never overwrites AGENTS.md or settings and
// preserves .nb runtime artifacts. See docs/UPGRADING.md.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!target) { console.error('usage: node scripts/update.mjs <targetDir> [--apply --yes]'); process.exit(1); }
const targetDir = resolve(target);

console.log('NB update — re-applies NB files via the installer.');
console.log('  (non-destructive on AGENTS.md / settings.json; preserves .nb runtime artifacts)\n');
const passthru = apply ? ['--apply', ...(args.includes('--yes') ? ['--yes'] : [])] : [];
const r = spawnSync('node', [join(ROOT, 'scripts', 'install.mjs'), target, ...passthru], { stdio: 'inherit' });

// Cleanup: older install.mjs versions copied NB's own dev test scripts (scripts/test-*.mjs) into the
// target, where a bare `node --test` would discover and FAIL them. We remove a target file ONLY when
// its CONTENT is byte-identical (SHA-256) to THIS repo's original dev test — never by filename alone.
// A same-named file the user authored (different content) is reported and left untouched.
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const nbScripts = join(ROOT, 'scripts');
const nbDevTests = new Map(   // NB dev-test name -> sha256 of NB's original
  (existsSync(nbScripts) ? readdirSync(nbScripts).filter((f) => /^test-.*\.mjs$/.test(f)) : [])
    .map((f) => [f, sha(join(nbScripts, f))]),
);
const tgtScripts = join(targetDir, 'scripts');
const remove = [], conflict = [], preserved = [];
if (existsSync(tgtScripts)) {
  for (const f of readdirSync(tgtScripts).filter((n) => /^test-.*\.mjs$/.test(n))) {
    if (!nbDevTests.has(f)) { preserved.push(f); continue; }                  // not an NB dev-test name -> yours
    let same = false;
    try { same = sha(join(tgtScripts, f)) === nbDevTests.get(f); } catch { same = false; } // unreadable -> never delete
    (same ? remove : conflict).push(f);
  }
}
if (remove.length || conflict.length || preserved.length) {
  console.log(`\nLeaked-dev-test cleanup scan in ${tgtScripts}:`);
  if (remove.length) {
    console.log('  remove — content matches an NB dev test exactly (leaked by a pre-fix install):');
    for (const f of remove) console.log(`     - scripts/${f}`);
  }
  if (conflict.length) {
    console.log('  KEPT (conflict) — same filename as an old NB leaked dev test, but content differs; left untouched:');
    for (const f of conflict) console.log(`     - scripts/${f}`);
  }
  if (preserved.length) {
    console.log('  kept — your own test-*.mjs (not an NB dev-test name):');
    for (const f of preserved) console.log(`     - scripts/${f}`);
  }
  if (apply) {
    for (const f of remove) rmSync(join(tgtScripts, f), { force: true });
    if (remove.length) console.log(`Removed ${remove.length} content-identical NB dev test(s). Conflicts and your files were left untouched.`);
  } else if (remove.length) {
    console.log('  (dry-run) re-run with --apply --yes to remove the content-identical ones.');
  }
}

if (!apply) console.log('\nDry-run. Re-run with --apply --yes to update + clean up. (docs/UPGRADING.md)');
process.exit(r.status ?? 0);
