# Dashboard identity / action entry v1

**Branch:** `fix/cc/dashboard-identity-action-entry-v1`
**Date:** 2026-06-15
**Builds on:** #416 (identity/action workspace on /dashboard/account). **UI only — NO schema/enum/migration/Supabase/auth-RLS/billing/env.**

## Goal
The Asmuo / Įmonė action center exists on `/dashboard/account`, but the user shouldn't have to
dig into account settings. Surface the SAME model on the **main dashboard** (the post-login entry),
compactly.

## What changed (surfaces)
- **`components/app/identity-actions.tsx`** — REUSED, not duplicated. Added a `compact` prop:
  tighter spacing, no section subtitles, no per-card descriptions (a quick action launcher; the
  full explainer stays on `/dashboard/account`).
- **`app/[locale]/dashboard/page.tsx`** — renders `<IdentityActions hasCompany={…} compact />`
  right after `CurrentSpaceHeader` in BOTH branches (worker + non-worker), so every user sees it
  after login. `hasCompany` from a real RLS-scoped `getOwnCompany()` read.
- Legacy `/dashboard/buyer` and `/dashboard/agency` routes are **kept** and still used — but only
  as ACTION destinations under "Įmonė" ("Buy services" / "Offer workers / teams"), never as
  separate top-level identities.

## What the user sees after login (`/dashboard`)
A compact two-identity entry above the usual dashboard content:
- **Jūs kaip asmuo** → Profilis ir CV · Ieškoti darbo · Pasirengimas.
- **Jūsų įmonė** → Pateikti poreikį · Samdyti · Pirkti paslaugas · Siūlyti darbuotojus/komandas ·
  Valdyti projektus — OR, if no company, **"Sukurti įmonę"**.
(Short titles only; the full descriptions live on /dashboard/account.)

## Guard
`lib/guards/identity-action-workspace.test.ts` extended: asserts the dashboard page mounts
`<IdentityActions hasCompany={hasCompany} compact …>` with a real `getOwnCompany()` read, in
addition to the account-page mount + per-locale copy. `role-no-silo-framing` still guards that
agency/buyer aren't top-level systems. `room-separation` / `room-based-account-spaces` stay green
(dashboard keeps `CurrentSpaceHeader`, no role-catalogue/feature grids added).

## Reuse vs split
**Reused** the existing `IdentityActions` component via a new `compact` prop — no duplicate
component, single source of truth for the two-identity model + action routes.

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (278 files / 4040 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ · `migration-safety` GREEN. i18n lt/en/ru parity preserved
(no new keys — reuses `identityActions.*`).

## Confirmation
No DB migration · no enum rename · no Supabase apply · no auth/RLS change · no billing · no env/secrets ·
no fake data. SEO (#410/#411/#412) intact.

## Still for the later RED schema / capability plan
DB `Role` enum / `profile_roles.role` still carries `agency` + `customer` as first-class rows;
`spaces.buyer.*` key still says "buyer" (≠ DB `customer`). Collapsing into identity (person/company)
+ capability flags is a **RED, human-gated** migration. Plus a fuller per-room dashboard IA;
company legal-change request workflow + admin verification queue; localization NL/DE/DA/NO/SV/FI.
