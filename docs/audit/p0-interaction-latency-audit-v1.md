# P0 Interaction Latency Audit & Repair — v1 (2026-07-14)

Owner goal: pašalinti juntamą delsą po vartotojo paspaudimų — produktas turi
iškart vizualiai reaguoti į kiekvieną paspaudimą.

Measurement setup: local **production build** (`next build` + `next start`),
real Supabase project over the network, Playwright-driven Chromium,
authenticated via a locally minted owner session (`e2e-mint-session`).
"Warm" = second pass against a warmed server. All numbers in ms.

## 1. Checked actions

| Action | Surface | Feedback before | Feedback after |
|---|---|---|---|
| Public home load `/lt` | marketing | fast (static) | unchanged |
| Marketing CTA → login | marketing | fast | unchanged |
| Login form submit | auth | has loading state (`Button loading`) | unchanged |
| Dashboard direct load | authed | 2.3–2.7 s blank wait | 0.9–1.3 s |
| Dashboard tab clicks (žemėlapis / žurnalas / žinutės / planavimas) | authed | 0.7–2.1 s frozen screen + tiny nav spinner | **57–107 ms** full-screen skeleton |
| Logo → dashboard | authed | fast (client cache) | unchanged |
| Mobile dashboard load | authed 390px | 1.7 s blank | 0.7 s |
| Mobile bottom-nav | authed 390px | frozen + nav spinner | skeleton (same boundary) |
| Role switcher | authed | has pending state | unchanged |
| Onboarding load | auth flow | no boundary | skeleton added |

## 2. Baseline measurements (before, warm prod build)

| Flow | click→URL | click→content | TTFB |
|---|---|---|---|
| public:home /lt | — | 584 | 37 |
| public:login | — | 238 | 19 |
| public:CTA→login | 203 | 274 | — |
| authed:dashboard direct | — | 2 729 | **2 279** |
| authed:tab→market_map | 1 348 | 1 424 | — |
| authed:tab→journal | 1 995 | 2 072 | — |
| authed:tab→communication | 760 | 790 | — |
| authed:tab→planning | 687 | 722 | — |
| authed-mobile:dashboard | — | 1 732 | 1 341 |

## 3. Root causes found

1. **`auth.getUser()` round-trip explosion.** 181 call sites; every lib
   helper creates its own Supabase server client and calls `getUser()` — a
   network round-trip to Supabase Auth. One dashboard SSR issued ~10+
   identical validations (middleware + layout + 6 spine helpers + page +
   hub adapter).
2. **Dashboard overview waterfall.** `app/[locale]/dashboard/page.tsx`
   awaited ~8 independent reads sequentially (profile, company, invitations,
   counts × 4, summary), several of which duplicated reads the layout's
   request-cached spine had already done.
3. **Zero `loading.tsx` in the whole app** (87 pages). Every server-rendered
   navigation held the old screen frozen for the full server render; the only
   feedback was the small `NavLinkPending` spinner on the nav link itself.
4. **Middleware did a per-navigation `profiles` read** (onboarded_at) that
   the dashboard layout repeats anyway — one wasted Supabase round-trip on
   every authed dashboard navigation.
5. Journal page has its own ~12-read waterfall (P1, not restructured here).
6. Public/marketing surface was already fast (static, 19–37 ms TTFB);
   login/role-switcher/bottom-nav already had honest pending affordances.

## 4. Fix list by priority

**P0 (implemented in this PR)**
- Request-scoped `createClient` (React `cache()`) + per-request
  `auth.getUser()` memo — one auth validation per request, app-wide.
- Dashboard overview: one parallel `Promise.all` batch; counts reused from
  the request-cached spine (no duplicate count queries); org-branch RPC +
  demand read-back parallelized.
- `getUnreadConversationIds` / `listMyPendingWorkerInvitations`
  request-cached (layout spine + page share one read); invitation reads
  (company + agency) parallelized.
- `loading.tsx` skeletons for the `/dashboard` tree and `/onboarding` —
  instant full-screen response on every in-app navigation.
- Middleware: dropped the duplicate `profiles` read; auth gate + session
  refresh kept; onboarding bounce stays in the dashboard layout.

**P1 (recommended next, not in this PR)**
- Journal page waterfall: batch the ~8 `worker_id`-dependent reads.
- Same treatment for profile / market-map / planning page waterfalls.
- Consider a per-section `loading.tsx` skeleton tuned to each section's
  layout (current one is a generic dashboard-rhythm skeleton).
- `getOwnCompany` request-caching (needs a mutation-safe design first —
  `saveCompanySetup` reads it pre-mutation in the same request).

**P2**
- Bundle: `First Load JS` is healthy (103–121 kB), leaflet/framer-motion are
  route-scoped; no action needed now.
- SQL-side aggregate for unread counts (bounded 500-row scan today).

## 5. After measurements (warm prod build, same flows)

| Flow | click→URL | click→feedback | click→real content | TTFB |
|---|---|---|---|---|
| authed:dashboard direct | — | — | 1 264 | **864** (−62 %) |
| authed:tab→market_map | 75 | **107** | 1 477 | — |
| authed:tab→journal | 55 | **86** | 1 984 | — |
| authed:tab→communication | 65 | **80** | 922 | — |
| authed:tab→planning | 44 | **57** | 906 | — |
| authed-mobile:dashboard | — | — | 737 | **460** (−66 %) |
| public:home /lt | — | — | 606 | 39 (unchanged) |

Click-to-feedback on every dashboard navigation: **0.7–2.1 s frozen screen →
under 110 ms skeleton**. Dashboard TTFB −62 % desktop, −66 % mobile.
Real-content times for tabs are bounded by each page's own reads (P1).

## 6. Validation

- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm test` — 9 424/9 424 passed (587 files); 5 source-shape guard tests
  updated to the equivalent new truths (same helpers, parallel batch shape;
  middleware test now locks in "no profiles read in middleware")
- `check:primary-route-smoke` — 45 routes, 0 blocking findings
- e2e (against fixed prod server): auth.spec + primary-route-live-smoke —
  17 passed; visual proof: skeleton during navigation, mobile + desktop
  dashboards render with real data.

## 7. Remaining risks

- Request-scoped `getUser` memo: any FUTURE server flow that mutates the
  auth session and then reads `getUser()` in the same request would see the
  pre-mutation user. Current flows (callback exchange, logout) never do —
  guarded by review, documented in `lib/supabase/server.ts`.
- Request-cached unread/invitation helpers: a same-request re-render after
  a mutation would show the pre-mutation count (identical semantics to the
  already-request-cached `getSpineCounts`); next navigation is fresh.
- **Pre-existing, NOT from this PR:** 3 e2e tests in
  `market-map-readiness-authenticated.spec.ts` fail because the readiness
  section moved inside a collapsed-by-default `<details data-testid="market-map-advanced">`
  (progressive disclosure) and the spec was never updated to open it.

## 8. Owner-review decisions

- None required for this PR (no schema, no env, no copy, no outbound).
- P1 wave (journal/profile page waterfalls, per-section skeletons) — start
  only with owner OK per the handoff rule.
