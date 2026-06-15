# Module Manifest (nb-module.yaml)

> Every module folder (`modules/<id>/`) ships one `nb-module.json`.
> Validation schema = `core/module-manifest.schema.json` (machine-read and validated).
> **This is what makes "run only security" work** — without a manifest, the harness is just a prompt bundle.

## Why a manifest
1. **Machine-clear module boundaries** — inputs / outputs / failure states are declared, so a module can be run on its own.
2. **Risk visible to human and AI** — `permissions` / `side_effects` show whether a module writes files or hits the network. The strength auto-judge (`core/strength.md`) reads these to rate risk.
3. **Modules hand off artifacts** — `outputs` + `exit` signals let one module's result feed the next (the basis of synergy).

## Required fields
| Field | Meaning |
|---|---|
| `id` | module identifier (`design` / `implement` / `security`) |
| `required_in` | required inputs; empty array = standalone entry module |
| `optional_in` | optional inputs that deepen the result (synergy) |
| `outputs` | output name + artifact path (may use `{WORKSPACE}`) |
| `verify_cmd` | command that verifies this module's result (`{VERIFY_CMD}`); `null` if N/A |
| `failure_states` | failure condition + action (`STOP` / `degrade` / `retry`) |
| `exit` | success / failure signal (the next module reads it) |

## Permission / side-effect fields (required for a public harness)
| Field | Meaning |
|---|---|
| `permissions` | requested capabilities (`read` / `write` / `network` / `exec` / `install`) |
| `side_effects` | side effects (writes files? network calls? external state change?) |
| `install_deps` | dependencies to install; if present, the install-safety flow (`core/INSTALL.md`) applies |
| `requires_approval` | needs explicit user approval before running; risky action = `true` → never auto-run by the strength judge |
| `safety_gates` | which safety gates apply (`core/self-check.md`, the security execution gate) |
| `modes` | (optional) strength modes; security: `analysis` / `red_team_sim` / `sandbox_attack` |

## The boundary (strength ↔ approval)
The AI auto-judges **strength / mode**. But a module with `requires_approval: true` or an `explicit_consent` gate needs **explicit user approval right before it runs.**
> "The AI auto-judges strength, but never auto-runs a risky action."

## Variables (filled at install — `nb.config.json`)
| Variable | Meaning |
|---|---|
| `{PROJECT_ROOT}` | target project root |
| `{WORKSPACE}` | pipeline output folder |
| `{PROJECT_DOCS}` | project docs (referenced if present; never required) |
| `{VERIFY_CMD}` | verify command (build / test / lint) |
| `{DEPLOY_CMD}` | deploy command |
| `{SECURITY_GATE}` | the project's own security rules |
