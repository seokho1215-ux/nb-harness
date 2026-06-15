// NB publish-hygiene engine (pure, dependency-free). SEPARATE structure: this inspects the file list a publish
// would actually ship (from `npm pack --dry-run`) and flags artifacts that must never leave the repo — secrets,
// credentials, source maps, raw source, and internal/notes paths. Basis: npm publish docs + the "VibeGuard"
// finding (arXiv 2604.01052) that AI-assisted publishes routinely leak .env / keys / internal files.
//
// Trigger, not SAST: it blocks the clearly-dangerous inclusions and warns when the package has no allow-list
// (`files`) or `.npmignore` (so the WHOLE directory ships). The decision-to-publish stays with the human.

// Each rule: a matcher over the published path (forward-slashed, package-relative) + a short reason. Ordered
// most-specific-first so the reported reason is the meaningful one.
const RISKY = [
  { re: /(^|\/)\.npmrc$/i, reason: '.npmrc (may carry an auth token)' },
  { re: /(^|\/)\.env(\.[\w.-]+)?$/i, reason: '.env file (secrets)' },
  { re: /\.(pem|key|p12|pfx|asc|ppk)$/i, reason: 'private key / certificate' },
  { re: /(^|\/)id_(rsa|dsa|ed25519|ecdsa)(\.|$)/i, reason: 'SSH private key' },
  { re: /(^|\/)\.ssh\//i, reason: 'ssh material' },
  { re: /(^|\/)(secrets?|credentials?)(\.[\w.-]+)?$/i, reason: 'secret/credential file' },
  { re: /\.(secret|key)\b/i, reason: 'secret-marked file' },
  { re: /(^|\/)\.git\//i, reason: '.git internals' },
  { re: /(^|\/)\.nb\//i, reason: 'NB runtime state (internal)' },
  { re: /(^|\/)(notes|internal|private|\.internal)\//i, reason: 'internal/notes path' },
  { re: /\.map$/i, reason: 'source map (leaks original source)' },
  { re: /\.(ts|tsx)$/i, exclude: /\.d\.ts$/i, reason: 'raw TypeScript source (ship compiled JS + .d.ts)' },
];

// Assess a published file list. files = array of package-relative paths (npm pack's `files[].path`).
// opts.hasFilesField / opts.hasNpmignore feed the "no allow-list" warning.
// Returns { ok, risky:[{path,reason}], warnings:[string] }.
export function assessFileList(files = [], { hasFilesField = false, hasNpmignore = false } = {}) {
  const risky = [];
  for (const raw of files) {
    const p = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
    for (const rule of RISKY) {
      if (rule.exclude && rule.exclude.test(p)) continue;
      if (rule.re.test(p)) { risky.push({ path: p, reason: rule.reason }); break; }
    }
  }
  const warnings = [];
  if (!hasFilesField && !hasNpmignore) {
    warnings.push('package.json has no "files" allow-list and there is no .npmignore — the whole directory ships; add a "files" field to publish only what you intend.');
  }
  return { ok: risky.length === 0, risky, warnings };
}

// Parse the file list out of `npm pack --dry-run --json` output. npm prints a JSON array of { files:[{path}], ... }.
// Tolerant: returns [] if the shape is unexpected (the caller treats "no list" as "could not verify").
export function parseNpmPackJson(stdout) {
  let data; try { data = JSON.parse(stdout); } catch { return null; }
  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry || !Array.isArray(entry.files)) return null;
  return entry.files.map((f) => (f && typeof f === 'object' ? f.path : f)).filter(Boolean);
}
