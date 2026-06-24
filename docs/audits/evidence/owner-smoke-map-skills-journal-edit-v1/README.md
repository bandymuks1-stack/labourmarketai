# Owner-review evidence — fix/owner-smoke-map-skills-journal-edit-v1

Fresh evidence for the owner-reported bugfixes. The dashboard is auth-gated
(owner Google-only login), which cannot be driven headlessly, so the map and
journal-skill evidence is rendered from the **real production modules** (same
projection geometry, same capability dictionary the app uses) via the harnesses
in `scripts/owner-evidence/`, then screenshot at desktop (1280px) and mobile
(390px). The artifacts are faithful to what the components render.

## 1. Market map (bug 1)
- `market-map-desktop.png`, `market-map-mobile.png` — the new interactive
  coordinate map. Real served-market reference points (country centroids),
  the selection plotted at its true position with its search radius, and an
  honest empty state. Three states shown: tapped/auto coordinate (Vilnius),
  manual country (Sweden centroid), and empty.
- Source harness: `scripts/owner-evidence/render-map-evidence.mts`
  (imports `lib/location/map-projection.ts` directly).
- Interactivity (tap-to-set → real coordinate via inverse projection) is
  covered by `lib/location/map-projection.test.ts` (project∘invert identity).

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

## 3. Edit existing journal entry → original text visible (bug 3)
- This flow is behind the auth-gated dashboard and is a structural state-init
  fix (the composer now remounts on edit-target change so it always loads the
  saved `original_text`), so it is verified by the regression guard test rather
  than a live authenticated screenshot:
  `lib/guards/journal-edit-remount.test.ts`.
- To verify live: log in as owner, open `/lt/dashboard/journal`, click **Edit**
  on an unconfirmed entry — the textarea now shows the saved text; **Cancel**
  returns to a clean create form.

## How to regenerate
```
npx tsx scripts/owner-evidence/render-map-evidence.mts
npx tsx scripts/owner-evidence/render-journal-evidence.mts
# then screenshot the two HTML files at 1280px and 390px
```
