#!/usr/bin/env node
// NB security gate (CWE-94 / CWE-78): NB's OWN runtime (scripts, hooks, libs, validators) must NEVER execute
// JavaScript from a string or shell out through a shell interpreter. If the harness / a hook / the /nb:close
// path could eval string code or run `sh -c <built string>`, a crafted state/proof/manifest could smuggle
// executable code into the very tool that judges it — the completion firewall would be bypassable. This static
// scan FAILS release-check on any hit outside the explicit ALLOWLIST. Docs/examples are NOT scanned.
//
// References: CWE-94 (Code Injection), CWE-78 (OS Command Injection), MDN eval, Node vm/child_process docs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = resolve(fileURLToPath(import.meta.url));

// Forbidden string/dynamic-execution constructs. `construct` is the allowlist key.
export const FORBIDDEN = [
  { construct: 'eval', name: 'eval() / eval?.()', re: /\beval\s*\??\.?\s*\(/ },
  { construct: 'new-function', name: 'new Function()', re: /\bnew\s+Function\s*\(/ },
  { construct: 'function-ctor', name: 'Function() constructor', re: /\bFunction\s*\(/ },
  { construct: 'vm', name: 'vm.runIn*/Script/compileFunction', re: /\bvm\s*\.\s*(runInThisContext|runInNewContext|runInContext|Script|compileFunction)\b/ },
  { construct: 'vm', name: 'runInNewContext', re: /\brunInNewContext\b/ },
  { construct: 'vm', name: 'runInThisContext', re: /\brunInThisContext\b/ },
  { construct: 'vm', name: 'runInContext', re: /\brunInContext\b/ },
  { construct: 'string-timer', name: 'setTimeout/setInterval(string)', re: /\bset(Timeout|Interval)\s*\(\s*['"`]/ },
  { construct: 'cp-exec', name: 'child_process exec/execSync', re: /(\b(child_process|cp)\s*\.\s*exec(Sync)?\s*\(|\bexecSync\s*\(|(^|[^.\w$])exec\s*\(\s*['"`])/ },
  { construct: 'shell-true', name: 'spawn/exec with shell:true', re: /\bshell\s*:\s*true\b/ },
  { construct: 'dynamic-import', name: 'dynamic import()/require() (non-static path)', re: /\b(?:import|require)\s*\(\s*[^'"`)\s]/ },
];

// Explicit allowlist: each entry is an INTENTIONAL, reviewed callsite. Keyed by exact file + construct (+ an
// optional `match` substring for callsite precision) + a REASON. Remove an entry and the scan FAILS (proving
// the gate is live). These are the only places NB is permitted to use a shell — all are static-argv or the
// trusted execution path, never a built-from-untrusted string.
// `match` must be a DISTINCTIVE snippet of the exact allowed line (Codex GATE: a broad match like 'shell' would
// also allow a future, unrelated `shell:true` callsite added to the same file — defeating regression protection).
export const ALLOWLIST = [
  { file: 'scripts/nb-run.mjs', construct: 'shell-true', match: 'spawnSync(command, { shell: true', reason: 'nb-run is the trusted Generic-mode execution path: runs the user-approved verify command and records run_id+output_sha256 (the firewall trust log). shell:true honors a full command string.' },
  { file: 'scripts/release-check.mjs', construct: 'shell-true', match: "'where claude' : 'command -v claude'", reason: 'dev-only release gate: probes for the `claude` CLI with a STATIC command. Never runs untrusted input.' },
  { file: 'scripts/release-check.mjs', construct: 'shell-true', match: "spawnSync('claude plugin validate .'", reason: 'dev-only release gate: runs `claude plugin validate .` (STATIC command string).' },
  { file: 'scripts/cross-review.mjs', construct: 'dynamic-import', match: "lib', 'proof.mjs'", reason: 'imports a STATIC local module (resolve(HERE, lib, proof.mjs)) via pathToFileURL().href so ESM dynamic-import works on Windows. Constant path, not untrusted input.' },
  { file: 'scripts/publish-check.mjs', construct: 'shell-true', match: "spawnSync('npm', ['pack', '--dry-run', '--json']", reason: 'publish hygiene gate: runs the STATIC `npm pack --dry-run --json` (npm is a .cmd on Windows; Node refuses to spawn .cmd without a shell). The target dir is passed via cwd, never interpolated into the command — no untrusted input.' },
];

// Detector/fixture files necessarily contain the very pattern literals they search for; exclude them (the scan
// would otherwise flag its own regex source). Kept deliberately tiny — everything else IS scanned.
const EXCLUDE = new Set([
  resolve(ROOT, 'scripts', 'no-eval-check.mjs'),
  resolve(ROOT, 'scripts', 'lib', 'exec-detect.mjs'),
]);

const allowed = (allowlist, file, construct, text) =>
  allowlist.some((a) => a.file === file && a.construct === construct && (!a.match || text.includes(a.match)));

// Scan one file's text; returns [{ line, construct, name, text }]. Pure — used by the test and the CLI alike.
export function scanText(text) {
  const hits = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    for (const f of FORBIDDEN) if (f.re.test(line)) hits.push({ line: i + 1, construct: f.construct, name: f.name, text: line.trim() });
  });
  return hits;
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(mjs|js|cjs)$/.test(e)) out.push(p);
  }
  return out;
}

// Scan the given runtime roots; returns findings (repo-relative paths) NOT covered by the allowlist.
export function scanTree(roots, { allowlist = ALLOWLIST, exclude = EXCLUDE } = {}) {
  const findings = [];
  for (const r of roots) {
    for (const file of walk(r)) {
      const abs = resolve(file);
      if (abs === SELF || exclude.has(abs)) continue;
      let txt = '';
      try { txt = readFileSync(file, 'utf8'); } catch { continue; }
      const rel = abs.slice(ROOT.length + 1).split('\\').join('/');
      for (const h of scanText(txt)) {
        if (allowed(allowlist, rel, h.construct, h.text)) continue;
        findings.push({ file: rel, ...h });
      }
    }
  }
  return findings;
}

export const RUNTIME_ROOTS = [join(ROOT, 'scripts'), join(ROOT, '.claude', 'hooks')];

if (process.argv[1] && SELF === resolve(process.argv[1])) {
  const findings = scanTree(RUNTIME_ROOTS);
  if (findings.length) {
    console.log(`no-eval: ${findings.length} forbidden dynamic-execution construct(s) in runtime code (not allowlisted):`);
    for (const f of findings) console.log(`   - ${f.file}:${f.line}  ${f.name}  ::  ${f.text}`);
    console.log('\nIf a hit is intentional and safe, add an exact {file, construct, match, reason} ALLOWLIST entry.');
    process.exit(1);
  }
  console.log(`no-eval: clean (no un-allowlisted eval / Function / vm.* / shell:true / cp.exec in runtime code; ${ALLOWLIST.length} reviewed allowlist entries)`);
  process.exit(0);
}
