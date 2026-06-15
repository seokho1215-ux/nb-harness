#!/usr/bin/env node
// Tests for lib/package-risk.mjs — the supply-chain / slopsquatting gate. Network is INJECTED (mock fetch / stub
// check), so this runs fully offline. Properties under test: 404 (hallucinated) blocks per profile; a network
// error fails CLOSED under strict; a brand-new package routes to a decision; an established package is allowed;
// package extraction ignores flags/paths/URLs and strips version specs.
import {
  ecosystemOf, extractInstallPackages, assessPackages, ageDaysFrom, checkRegistry, assessInstallSupplyChain, NEW_PACKAGE_DAYS,
} from './lib/package-risk.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const names = (cmd) => extractInstallPackages(cmd).map((p) => p.name);

// --- ecosystemOf ---
check('npm install -> npm', ecosystemOf('npm install left-pad') === 'npm');
check('yarn add -> npm', ecosystemOf('yarn add react') === 'npm');
check('pip install -> pypi', ecosystemOf('pip install requests') === 'pypi');
check('cargo -> null (no live check)', ecosystemOf('cargo add serde') === null);
check('not an install -> null', ecosystemOf('node build.js') === null);

// --- extractInstallPackages ---
check('npm names + strip version', eq(names('npm install left-pad@1.3.0 chalk'), ['left-pad', 'chalk']));
check('npm scoped keeps scope, strips version', eq(names('npm i @scope/pkg@2.0.0'), ['@scope/pkg']));
check('npm skips flags + value flags', eq(names('npm i --registry http://x react -D'), ['react']));
check('npm skips local paths / urls / tarballs', eq(names('npm i ./local ../x git+https://h/r.git http://a/b.tgz'), []));
check('npm ci (lockfile) -> no packages', eq(names('npm ci'), []));
check('pip strips == and extras', eq(names('pip install requests==2.31.0 flask[async]>=2'), ['requests', 'flask']));
check('pip skips -r requirement file', eq(names('pip install -r requirements.txt requests'), ['requests']));
check('dedup repeated names', eq(names('npm i react react'), ['react']));
// Codex GATE: a chained command must not bleed into the package list
check('chained && -> only the install args (not npm/publish)', eq(names('npm i react && npm publish'), ['react']));
check('chained ; -> only the first install args', eq(names('npm i lodash ; npm i evil'), ['lodash']));
check('piped | -> only the install args', eq(names('npm i chalk | tee log'), ['chalk']));
check('background & -> only the install args', eq(names('npm i chalk & echo done'), ['chalk']));
check('$(...) subshell -> cut before it', eq(names('npm i chalk $(curl x)'), ['chalk']));
check('pip version range NOT cut by >= (keeps later packages)', eq(names('pip install foo>=1 bar'), ['foo', 'bar']));

// --- ageDaysFrom ---
const NOW = Date.parse('2026-06-15T00:00:00Z');
check('ageDaysFrom computes whole days', ageDaysFrom('2026-06-05T00:00:00Z', NOW) === 10);
check('ageDaysFrom unparseable -> null', ageDaysFrom('not-a-date', NOW) === null);
check('ageDaysFrom null iso -> null', ageDaysFrom(null, NOW) === null);

// --- assessPackages (pure, injected lookup) ---
const P = [{ name: 'realpkg', ecosystem: 'npm' }];
const miss = { realpkg: { status: 'missing' } };
check('404 under strict -> deny + needsDecision', (() => { const r = assessPackages(P, miss, { profile: 'strict' }); return r.decision === 'deny' && r.needsDecision; })());
check('404 under approval -> ask', assessPackages(P, miss, { profile: 'approval' }).decision === 'ask');
check('404 under advisory -> ask (404 is never just a warn)', assessPackages(P, miss, { profile: 'advisory' }).decision === 'ask');

