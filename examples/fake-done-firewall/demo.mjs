#!/usr/bin/env node
// Fake-done firewall — runnable demo. Dependency-free; writes only to a temp dir; cleans up.
//
// The scene: the AI says "done". NB's /nb:close (scripts/close.mjs) refuses to let "done" through
// while the evidence for THIS task is missing — then passes once real evidence is recorded.
// Run:  node examples/fake-done-firewall/demo.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLOSE = resolve(HERE, '..', '..', 'scripts', 'close.mjs');

const nb = mkdtempSync(join(tmpdir(), 'nb-fakedone-'));
for (const d of ['evidence', 'reviews', 'briefs', 'decisions']) mkdirSync(join(nb, d), { recursive: true });
const close = () => spawnSync('node', [CLOSE], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const rule = (t) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`);

try {
  rule('SCENE 1 — the AI claims the task is done (intent locked, but no evidence yet)');
  writeFileSync(join(nb, 'state.json'), JSON.stringify({
    current_task: 'settings display name save', current_task_slug: 'settings-name',
    current_workflow: 'standard-feature', intent_summary: 'Let a user save a display name.',
  }, null, 2));
  console.log('AI: "Done — I added the settings save flow and it works."  ← a claim, no evidence behind it.\n');
  let r = close();
  process.stdout.write(r.stdout);
  console.log(`(exit ${r.status})  → "done" did NOT get through. The firewall held.`);

  rule('SCENE 2 — record the REAL evidence for this task, then try to close again');
  writeFileSync(join(nb, 'evidence', 'settings-name.md'), 'Task: settings-name\n$ npm test\n# tests 4\n# pass 4\n# fail 0\n');
  writeFileSync(join(nb, 'reviews', 'settings-name.md'), 'Task: settings-name\ncross-family review: PASS\n');
  writeFileSync(join(nb, 'briefs', 'settings-name.md'), 'Task: settings-name\nAdded display-name save; tests pass; nothing risky left.\n');
  console.log('Recorded: evidence (real test output) + review + brief — all matching THIS task.\n');
  r = close();
  process.stdout.write(r.stdout);
  console.log(`(exit ${r.status})  → now "done" is backed by evidence, so it closes.`);

  rule('THE POINT');
  console.log('NB does not just ask before risky actions. It also blocks false completion claims:');
  console.log('"done" is a claim until the evidence for THIS task exists. Same idea catches STALE evidence');
  console.log('(an older task\'s files) — try it: re-run with the task renamed and watch close reject again.');
} finally {
  rmSync(nb, { recursive: true, force: true });
}
