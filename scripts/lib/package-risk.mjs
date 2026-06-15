// NB package-risk engine (supply-chain / slopsquatting gate). SEPARATE from exec-detect on purpose: this is
// about WHICH packages an install pulls in (do they exist? are they reputable?), not about dangerous code sinks.
//
// 2026 attack class: "slopsquatting" — an AI hallucinates a plausible-but-nonexistent package name, and an
// attacker pre-registers it. The direct defense is registry EXISTENCE: a name the registry returns 404 for is
// either a typo or a trap, never something to install. A brand-new package is low-trust (could be a freshly
// planted squat). This is an NB completion-firewall TRIGGER, not a reputation system: block the 404 (direct
// vector), and route ambiguous (new/low-trust) packages to a human decision.
//
// Structure: the PURE pieces (extractInstallPackages / assessPackages) take injected registry results so tests
// run offline; checkRegistry() does the one real network call (fetch injectable). assessInstallSupplyChain()
// orchestrates for the hook. NOTHING here executes a string or shells out.

export const NEW_PACKAGE_DAYS = 30; // a package younger than this is "new / low-trust" -> ask + decision

// Which registry (if any) an install command targets. Only npm + PyPI get a live existence check (the two the
// gate supports); other managers (cargo/go/gem/brew/curl) return null -> no network check (pin/local logic in
// the hook's classifyInstall still applies).
export function ecosystemOf(cmd) {
  const s = String(cmd);
  if (/\b(npm|pnpm|yarn)\s+(install|i|add|ci)\b/i.test(s)) return 'npm';
  if (/\bpip3?\s+install\b/i.test(s)) return 'pypi';
  return null;
}

const NPM_VALUE_FLAGS = new Set(['--registry', '--prefix', '--userconfig', '--globalconfig', '--cache', '--otp', '--tag', '--omit', '--include', '--before', '--workspace', '-w', '--save-dev', '-D', '--save']);
const PIP_VALUE_FLAGS = new Set(['-r', '--requirement', '-c', '--constraint', '-i', '--index-url', '--extra-index-url', '-f', '--find-links', '-t', '--target', '--prefix', '--root']);

// A token that is NOT a package name to look up: a flag, a local path, a VCS/URL/tarball spec, or a scoped/file
// installer. We only want plain registry names — anything exotic is left to the human + the pin/local gate.
function isNonRegistryToken(t) {
  return !t
    || t.startsWith('-')
    || t.startsWith('.') || t.startsWith('/') || t.startsWith('~')
    || /^[a-z]:\\/i.test(t)                 // windows path
    || t.includes('://') || t.includes('@github') || t.startsWith('git+')
    || t.includes('.tgz') || t.includes('.tar') || t.includes('.whl')
    || t.startsWith('file:') || t.startsWith('http');
}

