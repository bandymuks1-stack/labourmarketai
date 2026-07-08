# Premium Hub screen — data bindings

Route: `/[locale]/dashboard/hub` (authenticated, under the dashboard layout).
Status: **concept preview** — route-truth-map class `GATED_PREVIEW`, deliberately
unlinked (no nav entry) and enforced by `preview-surfaces-unlinked.test.ts`.

The screen currently renders **marked stand-in data** from
`apps/web/components/app/premium-hub/premium-hub-fixtures.ts`
(`PREMIUM_HUB_PREVIEW`). Every visible value is fixture content, flagged in the
header by `premiumHub.conceptBadge` ("Koncepcinė peržiūra · dar ne gyvi
duomenys"). Structural/chrome labels are real i18n (`premiumHub.*` in
`messages/{lt,en,ru}.json`); the fixture holds only the sample *content*.

## What each block binds to (next PR)

| Block (component) | Fixture field | Real source when wired |
|---|---|---|
| **Asmens kortelė** (`premium-hub-person-card.tsx`) | `person.name`, `person.role`, `person.skills[]` | `profiles.full_name` + avatar (`lib/profile/avatar.ts`, `getOwnAvatar`); role/profession from `profiles.active_role` / `professions`; skills from the worker's real skill rows (`lib/worker/*`, work-journal-derived) — self-declared levels only, never a verified/certified score |
| **Įmonės kortelė** (`premium-hub-company-card.tsx`) | `company.companyName`, `company.location`, `company.sector`, `company.team/projects/active` | `getOwnCompany()` (`lib/company/company-setup.ts`, RLS-scoped); counts from company members + company projects. Show an honest "create a company" CTA when the caller has none (mirror the overview page) |
| **Rinkos žemėlapis** (`premium-hub-market-map.tsx`) | `mapNodes[]` (abstract positions) | Stays a stylized CSS/SVG panel. Nodes → preferred locations / login-location signals / demand signals (`lib/market-map/capture.ts`). Only render points that reflect real signals; keep the honest "not on map yet" state — no fake markers, **no external/paid map provider, no geocoding** |
| **Projekto / darbo paso kortelė** (`premium-hub-project-card.tsx`) | `project.name`, `workDone/workTotal`, `photosPresent`, `defects`, `handoverPercent` | `projects` + `dashboard/projects/[id]/operations` data: work journal / work-passport entries, evidence photos, defect records, handover/progress. Percentages must be real counts (met/total), never a fabricated rating |

Cross-cutting (future): `pokalbiai` / next actions → `conversations` + source
relation + next-action engine (`lib/dashboard/next-action.ts`), as a follow-up
panel — not part of this screen yet.

## Wiring steps (next PR)

1. Make `dashboard/hub/page.tsx` fetch the caller's real data server-side
   (Supabase server client, RLS-scoped) exactly like `dashboard/market-map` and
   the overview page do; pass real props into `PremiumHubScreen`.
2. Replace `PREMIUM_HUB_PREVIEW` usage with the fetched props; **delete**
   `premium-hub-fixtures.ts` and the `conceptBadge` header once every block is
   backed by real, RLS-scoped data.
3. Add honest empty/incomplete states per block (no company yet, no skills yet,
   no project yet) instead of fabricated values — mirror the overview page's
   `Placeholder` / incomplete-row conventions.
4. Graduate the route: reclassify `dashboard/hub` from `GATED_PREVIEW` to
   `REAL_LAUNCH_SURFACE` in `route-truth-map.test.ts`, remove it from
   `PREVIEW_ROUTES` in `preview-surfaces-unlinked.test.ts`, and add a nav entry
   via the feature-availability catalogue (`lib/config/navigation.ts` /
   `lib/config/feature-availability.ts`).

## What remains mock/local fixture after THIS PR

Everything the hub shows: person identity + skills, company identity + stats,
market-map nodes, and project stats all come from `PREMIUM_HUB_PREVIEW`. No DB
reads, no writes, no migration, no map provider. The screen is a visual/layout
deliverable marked as a concept preview; real data binding is the follow-up
described above.
