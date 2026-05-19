# labourmarket-platform

The living labour market — a real-time, two-sided platform connecting
**workers**, **companies** and **agencies** with proprietary matching.

Industry-agnostic; launches in **construction** across the Baltic & Northern
European market. This repository is at milestone **M0 (Foundation)**.

> Stack: Next.js 15 · TypeScript (strict) · Supabase · Tailwind v3 + brand
> preset · next-intl (LT/EN) · pnpm workspace. Hosting: Vercel **preview only**
> in M0 (no custom domain — `labourmarket.ai` DNS untouched).

## Prerequisites (Windows)

- Node 20 LTS (`.nvmrc` pins 20; CI/Vercel use 20). Dev was bootstrapped on
  Node 24 — see `docs/DECISIONS/0001-lean-mvp-stack.md`.
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

## Develop

```powershell
pnpm dev        # http://localhost:3000  → redirects to /lt
pnpm build      # production build (Linux-safe; Vercel runs this)
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
```

Locales: `/lt` (default) and `/en`. The locale switcher is in the page.

## Database (Supabase) — applied by the founder

The Supabase project already exists at
`https://gorgitwvdzxbnaxhrsrw.supabase.co`. Migrations and reference data
(`supabase/migrations/`, `supabase/reference-data.sql`) are **not** applied
automatically — see `docs/DEPLOYMENT.md`. Keys never live in the repo.

## Deploy (Vercel preview only — M0)

Connect the GitHub repo in Vercel, set env vars in the Vercel dashboard,
production branch = `main`. Full steps: `docs/DEPLOYMENT.md`. Going live on
the real domain is a separate, **not-yet-executed** `docs/LAUNCH_CHECKLIST.md`.

## Repository map

`apps/web` — the Next.js app · `supabase/` — schema & reference data ·
`docs/` — architecture, roadmap, brand, data model, roles, decisions.
Branches: `main` (stable preview) · `dev` (integration) ·
`feat/<name>` → PR → `dev`.