// npm name from a token: keep a leading @scope, drop a trailing @version. "@a/b@1.2.3" -> "@a/b"; "pkg@1" -> "pkg".
function npmName(tok) {
  const t = tok.replace(/^['"]+|['"]+$/g, '');
  const lastAt = t.lastIndexOf('@');
  return lastAt > 0 ? t.slice(0, lastAt) : t; // lastAt===0 means a bare @scope/name with no version
}
// PyPI name from a token: strip the version/extras spec. "requests==2.0" -> "requests"; "flask[async]>=2" -> "flask".
function pypiName(tok) {
  const t = tok.replace(/^['"]+|['"]+$/g, '');
  const m = /^[^[=<>~!;\s]+/.exec(t);
  return m ? m[0] : t;
}

// Extract the registry package names an install command would fetch. Returns [{ name, ecosystem }] (deduped).
// Skips flags + the value a value-flag consumes, lockfile-only installs, and non-registry specs (paths/URLs/VCS).
export function extractInstallPackages(cmd) {
  const eco = ecosystemOf(cmd);
  if (!eco) return [];
  const s = String(cmd);
  let rest = '';
  if (eco === 'npm') {
    const m = /\b(?:npm|pnpm|yarn)\s+(?:install|i|add|ci)\b([^\n]*)/i.exec(s);
    rest = m ? (m[1] || '') : '';
  } else {
    const m = /\bpip3?\s+install\b([^\n]*)/i.exec(s);
    rest = m ? (m[1] || '') : '';
  }
  // Stop at the first shell control operator so a CHAINED command does not bleed into the package list
  // (`npm i react && npm publish` must yield [react], not [react, &&, npm, publish]). We cut on `&& || ; | &`,
  // a backtick, `$(`, and newline — but NOT on `<`/`>` (pip version ranges like `foo>=1` use them, and a
  // redirect target is not a package anyway).
  const stop = rest.search(/[;|&\n\x60]|\$\(/);
  if (stop >= 0) rest = rest.slice(0, stop);
  const valueFlags = eco === 'npm' ? NPM_VALUE_FLAGS : PIP_VALUE_FLAGS;
  const toks = rest.trim().split(/\s+/).filter(Boolean);
  const names = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith('-')) { if (valueFlags.has(t)) i++; continue; }
    if (isNonRegistryToken(t)) continue;
    const name = eco === 'npm' ? npmName(t) : pypiName(t);
    if (name) names.push(name);
  }
  return [...new Map(names.map((n) => [n, { name: n, ecosystem: eco }])).values()];
}

// Pure risk decision for a set of packages given LOOKUP results (injected; checkRegistry produces them at runtime).
// lookup: { [name]: { status: 'exists'|'missing'|'error', ageDays?: number } }.
// Returns { decision: 'allow'|'warn'|'ask'|'deny', flags: string[], needsDecision: bool, packages: [...] }.
//   missing (404)  -> direct attack vector: DENY under strict, else ASK; needs a decision either way.
//   error (network)-> cannot confirm existence: DENY under strict (fail-closed), ASK under approval, WARN advisory.
//   exists + new   -> low-trust: ASK + decision.
//   exists + estab -> allow.
const RANK = { allow: 0, warn: 1, ask: 2, deny: 3 };
export function assessPackages(packages = [], lookup = {}, { profile = 'approval', newDays = NEW_PACKAGE_DAYS } = {}) {
  const flags = [];
  let decision = 'allow';
  let needsDecision = false;
  const out = [];
  const raise = (d) => { if (RANK[d] > RANK[decision]) decision = d; };
  for (const p of packages) {
    const r = lookup[p.name] || { status: 'error' }; // no result == couldn't check == treat as error (fail-closed-ish)
    let verdict = 'ok';
    if (r.status === 'missing') {
      verdict = 'missing';
      flags.push(`package "${p.name}" (${p.ecosystem}) is NOT in the registry (404) — likely a hallucinated / slopsquatted name. Do not install; verify the exact, intended package name.`);
      raise(profile === 'strict' ? 'deny' : 'ask');
      needsDecision = true;
    } else if (r.status === 'error') {
      verdict = 'unverified';
      flags.push(`could not verify package "${p.name}" (${p.ecosystem}) against the registry (network/lookup error) — existence unconfirmed.`);
      raise(profile === 'strict' ? 'deny' : profile === 'advisory' ? 'warn' : 'ask');
    } else if (r.status === 'exists' && typeof r.ageDays === 'number' && r.ageDays >= 0 && r.ageDays < newDays) {
      verdict = 'new';
      flags.push(`package "${p.name}" (${p.ecosystem}) exists but is very new (${r.ageDays}d old) — low-trust; confirm it is the intended, reputable package before installing.`);
      raise('ask');
      needsDecision = true;
    }
    out.push({ ...p, status: r.status, ageDays: r.ageDays, verdict });
  }
  return { decision, flags, needsDecision, packages: out };
}

// Days since an ISO date string, floored. Returns null if unparseable. `nowMs` injected so it's deterministic/testable.
export function ageDaysFrom(iso, nowMs) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}

// The one real network call: does <name> exist in <ecosystem>, and how old is it? fetchImpl + nowMs injected so
// the hook passes the real ones and tests pass mocks (NO live network in tests). Any failure -> { status:'error' }
// (fail-closed at the policy layer via assessPackages). A 404 -> { status:'missing' }. 200 -> existence + ageDays.
export async function checkRegistry(ecosystem, name, { fetchImpl, nowMs, timeoutMs = 2500 } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { status: 'error', reason: 'no-fetch' };
  const url = ecosystem === 'npm'
    ? `https://registry.npmjs.org/${name.replace(/\//g, '%2F')}`     // @scope/pkg -> @scope%2Fpkg
    : ecosystem === 'pypi' ? `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
      : null;
  if (!url) return { status: 'error', reason: 'unsupported-ecosystem' };
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { accept: 'application/json' } });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error', reason: `http-${res.status}` };
    let body = {}; try { body = await res.json(); } catch { /* existence still confirmed by 200 */ }
    const created = ecosystem === 'npm'
      ? (body && body.time && body.time.created)
      : earliestPypiUpload(body);
    const ageDays = ageDaysFrom(created, nowMs ?? Date.now());
    return { status: 'exists', ageDays: ageDays == null ? undefined : ageDays };
  } catch (e) {
    return { status: 'error', reason: (e && e.name === 'AbortError') ? 'timeout' : 'fetch-failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function earliestPypiUpload(body) {
  try {
    let earliest = null;
    for (const rel of Object.values(body.releases || {})) {
      for (const file of rel || []) {
        const t = file && file.upload_time_iso_8601;
        if (t && (!earliest || t < earliest)) earliest = t;
      }
    }
    return earliest;
  } catch { return null; }
}

// Orchestrate the supply-chain check for one install command (used by the hook). checkImpl is injectable so the
// hook passes the real network checkRegistry and tests pass a stub. Returns { flags, decision, needsDecision }.
export async function assessInstallSupplyChain(cmd, profile = 'approval', { checkImpl = checkRegistry, fetchImpl, nowMs } = {}) {
  const pkgs = extractInstallPackages(cmd);
  if (!pkgs.length) return { flags: [], decision: 'allow', needsDecision: false, packages: [] };
  const lookup = {};
  for (const p of pkgs) {
    try { lookup[p.name] = await checkImpl(p.ecosystem, p.name, { fetchImpl, nowMs }); }
    catch { lookup[p.name] = { status: 'error', reason: 'check-threw' }; }
  }
  return assessPackages(pkgs, lookup, { profile });
}
