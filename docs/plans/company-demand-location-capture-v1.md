# Company demand location capture v1 — owner review

> First REAL data path into `public.company_demand_locations` (applied via #423).
> **No DB migration, no schema/RLS change, no Supabase apply, no geocoding, no
> map markers, no deploy/merge without owner approval.**

## Flow — before / after

**Before.** A company submits a demand → a real `customer_requests` row
(`submit_demand_request`). The dashboard read-back (`DemandRequestsReadback`)
echoes the owner's own requests (RLS-scoped). The `company_demand_locations`
table existed (#423) but had **no write path** — 0 rows, demand layer showed
"schema prepared".

**After.** Each read-back row gains a **"Add a location signal"** control
(`DemandLocationCapture`). The owner records WHERE the work is (country +
optional city / label / address) for that specific demand. It writes one
**signal-only** row into `company_demand_locations`. The market-map demand layer
now reads the real count and shows **"signal only — N captured"** with **still
zero markers** (no confirmed coordinates).

## What gets written (per capture)

A single row in `public.company_demand_locations`:

| Column | Value |
|--------|-------|
| `request_id` | the caller's OWN `customer_requests.id` |
| `owner_id` | `auth.uid()` |
| `country_code` | validated via `isMarketCountry` (market set) |
| `city` / `region` / `locality` / `address_text` | optional free text (clamped) |
| `location_label` | required; owner's label, else address/city, else country code |
| `geo_precision` | derived: `address` → `city` → `country` → `unknown` |
| `geocode_status` | **always `pending`** |
| `source` | `demand_form` |

## What does NOT get written

- ❌ `latitude` / `longitude` — **hard-pinned to `null`** (no UI field, no code path).
- ❌ `geocode_status = 'verified'` — owners can **never** set verified (only `pending`).
- ❌ `geo_precision = 'coordinates'` — the derive function cannot return it.
- ❌ any map marker / point — a point needs confirmed coordinates (a future, owner-gated geocoder step).
- ❌ another user's demand — see ownership below.

## RLS / ownership assumptions

- Writes go through the **caller's own authenticated Supabase client**, so the
  `company_demand_locations` RLS (applied in #423) authorises the insert:
  `owner_id = auth.uid()` **and** the referenced `customer_requests` row belongs
  to the caller (WITH CHECK exists-clause).
- The helper additionally **pre-checks** ownership (`customer_requests` where
  `id = requestId AND profile_id = auth.uid()`) to return a clean `not-owner`
  result instead of a silent RLS rejection.
- No SECURITY DEFINER, no RLS change, no grant change, no schema change. The
  table, its policies and grants are exactly as applied in #423.

## Signal-only vs marker

- **Signal-only** = "a need exists here" — country/city/label/address, **no
  coordinates**. Surfaced as a private count/status, never plotted.
- **Marker** = a real map point — requires `latitude`/`longitude` AND
  `geocode_status ∈ {verified, manual}` (`isMappableDemandLocation`). This v1
  produces **none**: every captured row is `pending` with null coordinates, so
  `summarizeDemandLocations(...).mappable` is always 0 → `demandLayerStatus` is
  `signal_only`, never `live`.

## Files

- `lib/demand/demand-location.ts` — `addDemandLocation` (write) + `getOwnDemandLocationSummary` (read).
- `lib/demand/demand-location-actions.ts` — `"use server"` wrapper.
- `components/app/demand-location-capture.tsx` — client capture UI (no coordinate/verified field).
- `components/app/demand-requests-readback.tsx` — mounts the capture per demand.
- `components/app/market-map-shell.tsx` — real signal-only count/status, still 0 markers.
- `messages/{lt,en,ru}.json` — `demandLocationCapture.*`, `marketMap.layerSignalOnly`, `marketMap.demandSignalNote`.
- `lib/guards/demand-location-capture.test.ts` — safety invariants.

## Confirmations
DB migration **0** · schema change **0** · RLS change **0** · Supabase apply **0**
· external geocoding API/key **0** · fake coordinates **0** · fake markers **0** ·
deploy **0**.
