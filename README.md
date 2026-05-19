# labourmarket.ai — Foundation v1

**The labour market as a living system.** Every participant — person or
company — is one canonical profile, projected into a single reusable
**player card** that moves through discovery, matching and hiring.

This repository is the first high-quality foundation: a premium landing
experience, auth-ready structure, and the canonical product skeleton. It is
**structure and visual system** — not a wired backend.

## Core principle

> Every user has exactly **one** profile. The system represents that profile
> visually as **one** reusable player card. The card is **not** a separate
> data flow — it is derived (`src/lib/player-card.ts`) and reused everywhere:
> discover, matching, worker search, company needs, teams, future map views.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Cinematic landing — the market as a connected system |
| `/login` | Sign in (structure; providers honest) |
| `/register` | Create profile (structure) |
| `/role` | "Who are you?" — Worker / Company / Recruiter |
| `/app` | Workspace overview (never owns data) |
| `/app/profile` | **The one** canonical profile |
| `/app/discover` | Draft floor — reuses the player card |
| `/app/matches` | Deterministic, transparent fit |
| `/app/company` | Company profile — same card system |
| `/app/hiring-needs` | Open roles, anchored to a company |
| `/app/communication` | **The one** communication surface |
| `/app/settings` | Account, role, provider state |
| `/admin` | Operational console (no gatekeeping queues) |

## Components

`LandingHero`, `RoleSelector`, `ProfilePlayerCard`, `CompanyPlayerCard`,
`DiscoverCard`, `MatchResult`, `HiringNeedCard`, `CommunicationStart`,
`AppShell`, `AdminShell` — plus a small shared UI layer and a single shared
`PlayerSurface` that both canonical cards render.

## Auth state (honest)

- **Google** — UI + config structure prepared. Credentials are not connected,
  so it does not sign anyone in yet.
- **Facebook / Instagram** — disabled coming-soon placeholders.

No provider claims to work before it is wired.

## Data model

`src/lib/types.ts` is the single source of truth: `UserRole`, `Profile`,
`PlayerCard`, `CompanyProfile`, `HiringNeed`, `MatchResult`,
`CommunicationThreadStart`. Sample data is clearly labelled preview-only and
is never presented as real, live data.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run check      # foundation guards
npm run build      # production build
```

## Guards (`npm run check`)

Fails if: more than one profile route exists · a separate avatar route
exists · more than one communication route exists · gatekeeping wording
appears · fake AI capability claims appear · duplicate canonical player-card
components appear. See `scripts/check.ts`.

## Scope

Structure + visual system only. No production deploy, no payments, no fake AI,
no demo data treated as real, no duplicate flows. Onboarding and matching are
automated and self-serve by design. See `docs/`.
