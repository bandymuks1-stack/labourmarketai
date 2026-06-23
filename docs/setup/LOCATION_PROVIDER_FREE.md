# Location feature — provider-free (no Google, no paid map)

The `/dashboard/market-map` location picker is **provider-free**. It needs **no
Google Maps key, no paid provider, and no external geocoding/tile service**.
There is nothing to configure for it to work.

## How it works

1. **Automatic (first):** the user taps "Naudoti mano buvimo vietą". The browser
   asks permission; on allow, the app reads latitude/longitude from the standard
   `navigator.geolocation` API (built into the browser — no provider).
2. **Manual (fallback):** if denied/unavailable, the user picks a **country** +
   **city/region** + a **radius** (10 / 25 / 50 / 100 km). A full address is not
   required. This structured location is usable for job search without any
   geocoding service.
3. **Visual:** a custom, no-tile **location panel** (a radius diagram + the
   chosen place + the source: automatic vs manual). It is honestly a location
   area panel — it never renders external map tiles and never shows a fake
   marker or a "provider not configured" message.
4. **Persistence:** the chosen location + radius are saved in `localStorage`
   (this device only) and reused automatically. One-tap update/change/remove.
   No DB write, no migration.

## What was removed

- The Google Maps JS loader and the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  requirement (env var declaration removed from `lib/env.ts`).
- All Google/API/env wording from user-facing copy.

## If a real tile map is wanted LATER (documentation only — not required now)

Use **open-source / self-hostable** options only, never Google and never a paid
tile bill:

- **MapLibre GL** (open-source renderer) +
- **OpenFreeMap** or **Protomaps** (free / self-hostable vector tiles), or
- **Natural Earth** (public-domain base data for a low-zoom world layer).

Do **not** use Google tiles, do **not** use public OSM tile servers in
production unless their tile-usage policy is satisfied and documented, and do
**not** use Nominatim for production autocomplete/geocoding. None of these are
needed for the current MVP — the provider-free panel above is fully functional.