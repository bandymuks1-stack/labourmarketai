# AI-native visual system S3 — canonical Player Card honesty

Date: 2026-08-03 · Branch: `feature/ai-native-visual-s3-player-card-honesty` ·
Base: `origin/main = 081098c691ac77278c0a24aff04546288c7641e0`

## Problem

The visual audit found two contradictory worker-card systems living side by
side:

- **Canonical real card** — `apps/web/components/app/worker-player-card.tsx`:
  real data, honest counters, readiness as met/total signals, no rating, no
  fake verification. Rendered by the journal, the workspace result, the
  conversation and the landing showcase.
- **Conceptual marketing card** — `apps/web/components/app/player-card.tsx`
  (+ `ovr-ring.tsx`): FIFA/FUT-style fiction — 0–99 OVR ring,
  gold/silver/bronze tiers, six-acronym stat bars (SKL/REL/SPD/SAF/ADP/TRS),
  placeholder personas, manual `locale === "lt"` two-locale localization.

The public `/for-workers` page rendered the conceptual card — a public
honesty and product-consistency defect: the page sold a scoring fiction the
product deliberately refuses to build.

## Caller map (read-only inventory, before any deletion)

| Component | Callers found | Decision |
|---|---|---|
| `components/app/player-card.tsx` (FUT concept) | ONLY `app/[locale]/(marketing)/for-workers/page.tsx` | DELETE |
| `components/app/ovr-ring.tsx` | ONLY `player-card.tsx` (its own child) | DELETE |
| `components/app/worker-player-card.tsx` (canonical) | `dashboard/journal/page.tsx`, `components/app/workspace/player-card-result.tsx`, `components/marketing/player-card-showcase.tsx`, `lib/player-card/*` | KEEP — canonical, untouched |
| `components/marketing/player-card-showcase.tsx` | `app/[locale]/(marketing)/page.tsx` (landing) | KEEP — canonical public wrapper; sample data extracted to shared module |
| `components/visual/worker-card.tsx` | `app/[locale]/dashboard/talent/page.tsx` (admin talent) | KEEP — real non-marketing purpose, out of scope |
| `content/placeholders.ts` card payloads (`getCard`, `PlayerCardData`, `STAT_KEYS`, `PlayerStatus`, `hero.worker.featured.card`, `workers.featured.1/2/3`, `playercards.caption.dragToCompare`) | ONLY the deleted concept card | REMOVE payloads; registry itself + all other payload families (demand/pool/company/draft/geo/marketPanel) KEPT |
| `public/placeholders/worker-portrait.svg` | ONLY the deleted card payloads | DELETE |
| `messages/*.playercards.{stat,tier,status,statLegendIntro}` | ONLY the deleted concept card (statLegendIntro: dead key, zero code readers) | REMOVE in all 11 locales |
| `PlayerTier` type + `DraftCardData.ovr` + draft rows | `components/app/mini-draft-card.tsx` (landing draft board, frozen) | KEEP — out of scope, see "Residual finding" |

## Canonical decision

- Full worker identity card: `worker-player-card.tsx` (unchanged).
- Public wrapper: `player-card-showcase.tsx` (landing) — its inline sample
  moved to `lib/player-card/sample-card.ts`.
- `/for-workers` renders the SAME canonical `WorkerPlayerCard` with the SAME
  shared sample (cook persona, §3.3 deliberately non-construction), inside
  the existing always-visible `ExamplePreviewFrame` ("Example" chip + note).
- ONE sample source: `buildSampleWorkerPlayerCard` — both public surfaces
  physically share persona, series and derivers with the signed-in card.

## Copy

`workers.profile.bullets` advertised the fiction ("Stat bars — Skill,
Reliability, Speed…", "Status badge — … Drafted …"). Rewritten in all 11
locales to describe only what the canonical card really shows: readiness
(met/total, never a rating), skills with evidence, availability + location,
experience evidence. lt/en/ru/de/nl natural translations; pl/da/et/lv/no/sv
keep the repo's explicit `[EN]` fallback convention. Pay expectation is NOT
claimed — the canonical card has no pay-expectation field (the thermometer is
a separate owner-locked surface and is passed `null` here).

## Landing freeze

The freeze list contained `player-card.tsx`, `content/placeholders.ts`,
`player-card-showcase.tsx` and the `playercards` namespaces (lt/en/ru), so
this owner-directed slice regenerated the baseline (precedent: W14 Slice 1).
Exactly 6 hashes moved:

- removed: `components/app/player-card.tsx` (file deleted; freezing a deleted
  file would only make the guard fail to load)
- changed: `components/marketing/player-card-showcase.tsx` (sample extraction,
  render output unchanged), `content/placeholders.ts` (card payloads removed)
- changed namespaces: `lt.playercards`, `en.playercards`, `ru.playercards`
  (dead stat/tier/status/statLegendIntro keys removed)

Recorded in `landing-freeze.ts` under "BASELINE REGENERATIONS ON RECORD".

## Guards

- NEW `lib/guards/public-worker-card-honesty.test.ts` — concept card + OVR
  ring stay deleted and unimported; `/for-workers` renders the canonical card
  from the shared sample inside the Example frame; one sample source; retired
  stat/tier/status keys stay out of all locales; no OVR / stat-bar / "Drafted"
  fiction in the `workers` namespace; no manual two-locale localization on the
  card surfaces; no second full Player Card component.
- TIGHTENED `fit-not-rating.test.ts` — the two concept-card allowlist holes
  removed; the global-score identifier ban now covers every card surface.
- TIGHTENED `player-card-profile.test.ts` — concept card must NOT exist
  (repo-wide import walk widened from 2 dirs to all of `components/` +
  `app/`); the shared sample joined the no-construction ban list.
- UPDATED `public-nav-canonical.test.ts` — the stat-legend contract inverted:
  the six-acronym legend keys must now be ABSENT in every active locale.
- UPDATED `public-evidence-integrity.test.ts` — "featured cards diversified"
  (a contract of the deleted FUT cards) replaced with "the ONE public sample
  stays non-construction".
- UPDATED `placeholder-marker-prod.test.ts` / `public-no-fake-claims.test.ts`
  — deleted file left the scan lists (both guards otherwise unchanged).
- All pre-existing player-card guards re-run green; none weakened.

## Residual finding (out of scope, documented honestly)

The landing draft board (`components/marketing/draft-board.tsx` →
`components/app/mini-draft-card.tsx`) still renders a public 0–99 `ovr`
number in a tier-colored badge per mini card, from `DraftCardData` rows in
`content/placeholders.ts`. That is a frozen landing surface outside this
slice's scope (§9: landing untouched beyond necessity). It is the LAST public
OVR surface; removing it needs its own owner-directed landing slice.