const err = { realpkg: { status: 'error' } };
check('network error under strict -> deny (fail closed)', assessPackages(P, err, { profile: 'strict' }).decision === 'deny');
check('network error under approval -> ask', assessPackages(P, err, { profile: 'approval' }).decision === 'ask');
check('network error under advisory -> warn', assessPackages(P, err, { profile: 'advisory' }).decision === 'warn');
check('missing lookup entry treated as error (not silently allowed)', assessPackages(P, {}, { profile: 'strict' }).decision === 'deny');

check('new package -> ask + needsDecision', (() => { const r = assessPackages(P, { realpkg: { status: 'exists', ageDays: 3 } }, { profile: 'approval' }); return r.decision === 'ask' && r.needsDecision; })());
check('established package -> allow, no flags', (() => { const r = assessPackages(P, { realpkg: { status: 'exists', ageDays: 900 } }, { profile: 'approval' }); return r.decision === 'allow' && r.flags.length === 0; })());
check('age exactly at threshold -> allow (not new)', assessPackages(P, { realpkg: { status: 'exists', ageDays: NEW_PACKAGE_DAYS } }, { profile: 'approval' }).decision === 'allow');

// --- checkRegistry with a mock fetch (no live network) ---
const mockFetch = (map) => async (url) => {
  const hit = Object.entries(map).find(([k]) => url.includes(k));
  if (!hit) return { status: 404, ok: false, json: async () => ({}) };
  const [, v] = hit;
  return { status: 200, ok: true, json: async () => v };
};
const npm404 = await checkRegistry('npm', 'totally-not-real', { fetchImpl: mockFetch({}), nowMs: NOW });
check('checkRegistry 404 -> missing', npm404.status === 'missing');
const npmOld = await checkRegistry('npm', 'react', { fetchImpl: mockFetch({ react: { time: { created: '2013-05-29T00:00:00Z' } } }), nowMs: NOW });
check('checkRegistry npm 200 -> exists + ageDays', npmOld.status === 'exists' && npmOld.ageDays > 1000);
const pypiNew = await checkRegistry('pypi', 'freshpkg', { fetchImpl: mockFetch({ freshpkg: { releases: { '0.1.0': [{ upload_time_iso_8601: '2026-06-10T00:00:00Z' }] } } }), nowMs: NOW });
check('checkRegistry pypi 200 -> exists + ageDays from earliest upload', pypiNew.status === 'exists' && pypiNew.ageDays === 5);
const throwy = await checkRegistry('npm', 'x', { fetchImpl: async () => { throw new Error('boom'); }, nowMs: NOW });
check('checkRegistry fetch throw -> error', throwy.status === 'error');
const non200 = await checkRegistry('npm', 'x', { fetchImpl: async () => ({ status: 500, ok: false, json: async () => ({}) }), nowMs: NOW });
check('checkRegistry 500 -> error', non200.status === 'error');
// no fetch available at all (old runtime): temporarily remove the global so the fallback is null -> error (no net).
const savedFetch = globalThis.fetch;
globalThis.fetch = undefined;
const noFetch = await checkRegistry('npm', 'x', { fetchImpl: null });
globalThis.fetch = savedFetch;
check('checkRegistry no fetch impl -> error', noFetch.status === 'error' && noFetch.reason === 'no-fetch');

// --- assessInstallSupplyChain (orchestration with a stub check) ---
const stub = (results) => async (eco, name) => results[name] || { status: 'error' };
const sc1 = await assessInstallSupplyChain('npm i real-old hallucinated-xyz', 'strict', {
  checkImpl: stub({ 'real-old': { status: 'exists', ageDays: 800 }, 'hallucinated-xyz': { status: 'missing' } }),
});
check('orchestration: one 404 among installs -> deny (strict)', sc1.decision === 'deny' && sc1.needsDecision);
const sc2 = await assessInstallSupplyChain('npm ci', 'strict', { checkImpl: stub({}) });
check('orchestration: lockfile-only install -> allow (no packages)', sc2.decision === 'allow' && sc2.flags.length === 0);
const sc3 = await assessInstallSupplyChain('node x.js', 'strict', { checkImpl: stub({}) });
check('orchestration: non-install -> allow', sc3.decision === 'allow');

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
