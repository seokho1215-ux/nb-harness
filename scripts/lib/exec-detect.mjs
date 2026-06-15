// NB user-project dynamic-execution / unsafe-deserialization / command-execution detector.
// Goal: NOT a full SAST — a COMPLETION-FIREWALL TRIGGER. When a changed file in the user's project contains a
// dangerous sink (CWE-94 code injection, CWE-78 OS command injection, CWE-502 untrusted deserialization), NB
// raises a `code-execution` risk category -> security pack + full floor -> /nb:close stays NOT_READY until a
// security proof exists. It does NOT hard-ban (that is only for NB's OWN runtime; see scripts/no-eval-check.mjs).
//
// References: CWE-94, CWE-78, CWE-502; OWASP OS Command Injection & Deserialization cheat sheets; OWASP Secure
// Coding with AI; MDN eval; Node vm/child_process; Python pickle/subprocess/PyYAML; Microsoft BinaryFormatter.
//
// NOTE: this file necessarily contains the dangerous pattern literals it searches for; it is EXCLUDED from the
// NB-internal no-eval hard guard (it defines regexes, it never executes any of them).

// extension (no dot, lowercase) -> language tag
const LANG_BY_EXT = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js',
  py: 'py', pyw: 'py',
  ps1: 'ps', psm1: 'ps', psd1: 'ps',
  sh: 'sh', bash: 'sh', zsh: 'sh', ksh: 'sh',
  java: 'jvm', kt: 'jvm', kts: 'jvm', groovy: 'jvm', gradle: 'jvm', scala: 'jvm',
  cs: 'cs',
  php: 'php',
  rb: 'rb',
  go: 'go',
  rs: 'rust',
  c: 'c', cc: 'c', cpp: 'c', cxx: 'c', h: 'c', hpp: 'c', hh: 'c',
  sql: 'sql',
  swift: 'swift', m: 'swift', mm: 'swift',
  dart: 'dart',
  lua: 'lua',
  r: 'r',
  pl: 'perl', pm: 'perl', perl: 'perl',
};

export function langOf(filename = '') {
  const ext = String(filename).split('.').pop().toLowerCase();
  return LANG_BY_EXT[ext] || null;
}

