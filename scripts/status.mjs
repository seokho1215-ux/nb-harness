#!/usr/bin/env node
// NB status — read .nb/state.json and print the current harness state.
// Works on a fresh clone (no state.json yet) by reporting "not initialized".
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(ROOT, '.nb', 'state.json');

if (!existsSync(statePath)) {
  console.log('NB status: not initialized (no .nb/state.json).');
  console.log('Run /nb:setup (or copy .nb/state.example.json to .nb/state.json) to begin.');
  process.exit(0);
}

let s;
try { s = JSON.parse(readFileSync(statePath, 'utf8')); }
catch (e) { console.error(`.nb/state.json is not valid JSON: ${e.message}`); process.exit(1); }

const arr = (v) => (Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : (v ?? '-'));
const line = (k, v) => console.log(`  ${k.padEnd(14)} ${v ?? '-'}`);

console.log('NB status\n');
line('version', s.harness_version);
line('mode', s.current_mode);
line('workflow', s.current_workflow);
line('task', s.current_task);
line('strength', s.strength_level);
line('agent lane', s.active_agent_lane);
line('gates', arr(s.active_gates));
line('last review', s.last_review);
line('last evidence', s.last_evidence);
line('open risks', arr(s.open_risks));
line('updated at', s.updated_at);

// readiness signal (harness score)
const hs = spawnSync('node', [join(ROOT, 'scripts', 'harness-score.mjs')], { encoding: 'utf8' });
if (hs.stdout) console.log('\n' + hs.stdout.trim());
process.exit(0);
