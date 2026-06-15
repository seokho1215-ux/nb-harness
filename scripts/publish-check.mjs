#!/usr/bin/env node
// NB publish-check — publish artifact hygiene gate (lib/publish-hygiene.mjs). Runs `npm pack --dry-run --json`
// to get the ACTUAL file list a publish would ship, and STOPS if it includes secrets / keys / .npmrc / source
// maps / raw source / internal-notes paths. When the list is clean, it can write the release pack's
// `publish-file-list` objective proof (bound to the real npm-pack run via a tool-event), so `/nb:close` can
// require that a release was hygiene-checked before it ships.
//   node scripts/publish-check.mjs                                  # check the current package, print verdict
//   node scripts/publish-check.mjs --task <slug> --proof            # + write the release publish-file-list proof
//   node scripts/publish-check.mjs --dir <pkgDir>                   # check a specific package directory
// Exit: 0 clean · 1 risky (STOP — do not publish) · 2 could not run/parse npm pack (fail loud).
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessFileList, parseNpmPackJson } from './lib/publish-hygiene.mjs';
import { slugify, stripBom, sha256 } from './lib/proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dir = resolve(flag('--dir') || process.cwd());
const writeProof = args.includes('--proof');
const task = flag('--task');

// npm is a .cmd shim on Windows (Node refuses to spawn .cmd without a shell), so run the STATIC, fixed
// `npm pack --dry-run --json` through a shell. No untrusted input is interpolated (the directory is passed via
// cwd, never the command string). Reviewed + allowlisted in no-eval-check.mjs.
const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
if (res.error || typeof res.stdout !== 'string') { console.error(`publish-check: could not run npm pack (${res.error ? res.error.message : 'no output'})`); process.exit(2); }
const files = parseNpmPackJson(res.stdout);
if (!files) { console.error('publish-check: could not parse `npm pack --dry-run --json` output — cannot verify the publish file list (fail loud).'); process.exit(2); }

let pkg = {}; try { pkg = JSON.parse(stripBom(readFileSync(join(dir, 'package.json'), 'utf8'))); } catch { /* no package.json */ }
const hasFilesField = Array.isArray(pkg.files) && pkg.files.length > 0;
const hasNpmignore = existsSync(join(dir, '.npmignore'));
const { ok, risky, warnings } = assessFileList(files, { hasFilesField, hasNpmignore });

console.log(`publish-check: ${files.length} file(s) would be published from ${dir}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (risky.length) {
  console.log(`  ✗ ${risky.length} risky file(s) MUST NOT be published:`);
  for (const r of risky) console.log(`     - ${r.path}  (${r.reason})`);
  console.log('\nSTOP — fix the package "files" allow-list / .npmignore, then re-run. Not writing a proof.');
  process.exit(1);
}
console.log('  ✓ no secrets / keys / source maps / internal paths in the publish set.');

if (writeProof) {
  if (!task) { console.error('publish-check: --proof requires --task <slug> (the proof is task-scoped).'); process.exit(2); }
  const slug = slugify(task);
  const cmd = 'npm pack --dry-run --json';
  const runId = randomUUID();
  const outputSha = sha256(res.stdout); // hash of the REAL npm pack output -> binds the proof to this exact run
  const ts = new Date().toISOString();
  try {
    for (const d of ['proofs', 'logs']) mkdirSync(join(nb, d), { recursive: true });
    // STRONG binding: a trusted-execution event (source: publish-check) with run_id + output_sha256, mirrored on
    // the proof. verifyProof requires publish-file-list to be run_id-bound, so ONLY this real, hygiene-passing
    // run can mint the proof — a hand-written proof referencing a plain `npm pack` log line is rejected.
    appendFileSync(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ ts, tool: 'Bash', source: 'publish-check', ok: true, cmd, run_id: runId, output_sha256: outputSha }) + '\n');
    const sample = files.slice(0, 12).join(', ');
    writeFileSync(join(nb, 'proofs', `${slug}.release.publish-file-list.json`), JSON.stringify({
      task: slug, pack: 'release', proof_type: 'publish-file-list',
      command: cmd, exit_code: 0, run_id: runId, output_sha256: outputSha,
      output_excerpt: `published ${files.length} file(s), 0 risky; sample: ${sample}`,
      file_count: files.length, timestamp: ts,
    }, null, 2) + '\n');
    console.log(`  proof -> .nb/proofs/${slug}.release.publish-file-list.json (run_id ${runId})`);
  } catch (e) { console.error(`publish-check: could not write the proof (${e && e.message ? e.message : e})`); process.exit(2); }
}
process.exit(0);
