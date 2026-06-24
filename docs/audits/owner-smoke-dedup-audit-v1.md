# Owner-smoke dedup audit — map / journal / skill-extraction / location

Branch: `fix/owner-smoke-map-skills-journal-edit-v1`
Date: 2026-06-24
Scope: duplicate / same-purpose code created across recent PRs in the map,
journal, skill-extraction and profile/photo/location paths. Consolidate only
**obvious** duplicates; no app-wide rewrite.

## 1. Text → skill/capability extraction (CONSOLIDATED)

Two extractors had grown up doing overlapping "recognise named capabilities
from free text" work:

| Module | Surface | Output | Specialization-aware? |
| --- | --- | --- | --- |
| `lib/structuring/extract-journal-suggestions.ts` (+ `skill-recognition.ts`, `keywords.ts`) | Work Journal | taxonomy **slugs** + activity labels | **No** — flattened to generic chips |
| `lib/profile/skill-claim-extractor.ts` | Profile composer | free-text **capability labels** (parent **and** specialization) | **Yes** |

The journal path could not surface a specialization (e.g. "lietuviškos virtuvės
gamyba" collapsed to only the generic parent), and the two paths were drifting
toward two parallel lexicons.

**Consolidation:** the journal extractor now **reuses
`extractProfileSkillClaims`** (the profile dictionary) as the single source of
truth for explicitly-named capabilities/specializations, exposed on
`JournalSuggestions.capabilitySuggestions`. No parallel specialization rows were
added to `keywords.ts`; one dictionary now feeds both surfaces. Three missing
inflections/rows the owner smoke flagged were added to that one dictionary
(`automation`, `motivation`, `communication`, plus `vairav` / `bendrav` /
`montavau santechnik` stems) so both surfaces benefit at once.

**Left intentionally:** `keywords.ts` slug recognition + activity-fragment
parsing stays — it does a *different* job (mapping to the verified skill
taxonomy and parsing time/quantity fragments), not capability labelling.
Removing it would be a broad change with no dedup benefit.

## 2. Map components (ONE obvious duplicate removed)

Audited: `labour-market-world-map.tsx`, `market-map-shell.tsx`,
`market-map-base.tsx`, `market-map-signal-layer.tsx`, `market-map-my-signals.tsx`.

These are **not duplicates** — each has a distinct role (conceptual world
overview, signal board, location picker, signal lists). They were left as-is to
avoid a broad redesign.

The one obvious same-purpose duplicate was **inside `market-map-base.tsx`**: a
static decorative radius-circle `<svg>` that *pretended* to be the map but
rendered identically for every location (it ignored the actual coordinates).
**Removed** and replaced by the real `components/app/location-map.tsx`
(interactive coordinate map). No parallel map component was kept.

## 3. Location libs (no duplicate)

`lib/location/location-model.ts` and `lib/location/location-store.ts` are a
single source for the location type + persistence; no duplication. Added
`lib/location/map-projection.ts` — a *new, distinct* concern (projection
geometry), not a duplicate of either. `lib/market-map/*` and `lib/demand/*`
cover signals/demand, a separate concern from the personal location picker.

## 4. Profile / photo / location paths (no duplicate)

Image compression (`compressImageFile` / `isValidJournalPhoto`) is a single
shared utility already reused by the journal composer; no duplicate upload or
compression path was found. The journal "add undeclared skill / capability"
action (`saveProfileSkillClaimsAction`) is reused for the new capability
suggestions rather than introducing a second persistence path.

## Summary

- **Duplicate removed:** the fake static map circle in `market-map-base.tsx`.
- **Same-purpose code consolidated:** journal capability/specialization
  recognition now reuses the profile dictionary (one lexicon, not two).
- **Reused instead of duplicated:** `saveProfileSkillClaimsAction` for the new
  journal capability chips; `compressImageFile` for photos.
- **Intentionally left:** the world-overview + signal-board map components
  (distinct purpose) and the `keywords.ts` slug/fragment parser (distinct
  output) — consolidating them would be a broad rewrite outside this fix's scope.
