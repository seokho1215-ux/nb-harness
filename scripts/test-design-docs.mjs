#!/usr/bin/env node
// Tests for lib/design-docs.mjs — the planner 3-tier docs existence check (P-e/#9) + per-task context-budget
// declaration (M2). The docs must EXIST before implement/close, and each task file must DECLARE its budget.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDesignDocs, designDocsDir } from './lib/design-docs.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const root = mkdtempSync(join(tmpdir(), 'nb-dd-'));
const mk = (slug, { arch = true, mod = true, tasks = ['01.md'], budget = true, dir } = {}) => {
  const base = dir ? join(root, dir) : join(root, 'pipeline', slug);
  mkdirSync(join(base, '03-tasks'), { recursive: true });
  if (arch) writeFileSync(join(base, '01-architecture.md'), '# Arch\n');
  if (mod) writeFileSync(join(base, '02-module.md'), '# Contract\n');
  for (const t of tasks) writeFileSync(join(base, '03-tasks', t), `# Task\n${budget ? '\n## Context Budget\n~20% of the window.\n' : ''}`);
  return base;
};

// default dir convention
check('designDocsDir default = pipeline/<slug>', designDocsDir('/proj', 'Add Thing').replace(/\\/g, '/').endsWith('pipeline/add-thing'));
check('designDocsDir honors an override', designDocsDir('/proj', 'x', 'docs/design').replace(/\\/g, '/').endsWith('docs/design'));

// missing dir entirely
check('no docs dir -> not ok', !checkDesignDocs(root, 'never-planned').ok);

// full valid set
mk('good');
check('full 3-tier + budget -> ok', checkDesignDocs(root, 'good').ok);

// each missing tier is caught
mk('no-arch', { arch: false });
check('missing 01-architecture -> error', checkDesignDocs(root, 'no-arch').errors.some((e) => /01-architecture/.test(e)));
mk('no-mod', { mod: false });
check('missing 02-module -> error', checkDesignDocs(root, 'no-mod').errors.some((e) => /02-module/.test(e)));
mk('no-tasks', { tasks: [] });
check('empty 03-tasks -> error', checkDesignDocs(root, 'no-tasks').errors.some((e) => /03-tasks/.test(e)));

// M2: a task without a context budget is rejected
mk('no-budget', { budget: false });
check('task w/o Context Budget -> error (M2)', checkDesignDocs(root, 'no-budget').errors.some((e) => /Context Budget/i.test(e)));
// one good + one budget-less task -> still flagged
mk('mixed', { tasks: ['01.md'], budget: true });
writeFileSync(join(root, 'pipeline', 'mixed', '03-tasks', '02.md'), '# Task 2 (no budget)\n');
check('one task missing a budget among many -> error', !checkDesignDocs(root, 'mixed').ok);

// override dir (inside the project)
mk('ov', { dir: 'custom/design' });
check('override dir (inside project) is honored', checkDesignDocs(root, 'ov', 'custom/design').ok);

// Codex GATE: an override that ESCAPES the project must be refused, even if valid docs exist there
const ext = mkdtempSync(join(tmpdir(), 'nb-dd-external-'));
mkdirSync(join(ext, '03-tasks'), { recursive: true });
writeFileSync(join(ext, '01-architecture.md'), '# Arch\n');
writeFileSync(join(ext, '02-module.md'), '# Contract\n');
writeFileSync(join(ext, '03-tasks', '01.md'), '# Task\n\n## Context Budget\n~20% of the window.\n');
{ const r = checkDesignDocs(root, 'x', ext); check('absolute external override -> refused (containment)', !r.ok && r.errors.some((e) => /inside the project/.test(e))); }
{ const r = checkDesignDocs(root, 'x', '../nb-dd-external'); check('../ escape override -> refused', !r.ok && r.errors.some((e) => /inside the project/.test(e))); }
rmSync(ext, { recursive: true, force: true });

// M2: an EMPTY "## Context Budget" heading (no number/%/token/window) is not a budget
{
  const base = join(root, 'pipeline', 'empty-budget', '03-tasks');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(root, 'pipeline', 'empty-budget', '01-architecture.md'), '# Arch\n');
  writeFileSync(join(root, 'pipeline', 'empty-budget', '02-module.md'), '# Contract\n');
  writeFileSync(join(base, '01.md'), '# Task\n\n## Context Budget\n\n(to be estimated)\n');
  const r = checkDesignDocs(root, 'empty-budget');
  check('empty Context Budget (no estimate) -> error', !r.ok && r.errors.some((e) => /estimate/.test(e)));
}

rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
