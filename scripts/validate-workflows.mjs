#!/usr/bin/env node
// Validate workflows/*.md structure. Dependency-free, simple regex (no full Markdown parsing).
// Non-zero on gaps.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadingFrontmatter } from './lib/workflow.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, 'workflows');
const NAMES = ['light-change', 'standard-feature', 'full-feature', 'bugfix', 'refactor', 'docs-only', 'security-sensitive', 'release'];

if (!existsSync(WF)) { console.error('no workflows/ directory'); process.exit(1); }
const files = readdirSync(WF).filter((f) => f.endsWith('.md'));
if (!files.length) { console.error('no workflows found'); process.exit(1); }

let fail = 0;
for (const f of files) {
  const txt = readFileSync(join(WF, f), 'utf8');
  const low = txt.toLowerCase();
  const errs = [];

  // required section markers
  for (const s of ['when nb selects it', 'command surface', 'agents', 'expected artifacts']) {
    if (!low.includes(s)) errs.push(`missing "${s}"`);
  }
  if (!/skills\s*\/?\s*gates/i.test(txt)) errs.push('missing "Skills / gates" section');

  // required_artifacts frontmatter (machine-readable, audit #35): must be present and name only known kinds.
  // close + harness-score read this to gate evidence/review/brief per workflow.
  const fmBody = leadingFrontmatter(txt); // leading block only (shared rule; body spoof can't satisfy this)
  const ra = fmBody && /^\s*required_artifacts\s*:\s*(.+)$/im.exec(fmBody);
  if (!ra) errs.push('missing "required_artifacts" frontmatter (e.g. `required_artifacts: evidence, review, brief`)');
  else {
    const bad = ra[1].split(',').map((s) => s.trim().toLowerCase()).filter((s) => s && !['evidence', 'review', 'brief'].includes(s));
    if (bad.length) errs.push(`required_artifacts has unknown kinds: ${bad.join(', ')} (allowed: evidence, review, brief)`);
  }

  // non-empty content right after the bold label
  if (!/\*\*minimum evidence:\*\*\s*\S/i.test(txt)) errs.push('"Minimum evidence" empty or missing');
  if (!/\*\*exit criteria:\*\*\s*\S/i.test(txt)) errs.push('"Exit criteria" empty or missing');

  // escalation must name a workflow or say STOP
  const em = txt.match(/\*\*escalate when:\*\*\s*(.+)/i);
  if (!em) errs.push('"Escalate when" empty or missing');
  else if (!/\bSTOP\b/.test(em[1]) && !NAMES.some((n) => em[1].includes(n))) {
    errs.push('"Escalate when" should name a workflow or say STOP');
  }

  if (errs.length) { fail++; console.log(`FAIL ${f}`); errs.forEach((e) => console.log(`   - ${e}`)); }
  else console.log(`OK   ${f}`);
}
console.log(`\n${files.length} workflow(s), ${fail} invalid.`);
process.exit(fail ? 1 : 0);
