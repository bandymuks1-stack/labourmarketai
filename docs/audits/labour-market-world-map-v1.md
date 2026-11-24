# Labour Market World Map v1 — audit

Date: 2026-06-18 - Branch: `feat/labour-market-world-map-v1`. Read-then-build audit
for the stylized labour-market atlas added to the market-map route.

## Current market-map route / component map
- Route: `app/[locale]/dashboard/market-map/page.tsx` (auth-gated; redirects to login).
  Renders, in order:
  1. `FeatureNote` (feature note)
  2. `MarketMapBase` (real Google Maps base, config-gated; honest fallback) — kept
  3. **`LabourMarketWorldMap`** (NEW — this PR) — the stylized atlas
  4. `MarketMapShell` (signal board: my-signals + demand read layer + atlas-layer taxonomy) — kept
  5. `MarketMapOwnerReadiness` (availability + capability signals) — kept
  6. `MarketMapCapture` (add/manage own location signals) — kept
- Data libs (all RLS-scoped, owner-only, country/region level, no coordinates):
  `lib/market-map/owner-readiness.ts` (availability, capabilities),
  `lib/market-map/signals.ts` (normalized own signals),
  `lib/demand/demand-location.ts` (own demand summary/board).

## What real data exists today (frontend-reachable, owner-scoped)
- Profile signal + current country (`getOwnMarketSignals` profile_location; `getOwnAvailability.currentCountry`).
- Worker existence (`getOwnAvailability.hasWorker`).
- Skills with honest status: `confirmed` (real `worker_skills.verified`), `suggested` (real journal evidence), `self_declared` (`getOwnCapabilities`).
- Availability state (available/busy/unavailable/unknown) + preferred countries.
- Work-need / demand signals count (`getOwnDemandLocationSummary.total`, draft/review only).
- Company + project signals (`company_location`, `project_location`).

## What is UI / concept state only (no real frontend data yet)
- Teams / Brigades — always a concept zone ("not enough data yet"); no team data is surfaced to the frontend.
- Market Pulse "possible fit signals" — derived from presence of real signals only; NEVER a percentage or guaranteed match.
- Company zone is "concept/empty" until a real company_location signal exists.
- Cross-user aggregation, exact coordinates, real map markers — NOT in this PR (future owner-gated layer).

## What is implemented in this PR
- `lib/work-market/world-map.ts` — pure `buildWorldMapZones(input)` → 8 zones (profileHub, skillsEvidence, availability, workNeeds, teams, company, marketPulse, trust) with signal status (active/primary/supported/attention/concept) + honest dataState (real/empty/concept) + real metric or null. Deterministic, no DB.
- `components/app/labour-market-world-map.tsx` — server component: fetches the real owner signals, builds the zones, renders a stylized dark atlas (subtle grid + decorative aria-hidden glowing route SVG) with zone cards (icon, name, explanatory hint, signal dot, real-or-honest state line, concept/empty tag, CTA to a real route), a signal legend, and a side summary with a real "X of 8 zones have real signals" count. Responsive: desktop atlas + side panel, mobile stacked.
- i18n `worldMap` namespace in en/lt/ru (zones, states, legend, summary).
- `lib/work-market/world-map.test.ts` — 23 honesty + shape assertions.
- Mounted on the existing market-map route (centerpiece above the signal shell). No route added.

## What needs backend / DB later (not in this PR)
- Real teams / brigades data model + frontend reader.
- Cross-user, consent-aggregated market pulse (privileged, owner-gated source with k-anonymity).
- Confirmed coordinates → real map points (only with verified geocode + visibility), to plot zones/signals on the Google base.
- Richer company / organisation + project signals.
NONE of these are faked here; they appear as honest concept/empty states until real data + (owner-approved) schema exist.

## Fake-data prevention checklist
- [x] No fake workers / companies / demand — zones read only the caller's real RLS-scoped signals.
- [x] No fake coordinates / map markers — atlas is zone cards; route SVG is decorative + aria-hidden; no marker API.
- [x] No fake scores / percentages — `metric` is a real count or null; no "%" anywhere; guard asserts none.
- [x] No fake verified badges — trust/skills "confirmed" comes only from real `worker_skills.verified`; otherwise self-declared.
- [x] No guaranteed matching — market pulse uses "possible fit signals / needs more data"; copy states no fit is guaranteed.
- [x] Honest empty states — attention/concept states with real next-action CTAs to existing routes.
- [x] No old LABMA naming; no "living / gyvas / живой" wording (guard-asserted).
- [x] No external product copying — original Labourmarket.ai zone model + DESIGN.md tokens.
- [x] No DB/migration/Supabase/RLS/auth/billing/env changes.