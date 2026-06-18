# Labour Market World Map Visual v2 — audit (PR #481)

Date: 2026-06-19 · Branch: `feat/labour-market-world-map-visual-v2`.

## Objective
Turn the safe card-grid atlas (#475) into an original, visually distinctive Labour Market world view — not a card grid, not Google Maps, no fake markers/coordinates.

## What this PR does
- Rewrites `components/app/labour-market-world-map.tsx` rendering into a **map-like canvas**:
  - Desktop: a dark canvas with a subtle grid + **glowing routes** from a central **Profile Hub** to its districts (Skills & Evidence, Availability, Work Needs, Company/Organisation, Teams/Brigades, Trust/Confirmation, Market Pulse), zones positioned radially (a `POS` layout map, applied via CSS template percentages — never geo coordinates). Side panel = legend + summary + profile CTA.
  - Mobile: a **vertical connected map path** (nodes joined by a route line).
- Reuses the real zone model (`buildWorldMapZones`) + #480 accepted-claim union, so zones light up from real profile/skill/evidence/work-need signals. Empty zones stay honest (dimmed + honest state line).
- Reorders `dashboard/market-map/page.tsx`: the **world view is now the first impression**; the Google Maps configuration notice (`MarketMapBase`) is moved **below** the world view as a secondary, future precise-location layer — so it never creates a broken first impression.
- Guard `lib/guards/labour-market-world-map-visual-v2.test.ts` (6): canvas + routes (aria-hidden) + mobile path + radial layout + no fake coords/markers + page order.

## Honesty
Routes are decorative (aria-hidden); every zone has an accessible text label + honest state. No fake markers, no fake coordinates (positions are layout %, not geo), no scores/percentages, no matching. Real signals only; honest empty/concept zones.

## Remaining / future
- Real precise-location points on the Google base (only with verified, consent-gated coordinates) — the secondary layer, owner-gated future.
- Richer per-zone detail/drill-in.

No DB/migration/Supabase/RLS/auth/billing/env. No fake data, no external map/AI, no old LABMA, no living/gyvas/живой, no external copying.