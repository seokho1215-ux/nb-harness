#!/usr/bin/env node
// Tests for lib/ci-workflow-scan.mjs — the CI-workflow compromise detector. Each documented dangerous pattern
// must be flagged; a hardened workflow (pinned SHAs, least-privilege, no untrusted-head checkout) must be clean.
import { isWorkflowFile, scanWorkflowText } from './lib/ci-workflow-scan.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sigs = (txt) => scanWorkflowText(txt, 'w.yml').map((h) => h.signal).join(' || ');
const has = (txt, re) => re.test(sigs(txt));
const clean = (txt) => scanWorkflowText(txt, 'w.yml').length === 0;

// --- isWorkflowFile ---
check('recognizes .github/workflows/*.yml', isWorkflowFile('.github/workflows/ci.yml'));
check('recognizes nested + backslash path', isWorkflowFile('repo\\.github\\workflows\\release.yaml'));
check('rejects a normal yaml', !isWorkflowFile('config/app.yml'));
check('rejects a workflow-named non-path', !isWorkflowFile('docs/workflows.md'));

// --- pull_request_target + untrusted head checkout ---
const pwn = `on: pull_request_target
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm ci && npm test`;
check('pull_request_target + untrusted head -> pwn-request flag', has(pwn, /pwn request/i));

// pull_request_target WITHOUT untrusted head (default checkout of base) -> not the pwn pattern
const prtSafe = `on: pull_request_target
jobs:
  label:
    permissions:
      pull-requests: read
    steps:
      - uses: actions/labeler@8558fd74291d67161a8a78ce36a881fa63b766a9`;
check('pull_request_target without untrusted head -> no pwn flag', !has(prtSafe, /pwn request/i));

// --- permissions ---
check('permissions: write-all flagged', has('permissions: write-all\n', /write-all/));
check('contents: write flagged', has('permissions:\n  contents: write\n', /contents: write/));
check('id-token: write flagged', has('permissions:\n  id-token: write\n', /id-token: write/));
check('contents: read NOT flagged', clean('permissions:\n  contents: read\n'));

// --- secrets: inherit ---
check('secrets: inherit flagged', has('jobs:\n  call:\n    secrets: inherit\n', /inherit/));

// --- unpinned actions ---
check('uses @v4 (tag) flagged unpinned', has('      - uses: actions/checkout@v4\n', /unpinned action/));
check('uses @main (branch) flagged unpinned', has('      - uses: foo/bar@main\n', /unpinned action/));
check('uses @<40-hex SHA> NOT flagged', clean('      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n'));
check('local ./action NOT flagged', clean('      - uses: ./.github/actions/local\n'));
// Codex GATE: sub-path actions + reusable workflows were missed by the owner/repo-only regex
check('uses owner/repo/path@v1 (sub-path) flagged', has('      - uses: foo/bar/setup@v1\n', /unpinned action/));
check('uses reusable workflow owner/repo/.github/workflows/x.yml@main flagged', has('    uses: org/repo/.github/workflows/release.yml@main\n', /unpinned action/));
check('uses sub-path @<40-hex SHA> NOT flagged', clean('      - uses: foo/bar/setup@11bd71901bbe5b1630ceea73d27597364c9af683\n'));
check('docker:// ref NOT flagged as unpinned action', clean('      - uses: docker://alpine:3.19\n'));

// --- run-script injection (untrusted context in a run block) ---
const inj = `jobs:
  b:
    steps:
      - run: |
          echo "title is \${{ github.event.issue.title }}"
          ./build.sh`;
check('run: block interpolating github.event.issue.title -> injection flag', has(inj, /shell injection/));
const injInline = '      - run: echo ${{ github.head_ref }}\n';
check('inline run interpolating github.head_ref -> injection flag', has(injInline, /shell injection/));
// github.event.* inside an `if:` (not a run script) -> not an injection hit
check('github.event in if: (not run) -> no injection flag', !has('    if: \${{ github.event.pull_request.draft == false }}\n', /shell injection/));
// a run block that ENDS (dedent) then an event ref outside it -> not flagged as injection
const dedent = `jobs:
  b:
    steps:
      - run: |
          echo hello
      - name: \${{ github.event.number }}
        uses: foo/bar@9558fd74291d67161a8a78ce36a881fa63b766a9`;
check('event ref after the run block dedents -> no injection flag', !has(dedent, /shell injection/));

// --- a hardened workflow is clean ---
const hardened = `name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - run: npm ci && npm test`;
check('hardened workflow -> no hits', clean(hardened));

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
