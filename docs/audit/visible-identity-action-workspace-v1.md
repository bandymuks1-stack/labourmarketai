# Visible identity / action workspace v1

**Branch:** `fix/cc/visible-identity-action-workspace-v1`
**Date:** 2026-06-15
**Builds on:** #415 (copy cleanup). **UI + copy only — NO schema/enum/migration/Supabase/auth/RLS/billing/env.**

## Goal
After #415 reworded the model, this PR makes the model **visible in the UI** — two legal
identities, each with real actions, never "agency / buyer / worker" as separate systems.

## What changed (surfaces)
- **New component** `components/app/identity-actions.tsx` (server) — renders:
  - **You as a person (Asmuo)** — always-available action cards: Profile & CV → `/dashboard/profile`;
    Find work → `/dashboard/opportunities`; Readiness → `/dashboard/documents`.
  - **Your company (Įmonė)** — when a company exists: Submit a need → `/dashboard/company`;
    Hire → `/dashboard/candidates`; Buy services → `/dashboard/buyer`; Offer workers/teams →
    `/dashboard/agency`; Manage projects → `/dashboard/projects`. When NO company: a single honest
    **"Create a company"** CTA → `/dashboard/start/company` (no fake data created).
  - Lucide outline icons; short action titles + one-line descriptions; not a SaaS table grid.
- **`app/[locale]/dashboard/account/page.tsx`** — mounts `<IdentityActions hasCompany={…} />`
  ABOVE the legacy "My spaces" section, so the action-centred identity view leads. `hasCompany`
  comes from a real RLS-scoped `getOwnCompany()` read (row != null); read error / missing
  migration → CTA shown (no fabrication).
- **i18n** `identityActions.*` namespace added in en/lt/ru (person/company titles + subtitles,
  3 person actions, 5 company actions, create-company CTA).
- Remaining visible silo signals: agency/buyer "space" labels + role descriptions were already
  reframed in #413/#414/#415; this PR's block supersedes them as the primary identity view.

## What the user now sees
- **Jūs kaip asmuo** → Profilis ir CV · Ieškoti darbo · Pasirengimas.
- **Jūsų įmonė** → Pateikti poreikį · Samdyti · Pirkti paslaugas · Siūlyti darbuotojus / komandas ·
  Valdyti projektus — OR, if no company, **"Sukurti įmonę"**.
- No "agentūra"/"pirkėjas" presented as separate top-level systems.

## Guard / test
- `lib/guards/identity-action-workspace.test.ts` — the component renders both identities + the
  honest create-company path; it is mounted on the account page with a real `hasCompany` flag;
  and all `identityActions` copy (person/company titles, every action card, the CTA) exists in
  lt/en/ru.
- `lib/guards/role-no-silo-framing.test.ts` (from #414/#415) still guards that public/dashboard
  copy can't reintroduce "agentūra/pirkėjas" as top-level silos.

## Routes / surfaces checked
`/dashboard/account` (new block) · the action targets: `/dashboard/profile`, `/dashboard/opportunities`,
`/dashboard/documents`, `/dashboard/company`, `/dashboard/candidates`, `/dashboard/buyer`,
`/dashboard/agency`, `/dashboard/projects`, `/dashboard/start/company` (all pre-existing routes).

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (278 files / 4039 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ · `migration-safety` GREEN (no migration files). i18n lt/en/ru parity preserved.

## Confirmation
No DB migration · no enum rename · no Supabase apply · no auth/RLS change · no billing · no env/secrets ·
no fake data. SEO (#410/#411/#412) intact.

## Still for the later RED schema / capability plan
- DB `Role` enum / `profile_roles.role` still carries `agency` + `customer` as first-class rows;
  `spaces.buyer.*` key still says "buyer" (≠ DB `customer`). Collapsing these into identity
  (person/company) + capability flags is a **RED, human-gated** migration.
- A fuller dashboard IA that renders capabilities under one identity at runtime (this v1 places the
  identity/action center on the account page; the per-role dashboard rooms are unchanged).
- Company legal-change request workflow + admin verification queue; localization NL/DE/DA/NO/SV/FI.
