# labourmarket-platform

LabourMarket.ai — a two-sided European labour-market platform connecting
**workers**, **companies** and **agencies**: structured profiles, CVs and
work journals on the supply side; structured worker needs on the demand
side. Cross-sector (logistics, manufacturing, hospitality, care,
construction and more). First-stage candidate selection is
**operator-coordinated** — the platform structures information and
organises selection; it does not claim automatic matching.

> Stack: Next.js 15 · TypeScript (strict) · Supabase · Tailwind v3 + brand
> preset · next-intl · pnpm workspace. Hosting: Vercel, production on the
> real domain (see Domains).

## Domains (production)

| Role | Host |
|---|---|
| The ONE product origin (everything) | `https://labourmarket.ai` |
| WWW (legacy alias) | 308-redirects to the apex |
| `app.labourmarket.ai` (legacy alias) | 308-redirects to the apex |

Single-domain policy (2026-07-19). Policy source of truth:
`docs/policies/domain-truth-v1.md` (v3) and
`apps/web/lib/domain/canonical.ts`. Migration evidence:
`docs/audit/single-domain-and-deep-cleanup-v1.md`.

## Locales

Active UI locales: **lt (default) · en · ru · nl · de** — full message
parity enforced by guards. EN + LT are human-verified; RU/NL/DE are
AI-seeded full translations pending human review (preview-tagged in the
locale switcher). Six more catalog locales exist as non-routed shells.
See `apps/web/lib/i18n/config.ts` and `lib/i18n/launch-language-scope.ts`.

## Prerequisites (Windows)

- Node 20 LTS (`.nvmrc` pins 20; CI/Vercel use 20).
- `pnpm` (`corepack enable` then `corepack prepare pnpm@latest --activate`).
- Git Bash or PowerShell. Paths use `C:\Users\Mano\Documents\labourmarketai`.

## Setup

```powershell
git clone https://github.com/bandymuks1-stack/labourmarketai.git
cd labourmarketai
pnpm install

# env: copy the example and fill secrets from the Supabase Dashboard
copy .env.example apps\web\.env.local
#  NEXT_PUBLIC_SUPABASE_ANON_KEY   → Supabase → Settings → API
#  SUPABASE_SERVICE_ROLE_KEY       → Supabase → Settings → API (never commit)
#  SUPABASE_DB_PASSWORD            → Supabase → Settings → Database
```

## Develop & validate

```powershell
pnpm dev                        # http://localhost:3000 → redirects to /lt
pnpm build                      # production build (Vercel runs this)
pnpm lint                       # eslint
pnpm typecheck                  # tsc --noEmit
pnpm -C apps/web test           # vitest (unit + ~520 guard files)
pnpm placeholders:check         # placeholder governance
pnpm check:primary-route-smoke  # dead-UI / dead-link guard
pnpm check:public-seo-indexing  # domain/SEO invariants
pnpm check:i18n-debt            # untranslated-key ratchet
```

CI (`.github/workflows/quality.yml`) runs typecheck, lint, vitest, the
placeholder + honesty-copy + SEO + i18n gates and the build on every PR;
`migration-safety.yml` statically gates every migration change.

## Database (Supabase)

Production project: `https://gorgitwvdzxbnaxhrsrw.supabase.co` (keys never
live in the repo). **Migrations are applied only through the approved
human-gated process** — reviewed PR + owner-approved manual apply; never
`supabase db push` from a work session, never automatic. See
`docs/DEPLOYMENT.md` and `.github/scripts/migration-safety.mjs`.

## Deploy

Vercel auto-builds and deploys `main` to production (`labourmarket.ai`;
the legacy `www`/`app` hosts 308-redirect there). Secrets live only in
Vercel project env vars.
**Public payments are NOT active**: billing config is hard-blocked from
live mode (`apps/web/lib/billing/config-core.ts`); the pricing page shows
the concierge early-access offer, never a live checkout.

## Branch & PR flow

`main` is the production branch. Work lands as `feat/*` / `fix/*` / `docs/*`
branches → PR → green CI → squash-merge to `main` (see `AGENTS.md`,
"Branch strategy"). There is no separate integration branch.

## Landing page freeze

The landing page (`apps/web/app/[locale]/(marketing)/page.tsx`), its
component tree, its placeholder feed and its lt/en/ru i18n namespaces are
**frozen** until the separate real-data replacement plan runs — enforced
by `apps/web/lib/guards/landing-freeze.test.ts` (SHA-256 baseline;
regeneration is owner-gated).

## Repository map

`apps/web` — the Next.js app · `supabase/` — schema & reference data ·
`docs/` — architecture, policies, launch docs, audits, decisions ·
`docs/launch/` — launch truth docs (domain production truth, real-supply
readiness gap, search-index owner actions, final launch-repair report).
