# Company action rooms — practical flow v1

**Branch:** `fix/cc/company-action-rooms-practical-flow-v1`
**Date:** 2026-06-15
**Builds on:** #419 (next-actions card in 5 rooms). **UI + copy only — NO schema/enum/migration/Supabase/auth-RLS/billing/env.**

## Goal
Each company action room now shows a clear **3-step practical flow** so the user sees what they can
do now: (1) what to fill/choose → (2) what the system does next → (3) the human action after.
Short, operational copy. No fake data / candidates / matches / demand / statuses.

## Reuse (no new component)
Extended the existing reusable `components/app/company-action-next-actions.tsx` (from #419): the card
now renders a numbered 3-step `<ol data-testid="company-action-flow">` between the body and the
primary action, reading `companyActionRooms.<room>.flow.{step1,step2,step3}`. All 5 rooms get it for
free (no duplication). The honest first action / empty-state path is the primary CTA (a real route);
the rooms' own data sections keep their real empty states.

## Per-room flow (lt)
| Room | Step 1 (fill/choose) | Step 2 (system) | Step 3 (human) |
|------|------|------|------|
| /dashboard/company | Įrašykite poreikį (profesija, vieta, kiek žmonių) | Sistema struktūruoja poreikį ir paruošia atrankai | Peržiūrėkite tinkamus ir pradėkite pokalbį |
| /dashboard/candidates | Įrašykite kandidatą arba peržiūrėkite juodraščius | Sistema laiko juos privačiai, kol nuspręsite | Pažymėkite tinkamus ir pradėkite pokalbį |
| /dashboard/buyer | Aprašykite, ko reikia (paslauga, terminas, biudžetas) | Užklausa išsaugoma ir laukia peržiūros | Pridėkite failą ar detales, kad atsakymas būtų tikslesnis |
| /dashboard/agency | Pasiūlykite kandidatus ar komandą (profesija, įgūdžiai, kalbos) | Pasiūlymas lieka privatus, kol nuspręsite kitaip | Susiekite realius darbuotojus su savo rezervu |
| /dashboard/projects | Sukurkite projektą (pavadinimas, vieta) | Priskirkite darbuotojus prie projekto | Sekite eigą ir komandas ARENA rodinyje |

(en/ru parallel.) Operational verbs ("Įrašykite poreikį", "Peržiūrėkite kandidatus", "Pažymėkite
tinkamus", "Pradėkite pokalbį", "Sukurkite projektą") — no "platforma leidžia optimizuoti" jargon.

## i18n
Added `companyActionRooms.<room>.flow.{step1,step2,step3}` to all 5 rooms in en/lt/ru. Existing
`context / whatTitle / whatBody / primaryLabel / nextLine` unchanged.

## Guard
`lib/guards/company-action-rooms.test.ts` extended: the card renders a `company-action-flow` 3-step
block; every room has `flow.step1/step2/step3` in lt/en/ru. Existing checks kept — all 5 rooms still
have `company-context` + `back-to-action-center`, frame under the company (no silo), buyer/agency are
not top-level identities. `role-no-silo-framing` / `room-separation` / `role-dashboards` stay green.

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (279 files / 4114 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ · `migration-safety` GREEN. i18n lt/en/ru parity preserved.

## Confirmation
No DB migration · no enum rename · no Supabase apply · no auth/RLS · no billing · no env/secrets ·
no fake data/candidates/matches/statuses. Buyer/agency remain company actions. SEO (#410/#411/#412) intact.

## Still for the later RED schema / capability plan
DB `Role` enum / `profile_roles.role` still carries `agency` + `customer` first-class; routes still
`/dashboard/buyer` + `/dashboard/agency`; `spaces.buyer.*` key still "buyer" (≠ DB `customer`).
Collapsing routes + enum into identity + capability flags = **RED, human-gated** migration. Plus
company legal-change request workflow + admin verification queue; localization NL/DE/DA/NO/SV/FI.
