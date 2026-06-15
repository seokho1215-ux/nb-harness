#!/usr/bin/env node
// Scaffold a new skill. Refuses to overwrite without --force. Dependency-free.
// usage: node scripts/scaffold-skill.mjs <name> [--force]
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const force = process.argv.includes('--force');
if (!name || name.startsWith('--')) { console.error('usage: node scripts/scaffold-skill.mjs <name> [--force]'); process.exit(1); }

const dir = join(ROOT, 'skills', name);
const file = join(dir, 'SKILL.md');
if (existsSync(file) && !force) { console.error(`refusing to overwrite skills/${name}/SKILL.md (use --force)`); process.exit(1); }

const tpl = `---
name: ${name}
description: <when this skill should auto-activate — one line, the trigger>
---

# ${name} — skill

> Full rule: \`core/<sot>.md\`. First Read it, then apply.

<what automatic intervention this skill provides — add it only if it isn't already covered>
`;
mkdirSync(dir, { recursive: true });
writeFileSync(file, tpl);
console.log(`created skills/${name}/SKILL.md`);
console.log('next: node scripts/doctor.mjs --source');
