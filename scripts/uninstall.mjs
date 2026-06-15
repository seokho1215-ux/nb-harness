#!/usr/bin/env node
// NB uninstall — list NB-owned paths in a target. Dry-run by default; conservative.
// Removes only clearly NB-created files on --apply; never .nb/ (offers archive guidance).
// Shared-name dirs are listed for manual review, never auto-deleted. See docs/UPGRADING.md.
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!target) { console.error('usage: node scripts/uninstall.mjs <targetDir> [--apply --yes]'); process.exit(1); }
const T = resolve(target);

// clearly NB-created -> safe to remove on --apply
const SAFE = ['AGENTS.nb.md', 'nb.config.json'];
// NB content but generic names -> list for MANUAL removal (could be user-authored)
const MANUAL = ['core', 'modules', 'presets', 'agents', 'scripts', 'workflows', 'docs',
  '.claude/agents', '.claude/skills', '.claude/commands', '.claude/hooks'];

console.log(`NB uninstall plan -> ${T}\n`);
const safePresent = SAFE.filter((p) => existsSync(join(T, p)));
const manualPresent = MANUAL.filter((p) => existsSync(join(T, p)));
console.log('Safe to remove automatically (--apply):');
safePresent.length ? safePresent.forEach((p) => console.log(`   - ${p}`)) : console.log('   (none)');
console.log('\nRemove manually (NB content, shared names — review first):');
manualPresent.length ? manualPresent.forEach((p) => console.log(`   - ${p}`)) : console.log('   (none)');
console.log('\nNEVER removed: AGENTS.md (may be yours), .claude/settings.json (merged), .nb/ (your runtime artifacts).');
console.log('Archive .nb/ first if you want to keep evidence/reviews/briefs.');

if (!apply) { console.log('\nDry-run. Re-run with --apply --yes to remove the "safe" paths above.'); process.exit(0); }
if (!args.includes('--yes')) { console.error('\nrefusing to delete without --yes'); process.exit(1); }
for (const p of safePresent) rmSync(join(T, p), { recursive: true, force: true });
console.log('\nRemoved NB-created files. Shared-name dirs left for manual review. .nb/ preserved.');
process.exit(0);
