# Changelog

All notable changes to NB Harness. Format loosely follows Keep a Changelog.

## [Unreleased]

### Added
- **Plugin packaging** (`.claude-plugin/plugin.json`) — commands as `/nb:setup`, `/nb:plan`, … Script install remains a fallback (`/nb-*`).
- **8 commands** (setup / plan / work / review / security / grill / status / doctor) as the small human surface.
- **5 auto-firing skills** (self-check / strength-judge / install-safety / security-gate / grill-me).
- **7 agents** in Build / Review / Security lanes; **conservative hooks** (guide + record).
- **`.nb/` state & artifacts** + documented schema.
- **Scripts**: `doctor` (`--source` / `--target`), `validate-manifests`, `status`, `test-hooks`, and `release-check` with a real install smoke.
- Examples, CI, and contributor/security docs.

## [0.1.0] - 2026-06-09

- Initial public structure: a general AI coding harness for non-developers and vibe builders. Design → Implement → Review → Security (when risky) → Brief, with cross-family review, evidence-before-done, install safety, and a plain-language brief.
