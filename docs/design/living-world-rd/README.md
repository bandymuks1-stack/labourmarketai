# Living Opportunity World — visual R&D (three directions)

**Status: OWNER VISUAL GATE — awaiting selection (A / B / C / hybrid / reject all).**
Nothing here touches production: no routes, no landing changes, no navigation,
no frozen-copy edits. Standalone HTML prototypes only (`file://` openable) +
screenshots. After the owner selects, a SEPARATE implementation train begins.

Shared doctrine honoured by all three: real human activity first (care,
kitchen, electrical, logistics, crafts, small business, garden produce —
construction does not dominate); the grandmother's-cucumbers test is IN each
composition (30 kg of garden cucumbers finding a lawful buyer sits beside an
electrician finding Swedish work); activity visibly changes the world
(work → captured record/evidence → history grows → real demand routes appear);
NO person-score, NO "+value", no human-worth visualization — copy says we
improve *our understanding* of capabilities/work/results/services/availability;
no stock-photo card grids, no neon/particles/glassmorphism/orbital spheres.
All imagery: real documentary photographs (Unsplash for R&D — owner-approved
photography required before anything ships). Each page carries an
"R&D prototipas · ne produkcija" ribbon, reduced-motion fallbacks, and a
mobile model that is NOT a cropped desktop.

Screenshot harness: `shoot.mjs` (run from `apps/web`: `node ../../docs/design/living-world-rd/shoot.mjs`).

---

## A — „Darbo diena" (The Workday Ledger) · `a-workday-ledger.html`

**Visual thesis:** one real workday, told as a documentary editorial spread. A
falu-red thread stitches four real moments (07:12 care shift → 11:48 panel
inspection → 15:30 cucumber harvest → 19:05 dinner service). Each moment drops
an entry into a visible **professional-history ledger**; dashed routes run from
ledger entries to real Swedish opportunity cards that light up with an honest
"atitinka Nr.147 tavo istorijoje" tag.

- Typography: Fraunces (editorial serif) + IBM Plex Sans/Mono. Palette: paper,
  ink, falu red (Swedish work-building red — national anchor without flag kitsch).
- First interaction: scroll scrubs the day; photos develop from grayscale to
  color as they are "recorded"; hover/tap a ledger entry highlights exactly
  which opportunity it unlocked (causality made inspectable).
- Transition into product: the ledger IS the Work Journal; the opportunity rail
  IS `/dashboard/opportunities` with fit-band reasoning; CTA "Pradėk savo įrašą".
- Journal growth: ledger entries with evidence marks ("su įrodymu", "pasiūla").
  Opportunities: dark cards with source (Arbetsförmedlingen) + why-lit state.
  Multiple professions: the four protagonists + cucumber supply route (a
  non-job demand path — the market stall). Organizations: the restaurant's
  84-cover service entry is org activity feeding a worker's history.
- Motion: thread draws once, entries slide once — a single orchestrated reveal;
  everything idles calm. Reduced motion: fully composed static spread.
- Performance: CSS-only animation + 4 hero images; no canvas, no WebGL.
- Mobile: vertical day-feed; ledger becomes an accumulating section with the
  opportunity stack below (no sideways world to crop).

## B — „Gyvoji žemė" (Terra Viva) · `b-terra-viva.html`

**Visual thesis:** every person is a **parcel of living land** on an engraved
daylight map. Real-photo parcels (care home, kitchen, electrical, warehouse,
carpentry workshop, flower shop) sit among contour lines; Swedish region
**harbors** line the horizon with real inventory scale; **demand roads** are
dashed engravings that draw themselves toward a parcel when the map learns
what that parcel can offer.

- Typography: Archivo (wide grotesk) + Lora italic (cartographic labels).
  Palette: linen, soil, moss, harvest gold, route umber — no blue neon.
- First interaction: "Užfiksuok šiandienos darbą" on YOUR parcel (Onos
  šiltnamis — the 30 kg cucumbers) → a harvest crate appears, a road draws to
  "Vietinis turgus" (lawful produce route), the harbor flag lights, and a
  bulletin explains WHY the road appeared. Second press: second crate, road
  toward Skåne (real greenhouse-work demand). Third: state persists.
- Transition into product: parcels = profiles/living CVs; roads = matching;
  harbors = region-filtered opportunity board; bulletin = the "why these
  opportunities" explanation; CTA "Įsikurk savo sklypą".
- Multiple professions: six distinct parcels, none construction-dominant.
  Organizations: Ievos krautuvėlė (small business parcel) — org activity is a
  parcel like any other. Capability/product/service/capacity all map to the
  same primitive (what your land grows).
- Motion: roads draw, parcels settle, crates pop — each once, user-triggered
  afterwards. Reduced motion: roads pre-drawn, everything static.
- Performance: one inline SVG contour layer + dashed-path animations; photos
  lazy by nature; no 3D.
- Mobile: "my parcel" card first (the actionable thing), sticky region-harbor
  band on top, other parcels as a vertical village; roads collapse into the
  harbor band lighting up.

## C — „Įrodymų atelje" (The Evidence Atelier) · `c-evidence-atelier.html`

**Visual thesis:** a chiaroscuro atelier wall where real work **evidence
hangs as physical prints** (shift sheet, weld certificate, panel-inspection
photo, service note, a handwritten 30 kg cucumber weigh-slip). A warm brass
projector light sweeps the wall; where evidence clusters, it **projects a
doorway** — a bright real workplace with an honest label ("Kock — Malmö ·
Arbetsförmedlingen · šviesa rado: Nr.508 + 3 įrašai").

- Typography: Instrument Serif (display) + Archivo + Caveat (handwritten
  captions). Palette: umber room, print paper, brass light. Museum-poster
  chiaroscuro — deliberately NOT crypto-dark: materials are paper, brass, wood.
- First interaction: "Prisegti naują įrodymą — 30 kg agurkų" pins the
  weigh-slip with a physical drop, the light re-sweeps, and a SECOND doorway
  opens (Ūkininkų turgus — the produce buyer) while the first dims. Causality
  is literal: evidence → light → door.
- Transition into product: prints = Journal entries with evidence; doorways =
  matched opportunities with source + reason; creed section states the
  honesty doctrine ("Mes nematuojame žmogaus. Mes apšviečiame darbą.");
  CTA "Pakabink pirmą įrodymą".
- Multiple professions: care, welding, electrical, kitchen + produce supply.
  Organizations: doorways can equally be an org's demand (the market).
- Motion: prints pin once, one light sweep per event. Reduced motion: cone
  fixed, doors visible, chalk annotation shown.
- Performance: conic-gradient light (no canvas), 6 images, CSS keyframes only.
- Mobile: vertical corkboard; doorway becomes a full-width arched sheet after
  the wall; light becomes a top-down warm gradient.

---

## Frozen-frame check (screenshots committed under `screenshots/`)

Each direction was paused mid- and post-animation at 1440×900 and 390×844:
- A: editorial spread with red thread — passes campaign-image bar.
- B: engraved living map with real-photo parcels — passes.
- C: chiaroscuro evidence wall with brass light — passes.

## Not done on purpose

- No production integration, no new app routes (product constitution requires
  declaration first), no i18n keys, no reuse of frozen landing copy.
- Unsplash imagery is R&D-only; ship-ready imagery is an owner decision
  (brand rule: real, licensed, believable — no fake workers).
- Ad numbers shown inside prototypes are illustrative compositions from the
  real Swedish inventory scale and marked as such in each page's footer.
