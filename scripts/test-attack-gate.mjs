#!/usr/bin/env node
// Tests for lib/attack-gate.mjs — the five hard pins for Sandbox Attack Mode. A real attack is authorized ONLY
// when every pin passes; each pin must independently REFUSE. Fail-closed by construction (missing context = deny).
import { evaluateAttack, hostOf, hostAllowed, isLocalHost } from './lib/attack-gate.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const denied = (r, pin) => !r.allowed && r.denials.some((d) => d.startsWith(pin));

// A fully-authorized baseline: consent ok, a registered clone at localhost, benign actions.
const okCtx = { consent: { ok: true, approvedBy: 'Maintainer' }, ownership: { isCopy: true, cloneOf: 'git@github.com:me/app', target: 'localhost' }, allowlist: [], task: 't', now: '2026-06-15T00:00:00Z' };
const okPlan = { target: 'http://localhost:3000', actions: ['curl http://localhost:3000/api/login', 'fuzz /search?q='], rate: 10 };

const base = evaluateAttack(okPlan, okCtx);
check('all pins pass -> allowed + authorization', base.allowed && base.authorization && base.authorization.pins_passed.length === 6);
check('authorization is redacted-shaped (no raw secret fields)', base.authorization.mode === 'sandbox_attack' && base.authorization.task === 't');

// --- host helpers ---
check('hostOf strips scheme/port/userinfo', hostOf('https://user:pw@localhost:8443/x') === 'localhost');
check('hostOf ipv6', hostOf('http://[::1]:3000') === '[::1]');
check('isLocalHost localhost/127/.local/.test', isLocalHost('localhost') && isLocalHost('127.0.0.1') && isLocalHost('app.local') && isLocalHost('x.test'));
check('hostAllowed local always', hostAllowed('http://127.0.0.1:5000'));
check('hostAllowed public denied w/o allowlist', !hostAllowed('https://victim.com'));
check('hostAllowed public allowed w/ exact entry', hostAllowed('https://staging.example.com', ['staging.example.com']));
check('hostAllowed suffix entry', hostAllowed('https://api.example.com', ['.example.com']));

// --- each pin refuses independently ---
check('no consent -> explicit_consent refused', denied(evaluateAttack(okPlan, { ...okCtx, consent: { ok: false } }), 'explicit_consent'));
check('consent missing entirely -> explicit_consent refused (fail-closed)', denied(evaluateAttack(okPlan, { ...okCtx, consent: undefined }), 'explicit_consent'));
check('not a copy -> ownership_proof refused', denied(evaluateAttack(okPlan, { ...okCtx, ownership: { isCopy: false, cloneOf: 'x' } }), 'ownership_proof'));
check('no clone_of -> ownership_proof refused', denied(evaluateAttack(okPlan, { ...okCtx, ownership: { isCopy: true } }), 'ownership_proof'));
check('target != registered clone -> ownership_proof refused', denied(evaluateAttack({ ...okPlan, target: 'http://other:3000' }, { ...okCtx, ownership: { isCopy: true, cloneOf: 'x', target: 'localhost' } }), 'ownership_proof'));
check('public target not allowlisted -> allowlist refused', denied(evaluateAttack({ ...okPlan, target: 'https://victim.com' }, { ...okCtx, ownership: { isCopy: true, cloneOf: 'x', target: 'https://victim.com' } }), 'allowlist'));
check('destructive action -> no_destructive refused', denied(evaluateAttack({ ...okPlan, actions: ['drop table users'] }, okCtx), 'no_destructive'));
check('rm -rf action -> no_destructive refused', denied(evaluateAttack({ ...okPlan, actions: ['rm -rf /var/data'] }, okCtx), 'no_destructive'));
check('payment action -> no_real_payment refused', denied(evaluateAttack({ ...okPlan, actions: ['POST /api/stripe/charge'] }, okCtx), 'no_real_payment'));
check('sendmail action -> no_real_payment refused', denied(evaluateAttack({ ...okPlan, actions: ['sendmail attacker@evil.com'] }, okCtx), 'no_real_payment'));
check('rate over cap -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: 999 }, okCtx), 'rate_limit'));
check('rate within cap -> allowed', evaluateAttack({ ...okPlan, rate: 50 }, okCtx).allowed);
// Codex GATE: a bogus rate must be REFUSED, never allowed via `> cap` being false
check('rate -1 -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: -1 }, okCtx), 'rate_limit'));
check('rate 0 -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: 0 }, okCtx), 'rate_limit'));
check('rate 1.5 (non-integer) -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: 1.5 }, okCtx), 'rate_limit'));
check('rate Infinity -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: Infinity }, okCtx), 'rate_limit'));
check('rate NaN -> rate_limit refused', denied(evaluateAttack({ ...okPlan, rate: NaN }, okCtx), 'rate_limit'));
check('no rate provided -> allowed (rate optional)', evaluateAttack({ target: okPlan.target, actions: okPlan.actions }, okCtx).allowed);

// multiple failures listed together
const many = evaluateAttack({ target: 'https://victim.com', actions: ['drop database app', 'stripe refund'], rate: 9999 }, { consent: { ok: false }, ownership: {} });
check('multiple pins refuse together', !many.allowed && many.denials.length >= 4);

// a destructive token hidden in the target is also caught
check('destructive in target string caught', denied(evaluateAttack({ target: 'http://localhost/?x=drop table', actions: [] }, okCtx), 'no_destructive'));

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
