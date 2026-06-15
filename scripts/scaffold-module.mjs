#!/usr/bin/env node
// Scaffold a new module manifest. Refuses to overwrite without --force. Dependency-free.
// usage: node scripts/scaffold-module.mjs <name> [--force]
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const force = process.argv.includes('--force');
if (!name || name.startsWith('--')) { console.error('usage: node scripts/scaffold-module.mjs <name> [--force]'); process.exit(1); }
if (!/^[a-z][a-z0-9_-]*$/.test(name)) { console.error(`module id must be lowercase kebab/snake: ${name}`); process.exit(1); }

const dir = join(ROOT, 'modules', name);
const file = join(dir, 'nb-module.json');
if (existsSync(file) && !force) { console.error(`refusing to overwrite modules/${name}/nb-module.json (use --force)`); process.exit(1); }

const manifest = {
  $comment: `NB Harness — ${name} module manifest. Validated against ../../core/module-manifest.schema.json`,
  id: name,
  name,
  required_in: [],
  optional_in: [],
  outputs: [{ name: 'output', artifact: '{WORKSPACE}/...' }],
  verify_cmd: null,
  failure_states: [{ when: '<failure condition>', action: 'STOP', note: '<what happens>' }],
  exit: { success: `${name}.ok`, failure: `${name}.fail` },
  permissions: ['read'],
  side_effects: ['<describe side effects>'],
  install_deps: [],
  requires_approval: false,
  safety_gates: ['self_check'],
};
mkdirSync(dir, { recursive: true });
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(`created modules/${name}/nb-module.json`);
console.log('next: node scripts/validate-manifests.mjs');
