#!/usr/bin/env node
// Tests for lib/exec-detect.mjs (user-project dynamic-exec / deserialization / command detector) and for
// activation.scanContent (file reading: binary/large skip + report). JS-dangerous tokens are concatenated so
// this file stays clean under the NB-internal no-eval hard guard that also scans scripts/.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectExecSinks, langOf } from './lib/exec-detect.mjs';
import { scanContent, resolveActivation } from './lib/activation.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const has = (text, file, sink) => detectExecSinks(text, file).some((h) => !sink || h.sink.includes(sink));

const EV = 'ev' + 'al', FN = 'Func' + 'tion', CP = 'child_' + 'process';

// --- the explicitly-required language sinks each fire ---
check('JS ' + EV, has(`const x = ${EV}(userInput)`, 'app.js', EV));
check('JS ' + CP + ' exec (member)', has(`${CP}.exec(cmd)`, 'a.ts', 'exec'));
// Codex GATE round-2: destructured/namespaced child_process exec then a bare exec() call
check('JS destructured exec (require)', has(`const { exec } = require('node:${CP}')\nexec(userInput)`, 'a.js', 'destructured'));
check('JS destructured exec (import)', has(`import { exec } from '${CP}'\nexec(cmd)`, 'b.ts', 'destructured'));
check('JS bare exec() WITHOUT cp import -> not flagged', !has('exec(thing)\nconst m = /x/.exec(s)', 'c.js'));
check('JS require cp dot exec chain', has(`require('${CP}').exec(userInput)`, 'd.js', 'chain'));
check('JS require node cp dot exec chain', has(`require('node:${CP}').exec(cmd)`, 'e.ts', 'chain'));
// Codex GATE round-3b: spawn/execFile('sh', ['-c', ...]) — common Node command-injection sinks
check('JS spawn sh -c', has(`const { spawn } = require('${CP}')\nspawn('sh', ['-c', userInput])`, 'f.js', 'sh -c'));
check('JS execFileSync sh -c', has(`execFileSync('bash', ['-c', cmd])`, 'g.ts', 'sh -c'));
check('JS spawn node (not sh) -> not flagged', !has("spawn('node', [script])", 'h.js'));
// Codex GATE round-4: Deno/Bun subprocess sh -c
check('Deno.Command sh -c', has("new Deno.Command('sh', { args: ['-c', userInput] })", 'i.ts', 'Deno/Bun'));
check('Bun.spawn sh -c', has("Bun.spawn(['sh', '-c', userInput])", 'j.js', 'Deno/Bun'));
check('Deno.Command node -> not flagged', !has("new Deno.Command('node', { args: [f] })", 'k.ts'));
// Codex GATE round-5: Deno.run, Bun.$ template, Worker eval
check('Deno.run sh -c', has("Deno.run({ cmd: ['sh', '-c', userInput] })", 'l.ts', 'Deno/Bun'));
check('Bun.$ shell template (interpolated)', has('Bun.$`sh -c ${userInput}`', 'm.js', 'Deno/Bun'));
check('Bun.$ static (no interp) -> not flagged', !has('Bun.$`ls -la`', 'n.js'));
check('Worker eval:true', has('new Worker(code, { eval: true })', 'o.js', 'Worker'));
check('JS new ' + FN, has(`const f = new ${FN}("return 1")`, 'a.jsx', FN));
check('Python pickle.loads', has('obj = pickle.loads(data)', 'm.py', 'pickle'));
check('Python yaml.load (unsafe)', has('cfg = yaml.load(s)', 'm.py', 'yaml'));
check('Python yaml.load + SafeLoader -> clean', !has('cfg = yaml.load(s, Loader=yaml.SafeLoader)', 'm.py'));
check('Python subprocess shell=True', has('subprocess.run(c, shell=True)', 'm.py', 'shell=True'));
check('PowerShell iex', has('$p | iex', 's.ps1', 'iex'));
check('C system()', has('system(cmd);', 'main.c', 'system'));
check('SQL EXEC(@sql)', has('EXEC(@sql)', 'q.sql', 'EXEC'));

// --- a spread of the other languages (CWE-78/502 coverage) ---
check('PHP unserialize', has('$o = unserialize($_GET["x"]);', 'i.php', 'unserialize'));
check('Ruby Marshal.load', has('Marshal.load(blob)', 'a.rb', 'Marshal'));
check('Java readObject', has('Object o = ois.readObject();', 'A.java', 'readObject'));
check('C# BinaryFormatter', has('new BinaryFormatter().Deserialize(s)', 'A.cs', 'BinaryFormatter'));
check('Go exec sh -c', has('exec.Command("sh", "-c", c)', 'm.go', 'exec.Command'));
check('Rust Command sh -c', has('Command::new("sh").arg("-c").arg(c)', 'm.rs', 'sh -c'));
check('Shell curl|sh', has('curl http://x | sh', 'i.sh', 'curl'));

// --- false-positive discipline ---
check('benign JS regex .exec() not flagged', !has('const m = /x/.exec(s); arr.map(fn)', 'a.js'));
check('benign Python not flagged', !has('print(hi)\nx = compute(2)', 'm.py'));
check('doc .md -> no language -> no hit', !has(`${EV}(x); system(y)`, 'README.md'));
check('langOf unknown ext -> null', langOf('notes.txt') === null && langOf('data.json') === null);

// --- scanContent: binary + large file skip (reported), real hit surfaced ---
{
  const t = mkdtempSync(join(tmpdir(), 'nb-ed-'));
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(join(t, 'src', 'run.py'), 'import pickle\nobj = pickle.loads(d)\n');
  writeFileSync(join(t, 'src', 'big.py'), 'x = 1\n' + '# pad\n'.repeat(100000)); // > 512KB
  writeFileSync(join(t, 'src', 'bin.py'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0x65])); // NUL -> binary
  const files = ['src/run.py', 'src/big.py', 'src/bin.py', 'docs/readme.md', 'missing.py'];
  const r = scanContent(t, files);
  check('scanContent flags the real sink', r.hits.some((h) => h.file === 'src/run.py' && /pickle/.test(h.sink)));
  check('scanContent skips + reports large file', r.skipped.some((s) => s.file === 'src/big.py' && s.reason === 'large'));
  check('scanContent skips + reports binary file', r.skipped.some((s) => s.file === 'src/bin.py' && s.reason === 'binary'));
  check('scanContent ignores docs/missing (no hit, no crash)', !r.hits.some((h) => /readme|missing/.test(h.file)));

  // --- end-to-end: a dangerous sink raises code-execution + security pack + full floor (the firewall trigger) ---
  mkdirSync(join(t, '.nb', 'logs'), { recursive: true });
  writeFileSync(join(t, '.nb', 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Write', ok: true, path: 'src/run.py' }) + '\n');
  const act = resolveActivation({ nbDir: join(t, '.nb'), root: t, state: {} });
  check('resolveActivation -> code-execution category', act.observed_categories.includes('code-execution'));
  check('resolveActivation -> security pack active', act.active_packs.includes('security'));
  check('resolveActivation -> full floor', act.floor_strength === 'full');
  check('resolveActivation -> not unknown_impact (classified)', act.unknown_impact === false);
  rmSync(t, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
