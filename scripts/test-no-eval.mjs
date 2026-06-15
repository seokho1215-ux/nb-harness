#!/usr/bin/env node
// Tests for no-eval-check.mjs — the NB-internal dynamic-execution HARD guard. Every forbidden literal (inputs
// AND check names) is built by concatenation so THIS file stays clean under the very scan it exercises.
import { scanText, scanTree, RUNTIME_ROOTS, ALLOWLIST } from './no-eval-check.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

const EV = 'ev' + 'al', FN = 'Func' + 'tion';
const RNC = 'runIn' + 'NewContext', RIC = 'runIn' + 'Context', CP = 'child_' + 'process';
const hit = (text) => scanText(text).length > 0;

// detection of each banned construct
check('detects ' + EV + '(', hit(`x = ${EV}(s)`));
check('detects ' + EV + '?.(', hit(`x = ${EV}?.(s)`));
check('detects new ' + FN, hit(`f = new ${FN}("return 1")`));
check('detects bare ' + FN + ' ctor', hit(`${FN}("a","return a")`));
check('detects vm dot ' + RNC, hit('vm.' + RNC + '(c)'));
check('detects vm dot ' + RIC, hit('vm.' + RIC + '(c)'));
check('detects vm dot Script', hit('new vm.' + 'Script(code)'));
check('detects vm dot compileFunction', hit('vm.' + 'compileFunction(src)'));
check('detects string set' + 'Timeout', hit('set' + 'Timeout("code()", 10)'));
check('detects string set' + 'Interval', hit('set' + 'Interval(`code()`, 10)'));
check('detects ' + 'exec' + 'Sync(', hit('exec' + 'Sync("ls")'));
check('detects ' + CP + ' exec', hit(CP + '.exec("ls")'));
check('detects shell ' + 'true', hit('spawn(c, { shell:' + ' true })'));
check('detects dynamic imp' + 'ort()', hit('await imp' + 'ort(userPath)'));
check('detects dynamic requ' + 'ire()', hit('const m = requ' + 'ire(dynamicName)'));

// no false positives on look-alikes
check('clean: regex .exec() not flagged', !hit('const m = /x/.exec(s)'));
check('clean: static import literal not flagged', !hit("await imp" + "ort('./mod.mjs')"));
check('clean: .' + EV + 'uate() not flagged', !hit('obj.' + EV + 'uate(2)'));
check('clean: my' + FN + 'Call() not flagged', !hit('my' + FN + 'Call(1)'));

// the real gate: repo runtime is clean under the REAL allowlist
check('repo runtime clean with real allowlist', scanTree(RUNTIME_ROOTS).length === 0);
check('allowlist is non-empty (reviewed callsites exist)', ALLOWLIST.length > 0);
// removing the allowlist must surface the intentional shell-true callsites (proves the gate is live)
{
  const bare = scanTree(RUNTIME_ROOTS, { allowlist: [] });
  check('no allowlist -> nb-run shell-true surfaces', bare.some((f) => f.file === 'scripts/nb-run.mjs' && f.construct === 'shell-true'));
  check('with allowlist -> nb-run NOT in findings', !scanTree(RUNTIME_ROOTS).some((f) => f.file === 'scripts/nb-run.mjs'));
  check('no allowlist -> more findings than with allowlist', bare.length > scanTree(RUNTIME_ROOTS).length);
}
// Codex GATE: allowlist match must be a DISTINCTIVE callsite snippet, never a broad word like 'shell' (which
// would also allow a future unrelated shell-true callsite in the same file).
check('every allowlist match is specific (not the bare word "shell")',
  ALLOWLIST.every((a) => a.match && a.match !== 'shell' && a.match.length >= 12 && a.reason));

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
