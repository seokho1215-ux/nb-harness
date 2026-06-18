# Changelog

All notable changes to NB Harness. Format loosely follows Keep a Changelog.

## [Unreleased]

### Added
- **Scope & core-value preservation** (`core/scope-value.md`) — NB already stopped scope *creep*; this stops scope *shrink*: the planner may not quietly move a **core value** (the point of what the user is building) out of the first cut or split it into a later phase without asking or a `scope-change` decision. The planner must emit a plain-language **Design Decisions** section (what's deferred & why, phase-split rationale, core-value→acceptance traceability); plan-reviewer gates on silent shrink / dropped core values (NO-GO). intent-lock captures optional `core_value` / `must_preserve` / `defer_candidates` (task-scoped — cleared on `--replace-task`). When a `core_value` is declared, `validate-state` deterministically blocks `implement` until the `## Design Decisions` section exists (the semantic preservation check stays with plan-reviewer).
- **Plugin packaging** (`.claude-plugin/plugin.json`) — commands as `/nb:setup`, `/nb:plan`, … Script install remains a fallback (`/nb-*`).
- **8 commands** (setup / plan / work / review / security / grill / status / doctor) as the small human surface.
- **5 auto-firing skills** (self-check / strength-judge / install-safety / security-gate / grill-me).
- **7 agents** in Build / Review / Security lanes; **conservative hooks** (guide + record).
- **`.nb/` state & artifacts** + documented schema.
- **Scripts**: `doctor` (`--source` / `--target`), `validate-manifests`, `status`, `test-hooks`, and `release-check` with a real install smoke.
- Examples, CI, and contributor/security docs.

## [0.1.0] - 2026-06-09

- Initial public structure: a general AI coding harness for non-developers and vibe builders. Design → Implement → Review → Security (when risky) → Brief, with cross-family review, evidence-before-done, install safety, and a plain-language brief.
