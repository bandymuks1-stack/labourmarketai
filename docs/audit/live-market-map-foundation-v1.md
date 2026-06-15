# Live market map — foundation v1

**Branch:** `feat/cc/live-market-map-foundation-v1`
**Date:** 2026-06-15
**Type:** foundation feature. **NO schema · no fake markers · no external map API/key.**

## Goal
Start LabourMarket.ai's **operational map** — where people are, where the need is,
where documents are missing, where accommodation exists, where you can act now.
NOT a directory. NOT a Holidjob copy. This PR ships the honest **foundation shell**;
no point appears until a real source has a location field.

## What ships
- **Route** `/dashboard/market-map` (authenticated — `getUser` → redirect to login,
  under the middleware-gated `/dashboard` tree).
- **Shell** `components/app/market-map-shell.tsx`: hero + "← Action center", an honest
  foundation notice, a **filter bar** over real dimensions (the app's existing
  countries + sectors — counts only, no fake rows), an **empty map canvas** (no
  markers), a **status legend** (ready / docs missing / no data), the **planned data
  layers** (each tagged `planned`), and a **next-action panel** linking to real flows.
- **Nav:** a compact "Live labour-market map" link on the main `/dashboard`.
- **i18n** `marketMap.*` (en/lt/ru). Copy says plainly: *"Gyvas darbo rinkos žemėlapis"*,
  *"Ruošiamas iš realių… duomenų"*, *"Jokių netikrų taškų — žemėlapis užsipildys tik
  realiais duomenimis"*.

## Planned layers (foundation — all marked `planned`)
workers (preferred locations) · company needs (demand) · projects · accommodation ·
teams/brigades · readiness/documents/skills · work rates · country fit · next-action signals.

## Next actions (safe, real routes)
Add/refine preferred country → `/dashboard/profile` · Submit a company need →
`/dashboard/company` · Create a project → `/dashboard/company/projects/new`.
Accommodation is shown as a **planned future layer note**, not an action (no route/data yet).

## Data-source matrix (why each layer is still "planned")
| Layer | Current source (real) | Has geo/location field? | Needs migration? | Future PR |
|-------|-----------------------|--------------------------|------------------|-----------|
| Workers — preferred locations | `worker_professions` / profiles; preferred country not modelled | ❌ no preferred-location field | ✅ additive column/table | worker preferred-locations |
| Company needs (demand) | `company_demand_locations` (applied #423; signal-only write hardened #424) | 🟢 **SIGNAL-ONLY LIVE** — owner write path captures country/city/label/address (no coords); market map renders a signal read layer grouped by country, **no markers** | ✅ table + RLS applied; coordinates/markers = future geocoder | **market-map-signal-read-layer-v1** (this) → next: geocoder/admin verified-coordinate marker layer |
| Projects | `projects` (`map.ts` has city text) | ⚠️ city text, not lat/lng | ✅ structured geo | project-locations |
| Accommodation | none yet | ❌ no entity | ✅ new table | accommodation-locations |
| Teams / brigades | agency pool / company workers | ❌ no location | ✅ derive/extend | teams-availability |
| Readiness / documents / skills | `worker_documents_readiness`, skills, country-readiness | ⚠️ country-level only | maybe (aggregate) | readiness-overlay |
| Work rates | none (honest — no invented prices) | ❌ | ✅ rate model (RED, careful) | rates-layer |
| Country fit | `lib/country-readiness` (qualitative, sourced) | ✅ country-level | ❌ (app-layer) | country-fit-overlay |
| Next-action signals | derived from real gaps (no new data) | n/a | ❌ | next-action-overlay |

**Takeaway:** most layers need an **additive geo field/table** (RED, human-gated) before
they can show points. The foundation deliberately renders nothing until then.

## Guard / test
`lib/guards/market-map-foundation.test.ts`: route exists + auth-gated; reachable from the
dashboard; **no seeded marker/coordinate arrays**, no `geoPayloads`/`placeholders` import;
**no Mapbox/Google Maps/API key/env**; shell has filters/canvas/legend/layers/next-actions +
foundation notice; copy is a living map (not a directory/catalogue) in all active locales.

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (280 files / 4136 tests) · `build` ✅ (route
prerendered lt/en/ru) · `check:public-seo-indexing` ✅ · `migration-safety` GREEN ·
secret/env scan: none in new files. i18n lt/en/ru parity preserved.

## Confirmation
fake marker data **0** · external map API live key **0** (none used; integration would be
inert/owner-gated) · DB migration **0** · enum/route rename **0** · Supabase apply **0** ·
auth/RLS runtime change **0** · billing/env/secrets **0** · deploy **0**. SEO (#410/#411/#412) intact.

## Left for next PRs (each likely RED — additive geo schema, human-gated)
real geo schema; worker preferred locations; demand locations (structured + geocode);
project locations (lat/lng); accommodation locations (new table); teams availability;
readiness/rates overlays. (See the §data-source matrix + the identity/capability RED plan
`docs/plans/identity-capability-schema-red-plan-v1.md` for the gating model.)
