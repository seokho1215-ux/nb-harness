#!/usr/bin/env node
// Install NB into each fixture (copied to a temp dir) and assert a non-destructive, complete install.
// Dependency-free. Cleans up temp dirs.
import { mkdtempSync, cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures');
const INSTALL = join(ROOT, 'scripts', 'install.mjs');

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

const setup = (fixture) => {
  const t = mkdtempSync(join(tmpdir(), 'nb-fix-'));
  cpSync(join(FIXTURES, fixture), t, { recursive: true });
  return t;
};
const install = (t) => spawnSync('node', [INSTALL, t, '--apply', '--yes'], { encoding: 'utf8' });

// empty project installs cleanly
{
  const t = setup('empty-project');
  install(t);
  check('empty: nb.config.json created', existsSync(join(t, 'nb.config.json')));
  check('empty: AGENTS.md copied', existsSync(join(t, 'AGENTS.md')));
  check('empty: scripts copied', existsSync(join(t, 'scripts', 'doctor.mjs')));
  check('empty: workflows copied', existsSync(join(t, 'workflows', 'standard-feature.md')));
  rmSync(t, { recursive: true, force: true });
}
// existing AGENTS.md is never overwritten
{
  const t = setup('existing-agents-project');
  const before = readFileSync(join(t, 'AGENTS.md'), 'utf8');
  install(t);
  check('existing AGENTS.md preserved', readFileSync(join(t, 'AGENTS.md'), 'utf8') === before);
  check('AGENTS.nb.md created instead', existsSync(join(t, 'AGENTS.nb.md')));
  rmSync(t, { recursive: true, force: true });
}
// existing statusLine + hooks preserved
{
  const t = setup('existing-claude-hooks-project');
  install(t);
  const s = JSON.parse(readFileSync(join(t, '.claude', 'settings.json'), 'utf8'));
  check('existing statusLine preserved', s.statusLine && s.statusLine.command === 'echo my-own-statusline');
  check('existing hooks preserved', JSON.stringify(s.hooks || {}).includes('my-own-stop-hook'));
  rmSync(t, { recursive: true, force: true });
}
// package.json project still receives nb.config + scripts, package.json intact
{
  const t = setup('package-json-project');
  const before = readFileSync(join(t, 'package.json'), 'utf8');
  install(t);
  check('package.json preserved', readFileSync(join(t, 'package.json'), 'utf8') === before);
  check('package: nb.config.json created', existsSync(join(t, 'nb.config.json')));
  check('package: scripts copied', existsSync(join(t, 'scripts', 'harness-score.mjs')));
  rmSync(t, { recursive: true, force: true });
}
// monorepo: install at the selected root only
{
  const t = setup('monorepo-project');
  install(t);
  check('monorepo: nb.config at root', existsSync(join(t, 'nb.config.json')));
  check('monorepo: packages/ untouched', !existsSync(join(t, 'packages', 'nb.config.json')));
  rmSync(t, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
