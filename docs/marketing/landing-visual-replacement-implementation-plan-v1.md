# Landing visual replacement — implementation plan v1

Status: **APPROVED DIRECTION, IMPLEMENTATION PLAN ONLY** (2026-07-06,
baseline `origin/main` @ a98df5e). **This PR does not edit the landing.
No landing/public marketing file, no component, no i18n catalog and no
guard is changed by this document.** Implementation happens in a separate
future PR (or PR train) that the owner triggers explicitly — see §7 for
the exact command.

Converts the approved presentation model
(`docs/marketing/landing-visual-replacement-presentation-v1.md`, merged
in #670) into a concrete, file-grounded implementation plan. Companion
copy model: `docs/marketing/landing-replacement-model-v1.md` (#657).

## Owner decisions encoded (verbatim, 2026-07-06)

1. Visual direction: **YES** — "living work passport / labour-service
   operating system".
2. Capability cards instead of fake counters: **YES**.
3. Real app screenshots: **YES** — real screenshots or real UI-derived
   visual cards only.
4. Animated numeric counters: **REMOVE** fake animated numeric counters.
   Real counts only when backed by a database/public metric and clearly
   labeled.

All four answers are final inputs to this plan. Decision 4 closes the
"keep under >0-aggregate rule" option for the current placeholder cycles:
`MarketCounters` and its `counters.*` placeholder cycles are removed
outright; any future real counter is a new, separately-gated feature.

---

## 1. Section-by-section landing plan (grounded in current code)

Current landing entry point:
`apps/web/app/[locale]/(marketing)/page.tsx` (hero → `MarketCounters` →
`LiveMap` → `LiveTicker` → journey band → audience band → why-now
pillars → two paths → `LabourMarketEvidence` → `PlayerCardShowcase` →
`DraftBoard` → `MarketPulse`).

Target order (presentation model §7), mapped to what changes in code:

| Pos | Section | Weight | Code action |
|---|---|---|---|
| 1 | **Hero — living work passport** | flagship | Keep left column of `page.tsx` (eyebrow chip, 2-line headline w/ `text-gradient-accent`, subcopy, `hero-signals` chips, dual CTA to `/auth/signup` + `/company-need`). Replace hero-right (`PreviewChip` + `LiveMap`) with new `components/marketing/passport-diorama.tsx`: 3 stacked real product surfaces (journal entry → evidence-tier chips → verified-CV preview) threaded by the existing `stage-line` motif, one ~9s loop, `useReducedMotion`-gated. Replace `<MarketCounters />` under the CTAs with new `components/marketing/capability-strip.tsx` |
| 2 | **Capability ticker** | quiet strip | Rework `components/app/live-ticker.tsx` (or replace with `components/marketing/capability-ticker.tsx`): keep the `.ticker-track` CSS marquee; feed items from a static real-capabilities list (new `live.ticker.capability.*` keys), not `placeholderText("ticker.event.N")` |
| 3 | **Journey band** | standard | Unchanged (`journeyStages` block in `page.tsx`, `journey.*` keys) |
| 4 | **Europe directions map, demoted** | standard | Move `LiveMap` from hero into its own section here; strip staged markers/counts from `components/app/live-map.tsx` (drop `geoPayloads("map.marker.*")` usage — tooltips become country name + direction tier only); add "Built for the European labour market — starting from Lithuania" line; fold the audience chips (`labourMarket.audience*` + `a*` keys) beneath it, merging the current audience band |
| 5 | **Module wall — the OS in 8 real screens** | flagship | New `components/marketing/module-wall.tsx`: 8 OS-style module cards (mono `text-[11px]` uppercase label + `live-dot` + real screenshot + one capability line). Journal cell 2×. Cells per presentation §4: player card, work journal (flagship), skills/evidence tiers, verified CV + exports, marketplace+opportunities split cell, map visibility, bookings·messages·notifications, privacy/security/export (no MFA claim) |
| 6 | **Booking-lifecycle showcase** | standard | New `components/marketing/booking-lifecycle-showcase.tsx` replacing `components/marketing/draft-board.tsx` + `components/app/draft-board-columns.tsx`: real states proposed → accepted → declined, each with its real next action ("no dead ends") |
| 7 | **Market pulse — real evidence** | standard | Retire `components/marketing/market-pulse.tsx` and its four staged panels (`components/app/regional-heatmap.tsx`, `skills-demand-list.tsx`, `supply-demand-chart.tsx`, `recent-matches-feed.tsx`). Promote the already-real `components/marketing/labour-market-evidence.tsx` into this slot with terminal styling (mono provenance rows, claim-type badges, source links — all data already provenanced) |
| 8 | **Why-now pillars** | standard | Unchanged (`pillarKeys` block, `labourMarket.p*` keys) |
| 9 | **Two paths — worker / company** | standard | Keep structure + routes; add one real screenshot per card (worker: journal; company: opportunities/booking) |
| 10 | **Trust strip — privacy & security** | quiet strip | New compact row: live JSON export, live deletion-request intake, count-gated notifications, LT/EN/RU. No MFA claim |
| 11 | **Final CTA band** | standard | Headline reprise + dual CTA; links to pilot-program card on `/pricing` |

Retired outright (with their placeholder registry entries in
`apps/web/content/placeholders.ts`): `MarketCounters`,
`PlayerCardShowcase`'s fictional trio, `DraftBoard`/`DraftBoardColumns`,
`MarketPulse` + its four panel components, staged `LiveMap` markers,
fake `LiveTicker` events.

### 1.1 Fake → honest replacement table, mapped to concrete files

From the presentation model §5, now with implementation targets:

| # | Fake element (file today) | Replacement (file after) |
|---|---|---|
| C1–C4 | `apps/web/components/app/market-counters.tsx` — 4 animated counters cycling `counters.active_workers` / `counters.live_demand` / `counters.matches_today` / `counters.avg_ovr` placeholder cycles from `apps/web/content/placeholders.ts`, fake ▲/▼ deltas, 10px preview note | New `apps/web/components/marketing/capability-strip.tsx` — 4 capability cards with real micro-visuals (journal entry chip, evidence-tier chip, CV stamp, verified-company badge) + approved capability copy. `market-counters.tsx` deleted; `counters.*` entries removed from `placeholders.ts`; `live.counters.*` keys retired from catalogs (or repurposed to `capabilities.*`) |
| M1 | `apps/web/components/app/live-map.tsx` — staged per-country worker/project/match/company markers via `geoPayloads("map.marker.*")`, intensity glow, count tooltips | Same file, cleaned: keep `EUROPE_GEO` outline + country names + tier styling from `apps/web/components/app/europe-geo.tsx`; tooltips = country + direction tier only; `map.marker.*` + `map.intensity.*` entries removed from `placeholders.ts`; section moves from hero to position 4 |
| T1 | `apps/web/components/app/live-ticker.tsx` — 12 `ticker.event.N` staged items from `placeholders.ts` | Capability ticker (same marquee CSS): items = real module/sector capabilities + shipped facts ("Verified CV print — live", "Journal CSV export — live", "LT · EN · RU"). `ticker.event.*` entries removed from `placeholders.ts` |
| PC1 | `apps/web/components/marketing/player-card-showcase.tsx` — 3 fictional FUT profiles via `<PlayerCard id="workers.featured.N" />` | Module-wall cell 1 renders the real in-app card component (`apps/web/components/app/worker-player-card.tsx` surface) with an owner-approved real profile or a ≥12px-framed worked example. `player-card-showcase.tsx` deleted; `workers.featured.*` entries removed from `placeholders.ts` |
| DB1 | `apps/web/components/marketing/draft-board.tsx` + `apps/web/components/app/draft-board-columns.tsx` — staged "live matching" pipeline (`draft.*` placeholder cards) | New `booking-lifecycle-showcase.tsx` — real booking states with real next actions. Both draft files deleted; `draft.*` card entries removed from `placeholders.ts` |
| MP1 | `apps/web/components/marketing/market-pulse.tsx` + `regional-heatmap.tsx`, `skills-demand-list.tsx`, `supply-demand-chart.tsx`, `recent-matches-feed.tsx` — staged Bloomberg panels | `labour-market-evidence.tsx` promoted into the pulse slot with terminal styling; sourced statistics with provenance rows (`labourMarket.evidence.*`, `fieldSource`, `fieldFigureDate`, `fieldLastChecked`, `claim*` keys — all already real). The four panel files deleted; `pulse.*`/panel entries removed from `placeholders.ts` |
| D1–D2 | `apps/web/app/[locale]/(marketing)/for-companies/page.tsx` — `<DemandPreviewCard id="demand.featured.1" />` ("47 ranked matches · HOT") + sample company "88 gold" (`company.score`) | Keep the card design inside a designed ≥12px worked-example frame ("Pavyzdys, kaip atrodo paskelbtas poreikis / A worked example of a posted demand"); staged counts removed or explicitly inside the frame; score chip gets "(pavyzdys)" |
| A1 | `apps/web/app/[locale]/(marketing)/for-agencies/page.tsx` — `<AgencyPoolPreview id="agency.pool.preview" />` ("86 workers · 31 active") | Same designed worked-example frame: "Pavyzdys: agentūros komandos vaizdas / Worked example: the agency pool view" |
| P1 | `apps/web/app/[locale]/(marketing)/pricing/page.tsx` — FAQ line "Dar nepradėjome veiklos…" | Pilot-program card (bordered card + "Pilot" chip + direct-contact CTA) using the approved pilot-phase paragraph; `pricing.faq` entry replaced across LT/EN/RU |
| J1–J5 | Internal jargon leaks ("(M5)", "PR2 pending", "ChiefOperator", vision smoke banner, DB-layer wording) on public surfaces | Deleted per the copy model; no visual replacement needed |

Net effect: zero fabricated numbers on the public site; every number is a
sourced statistic with provenance, a real >0 DB aggregate (future,
separately gated), or inside a labelled worked-example frame.

## 2. Future implementation PR scope

### 2.1 Files likely touched (real paths, current `main`)

Pages (public marketing surfaces — owner-gated):

- `apps/web/app/[locale]/(marketing)/page.tsx` (section order, imports)
- `apps/web/app/[locale]/(marketing)/for-companies/page.tsx`
- `apps/web/app/[locale]/(marketing)/for-agencies/page.tsx`
- `apps/web/app/[locale]/(marketing)/pricing/page.tsx`

Components deleted:

- `apps/web/components/app/market-counters.tsx`
- `apps/web/components/marketing/player-card-showcase.tsx`
- `apps/web/components/marketing/draft-board.tsx`
- `apps/web/components/app/draft-board-columns.tsx`
- `apps/web/components/marketing/market-pulse.tsx`
- `apps/web/components/app/regional-heatmap.tsx`
- `apps/web/components/app/skills-demand-list.tsx`
- `apps/web/components/app/supply-demand-chart.tsx`
- `apps/web/components/app/recent-matches-feed.tsx`

Components reworked:

- `apps/web/components/app/live-map.tsx` (strip staged markers/counts)
- `apps/web/components/app/live-ticker.tsx` (capability feed)
- `apps/web/components/app/demand-preview-card.tsx` (worked-example frame)
- `apps/web/components/app/agency-pool-preview.tsx` (worked-example frame)
- `apps/web/components/app/preview-chip.tsx` (role changes with hero swap)

Components created (names indicative):

- `apps/web/components/marketing/passport-diorama.tsx`
- `apps/web/components/marketing/capability-strip.tsx`
- `apps/web/components/marketing/module-wall.tsx`
- `apps/web/components/marketing/booking-lifecycle-showcase.tsx`
- `apps/web/components/marketing/trust-strip.tsx`

Content/registry:

- `apps/web/content/placeholders.ts` (remove `counters.*`,
  `ticker.event.*`, `map.marker.*`, `workers.featured.*`, draft/pulse
  entries; keep the registry itself — worked-example frames may still be
  governed through it)
- `apps/web/public/placeholders/` (retire staged assets; add real
  screenshot assets, e.g. `apps/web/public/screens/`)

Guards/tests (see §2.4):

- `apps/web/lib/guards/homepage-counter-honesty.test.ts` (rewrite: from
  "counters must carry disclaimer" to "counters must not exist")
- `apps/web/lib/guards/public-no-fake-claims.test.ts` (extend)
- `apps/web/lib/guards/placeholder-marker-prod.test.ts`,
  `placeholder-sample-affordance.test.ts` (update expectations)
- new `apps/web/lib/guards/landing-no-fake-counter.test.ts`
- `apps/web/scripts/check-pricing-honesty-copy.ts` /
  `check-pilot-honesty-copy.ts` (pilot-card wording)

### 2.2 Copy keys likely touched (real namespaces)

Main per-locale catalogs `apps/web/messages/lt.json`, `en.json`,
`ru.json` (all three must stay in parity; the other locales in
`apps/web/messages/*.json` follow the repo's i18n-debt process):

- `hero.*` — headline/headlineAccent/subcopy swap per §3 shortlist;
  `hero.signals.s1–s4` kept
- `live.counters.*` — retired (or replaced by a new `capabilities.*`
  namespace for the capability strip)
- `live.ticker.*` — `event.*` items replaced by capability items
- `map.*` — tooltip keys reduced to name+tier; new "starting from
  Lithuania" caption key
- `playercards.*` — retired or reduced to the module-wall cell copy
- `draft.*` — retired; new `bookingShowcase.*` (or similar) namespace
- `marketPulse.*` — retired; evidence section already uses
  `labourMarket.evidence*` keys
- `journey.*` — unchanged
- `pages.companies.*`, `pages.agencies.*` — worked-example frame labels
- `company.score` — "(pavyzdys)" marker
- `pricing.faq` / new `pricing.pilotCard.*` — pilot-program card
- new `moduleWall.*`, `trustStrip.*` namespaces

Per-locale directory catalogs `apps/web/messages/{lt,en,ru}/labour-market.json`
(`labourMarket` namespace: `audience*`, `a*`, `pillars*`, `p*`,
`workerPath*`, `employerPath*`, `evidence*`) — mostly unchanged; audience
band merge may relocate render position only, keys stay.

### 2.3 Screenshots / visual cards needed

One capture session feeds BOTH this landing work and the Play-listing
pack in `docs/mobile/mobile-store-assets-owner-pack-v1.md` §4 — do not
run two sessions. Table carried from the presentation model §6:

| # | Screen | Route | Used by |
|---|---|---|---|
| 1 | Work journal (entry + composer) | `/{locale}/dashboard/journal` | Hero diorama layer 1, module wall cell 2, store shot 2 |
| 2 | Skills with evidence tiers | `/{locale}/dashboard/profile` | Hero diorama layer 2, module wall cell 3, store shot 3 |
| 3 | Verified CV print view | `/{locale}/cv` / `/{locale}/dashboard/cv` | Hero diorama layer 3, module wall cell 4, store shot 4 |
| 4 | Opportunities list | `/{locale}/dashboard/opportunities` | Module wall cell 5, company path card, store shot 5 |
| 5 | Dashboard home | `/{locale}/dashboard` | Module wall backdrop, store shot 1 |
| 6 | Bookings / inbox (real states) | `/{locale}/dashboard/bookings`, `/{locale}/dashboard/inbox` | Booking-lifecycle showcase, module wall cell 7, store shot 6 |
| 7 | Privacy page (export + deletion-request, both live) | `/{locale}/dashboard/privacy` | Module wall cell 8 (landing-only) |
| 8 | In-app professional/player card | profile card surface | Module wall cell 1 (landing-only) |

Rules: real product states only (owner account or consented demo
account; honest empty states acceptable and framed); capture 390px and
1440px per displayed locale (LT+EN first); 1px `border-ink-500` + subtle
glow so screens read as objects; no device frames, no text overlays in
v1; never invented names presented as real users. **No images are
created by this docs PR.**

### 2.4 Tests / guards needed

Implementable assertions (see also §4):

1. **No-fake-counter guard** (new
   `apps/web/lib/guards/landing-no-fake-counter.test.ts`):
   - `apps/web/components/app/market-counters.tsx` does not exist;
     no file under `apps/web/` imports `MarketCounters`.
   - `apps/web/content/placeholders.ts` contains no
     `counters.active_workers` / `counters.live_demand` /
     `counters.matches_today` / `counters.avg_ovr` ids and no `cycle`
     arrays for numeric stats rendered on `(marketing)` routes.
   - The landing page source contains no `setInterval`-driven numeric
     cycle component and no ▲/▼ delta glyph pair tied to
     placeholder-derived numbers.
   - Retired copy does not reappear: `live.counters` namespace absent
     from `lt.json`/`en.json`/`ru.json` (or contains only
     non-numeric capability copy under its replacement name).
2. **Real-metric labeling rule** (extend
   `public-no-fake-claims.test.ts`): any numeric rendered on a public
   `(marketing)` route must come from (a) the provenanced evidence module
   (`lib/labour-market/evidence`), (b) a public-safe RPC aggregate
   gated behind `> 0`, or (c) sit inside an element carrying the
   worked-example marker (`data-testid` frame + ≥12px label). Static
   numerals in marketing components outside those three paths fail the
   guard.
3. **Staged-module absence**: `player-card-showcase.tsx`,
   `draft-board.tsx`, `draft-board-columns.tsx`, `market-pulse.tsx`,
   `regional-heatmap.tsx`, `skills-demand-list.tsx`,
   `supply-demand-chart.tsx`, `recent-matches-feed.tsx` deleted and
   unreferenced; `geoPayloads("map.marker.` absent from `live-map.tsx`;
   `ticker.event.` absent from `live-ticker.tsx`.
4. **MFA absence**: no public marketing surface mentions MFA/2FA as live
   (string scan across `(marketing)` pages + `lt/en/ru` marketing keys).
5. **Existing guards stay green**: `pnpm -C apps/web placeholders:check`,
   `check:pilot-honesty-copy`, `check:pricing-honesty-copy`,
   `public-no-fake-claims.test.ts`, `placeholder-marker-prod.test.ts`,
   `homepage-counter-honesty.test.ts` (rewritten to assert absence),
   `pricing-no-live-claim.test.ts`, plus `pnpm typecheck`, `pnpm lint`,
   `pnpm check:primary-route-smoke`, `pnpm check:i18n-debt`.

### 2.5 Suggested PR slicing

This exceeds one narrow PR. Four slices, each independently green and
reviewable, in dependency order:

- **PR-A — Hero + capability strip + ticker**: passport diorama
  (needs screenshots 1–3), capability strip replacing `MarketCounters`
  (deletes C1–C4), capability ticker (T1), hero headline swap (§3),
  `counters.*`/`ticker.event.*` purge from `placeholders.ts`, rewritten
  counter guard + new no-fake-counter guard. Biggest honesty win first.
- **PR-B — Map demotion + module wall**: `LiveMap` cleaned and moved to
  position 4 with audience-band merge (M1); module wall flagship section
  (needs screenshots 1–8); fictional player trio retired (PC1).
- **PR-C — Lifecycle + pulse swap**: booking-lifecycle showcase replaces
  DraftBoard (DB1); `LabourMarketEvidence` promoted into the pulse slot,
  MarketPulse panels retired (MP1); trust strip + final CTA band.
- **PR-D — Companies / agencies / pricing + jargon purge**:
  worked-example frames on `/for-companies` (D1–D2) and `/for-agencies`
  (A1); pilot-program card on `/pricing` (P1); J1–J5 jargon purge;
  guard updates for `check:pilot-honesty-copy` / `check:pricing-honesty-copy`.

If screenshots are not yet captured when PR-A starts, PR-A may ship the
capability strip + ticker + headline first and land the diorama in PR-B
alongside the module wall (both need the same capture session).

## 3. Headline shortlist carried from the presentation model (final)

Two-line hero structure kept; line 2 carries `text-gradient-accent`.
All claims true today. Owner picks one at implementation time (default
recommendation: H1, with H5 as the final-CTA-band reprise):

| # | LT | EN |
|---|---|---|
| H1 | `Tavo darbas tampa įrodymu.` / `Įrodymai tampa karjera.` | `Your work becomes proof.` / `Proof becomes your career.` |
| H2 | `Darbo rinkos` / `operacinė sistema.` | `The operating system` / `for real work.` |
| H3 | `Dirbk. Fiksuok. Įrodyk.` / `CV, kuriuo galima patikėti.` | `Work it. Log it. Prove it.` / `A CV that can be trusted.` |
| H4 | `Kiekviena darbo diena` / `stato tavo patikrintą CV.` | `Every day you work` / `builds your verified CV.` |
| H5 | `Ne pažadai.` / `Įrodymai.` | `Not promises.` / `Evidence.` |
| Sub | `Darbo žurnalas, įgūdžių įrodymai ir patikrintas CV vienoje sistemoje — darbuotojams ir įmonėms visoje Europoje.` | `A work journal, evidence-backed skills and a verified CV in one system — for workers and companies across Europe.` |

`/for-companies`: LT `Samdykite pagal įrodymus, ne pažadus.` / EN
`Hire on evidence, not promises.`; alt LT `Matykite, ką žmogus tikrai
dirbo.` / EN `See what a person has actually done.`

RU versions are produced at implementation time to full parity (the
repo ships LT/EN/RU on public pages) and reviewed as adapted copy, not
literal translation.

## 4. No-fake-data rules as implementable assertions

Restated from the presentation model §9 in guard-enforceable form:

1. **Numbers**: a numeral may render on a public marketing route only if
   it is (a) a sourced public statistic with visible provenance rendered
   through `components/marketing/labour-market-evidence.tsx`, (b) a real
   DB aggregate from a public-safe RPC rendered only while `> 0`
   (future, owner-gated — per decision 4 clearly labeled as a real
   count), or (c) inside a designed worked-example frame labelled at
   ≥12px in the page language. Guard: §2.4 item 2.
2. **Motion**: no animation that fabricates change. `setInterval`/cycled
   numeric values, staged match feeds and fake deltas are forbidden;
   motion may depict the real product process (diorama loop, marquee of
   true capabilities) or be pure decoration (`ConstellationBg`). All
   loops respect `prefers-reduced-motion`. Guard: §2.4 items 1 and 3.
3. **Screenshots**: only real product states (real/consented account or
   honest framed empty state). No invented user names presented as real.
   Enforced by PR review checklist + capture-session protocol (§2.3).
4. **Liveness claims**: MFA, offline mode, store listings and anything
   not shipped never appears as live. Guard: §2.4 item 4.
5. **Regressions**: the retired components and copy keys must not
   reappear — the no-fake-counter guard pins their absence permanently.
   All existing honesty guards (§2.4 item 5) stay green in every slice.

## 5. Explicit non-edit note

This PR is docs-only. It does not edit
`apps/web/app/[locale]/(marketing)/page.tsx`, any component, catalog,
guard or asset. Implementation of everything in §1–§4 is a **separate,
owner-triggered PR train** (§2.5). Until the owner green-lights it, the
landing, `/for-companies`, `/for-agencies`, `/pricing` and all public
marketing surfaces stay exactly as on `main`.

## 6. Prerequisites before the implementation PR train starts

1. Owner green-light referencing this plan (the command in §7).
2. Screenshot capture session done (§2.3) — or PR-A ships in its
   reduced form (capability strip + ticker + headline) first.
3. Headline choice from §3 (default H1 if the owner does not object in
   the green-light message).

## 7. The future landing implementation PR command

To be run by an agent only after the owner explicitly green-lights
implementation:

> Execute the owner-approved landing visual replacement for
> LabourMarket.ai at `C:\Users\Mano\Documents\labourmarketai` per
> `docs/marketing/landing-visual-replacement-implementation-plan-v1.md`
> (this plan) and its sources
> `docs/marketing/landing-visual-replacement-presentation-v1.md` (#670)
> and `docs/marketing/landing-replacement-model-v1.md` (#657). Work in an
> isolated worktree off `origin/main`; ship slice **PR-A** from plan §2.5
> (hero passport diorama if screenshots exist — otherwise the reduced
> PR-A — capability strip replacing `MarketCounters`, capability ticker
> replacing fake `ticker.event.*` items, headline swap to the owner's §3
> pick, `counters.*`/`ticker.event.*` purge from
> `apps/web/content/placeholders.ts`, rewritten
> `homepage-counter-honesty` guard plus the new `landing-no-fake-counter`
> guard from plan §2.4), keeping LT/EN/RU parity and all honesty guards
> green (`pnpm typecheck && pnpm lint && pnpm -C apps/web test && pnpm
> placeholders:check && pnpm check:primary-route-smoke &&
> pnpm check:i18n-debt`); then open the PR, wait for CI, squash-merge if
> green, and queue PR-B/C/D as follow-ups, one slice per PR, each
> individually reviewable. No fabricated numbers, activity, profiles,
> testimonials or logos anywhere; every §4 assertion must hold in every
> slice.

---

Sources: `docs/marketing/landing-visual-replacement-presentation-v1.md`
(#670); `docs/marketing/landing-replacement-model-v1.md` (#657); landing
code read-only at `origin/main` @ a98df5e (`page.tsx`,
`market-counters.tsx`, `live-map.tsx`, `live-ticker.tsx`,
`player-card-showcase.tsx`, `draft-board.tsx`, `market-pulse.tsx`,
`labour-market-evidence.tsx`, `content/placeholders.ts`, for-companies /
for-agencies / pricing pages, `messages/{lt,en,ru}.json` +
`messages/{lt,en,ru}/labour-market.json`);
`docs/mobile/mobile-store-assets-owner-pack-v1.md` §4.
