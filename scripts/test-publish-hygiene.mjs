#!/usr/bin/env node
// Tests for lib/publish-hygiene.mjs — the publish artifact hygiene gate. A file list that would ship a secret /
// key / .npmrc / source map / raw source / internal path must be flagged; a clean dist must pass; the missing
// allow-list warning fires only when there's neither a `files` field nor a .npmignore.
import { assessFileList, parseNpmPackJson } from './lib/publish-hygiene.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const reasons = (files, opts) => assessFileList(files, opts).risky.map((r) => r.reason);
const flagged = (files) => assessFileList(files, { hasFilesField: true }).risky.map((r) => r.path);

// --- risky inclusions ---
check('.env flagged', flagged(['dist/index.js', '.env']).includes('.env'));
check('.env.production flagged', flagged(['.env.production']).includes('.env.production'));
check('.pem key flagged', flagged(['certs/server.pem']).includes('certs/server.pem'));
check('private key .key flagged', flagged(['id.key']).includes('id.key'));
check('.npmrc flagged', flagged(['.npmrc']).includes('.npmrc'));
check('id_rsa flagged', flagged(['deploy/id_rsa']).includes('deploy/id_rsa'));
check('source map flagged', flagged(['dist/app.js.map']).includes('dist/app.js.map'));
check('raw .ts source flagged', flagged(['src/index.ts']).includes('src/index.ts'));
check('.d.ts declaration NOT flagged', !flagged(['dist/index.d.ts']).includes('dist/index.d.ts'));
check('notes/ internal path flagged', flagged(['notes/design-plan.md']).includes('notes/design-plan.md'));
check('internal/ path flagged', flagged(['internal/secrets-list.txt']).length > 0);
check('.git internals flagged', flagged(['.git/config']).includes('.git/config'));
check('.nb runtime flagged', flagged(['.nb/state.json']).includes('.nb/state.json'));

// --- clean dist passes ---
const clean = ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'dist/index.js.LICENSE.txt'];
check('clean dist -> ok, no risky', assessFileList(clean, { hasFilesField: true }).ok);

// --- reason text ---
check('.env reason mentions secrets', reasons(['.env'], { hasFilesField: true }).some((r) => /secret/i.test(r)));

// --- allow-list warning ---
check('no files field + no .npmignore -> warning', assessFileList(clean, { hasFilesField: false, hasNpmignore: false }).warnings.length === 1);
check('files field present -> no warning', assessFileList(clean, { hasFilesField: true, hasNpmignore: false }).warnings.length === 0);
check('.npmignore present -> no warning', assessFileList(clean, { hasFilesField: false, hasNpmignore: true }).warnings.length === 0);

// --- npm pack --json parsing ---
const packJson = JSON.stringify([{ name: 'x', files: [{ path: 'dist/index.js' }, { path: '.env' }] }]);
check('parseNpmPackJson extracts paths', JSON.stringify(parseNpmPackJson(packJson)) === JSON.stringify(['dist/index.js', '.env']));
check('parseNpmPackJson on garbage -> null', parseNpmPackJson('not json') === null);
check('parseNpmPackJson on unexpected shape -> null', parseNpmPackJson('{"nope":1}') === null);
// end-to-end: parse then assess
check('parsed list with .env -> not ok', !assessFileList(parseNpmPackJson(packJson), { hasFilesField: true }).ok);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
