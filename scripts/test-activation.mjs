#!/usr/bin/env node
// Tests for lib/activation.mjs — the observed/floor engine under /nb:close. Dependency-free.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCategories, floorStrength, impliedPacks, observedPacks, unknownImpact, resolveActivation } from './lib/activation.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

// detectCategories
check('migration file -> data', detectCategories({ files: ['db/migrations/001_init.sql'] }).includes('data'));
check('npm install cmd -> supply-chain', detectCategories({ commands: ['npm install left-pad'] }).includes('supply-chain'));
check('lockfile change -> supply-chain', detectCategories({ files: ['pnpm-lock.yaml'] }).includes('supply-chain'));
check('rm -rf cmd -> delete', detectCategories({ commands: ['rm -rf build'] }).includes('delete'));
check('auth file -> auth', detectCategories({ files: ['src/auth/session.ts'] }).includes('auth'));
check('.env file -> secret', detectCategories({ files: ['.env.production'] }).includes('secret'));
check('plain file -> no category', detectCategories({ files: ['src/util/format.ts'] }).length === 0);

// data over-detection fix (KNOWN-ISSUES): non-DB analysis files must NOT trip `data`; real DB signals still do.
check('non-DB data_loader.py does NOT trip data', !detectCategories({ files: ['src/data_loader.py'] }).includes('data'));
check('market data csv does NOT trip data', !detectCategories({ files: ['data/market_prices.csv'] }).includes('data'));
check('seed file alone no longer trips data (was over-broad)', !detectCategories({ files: ['scripts/seed_demo.ts'] }).includes('data'));
check('real migration still trips data', detectCategories({ files: ['prisma/schema.prisma'] }).includes('data'));
check('alter table cmd still trips data', detectCategories({ commands: ['psql -c "ALTER TABLE x ADD COLUMN y"'] }).includes('data'));

// read-pollution fix (KNOWN-ISSUES): reading a file (Read/Grep) is NOT a task change; only mutations are.
{ const t = mkdtempSync(join(tmpdir(), 'nb-act-')); mkdirSync(join(t, 'logs'), { recursive: true });
  const reads = [{ ts: '2026-06-28T00:00:00Z', tool: 'Read', ok: true, path: 'scripts/lib/security-floor.mjs' },
                 { ts: '2026-06-28T00:00:01Z', tool: 'Grep', ok: true, path: 'src/auth/session.ts' }];
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'), reads.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const a = resolveActivation({ nbDir: t, root: null, state: {}, packRules: {} });
  check('reading auth/security source does NOT trip categories (read-pollution)', a.changes.files.length === 0 && !a.observed_categories.includes('auth') && !a.observed_categories.includes('secret'));
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'), JSON.stringify({ ts: '2026-06-28T00:00:02Z', tool: 'Write', ok: true, path: 'src/auth/login.ts' }) + '\n');
  const b = resolveActivation({ nbDir: t, root: null, state: {}, packRules: {} });
  check('writing an auth file DOES trip auth category', b.changes.files.includes('src/auth/login.ts') && b.observed_categories.includes('auth'));
  rmSync(t, { recursive: true, force: true }); }

// floorStrength
check('data -> full floor', floorStrength(['data']) === 'full');
check('supply-chain -> standard floor', floorStrength(['supply-chain']) === 'standard');
check('none -> light floor', floorStrength([]) === 'light');
check('supply-chain+data -> full (max wins)', floorStrength(['supply-chain', 'data']) === 'full');

// impliedPacks
check('auth implies security pack', impliedPacks(['auth']).includes('security'));
check('data implies data pack', impliedPacks(['data']).includes('data'));
check('delete implies no specific pack', impliedPacks(['delete']).length === 0);

// observedPacks (pack rules)
check('pack rule path match -> observed', observedPacks({ files: ['db/migrations/x.sql'] }, { data: { paths: [/migrat/] } }).includes('data'));
check('pack rule command match -> observed', observedPacks({ commands: ['npm run build'] }, { frontend: { commands: ['npm run build'] } }).includes('frontend'));
check('no rule match -> not observed', observedPacks({ files: ['readme.md'] }, { data: { paths: [/migrat/] } }).length === 0);

// unknownImpact
check('change with no class -> unknown true', unknownImpact({ files: ['src/x.ts'] }, [], []) === true);
check('change with category -> unknown false', unknownImpact({ files: ['db/m.sql'] }, [], ['data']) === false);
check('no change -> unknown false', unknownImpact({ files: [] }, [], []) === false);

// resolveActivation: low confidence (no git/base_ref), category from logs pulls in implied pack
{
  const t = mkdtempSync(join(tmpdir(), 'nb-act-'));
  mkdirSync(join(t, 'logs'), { recursive: true });
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'),
    '{"tool":"Bash","ok":true,"cmd":"supabase db push"}\n{"tool":"Write","ok":true,"path":"db/schema.sql"}\n');
  const r = resolveActivation({ nbDir: t, root: t, state: { declared_packs: ['frontend'] } });
  check('resolve: data category detected from logs', r.observed_categories.includes('data'));
  check('resolve: floor escalated to full', r.floor_strength === 'full');
  check('resolve: data pack implied-active', r.active_packs.includes('data'));
  check('resolve: declared frontend kept', r.active_packs.includes('frontend'));
  check('resolve: no git/base_ref -> low confidence', r.baseline_confidence === 'low');
  check('resolve: classified -> not unknown_impact', r.unknown_impact === false);
  rmSync(t, { recursive: true, force: true });
}

// resolveActivation: the security-sensitive WORKFLOW forces the security pack + a full floor even when the
// diff/logs match NOTHING (audit #20) — choosing the workflow is itself a safety-floor declaration.
{
  const t = mkdtempSync(join(tmpdir(), 'nb-act-sec-'));
  mkdirSync(join(t, 'logs'), { recursive: true });
  writeFileSync(join(t, 'logs', 'tool-events.jsonl'), '{"tool":"Write","ok":true,"path":"src/util/format.ts"}\n');
  const r = resolveActivation({ nbDir: t, root: t, state: { current_workflow: 'security-sensitive' } });
  check('sec-wf: no category detected (benign file)', r.observed_categories.length === 0);
  check('sec-wf: security pack forced active', r.active_packs.includes('security'));
  check('sec-wf: security pack is explicit (not implied)', r.explicit_packs.includes('security'));
  check('sec-wf: forced_packs reports security', (r.forced_packs || []).includes('security'));
  check('sec-wf: floor raised to full', r.floor_strength === 'full');
  // a non-security workflow does NOT force the security pack
  const r2 = resolveActivation({ nbDir: t, root: t, state: { current_workflow: 'docs-only' } });
  check('docs-wf: security pack NOT forced', !r2.active_packs.includes('security'));
  check('docs-wf: floor stays light', r2.floor_strength === 'light');
  rmSync(t, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
