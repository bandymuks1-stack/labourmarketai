# Company demand location capture v1 — owner review

> First REAL data path into `public.company_demand_locations` (applied via #423).
> **No geocoding, no map markers, no deploy/merge/apply without owner approval.**
> **Now RED/human-gated** — see the pre-merge safety review below (it adds one
> hardening migration that must be owner-applied before merge).

## Pre-merge write-path safety review (v1.1)

**Risk found (confirmed against live prod #423 schema).** The #423 owner write
policy gated only `owner_id = auth.uid()` + demand ownership. It did **not**
restrict coordinates or `geocode_status`, and the table CHECKs allow a
`verified` row with coordinates. So an authenticated user could **bypass the app
helper** via a direct PostgREST write and self-insert — on **their own** demand —
a row with `geocode_status='verified'`, `geo_precision='coordinates'` and real
`latitude`/`longitude`, i.e. fabricate a "verified" map point. (The app helper
was already signal-only; the gap was the DB allowing direct writes to exceed it.)

**Fix (this PR — now RED).** Migration
`20260615210000_company_demand_locations_signal_only_write.sql` (human-gated,
NOT applied) **replaces the owner write policy** so direct authenticated writes
(insert AND update) can only create **signal-only** rows:
`latitude/longitude null`, `geo_precision <> 'coordinates'`,
`geocode_status in ('pending','manual')`, plus the existing owner + demand-
ownership checks. `verified` + coordinates are **reserved for a future
admin/geocoder path** (a SECURITY DEFINER RPC bypasses RLS — not built here).
It also adds a **partial unique index** preventing exact-duplicate signal rows
per demand (multi-site demands stay allowed).

**Consequence:** #424 is **no longer no-schema** — it is **RED/human-gated**.
The hardening migration must be **owner-applied** (Supabase MCP `apply_migration`,
never `db push`) **before** merge for the DB to actually enforce signal-only.

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
