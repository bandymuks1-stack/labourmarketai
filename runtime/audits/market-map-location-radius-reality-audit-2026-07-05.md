# Market Map / Location / Radius — Reality Audit (2026-07-05, PR8)

**Owner question:** is location real in matching, and what does the market
map actually stand on?

**Headline:** the location DATA MODEL is fully applied in production (all
three tables exist — the older "NOT applied" guard notes were stale), but it
holds **zero coordinates** and matching used only the country tier. Radius is
therefore honestly DATA-gated (no geocoder exists by design — no external
APIs). PR8 closes the CITY tier end-to-end and keeps radius engine-ready.

## Verified production state (read-only, 2026-07-05)

| Layer | State |
|---|---|
| `company_demand_locations` (20260615120000 + signal-only-write 20260615210000) | **APPLIED**; 2 rows; **0 with coordinates** (city-granularity, geocode deliberately absent); RLS owner+admin only |
| `preferred_locations` (20260617120000) | **APPLIED**; 2 rows; city/region/country, **no lat/lng columns at all**; RLS own-rows only (§20 — employers can NEVER read a worker's locations) |
| `consented_login_location_signals` | **APPLIED**; 1 row; consent-gated signal layer (map only) |
| `customer_requests.location` | free-text city (company-written) |
| `workers` | `current_location_country` + `preferred_countries` only — no city, no coords |
| Worker-visible RPC | exposed **country only** — no city label (the gap this PR closes) |
| Matching engine | city + haversine-radius tiers REAL since PR4 — but data-starved on both sides |
| Market map | signal-only visual layer over `company_demand_locations` + city-coordinates static table; guarded (`market-map-read-layer-v1`); NOT a matching input (by design) |

## Why radius stays YELLOW (honest)
No coordinates exist anywhere: demand locations are city-granularity with
`geocode_status` pending-by-design ("no PostGIS, no external geocoder"), and
worker locations have no coordinate columns at all. Producing coordinates
would require either an external geocoding API (forbidden: offline mandate)
or a bundled offline geocoder dataset (a deliberate owner decision — size +
licence). The engine's radius tier is implemented, haversine-tested, and
fires ONLY on real coordinates — nothing is invented. **Radius = engine
GREEN, data YELLOW, by design.**

## What PR8 changes (city tier GREEN scoped)

1. **Demand side, worker-visible**: gated-RPC recreate
   (`20260705130000_worker_demand_location_label.sql`, owner-gated apply)
   adds ONE coarse `location_label` (structured market-map city →
   `location_label` → demand's own location text; **never**
   address_text/locality/contacts). Rollback restores the exact Model-A
   definition.
2. **Worker side (own data, §20-safe)**: the own-context builder reads the
   worker's OWN `preferred_locations` (own-rows RLS): first active city by
   priority → `subject.city`; preferred country codes union into
   `preferredCountries`. Employers still can never read these — the company
   scouting supply builder is guard-pinned to never touch the table.
3. **Company scouting**: `need.city` now prefers the structured
   `company_demand_locations` city (owner-scoped read) over the free-text
   location field.
4. **UI**: opportunity cards show "City · Country" when the label exists.
5. **Guards** (`location-matching.test.ts`): city-tier behavior (both-sides
   rule, honest degradation, unknown-never-penalty), haversine sanity,
   radius-fires-only-on-real-coords, no-geocoder scan across all
   location/matching modules, RPC SQL pins (coarse label only), §20
   preferred-locations boundary pin.

## Status after PR8

| Path | Status |
|---|---|
| Country-tier location matching | GREEN (live both sides) |
| City-tier matching — company scouting | **GREEN scoped** (live at merge: structured city + free-text fallback vs worker country… worker city not employer-visible → city tier on scouting fires only via demand-city == worker-preferred-city when the worker side is the subject; on scouting the subject city stays unknown by §20 — honest) |
| City-tier matching — worker board | **GREEN scoped after RPC apply** (worker's own city vs demand label; owner-gated migration pending) |
| Radius | YELLOW — engine + tests real; zero coordinates by design; unblocks only by an owner decision (offline geocode dataset or consented device coords) |
| Market map visual layer | unchanged (signal-only, real rows, guarded) |

**Do not call radius GREEN.** City tier is the honest launch-scoped win.
