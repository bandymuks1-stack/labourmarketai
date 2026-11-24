# Company action rooms — next actions v1

**Branch:** `fix/cc/company-action-rooms-next-actions-v1`
**Date:** 2026-06-15
**Builds on:** #418 (buyer/agency framed as company actions). **UI + copy only — NO schema/enum/migration/Supabase/auth-RLS/billing/env.**

## Goal
Give every company action room a clear **practical next-action block** (not just a page title), and
make the framing consistent across all five rooms.

## Reusable component
`components/app/company-action-next-actions.tsx` — `CompanyActionNextActions` (server). One card per
room: **what you do here** → a **first clear action** (real primary CTA) → **what happens next**.
Copy from `companyActionRooms.<room>` (en/lt/ru). `primaryHref` passed by each page so the CTA always
points at an existing route. Reused across all 5 rooms (no copy/layout duplication).

## Routes / surfaces changed + next action added
| Route | Breadcrumb (Įmonė · …) | First action (primaryHref) | What's next |
|-------|------------------------|----------------------------|-------------|
| `/dashboard/company` | Profile & needs | New need / project → `/dashboard/company/projects/new` | need saved to your account, ready for matching |
| `/dashboard/candidates` | Hire | Find workers → `/dashboard/search` | mark the ones who fit, start a conversation |
| `/dashboard/buyer` | Buy services | Start a request → `/dashboard/start/buyer` | request saved, waits for review — no fake offers |
| `/dashboard/agency` | Offer workers | Manage your pool → `/dashboard/agency/pool` | offer stays private until you decide |
| `/dashboard/projects` | Projects | New project → `/dashboard/company/projects/new` | track progress and teams as it moves |

Each room also has a **"← Action center"** link (`data-testid="back-to-action-center"` → `/dashboard`)
and a **company-context breadcrumb** (`data-testid="company-context"`). buyer/agency already had these
(#418); company/candidates/projects gained them here. Copy is short, practical, no SaaS jargon, no fake
data / matching / candidates / demand.

## i18n
New `companyActionRooms` namespace (en/lt/ru): `backToActions` + per room `{context, whatTitle,
whatBody, primaryLabel, nextLine}`. All silo wording (space/erdvė/пространство/workspace) scrubbed —
company room breadcrumb is "Company · Profile & needs", never "Company workspace".

## Guard
`lib/guards/company-action-rooms.test.ts`: every room page mounts `<CompanyActionNextActions>` + has
`company-context` + `back-to-action-center`; the component renders a primary action; per-locale copy
exists; each room `context` frames under the company (Įmonė/Company/Компани) with NO silo wording.
`role-no-silo-framing`, `room-separation`, `role-dashboards` stay green.

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (279 files / 4098 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ · `migration-safety` GREEN. i18n lt/en/ru parity preserved.

## Confirmation
No DB migration · no enum rename · no Supabase apply · no auth/RLS · no billing · no env/secrets ·
no fake data. Buyer/agency remain company actions (not top-level identities). SEO (#410/#411/#412) intact.

## Still for the later RED schema / capability plan
DB `Role` enum / `profile_roles.role` still carries `agency` + `customer` first-class; routes still
`/dashboard/buyer` + `/dashboard/agency`; `spaces.buyer.*` key still "buyer" (≠ DB `customer`).
Collapsing routes + enum into identity + capability flags = **RED, human-gated** migration. Plus
company legal-change request workflow + admin verification queue; localization NL/DE/DA/NO/SV/FI.
