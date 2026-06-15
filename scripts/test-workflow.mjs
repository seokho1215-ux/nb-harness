#!/usr/bin/env node
// Tests for lib/workflow.mjs — the per-workflow required-artifacts parser and its leading-frontmatter rule.
// The security property under test (Codex GATE): a `---\n…\n---` block in the BODY must NEVER be read as
// machine frontmatter, or an author could spoof required_artifacts to exempt a real workflow from review/brief.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leadingFrontmatter, requiredArtifacts, requiredFor, DEFAULT_REQUIRED } from './lib/workflow.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- leadingFrontmatter: only a real leading block parses ---
check('leading block parses', leadingFrontmatter('---\nrequired_artifacts: evidence\n---\nbody') === 'required_artifacts: evidence');
check('BOM + leading block parses', leadingFrontmatter('﻿---\nrequired_artifacts: evidence\n---\n') === 'required_artifacts: evidence');
check('no frontmatter -> null', leadingFrontmatter('# just a heading\n') === null);
// THE blocker: a body block that merely looks like frontmatter must NOT match.
const spoof = 'This is body first.\n\n---\nrequired_artifacts: evidence\n---\n';
check('body spoof block -> null (not parsed as frontmatter)', leadingFrontmatter(spoof) === null);
check('text before --- -> null', leadingFrontmatter('intro\n---\nrequired_artifacts: evidence\n---\n') === null);

// --- requiredArtifacts / requiredFor against real files ---
const root = mkdtempSync(join(tmpdir(), 'nb-wf-'));
mkdirSync(join(root, 'workflows'));
const wf = (name, txt) => writeFileSync(join(root, 'workflows', `${name}.md`), txt);

wf('docs-only', '---\nrequired_artifacts: evidence\n---\n# Docs only\n');
wf('full', '---\nrequired_artifacts: evidence, review, brief\n---\n# Full\n');
wf('spoofed', spoof);                 // no real leading frontmatter; a body block tries to exempt
wf('typo', '---\nrequired_artifacts: evdence, reviw\n---\n');   // present but no VALID kinds
wf('nofield', '---\ntitle: x\n---\n');

check('parses a valid subset', eq(requiredArtifacts(root, 'docs-only'), ['evidence']));
check('parses the full set', eq(requiredArtifacts(root, 'full'), ['evidence', 'review', 'brief']));
check('spoofed body -> null (no leading frontmatter)', requiredArtifacts(root, 'spoofed') === null);
check('field absent -> null', requiredArtifacts(root, 'nofield') === null);
check('unknown workflow -> null', requiredArtifacts(root, 'does-not-exist') === null);
check('no workflow -> null', requiredArtifacts(root, undefined) === null);

// requiredFor applies the strict default whenever parsing yields null OR an empty/typo'd list (fail SAFE).
check('spoofed body enforces strict default', eq(requiredFor(root, 'spoofed'), DEFAULT_REQUIRED));
check('typo-only list enforces strict default', eq(requiredFor(root, 'typo'), DEFAULT_REQUIRED));
check('unknown workflow enforces strict default', eq(requiredFor(root, 'does-not-exist'), DEFAULT_REQUIRED));
check('valid subset is honored by requiredFor', eq(requiredFor(root, 'docs-only'), ['evidence']));

rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
