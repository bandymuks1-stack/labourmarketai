# Company action rooms cleanup v1

**Branch:** `fix/cc/company-action-rooms-cleanup-v1`
**Date:** 2026-06-15
**Builds on:** #417 (dashboard identity/action entry). **UI + copy only — NO schema/enum/migration/Supabase/auth-RLS/billing/env.**

## Goal
Make the action-destination pages — `/dashboard/buyer` and `/dashboard/agency` — read as **actions
under the Įmonė (company) identity**, not as separate top-level systems. Route names stay
(`buyer`/`agency`), but the UI frames them as company actions and offers a clear way back to the
main dashboard action center.

## What changed (surfaces)
- **`app/[locale]/dashboard/buyer/page.tsx`** — header reworked:
  - new **"← Action center"** link → `/dashboard` (`data-testid="back-to-action-center"`);
  - the eyebrow is now a **company-context breadcrumb** `data-testid="company-context"` →
    `roleDashboards.buyer.companyContext` = "Įmonė · Pirkti paslaugas / pateikti užklausą";
  - the guarded `room-my-spaces-link` (→ /dashboard/account) is kept.
- **`app/[locale]/dashboard/agency/page.tsx`** — same treatment in BOTH branches (the no-agency
  guide branch + the main branch): back-to-action-center link + company-context breadcrumb
  `roleDashboards.agency.companyContext` = "Įmonė · Siūlyti darbuotojus / komandas". Pool link +
  my-spaces link kept.
- **i18n** `roleDashboards.{buyer,agency}.companyContext` + `.backToActions` added in en/lt/ru.
  The old `eyebrow` keys are retained (still referenced by the role-dashboards guard) but no longer
  the primary visible label.

## Before / after (visible header copy)
| Page | Before (eyebrow) | After (breadcrumb) |
|------|------|------|
| /dashboard/buyer (lt) | MANO UŽKLAUSOS | **Įmonė · Pirkti paslaugas / pateikti užklausą** + "← Veiksmų centras" |
| /dashboard/buyer (en) | MY REQUESTS | **Company · Buy services / submit a request** + "← Action center" |
| /dashboard/agency (lt) | PARTNERIO PASLAUGOS | **Įmonė · Siūlyti darbuotojus / komandas** + "← Veiksmų centras" |
| /dashboard/agency (en) | PARTNER SERVICES | **Company · Offer workers / teams** + "← Action center" |

(Titles/subtitles unchanged — already reframed in #414. No "Pirkėjo erdvė" / "Agentūros erdvė" / separate-system framing remains.)

## Guard / test
`lib/guards/role-no-silo-framing.test.ts` extended: both buyer + agency pages must render a
`company-context` breadcrumb + a `back-to-action-center` link; `roleDashboards.{buyer,agency}.companyContext`
must exist in lt/en/ru, frame the action **under the company** (Įmonė/Company/Компани), and carry NO
silo framing (space/erdvė/пространство/workspace); `backToActions` must exist. Existing
`room-separation` (keeps `room-my-spaces-link`) + `role-dashboards` guards stay green.

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (278 files / 4053 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ · `migration-safety` GREEN. i18n lt/en/ru parity preserved.

## Confirmation
No DB migration · no enum rename · no Supabase apply · no auth/RLS change · no billing · no env/secrets ·
no fake data. SEO (#410/#411/#412) intact. Routes `buyer`/`agency` unchanged technically; only the
in-page framing changed.

## Still for the later RED schema / capability plan
DB `Role` enum / `profile_roles.role` still carries `agency` + `customer` as first-class rows;
`spaces.buyer.*` key still says "buyer" (≠ DB `customer`); routes are still `/dashboard/buyer` +
`/dashboard/agency`. Collapsing the routes + enum into identity (person/company) + capability flags
is a **RED, human-gated** migration. Plus company legal-change request workflow + admin verification
queue; localization NL/DE/DA/NO/SV/FI.
