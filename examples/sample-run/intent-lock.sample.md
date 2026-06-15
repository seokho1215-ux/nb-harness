# Intent Lock — settings-name

> Captured at `/nb:plan`, checked at `/nb:grill`. Stored at `.nb/decisions/intent-lock.<task>.md`.

## User intent
Let a user save a display name on a settings page.

## Non-goals
- avatars or profile photos
- any auth / login changes
- internationalization

## Definition of done
- the name persists to storage
- it shows after a reload
- very long names are handled (not a crash)

## Taste / UX notes
- match the existing settings layout; quiet, no new colors
- inline save, no extra modal

## What must not change
- the settings route path
- the existing settings fields
- the auth flow

## Drift checks (for grill)
- did we add profile fields beyond the name? (non-goal)
- did we touch auth? (must-not-change)
- did the save UX get heavier than "inline"? (taste)
