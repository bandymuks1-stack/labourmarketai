# Market Map — long-term map strategy

Internal infrastructure audit (PR #490). Not user-facing copy.

## Current MVP (shipped in PR #490)
- **Library:** Leaflet (vanilla, dynamic-imported client-side).
- **Tiles:** OpenStreetMap public raster tiles — `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
- **API key / secret:** **none.** No env keys, no account, no billing.
- **Attribution:** "© OpenStreetMap contributors" shown on the map (required).
- **Component:** `apps/web/components/app/market-map-live.tsx`.

## Why this is acceptable now — and only now
Acceptable **only** for owner review and low-traffic MVP:
- It is a real interactive map (real geography/streets, pan/zoom, tap-to-set), which the product needs immediately, with zero key/secret/cost.

**It must NOT be documented or treated as final production-scale infrastructure.**

## Production risk
- `tile.openstreetmap.org` is a **community service with a fair-use Tile Usage Policy**, not a guaranteed free business CDN. Heavy/automated/commercial traffic can be rate-limited or blocked. It offers no SLA, no bulk capacity, and no styling control.
- Relying on it at pilot/production scale is a legal/operational risk (usage policy + attribution obligations + availability).

## Long-term target (free / controlled, no paid provider)
- **Renderer:** migrate Leaflet → **MapLibre GL JS** (open-source vector renderer; better performance, styling, retina/vector tiles).
- **Tiles (OpenStreetMap-based, controlled):**
  1. **OpenFreeMap** — free, OSM-based hosted vector tiles (no key), or
  2. **Self-hosted Protomaps / PMTiles** — a single static `.pmtiles` archive served from our own CDN/object storage (full control, no per-tile vendor, no key).
- Both keep OSM attribution and remain key-free / no paid vendor.

## Forbidden unless the owner explicitly approves later
- Google Maps, Mapbox, or any **paid** provider.
- Any **new env key / secret / billing** for maps.
- Any **fake SVG/coordinate-only "map"** standing in for a real map.

## Migration trigger (revisit when ANY of these hits)
- Real/pilot traffic begins, or usage approaches OSM public-tile fair-use limits.
- Tile rate-limiting, blocking, or latency/performance issues appear.
- Attribution/legal/usage-policy concern is raised.
- Need for custom styling, offline/region packs, or vector tiles.

## Owner decision needed at migration time
Pick **OpenFreeMap** (fastest, hosted, key-free) **or** **self-hosted Protomaps/PMTiles** (max control), then swap the tile source (and, ideally, Leaflet → MapLibre GL JS). No code here depends on a paid vendor, so the swap is localized to `market-map-live.tsx` + the tile URL.
