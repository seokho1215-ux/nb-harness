<!-- NB_REVIEW_PROVENANCE
reviewer: codex
command: codex exec --sandbox read-only -
exit_status: 0
manual_fallback: false
-->

# Code Review — settings-name (cross-family)

## Verdict
PASS with revisions

## Important
- Long names are silently trimmed — consider a visible limit or message. (`SettingsForm.tsx:42`)

## Acceptance Criteria
- [x] name persists — `api/settings/route.ts:21`
- [x] shows after reload — `page.tsx:55`
- [x] verify output shown (build + 12 tests)

## Cross-Family Bias Check
No same-family preference; the trim note is a real UX gap, not a style call.
