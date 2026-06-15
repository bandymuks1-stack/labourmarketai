# Market-map signal-only read layer v1 — owner review

> Shows REAL company demand location signals on the market map, grouped by
> country — **no fake markers, no coordinates, no map API**.
> **No DB migration, no schema/RLS change, no Supabase apply, no deploy/merge
> without owner approval.**

## What it does

The `/dashboard/market-map` canvas — empty until now — renders the caller's
**own** demand location signals (RLS-scoped, from `company_demand_locations`
applied #423/#424) as an honest **signal board**: grouped by country, each entry
showing label + city/region + a precision tag. When the caller has no signals,
the canvas keeps its empty foundation state.

## What gets shown vs not shown

| Shown | NOT shown |
|-------|-----------|
| Country groups + per-country signal counts | ❌ map markers / plotted points |
| Each signal's label, city/locality, precision | ❌ latitude / longitude (the data shape has none) |
| "Signals, not points" + "no points until coordinates confirmed" copy | ❌ any map API / tile / key |

## Read model (coordinate-free by construction)

- `buildDemandSignalBoard(rows)` (`lib/market-map/demand-locations.ts`) groups
  rows by country into `DemandSignalEntry` — a shape that **has no
  latitude/longitude fields**, so the layer literally cannot render a point.
- It **excludes** any coordinate-confirmed (`isMappableDemandLocation`) row —
  those belong to a future marker layer, not the signal layer.
- `getOwnDemandSignalBoard()` (`lib/demand/demand-location.ts`) fetches the
  caller's own rows (RLS-scoped) and returns the board; null on auth/read error
  → the shell falls back to the empty state.

## Files

- `lib/market-map/demand-locations.ts` — `DemandSignalEntry/Group/Board` + `buildDemandSignalBoard` (pure).
- `lib/demand/demand-location.ts` — `getOwnDemandSignalBoard()` (+ shared fetch refactor).
- `components/app/market-map-signal-layer.tsx` — presentational signal board (no coordinate render).
- `components/app/market-map-shell.tsx` — canvas renders the layer when signals exist.
- `messages/{lt,en,ru}.json` — `marketMap.signalLayer.*`.
- `lib/guards/market-map-signal-read-layer.test.ts` — invariants.

## Confirmations
DB migration **0** · schema/RLS change **0** · Supabase apply **0** · fake
markers **0** · coordinates rendered **0** · external map/geocoding API/key **0**
· deploy **0**.

## Left for the next PR
Geocoder / admin **verified-coordinate marker layer** (a SECURITY DEFINER RPC
sets `verified` + coordinates → real plotted points) — the only path that adds
markers, owner-gated.
