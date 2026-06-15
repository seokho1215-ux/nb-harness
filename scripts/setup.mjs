#!/usr/bin/env node
// NB setup — deterministic .nb scaffold + health check for a project that already has NB installed.
// /nb:setup runs THIS so state initialization is a SCRIPT (one correct shape, every time) instead of the AI
// hand-authoring state.json it might get wrong (audit #19/N9: "state creation was prompt-following"). The
// firewall builds on state.json's shape (status/hud/score/close read it), so the foundation must be exact.
//
// Idempotent by design: it NEVER clobbers an existing state.json (that would wipe live task state) — pass
// --force to recreate from the example. Runtime dirs are created if missing, left alone if present.
//
// Usage: node scripts/setup.mjs [--force] [--no-doctor]
//   --force      recreate .nb/state.json from the example even if one exists (DESTROYS live state — explicit)
//   --no-doctor  scaffold only; skip the doctor health run (scripted / test use)
// Set NB_DIR to point .nb elsewhere (tests).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const force = args.includes('--force');
const noDoctor = args.includes('--no-doctor');

// Same runtime dirs the installer lays down — setup re-asserts them so it also works on a hand-cloned .nb.
const RUNTIME_DIRS = ['sessions', 'evidence', 'reviews', 'briefs', 'decisions', 'logs'];

const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1).split('\\').join('/') : p);

try {
  // 1) ensure .nb + runtime dirs (each with a .gitkeep so the empty dir survives a fresh clone)
  mkdirSync(nb, { recursive: true });
  for (const d of RUNTIME_DIRS) {
    mkdirSync(join(nb, d), { recursive: true });
    const k = join(nb, d, '.gitkeep');
    if (!existsSync(k)) writeFileSync(k, '');
  }

  // 2) create state.json from the committed example SHAPE — deterministic, never hand-authored JSON.
  //    The live state.json is git-ignored; state.example.json is the committed documented shape.
  const statePath = join(nb, 'state.json');
  const examplePath = join(nb, 'state.example.json');
  const existed = existsSync(statePath);
  if (existed && !force) {
    console.log(`state.json preserved (already exists; use --force to recreate) — ${rel(statePath)}`);
  } else {
    if (!existsSync(examplePath)) {
      console.error(`setup: cannot find ${rel(examplePath)} — is NB installed in this project? (run the installer first)`);
      process.exit(2);
    }
    const ex = JSON.parse(readFileSync(examplePath, 'utf8'));
    delete ex.$comment;          // the example's doc note never belongs in live state
    ex.current_mode = 'idle';    // a fresh project starts idle (no task in flight)
    ex.updated_at = new Date().toISOString();
    writeFileSync(statePath, JSON.stringify(ex, null, 2) + '\n');
    console.log(`${existed ? 'recreated' : 'created'} state.json (mode: idle) — ${rel(statePath)}`);
  }

  // 3) deterministic health check: doctor --target. A scaffolded-but-broken install must surface here, not
  //    after the user starts a task. doctor problems => exit 1 (state was still scaffolded above).
  if (!noDoctor) {
    console.log('');
    const d = spawnSync('node', [join(ROOT, 'scripts', 'doctor.mjs'), '--target'], { encoding: 'utf8' });
    if (d.stdout) process.stdout.write(d.stdout);
    if (d.stderr) process.stderr.write(d.stderr);
    if (d.status !== 0) {
      console.log('\nsetup: doctor reported problems (state was still scaffolded). Fix the FAILs above, then re-run.');
      process.exit(1);
    }
  }
  console.log('\nNB setup complete. Next: fill nb.config.json (VERIFY_CMD), then /nb:plan a task.');
  process.exit(0);
} catch (e) {
  // fail loud — a half-scaffolded foundation must not read as success.
  console.error(`setup failed: ${e && e.message ? e.message : e}`);
  process.exit(2);
}
