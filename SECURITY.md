# Security Policy

NB Harness is a local tool. It is not a hosted service and stores no user data.

## Reporting a vulnerability in NB itself

If you find a security issue in NB's own code (installer, hooks, scripts, manifests):

- Prefer **GitHub Security Advisories** (private report), or
- open an issue labeled `security` **without** exploit details, and we'll coordinate.

Please don't include real secrets or third-party data in a report.

## Scope

- **In scope:** NB's own scripts, hooks, installer, and manifests.
- **Out of scope:** vulnerabilities in *your* project that NB reviewed — finding those is what NB's security module is for.

## Using NB's attack tooling

The security module's **Sandbox Attack** runs only against systems you own or are authorized to test (see [`ACCEPTABLE_USE.md`](ACCEPTABLE_USE.md)). Misuse is the user's responsibility.
