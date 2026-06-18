# My Work View cockpit v1 — audit

Date: 2026-06-18 - Branch: `feat/my-work-view-cockpit-v1`. Read-then-build audit for
the first authenticated cockpit connecting "My Work View" with Labour Market World Map v1.

## Actual route map (verified, not invented)
- Dashboard home: `app/[locale]/dashboard/page.tsx` (auth-gated; role-aware — worker overview vs company/agency/customer overview).
- Profile (+ CV import, skills, availability editing live here): `app/[locale]/dashboard/profile/page.tsx`.
- Verified CV export (print/PDF, built from journal/skills): `app/[locale]/cv/page.tsx` (`lib/cv-export/verified-cv.ts`). CV *import* extraction libs: `lib/cv/extract.ts`, `lib/cv/normalize.ts`, `lib/cv/cv-import-client.ts`.
- Work journal: `app/[locale]/dashboard/journal/page.tsx`.
- Company / work need: `app/[locale]/dashboard/company/page.tsx` (+ public `/(marketing)/company-need`).
- Market map (World Map v1): `app/[locale]/dashboard/market-map/page.tsx` → `components/app/labour-market-world-map.tsx`.
- Documents: `app/[locale]/dashboard/documents/page.tsx`. Player card: `app/[locale]/dashboard/player-card/page.tsx`.

## Current dashboard state (before this PR)
Worker overview = CurrentSpaceHeader + IdentityActions + a standalone market-map link + TodayScreen + WorkCard + invitations + first-use panel. The pieces were not connected into one cockpit; the market map was a separate link, profile/CV/skills/evidence/availability/journal/work-needs status was scattered.

## Where the World Map lives
`/dashboard/market-map` (PR #475) — the stylized 8-zone atlas. This PR summarizes it (real-zone count + CTA) inside the cockpit's World Map block.

## Real data available to the frontend (RLS-scoped, owner-only)
- profiles: full_name, country, profile_text (summary).
- workers row + worker_skills count + journal_entries count.
- `getOwnAvailability` (available/busy/unavailable/unknown + preferred countries).
- `getOwnCapabilities` (skills tagged confirmed / suggested / self_declared; confirmed = real `worker_skills.verified`).
- `getOwnMarketSignals` (profile/company/preferred/login/demand/project signals) + `getOwnDemandLocationSummary` (demand draft count) + `buildWorldMapZones` (real-zone count).

## What this PR connects
- New `lib/dashboard/my-work-view.ts`: pure `buildWorkViewBlocks` (8 blocks) + `buildWorkViewActions` (max 5, market map always last).
- New `components/app/my-work-view.tsx`: server cockpit reading the real signals above, rendering 8 status blocks (Profile, CV, Skills, Evidence, Availability, Work journal, Work needs, World map) + a prioritized Next actions panel, each linking to a real route. Reuses owner-readiness + world-map + signals logic.
- i18n `myWorkView` (en/lt/ru). Mounted on the worker dashboard (replaces the standalone market-map link; the World map block covers it).
- Guard `lib/dashboard/my-work-view.test.ts` (19 assertions).

## Which states are real vs honest empty/concept
- Real: skills count, evidence (confirmed/suggested), availability state, journal count, demand drafts, world real-zone count, profile/summary presence.
- Honest empty/concept: every block falls back to attention/concept + a real next-action CTA when data is missing; Work needs → concept "prepare"; World map → "add data to light up zones"; Evidence → "needs evidence" / "add skills first". A new/unauth user sees a fully honest empty cockpit (no fabricated data).

## What remains blocked by backend/DB (not in this PR)
- A dedicated "CV imported" flag (CV status here is inferred honestly from profile summary presence; no fake parsing claim).
- Teams/brigades data (concept on the world map).
- Cross-user / consent-aggregated market pulse + confirmed coordinates → real map points.
- Richer work-needs lifecycle for non-company persons.
None faked here — surfaced as honest concept/empty states.

## Fake-data prevention checklist
- [x] No fake workers/companies/demand/coordinates/markers/scores — real RLS-scoped counts or null.
- [x] No fake parsing claim on CV (honest "import your CV or add a summary").
- [x] No fake verified badge — evidence "confirmed by people" only from real `worker_skills.verified`.
- [x] No guaranteed matching / percentages — World map block uses real zone count; no "%".
- [x] No dead CTAs — every block + action links to a live route; market map always present.
- [x] No old LABMA; no "living / gyvas / живой"; no "unlock"/"demo" (guard-asserted).
- [x] No external copying; DESIGN.md tokens + original cockpit model.
- [x] No DB/migration/Supabase/RLS/auth/billing/env changes.