# Authenticated Navigation Performance — root-cause audit v2 (Wagon 2)

Audited 2026-07-16 against main after #766 (fresh code, not prior-session claims).
All paths `apps/web/`.

## Already correct — DO NOT REGRESS
- `lib/supabase/server.ts:23` — `createClient` is `cache()`-wrapped AND memoizes
  `auth.getUser()` (`server.ts:59-65`) → exactly **1** getUser network call per
  server render (middleware adds 1 more on its own client = 2 per nav total).
- `lib/notifications/spine.ts:35` — `getSpineCounts` is `cache()`-wrapped, shared
  by layout + page, 8 internal queries in one `Promise.all`. Correct.
- Middleware (`middleware.ts:110`) — 1 supabase round-trip, cookie-gated, NO
  profiles read (deliberately removed, see `middleware.ts:122-128`).
- Leaflet is NOT in the dashboard bundle (`premium-hub-market-map.tsx` is inline
  SVG; real map dynamic-imports inside effect in `market-map-live.tsx`).
- `dashboard/loading.tsx` route-transition skeleton exists.
- `getOwnCompany` (`lib/company/company-setup.ts:147`) is NOT cached — REQUIRED
  constraint, keep it uncached.

## Findings (avoidable per-navigation cost)
| P | Finding | Evidence | Fix |
|---|---|---|---|
| High | 3× independent `profiles` SELECT per nav | `layout.tsx:55-60`, `page.tsx:155-160`, `premium-hub-data.ts:144` | one `cache()`-wrapped `getSessionProfile()` reader consumed by all three |
| High | Hub intelligence blocks TTFB; comment claims streaming but there is NO `<Suspense>` | `page.tsx:69,84` async components rendered inline | wrap `HubWorkerIntelligence`/`HubCompanyIntelligence` in `<Suspense>` with skeleton fallbacks |
| Med | `getServiceRequestsNewCounts` runs 2× (uncached; also called inside `getSpineCounts`) | `spine.ts:47` + `page.tsx:164`; def `service-requests.ts:310` | `cache()`-wrap it |
| Med | 2–3× `companies` SELECT per nav (`getOwnCompany` at each site) | `page.tsx:161`, `premium-hub-data.ts:224`, `layout.tsx:130` (conditional) | keep uncached; thread the page's single read into the hub view model |
| Med | `getDashboardCardPreferences` is a serial round-trip after the main batch | `page.tsx:186`; def `preferences.ts:37` | overlap with hubVmPromise/translations |
| Low | Worker branch 3-step serial chain (workers → 3 reads → getWorkerCard) | `page.tsx:558→566→598` | candidate for one RPC later; not this wagon |
| Low | 7 full i18n catalogs parsed per request, no namespace split | `lib/i18n/request.ts:23-31` | out of wagon scope; note only |

## Wagon 2 scope decision
Implement the High + Med rows (safe, measurable, no data-freshness change:
profiles/name/role do not change mid-request; service-request counts are
request-scoped dedup only). Leave Low rows documented, untouched.

## Measurements (before/after, 2026-07-16)

Setup: production builds (`next build` + `next start`) of main `96fa4a7b`
(:3200) and this branch (:3300), both against the LOCAL Supabase stack with
the dev-fixture worker; Playwright drives warm client-side navigations,
medians of 5 runs. Both servers ran simultaneously for symmetric load.

### Wall-clock (medians of 5, local stack — sub-ms DB RTT compresses gains)
| Metric | before | after | Δ |
|---|---|---|---|
| TTFB /lt/dashboard (responseStart) | 643ms | 593ms | **−8%** |
| dashboard→journal | 829ms | 800ms | −3.5% |
| journal→market-map | 568ms | 636ms | +12% (untouched route) |
| market-map→communication | 531ms | 764ms | +44% (untouched route; AFTER samples 540–941 — highest variance of the set) |
| communication→planning | 549ms | 456ms | −17% |
| planning→network | 673ms | 651ms | −3% |
| network→dashboard | 612ms | 589ms | −4% |

Honest read: run-to-run variance on this machine is ±30%, larger than most
effect sizes; the two "worse" rows are routes THIS WAGON DOES NOT TOUCH and
carry the widest sample spread — noise, not regression. The changed page
(/dashboard) improved on every measure (TTFB −8%, both dashboard-bound
transitions faster). An earlier asymmetric run (only one server up for
BEFORE) showed the opposite skew across ALL routes, confirming environment
noise dominates locally. In production the saved round-trips are worth
~20–50ms each (real network RTT to Supabase), where the structural change
matters more than local wall-clock can resolve.

### Query-count per warm /dashboard navigation (Kong access log, exact)
| Path | before | after | Δ |
|---|---|---|---|
| GET /rest/v1/profiles | **5** | **3** | **−2** (layout + page + hub now share ONE cached read — exactly the two dedups shipped) |
| GET /auth/v1/user | 12 | 12 | 0 (already memoized per render before this wagon) |
| everything else | equal | equal | 0 |

The −2 profiles round-trips per navigation is deterministic (not a median) —
counted from the gateway log over an isolated navigation window on both
builds. Remaining 3 profiles reads come from helpers outside this wagon's
scope (candidates for a later slice).
