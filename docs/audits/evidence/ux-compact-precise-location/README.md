# Evidence — fix/ux-compact-control-centers-precise-location

The dashboard is auth-gated (owner Google-only) and previews are SSO-walled, so
the map evidence uses the **same Leaflet + OSM tile layer + the same resolved
coordinates** the app uses, in a harness — not a live authenticated route.

## Map city precision (TASK 2)
- `map-hilversum-desktop.png`, `map-hilversum-mobile.png` — the marker sits **on
  Hilversum** (labelled center), with the 25 km radius and the "Pasirinktas
  miestas" precision badge. Coordinates come from `resolveCity("NL","Hilversum")`
  = 52.2236, 5.1761 (the real app function), **not** the NL country centroid.
- Logic proof: `apps/web/lib/location/city-coordinates.test.ts` (Hilversum,
  name normalization, country-only=approximate, unknown=unset).

## What still needs the owner / a follow-up
- Compact map page (collapsed "Išsamiau"), precision labels in-app, and the
  new sector-neutral cases are verified by tests/guards; a live authenticated
  screenshot needs owner login on production after deploy.
- Messages clarity, "Mano paskyra"→"Nustatymai" nav rename, and the workspace
  scope-leak fix are **not in this PR** — separate focused follow-ups.