// Each rule: { sink, langs:[tags], re, unless? }. A line matches when re.test(line) && !(unless && unless.test(line)).
const RULES = [
  // --- JavaScript / TypeScript ---
  { sink: 'eval', langs: ['js'], re: /\beval\s*\??\.?\s*\(/ },
  { sink: 'new Function', langs: ['js'], re: /\bnew\s+Function\s*\(/ },
  { sink: 'Function constructor', langs: ['js'], re: /\bFunction\s*\(\s*['"`]/ },
  { sink: 'vm.run*/Script/compileFunction', langs: ['js'], re: /\bvm\s*\.\s*(runInThisContext|runInNewContext|runInContext|Script|compileFunction)\b/ },
  { sink: 'child_process exec', langs: ['js'], re: /(\b(child_process|cp)\s*\.\s*exec(Sync)?\s*\(|\bexecSync\s*\()/ },
  { sink: 'require(child_process).exec chain', langs: ['js'], re: /\brequire\(\s*['"](?:node:)?child_process['"]\s*\)\s*\.\s*exec(Sync)?\s*\(/ },
  { sink: 'spawn/execFile sh -c', langs: ['js'], re: /\b(spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"](sh|bash|zsh)['"]\s*,\s*\[\s*['"]-c['"]/ },
  { sink: 'Deno/Bun subprocess sh -c', langs: ['js'], re: /(\bDeno\.Command\s*\(\s*['"](sh|bash|zsh)['"]|\bDeno\.run\s*\(\s*\{[^}]*cmd\s*:\s*\[\s*['"](sh|bash|zsh)['"]\s*,\s*['"]-c['"]|\bBun\.spawn\w*\s*\(\s*\[\s*['"](sh|bash|zsh)['"]\s*,\s*['"]-c['"]|\bBun\.\$\s*`[^`]*\$\{)/ },
  { sink: 'Worker({ eval: true })', langs: ['js'], re: /\bnew\s+Worker\s*\([^)]*\beval\s*:\s*true\b/ },
  { sink: 'spawn shell:true', langs: ['js'], re: /\bshell\s*:\s*true\b/ },
  { sink: 'dynamic require/import', langs: ['js'], re: /\b(?:require|import)\s*\(\s*[^'"`)\s]/ },
  { sink: 'dangerouslySetInnerHTML', langs: ['js'], re: /\bdangerouslySetInnerHTML\b/ },
  { sink: 'innerHTML (non-literal)', langs: ['js'], re: /\.innerHTML\s*=\s*[^'"`]/ },

  // --- Python ---
  { sink: 'eval/exec/compile', langs: ['py'], re: /\b(eval|exec|compile)\s*\(/ },
  { sink: 'os.system/os.popen', langs: ['py'], re: /\bos\.(system|popen)\s*\(/ },
  { sink: 'subprocess shell=True', langs: ['py'], re: /\bshell\s*=\s*True\b/ },
  { sink: 'pickle.load', langs: ['py'], re: /\bpickle\.(load|loads)\s*\(/ },
  { sink: 'dill/cloudpickle/joblib load', langs: ['py'], re: /\b(dill|cloudpickle|joblib)\.load\w*\s*\(/ },
  { sink: 'torch.load', langs: ['py'], re: /\btorch\.load\s*\(/ },
  { sink: 'numpy.load allow_pickle', langs: ['py'], re: /\ballow_pickle\s*=\s*True\b/ },
  { sink: 'yaml.load (no SafeLoader)', langs: ['py'], re: /\byaml\.load\s*\(/, unless: /SafeLoader|safe_load/ },

  // --- PowerShell ---
  { sink: 'Invoke-Expression/iex', langs: ['ps'], re: /\b(Invoke-Expression|iex)\b/i },
  { sink: 'powershell -EncodedCommand', langs: ['ps'], re: /-Enc(odedCommand)?\b/i },
  { sink: 'download | iex', langs: ['ps'], re: /(Invoke-WebRequest|iwr|curl|wget)\b[^\n]*\|\s*(iex|Invoke-Expression)\b/i },

  // --- Shell ---
  { sink: 'eval', langs: ['sh'], re: /\beval\s+["'$]/ },
  { sink: 'sh -c / bash -c (variable)', langs: ['sh'], re: /\b(sh|bash|zsh)\s+-c\b[^\n]*\$/ },
  { sink: 'curl|wget | sh', langs: ['sh'], re: /(curl|wget)\b[^|\n]*\|\s*(sh|bash|zsh)\b/ },
  { sink: 'source <(curl)', langs: ['sh'], re: /(source|\.)\s+<\(\s*(curl|wget)/ },

  // --- Java / Kotlin / Groovy / Scala ---
  { sink: 'ScriptEngine.eval', langs: ['jvm'], re: /\bScriptEngine\b/ },
  { sink: 'GroovyShell.evaluate / Eval.me', langs: ['jvm'], re: /\b(GroovyShell|Eval\.me)\b/ },
  { sink: 'Runtime.exec', langs: ['jvm'], re: /\bRuntime\.getRuntime\(\)\s*\.\s*exec\s*\(/ },
  { sink: 'ProcessBuilder', langs: ['jvm'], re: /\bProcessBuilder\b/ },
  { sink: 'ObjectInputStream.readObject', langs: ['jvm'], re: /\.readObject\s*\(/ },
  { sink: 'XMLDecoder.readObject', langs: ['jvm'], re: /\bXMLDecoder\b/ },

  // --- C# / .NET ---
  { sink: 'CSharpScript', langs: ['cs'], re: /\bCSharpScript\.\w+/ },
  { sink: 'PowerShell.AddScript', langs: ['cs'], re: /\.AddScript\s*\(/ },
  { sink: 'ProcessStartInfo', langs: ['cs'], re: /\bProcessStartInfo\b/ },
  { sink: 'BinaryFormatter.Deserialize', langs: ['cs'], re: /\bBinaryFormatter\b/ },
  { sink: 'LosFormatter/ObjectStateFormatter', langs: ['cs'], re: /\b(LosFormatter|ObjectStateFormatter)\b/ },

  // --- PHP ---
  { sink: 'eval/assert(string)', langs: ['php'], re: /\b(eval\s*\(|assert\s*\(\s*['"$])/ },
  { sink: 'system/exec/shell_exec/passthru/proc_open/popen', langs: ['php'], re: /\b(system|exec|shell_exec|passthru|proc_open|popen)\s*\(/ },
  { sink: 'variable include/require', langs: ['php'], re: /\b(include|require)(_once)?\s+\$/ },
  { sink: 'unserialize', langs: ['php'], re: /\bunserialize\s*\(/ },

  // --- Ruby ---
  { sink: 'eval/instance_eval/class_eval/module_eval', langs: ['rb'], re: /\b(instance_eval|class_eval|module_eval|eval)\s*[\s(]/ },
  { sink: 'backtick/%x/system (interpolation)', langs: ['rb'], re: /(`[^`]*#\{|%x[({\[][^)}\]]*#\{|\bsystem\s*\([^)]*#\{)/ },
  { sink: 'Marshal.load', langs: ['rb'], re: /\bMarshal\.load\b/ },
  { sink: 'YAML.load', langs: ['rb'], re: /\bYAML\.load\b/, unless: /safe_load/ },

  // --- Go ---
  { sink: 'exec.Command sh -c', langs: ['go'], re: /\bexec\.Command\s*\(\s*"(sh|bash|zsh)"\s*,\s*"-c"/ },
  { sink: 'plugin.Open', langs: ['go'], re: /\bplugin\.Open\s*\(/ },

  // --- Rust ---
  { sink: 'Command sh -c', langs: ['rust'], re: /Command::new\s*\(\s*"(sh|bash|zsh)"\s*\)[\s\S]{0,40}?\.arg\s*\(\s*"-c"/ },
  { sink: 'libloading non-static', langs: ['rust'], re: /libloading::Library::new\s*\(/ },

  // --- C / C++ ---
  { sink: 'system/popen', langs: ['c'], re: /\b(system|popen)\s*\(/ },
  { sink: 'exec family', langs: ['c'], re: /\bexecl?p?e?v?\s*\(/ },
  { sink: 'CreateProcess/ShellExecute', langs: ['c'], re: /\b(CreateProcess\w*|ShellExecute\w*)\s*\(/ },
  { sink: 'dlopen/LoadLibrary', langs: ['c'], re: /\b(dlopen|LoadLibrary\w*)\s*\(/ },

  // --- SQL ---
  { sink: 'EXEC(@sql)', langs: ['sql'], re: /\bEXEC(UTE)?\s*\(\s*@/i },
  { sink: 'sp_executesql', langs: ['sql'], re: /\bsp_executesql\b/i },
  { sink: 'EXECUTE dynamic (format/concat)', langs: ['sql'], re: /\bEXECUTE\s+(format\s*\(|')/i },

  // --- Swift / Objective-C ---
  { sink: 'Process/NSTask', langs: ['swift'], re: /\b(Process\s*\(\)|NSTask)\b/ },
  { sink: 'dlopen', langs: ['swift'], re: /\bdlopen\s*\(/ },
  { sink: 'NSKeyedUnarchiver (unsafe)', langs: ['swift'], re: /\bNSKeyedUnarchiver\b/ },

  // --- Dart ---
  { sink: 'Process.run/start', langs: ['dart'], re: /\bProcess\.(run|start)\s*\(/ },

  // --- Lua ---
  { sink: 'load/loadstring/dofile', langs: ['lua'], re: /\b(loadstring|dofile|load)\s*\(/ },
  { sink: 'dynamic require', langs: ['lua'], re: /\brequire\s*\(\s*[^'"\)]/ },

  // --- R ---
  { sink: 'eval/system/source', langs: ['r'], re: /\b(eval|system|source|sys\.source)\s*\(/ },

  // --- Perl ---
  { sink: 'eval STRING', langs: ['perl'], re: /\beval\s+["']/ },
  { sink: 'backtick/system (interpolation)', langs: ['perl'], re: /(`[^`]*\$|\bsystem\s*\(\s*"[^"]*\$)/ },
  { sink: 'open pipe', langs: ['perl'], re: /\bopen\s*\([^)]*\|/ },
];

// JS: a destructured / namespaced child_process exec import (Codex GATE: `const { exec } = require('child_process')`
// then `exec(cmd)`). We can't flag a bare `exec(` line by itself (it collides with regex `.exec()`), so this is
// a 2-stage, file-level check: only when the file actually imports exec/execSync from child_process do we treat
// a standalone `exec(`/`execSync(` CALL (not `.exec(`) as a sink.
const CP_EXEC_IMPORT = /(?:\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*=\s*require\(\s*['"](?:node:)?child_process['"]\s*\)|import\s*\{[^}]*\bexec(?:Sync)?\b[^}]*\}\s*from\s*['"](?:node:)?child_process['"])/;
const CP_EXEC_CALL = /(^|[^.\w$])exec(Sync)?\s*\(/;

// Detect dangerous sinks in one file's text. Returns [{ sink, line, lang }]. Unknown extension -> no rules (we
// only flag languages we have patterns for; the caller still skips docs/binaries).
export function detectExecSinks(text, filename = '') {
  const lang = langOf(filename);
  if (!lang) return [];
  const rules = RULES.filter((r) => r.langs.includes(lang));
  if (!rules.length) return [];
  const src = String(text);
  const lines = src.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    for (const r of rules) {
      if (r.re.test(line) && !(r.unless && r.unless.test(line))) hits.push({ sink: r.sink, line: i + 1, lang });
    }
  });
  if (lang === 'js' && CP_EXEC_IMPORT.test(src)) {
    lines.forEach((line, i) => {
      if (CP_EXEC_CALL.test(line) && !CP_EXEC_IMPORT.test(line) && !/\b(require|import)\b/.test(line)) {
        hits.push({ sink: 'child_process exec (destructured)', line: i + 1, lang });
      }
    });
  }
  return hits;
}
