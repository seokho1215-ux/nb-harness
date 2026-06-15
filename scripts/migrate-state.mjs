#!/usr/bin/env node
// Migrate .nb/state.json to the current shape (add missing keys from state.example.json, keep your
// values), then validate. Dry-run by default. NB_DIR overrides .nb location.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const live = join(nb, 'state.json');

if (!existsSync(live)) { console.log('no .nb/state.json to migrate (nothing to do)'); process.exit(0); }

const example = JSON.parse(readFileSync(join(nb, 'state.example.json'), 'utf8'));
delete example.$comment;
const cur = JSON.parse(readFileSync(live, 'utf8'));
const missing = Object.keys(example).filter((k) => !(k in cur));
const apply = process.argv.includes('--apply');

if (!apply) {
  console.log(`would add missing keys: ${missing.join(', ') || '(none)'}`);
  console.log('dry-run; re-run with --apply to write');
  process.exit(0);
}

const merged = { ...example, ...cur };
delete merged.$comment;
writeFileSync(live, JSON.stringify(merged, null, 2) + '\n');
console.log(`migrated .nb/state.json (added: ${missing.join(', ') || 'none'})`);
const r = spawnSync('node', [join(ROOT, 'scripts', 'validate-state.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 0);
