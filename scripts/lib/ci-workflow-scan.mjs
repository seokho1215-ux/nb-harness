// NB CI-workflow security scanner (pure, dependency-free). SEPARATE structure from exec-detect / package-risk:
// this reads changed GitHub Actions workflow files and flags the well-known CI compromise patterns. It is a
// completion-firewall TRIGGER, not a YAML SAST — it catches the direct, documented dangerous shapes and routes
// them to a security review; it does not fully parse every expression.
//
// Signals (GitHub's own "Security hardening" / pull_request_target guidance):
//   - pull_request_target (or workflow_run) + checkout/use of the UNTRUSTED PR head -> "pwn request": attacker
//     code runs WITH repo secrets and write token.
//   - permissions: write-all, or a broad contents/actions/packages/id-token/deployments/security-events: write.
//   - secrets: inherit (hands every secret to a called workflow).
//   - unpinned action (`uses: owner/repo@v1` / `@main`) instead of a full 40-char commit SHA.
//   - an inline `run:` script interpolating untrusted context (`${{ github.event.* }}`, `github.head_ref`)
//     -> shell injection.

export function isWorkflowFile(path) {
  return /(^|[\\/])\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i.test(String(path).replace(/\\/g, '/'));
}

const UNTRUSTED = /github\.(head_ref|event\.(pull_request\.(title|body|head\.(ref|label))|issue\.(title|body)|comment\.body|review\.body|discussion\.(title|body)|head_commit\.message|pages|commits))/;
// a looser "any untrusted event field" for run-script injection (event.* fields are attacker-controllable)
const UNTRUSTED_RUN = /\$\{\{\s*github\.(head_ref|event\.[\w.]*(title|body|ref|label|message|email|name|url)[\w.]*)/i;
const BROAD_WRITE = /^\s*(contents|actions|packages|id-token|deployments|security-events|pull-requests|issues):\s*write\s*$/;

const lineOf = (lines, re) => { const i = lines.findIndex((l) => re.test(l)); return i < 0 ? 1 : i + 1; };

// Scan one workflow file's text. Returns [{ file, line, signal }]. Stateless except for tracking whether we are
// inside a `run:` block scalar (so untrusted interpolation is only flagged as injection inside a run script).
export function scanWorkflowText(text, file = 'workflow.yml') {
  const hits = [];
  const lines = String(text).split(/\r?\n/);

  const hasPRT = /^\s*(pull_request_target|workflow_run)\b/m.test(text) || /\bon:\s*\[?[^\]\n]*\b(pull_request_target|workflow_run)\b/.test(text);
  const usesUntrustedHead = UNTRUSTED.test(text) || /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/.test(text);
  if (hasPRT && usesUntrustedHead) {
    hits.push({ file, line: lineOf(lines, /(pull_request_target|workflow_run)/), signal: 'pull_request_target/workflow_run checks out or uses the untrusted PR head — runs attacker code with repo secrets (GitHub: "pwn request")' });
  }

  let runIndent = -1; // >=0 means we're inside a `run: |` block scalar; the value is the run key's indent
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const n = i + 1;
    const indent = ln.length - ln.replace(/^\s*/, '').length;

    // run-block state: a block scalar starts at `run: |` / `run: >`; it ends when a non-blank line dedents to
    // the run key's indent or less.
    if (runIndent >= 0) {
      if (ln.trim() !== '' && indent <= runIndent) runIndent = -1;
      else if (UNTRUSTED_RUN.test(ln)) { hits.push({ file, line: n, signal: 'inline run: interpolates untrusted context (github.event.*/head_ref) — shell injection; pass it via an env: var and quote it' }); continue; }
    }
    const blockRun = /^(\s*)(-\s*)?run:\s*[|>]/.exec(ln);
    if (blockRun) runIndent = (blockRun[1] || '').length;
    // inline single-line run with interpolation
    if (/^\s*(-\s*)?run:\s*\S/.test(ln) && !/[|>]\s*$/.test(ln) && UNTRUSTED_RUN.test(ln)) {
      hits.push({ file, line: n, signal: 'inline run: interpolates untrusted context (github.event.*/head_ref) — shell injection; pass it via an env: var and quote it' });
    }

    if (/^\s*permissions:\s*write-all\s*$/.test(ln)) hits.push({ file, line: n, signal: 'permissions: write-all — grant least-privilege scopes instead' });
    const bw = BROAD_WRITE.exec(ln);
    if (bw) hits.push({ file, line: n, signal: `broad write permission "${bw[1]}: write" — scope it down (read where possible)` });
    if (/^\s*secrets:\s*inherit\s*$/.test(ln)) hits.push({ file, line: n, signal: 'secrets: inherit — passes ALL secrets to the called workflow; pass only what is needed' });

    // unpinned action / reusable workflow. The action ref may carry a sub-path or a reusable-workflow path
    // (`owner/repo/path@v1`, `owner/repo/.github/workflows/x.yml@main`), so capture everything up to the LAST
    // `@` as the action and the rest as the ref. Pinned = a full 40-char commit SHA. Exempt LOCAL (`./…`) and
    // Docker (`docker://…`) references — those have no GitHub @ref to pin.
    const u = /uses:\s*["']?([^@\s"'#]+)@([^\s"'#]+)/.exec(ln);
    if (u && !/^[0-9a-f]{40}$/i.test(u[2]) && !/^\.\//.test(u[1]) && !/^docker:/i.test(u[1])) {
      hits.push({ file, line: n, signal: `unpinned action ${u[1]}@${u[2]} — pin third-party actions/reusable workflows to a full commit SHA` });
    }
  }
  return hits;
}
