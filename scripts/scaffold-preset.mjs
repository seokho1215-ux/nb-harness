#!/usr/bin/env node
// Scaffold a new preset. Refuses to overwrite without --force. Dependency-free.
// usage: node scripts/scaffold-preset.mjs <name> [--force]
import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const force = process.argv.includes('--force');
if (!name || name.startsWith('--')) { console.error('usage: node scripts/scaffold-preset.mjs <name> [--force]'); process.exit(1); }

const file = join(ROOT, 'presets', `${name}.yaml`);
if (existsSync(file) && !force) { console.error(`refusing to overwrite presets/${name}.yaml (use --force)`); process.exit(1); }

const tpl = `# Advanced/team profile. The default experience stays automatic (core/strength.md).
id: ${name}
name: ${name}
description: <one line>
default_workflow_bias: standard-feature
review_strictness: medium
evidence_strictness: medium
security_strictness: floor+module
cross_family_required: true
human_brief_depth: standard
`;
writeFileSync(file, tpl);
console.log(`created presets/${name}.yaml`);
console.log('next: node scripts/doctor.mjs --source');
