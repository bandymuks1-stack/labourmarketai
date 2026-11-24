# Dashboard consolidation v1

Goal: one canonical authenticated dashboard at **`/dashboard`**, not two. The
premium hub (PR #688 visual + PR #689 real-data wiring) becomes the lead visual
of the existing `/dashboard`, and the separate `/dashboard/hub` product route is
removed. No redirect-based solution; no third dashboard; no rebuilt logic.

## Side-by-side audit

### Old `/dashboard` (overview) — `app/[locale]/dashboard/page.tsx`
A role-branched, action-first control room, **heavily guarded** (~41 guard files
pin its exact source order, component mounts, testids, telemetry funnel events,
and the `?notice=` role-gate contract). Renders:
- **Launch-critical dynamic behavior (kept):** `?notice=needs_*_role` banner
  (other routes redirect into it via `lib/auth/require-role.ts`); telemetry
  (`dashboardViewed`, `firstActionCardViewed`); `DashboardNextAction`;
  `decideTopSlot` top-slot; `WorkCard` ("Mano darbo kortelė"); `MyZone`;
  count-gated next-action cards (service requests, outgoing, bookings, booking
  responses) with seen-tracking; `DemandRequestButton` + `DemandRequestsReadback`
  (org); inline `WorkerInvitationsCard` accept/decline.
- **Launchers (kept, already premium-styled):** `marketplaceAccess`,
  `DashboardChainActions`, `IdentityActions`, `CurrentSpaceHeader`,
  `CommandFinder`.

### New `/dashboard/hub` (premium hub) — REMOVED
The 4-block premium visual (`Asmens` / `Įmonės` / `Rinkos žemėlapis` / `Projekto`
kortelė) backed by the real RLS-scoped `getPremiumHubViewModel()` read model.
It was a `GATED_PREVIEW` route with no nav entry.

### Duplication
- **Two routes** presenting a "dashboard" (`/dashboard` overview vs
  `/dashboard/hub` premium visual) — the core problem.
- **Identity overlap:** the hub's `Asmens kortelė` (identity + skill counts +
  completeness) partially overlaps the worker `WorkCard` (state-aware next
  action + inline editor). They are complementary (snapshot vs. next action),
  not identical.

## What was done

- `app/[locale]/dashboard/page.tsx` now **leads** (both role branches) with
  `<PremiumHubScreen vm={hubVm} embedded />` — the real-data snapshot is the
  canonical visual surface. `embedded` drops the hub's own page title/lead so the
  existing greeting stays the single page heading (no duplicated `<h1>`). The hub
  view model is fetched in parallel with the overview reads (no serial latency).
- **All** the guarded launch-critical actions/telemetry/order below the hub are
  **unchanged** — the overview's action content is preserved in its audited
  order, so nothing launch-critical was dropped.
- `app/[locale]/dashboard/hub/page.tsx` **deleted** (route removed, not aliased,
  no redirect).

## Final decisions

- **Route:** `/dashboard` is the one canonical premium dashboard. `/dashboard/hub`
  no longer exists (404). No compatibility alias was needed.
- **Nav:** unchanged — the existing single **overview** tab (`auth.dashboard.tabs
  .overview` → `/dashboard`) is the one dashboard entry. No second entry, no
  "Centras" added, `/dashboard/hub` was never in nav.
- **Route truth:** `/dashboard` stays `REAL_LAUNCH_SURFACE`. The `dashboard/hub`
  `GATED_PREVIEW` entry was removed from `route-truth-map.test.ts` and from
  `preview-surfaces-unlinked.test.ts`. `hub-real-data-only.test.ts` was repointed
  to `/dashboard/page.tsx` (still enforces: no concept fixtures, reads the real
  view model).
- **Data:** unchanged from #689 — real RLS-scoped reads only, no fixtures, no fake
  counts, honest empty/unavailable states, no migration, no auth/RLS change, no
  map provider.

## Known residual (deliberate, follow-up)

The worker branch shows both the hub `Asmens kortelė` and `WorkCard`. Fully
merging them would require removing `WorkCard`, which ~5 guards pin present and
which carries the state-aware next action + inline availability editor — removing
it here would drop launch-critical behavior and break guards. That careful,
per-component dedup (folding `WorkCard`'s next-action/editor into the hub person
block, then updating each guard deliberately) is the recommended next PR. This
PR delivers the one-route consolidation safely without regressing behavior.
