#!/usr/bin/env node
// Validate commands/*.md contract. Dependency-free; non-zero on gaps.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CMD = join(ROOT, 'commands');
if (!existsSync(CMD)) { console.error('no commands/ directory'); process.exit(1); }
const files = readdirSync(CMD).filter((f) => f.endsWith('.md'));
if (!files.length) { console.error('no commands found'); process.exit(1); }

let fail = 0;
for (const f of files) {
  const txt = readFileSync(join(CMD, f), 'utf8');
  const name = f.replace(/\.md$/, '');
  const errs = [];

  if (!/^---[\s\S]*?\bdescription:\s*\S[\s\S]*?---/.test(txt)) errs.push('frontmatter description missing');
  if (!/\*\*When/i.test(txt)) errs.push('missing "When"');
  if (!/NB does automatically/i.test(txt)) errs.push('missing "NB does automatically"');
  if (!/\*\*Your approval/i.test(txt)) errs.push('missing "Your approval"');
  if (!/\*\*Produces/i.test(txt)) errs.push('missing "Produces"');
  if (!/(\.nb\b|artifact|state|read-only|nothing)/i.test(txt)) errs.push('no .nb artifact/state mention (or "nothing"/"read-only")');

  const tm = txt.match(/^#\s*\/nb:([a-z0-9-]+)/m);
  if (!tm) errs.push('title missing "# /nb:<name>"');
  else if (tm[1] !== name) errs.push(`title /nb:${tm[1]} does not match file name ${name}`);

  if (errs.length) { fail++; console.log(`FAIL ${f}`); errs.forEach((e) => console.log(`   - ${e}`)); }
  else console.log(`OK   ${f}`);
}
console.log(`\n${files.length} command(s), ${fail} invalid.`);
process.exit(fail ? 1 : 0);
