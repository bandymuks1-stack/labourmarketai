# Architecture

Next.js 16 (App Router) · TypeScript · Tailwind v4 · ESLint 9. Guards run on
`tsx`.

## Layout

```
src/
  app/                     App Router routes
    page.tsx               /            landing
    login/ register/ role/ auth + role selection
    app/                   workspace (AppShell layout)
      page.tsx             /app         overview (owns no data)
      profile/             the ONE profile
      discover/ matches/ company/ hiring-needs/ communication/ settings/
    admin/                 operational console (AdminShell)
  components/
    landing/ role/ profile/ company/ discover/ matches/ hiring/
    communication/ shell/ auth/ ui/
  lib/
    types.ts               canonical domain types (single source of truth)
    player-card.ts         the ONE place a PlayerCard is derived
    matching.ts            deterministic, transparent fit
    sample-data.ts         clearly-labelled preview data (never "real")
    auth-providers.ts      honest provider config structure (no secrets)
  config/site.ts           site identity + navigation
scripts/check.ts           foundation guards (npm run check)
```

## The player-card system

`lib/player-card.ts` exposes `profileToPlayerCard` and `companyToPlayerCard`.
Both produce the identical `PlayerCard` view-model. `ui/PlayerSurface.tsx` is
the single visual frame. `ProfilePlayerCard` and `CompanyPlayerCard` are the
only entry points; everything else (discover, matches, hiring) composes them
and never re-implements identity or avatar visuals.

This is enforced by `scripts/check.ts`: any extra `*PlayerCard` component, any
standalone avatar component, or a second profile/communication route fails the
build.

## Matching

`lib/matching.ts` scores skill overlap, availability and location with fixed
weights. Same input → same output. The explanation is generated from the same
rules. No model, no hidden ranking — this is the structural seed only.

## Auth

`lib/auth-providers.ts` declares provider state honestly: Google is
*prepared* (UI + config shape, credentials not wired), Facebook/Instagram are
*coming-soon* placeholders. No secrets live in the repo and nothing
authenticates yet.

## Conventions

- Server Components by default; `"use client"` only where interaction needs it
  (`RoleSelector`, `AppShell`).
- One canonical home per concern; the overview never owns data.
- Sample data always shown with the preview-only notice.
