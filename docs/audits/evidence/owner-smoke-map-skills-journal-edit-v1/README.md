# Owner-review evidence — fix/owner-smoke-map-skills-journal-edit-v1

Evidence for the owner-reported bugfixes. The dashboard is auth-gated (owner
Google-only login) and cannot be driven headlessly, so the in-app surfaces are
shown via harnesses that use the **same library/provider and the same modules**
the app uses, screenshot at desktop (1280px) and mobile (390px).

## 1. Market Map — REAL provider map (bug 1)
- `market-map-live-desktop.png`, `market-map-live-mobile.png` — a **real
  interactive map: OpenStreetMap raster tiles via Leaflet** (free, no API key,
  no secret). Real streets / roads / geography around Vilnius, the worker's own
  location marker, and the 25 km search radius circle. Mobile shows no
  horizontal overflow, touch zoom controls, and the OSM attribution.
- This is the SAME library + tile provider the app component
  `components/app/market-map-live.tsx` uses (`L.tileLayer('https://
  tile.openstreetmap.org/{z}/{x}/{y}.png')`). The previous SVG/coordinate-only
  locator was **removed**.
- Source harness: `market-map-live.html` (Leaflet 1.9.4 + OSM tiles, with SRI on
  the CDN assets).

## 2. Work Journal skill/specialization recognition (bug 2)
- `journal-skills-desktop.png`, `journal-skills-mobile.png` — the capability
  chips the journal now surfaces. Proves the flattening fix: "lietuviškos
  virtuvės gamyba" yields BOTH "Maisto gamyba" AND "Lietuviškos virtuvės
  gamyba". The broad entry captures all owner-flagged items (driving + the
  passenger-car specialization, sales, plumbing install, legal/contract,
  document handling, automation, motivation, communication, culinary).
- Source harness: `scripts/owner-evidence/render-journal-evidence.mts`
  (imports `lib/profile/skill-claim-extractor.ts`, the same dictionary the
  journal composer now uses).
- Regression test: `lib/structuring/journal-capability-extraction.test.ts`.

## 3. Journal edit — full state preserved (bug 3)
- Behind the auth-gated dashboard, so verified by tests rather than a live
  authenticated screenshot:
  - `lib/journal/edit-entry.test.ts` — the pure reconstruction preloads text +
    work date + hours/quantity + direction + linked skills, and a text-only edit
    keeps them all.
  - `lib/guards/journal-edit-preserves-state.test.ts` — the composer/page wiring
    preloads those fields (confirmed) and always re-submits the work date.
  - `lib/guards/journal-edit-remount.test.ts` — the composer remounts per edit so
    the saved text always loads.
- To verify live: log in as owner, open `/lt/dashboard/journal`, create an entry
  with hours + a skill + a non-today date, save, then **Redaguoti įrašą** — the
  textarea, date, hours and skill chips are prefilled (and shown under
  "Kept from the previous entry"); **cancel** leaves the entry unchanged; **save**
  supersedes the same entry without dropping fields.

## Real app evidence vs. rendered/demonstration evidence (important)

None of these images are screenshots of the **running authenticated app** (the
dashboard is owner-Google-login-gated and cannot be driven headlessly):

| Artifact | Real app part | Demonstration / reconstructed part |
| --- | --- | --- |
| `market-map-live.*` | The **library + tile provider are identical** to the app: Leaflet + `tile.openstreetmap.org` raster tiles, marker + radius. The tiles are the real, live OSM tiles. | The surrounding page is a minimal harness, not the full `market-map-base.tsx` controls. The in-app map is the same `MarketMapLive` component. |
| `journal-skills.*` | The capability **labels** come straight from the real `lib/profile/skill-claim-extractor.ts` — the exact module the journal composer calls. | The chip **styling/layout** is a static HTML mock, not the real `journal-entry-composer.tsx`. |

So: **real provider/modules, harness chrome.** A true in-app screenshot still
requires an authenticated owner session (manual steps above).

## How to regenerate
```
# Journal skills (Node):
npx tsx scripts/owner-evidence/render-journal-evidence.mts
# Market map: open market-map-live.html in a browser (loads live OSM tiles).
```
