#!/usr/bin/env node
// NB Harness — cross-family review helper.
// Pipes a review bundle into the OTHER AI family (Codex) and returns its verdict.
// The whole point is cross-family: a same-family review shares the blind spots.
//
// Usage:
//   node scripts/cross-review.mjs <bundle.md> [out.md]
//
// The bundle = the relevant review rubric (agents/plan-reviewer.md or agents/code-reviewer.md)
// + the artifacts (design docs, or the diff + task spec + contract).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { REVIEW_BODY_START, REVIEW_BODY_END, reviewBodyHash } =
  await import(pathToFileURL(resolve(HERE, 'lib', 'proof.mjs')).href);

const [bundlePath, outPath] = process.argv.slice(2);
if (!bundlePath) {
  console.error('usage: node scripts/cross-review.mjs <bundle.md> [out.md]');
  process.exit(1);
}

let bundle;
try {
  bundle = readFileSync(bundlePath, 'utf8');
} catch {
  console.error(`cannot read bundle: ${bundlePath}`);
  process.exit(1);
}

// read-only sandbox: the reviewer must not modify anything.
// On Windows, `codex` is an npm shim (codex.cmd) — spawnSync can't resolve/run a .cmd without a shell
// (Node refuses to run a .cmd/.bat without a shell since CVE-2024-27980). So use a shell there. The bundle is
// piped via stdin (`input`), not the command line, so it is never subject to shell quoting.
const isWin = process.platform === 'win32';
const res = spawnSync('codex', ['exec', '--sandbox', 'read-only', '-'], {
  input: bundle,
  encoding: 'utf8',
  shell: isWin,
  maxBuffer: 32 * 1024 * 1024, // reviews are small, but don't truncate a large one into a bogus verdict
});

// spawn-level failure (non-Windows "not found", or the shell itself missing). On Windows a missing codex
// surfaces as a non-zero status + stderr instead, handled by the normal exit path below.
if (res.error) {
  console.error('codex not found on PATH.');
  console.error('  install: npm i -g @openai/codex   then: codex login');
  console.error('  manual fallback: paste the bundle into the other family\'s chat, save the verdict to the out path.');
  process.exit(1);
}

// The reviewer output goes inside a canonical body block; everything that binds the artifact to the run
// (the body hash) is computed over THAT block only, so provenance/format changes outside it never break the
// match. The PostToolUse hook independently hashes the same block from this command's captured output, and
// /nb:close recomputes it from the saved artifact — three-way agreement is the analytical proof's binding.
const bodyBlock = `${REVIEW_BODY_START}\n${res.stdout ?? ''}\n${REVIEW_BODY_END}\n`;
const outputSha = reviewBodyHash(bodyBlock);

// Provenance over header-parsing: instead of trusting the model to print its own name, we record HOW the
// review was run. Since this script invokes `codex exec` directly, a same-family fallback can't silently slip
// in. A human only sets manual_fallback: true when they paste into the other family's chat by hand.
// output_sha256 binds this artifact to its run; it is NOT a correctness attestation (logs are tamper-evident).
const provenance =
`<!-- NB_REVIEW_PROVENANCE
reviewer: codex
command: codex exec --sandbox read-only -
exit_status: ${res.status ?? 0}
manual_fallback: false
output_sha256: ${outputSha}
-->
`;
const out = provenance + bodyBlock;
process.stdout.write(out); // always show the output (incl. a failed run) for debugging
// Persist to the review ledger ONLY on a successful review. A failed codex run is not a "Review": the
// analytical firewall already rejects it (exit_status / hook ok:false), but a saved file would still read as
// a present Review to the core score (a phantom pass). On failure we print above but do not write the file.
if (outPath) {
  if ((res.status ?? 0) === 0) writeFileSync(outPath, out);
  else console.error(`cross-review: codex exited ${res.status} — not writing ${outPath} (failed review not persisted)`);
}

process.exit(res.status ?? 0);
