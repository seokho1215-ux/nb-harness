#!/usr/bin/env node
// Scaffold a new workflow. Refuses to overwrite without --force. Dependency-free.
// usage: node scripts/scaffold-workflow.mjs <name> [--force]
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const force = process.argv.includes('--force');
if (!name || name.startsWith('--')) { console.error('usage: node scripts/scaffold-workflow.mjs <name> [--force]'); process.exit(1); }

const file = join(ROOT, 'workflows', `${name}.md`);
if (existsSync(file) && !force) { console.error(`refusing to overwrite workflows/${name}.md (use --force)`); process.exit(1); }

const tpl = `# Workflow: ${name}

**When NB selects it:** <describe the task intent>. (strength: <light|medium|full>)

**Command surface:** \`/nb:plan\` → \`/nb:work\` → \`/nb:review\`.

**Agents:** <e.g. planner → implementer → code-reviewer>.

**Skills / gates:** <e.g. self-check, intent-lock, context-budget>.

**Expected artifacts:** <design docs, diff, evidence, review>.

**Minimum evidence:** <shown VERIFY_CMD output; review verdict recorded>.

**Exit criteria:** <criteria met, intent matched, brief generated>.

**Escalate when:** <condition> → \`standard-feature\` (or STOP).
`;
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, tpl);
console.log(`created workflows/${name}.md`);
console.log('next: node scripts/validate-workflows.mjs');
