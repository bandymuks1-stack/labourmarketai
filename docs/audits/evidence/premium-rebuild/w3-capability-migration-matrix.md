# W3 — `/dashboard/advanced` CAPABILITY MIGRATION MATRIX

> **Status: INVENTORY COMPLETE, MIGRATION NOT STARTED.**
> This file is step 1 of the W3 method. The route is **not** deleted, and must
> not be deleted until every row below is `MIGRATED` and browser-proven.

## What it is

`app/[locale]/dashboard/advanced/page.tsx` — **916 lines**, composing ~25
components. Introduced as the "card control room" when `/dashboard` became
chat-first: the cards had to go somewhere, and they went to a second page.

That is the parallel dashboard the owner command forbids. It is also, today,
the only place several real capabilities exist — so deleting it first would
delete the product, not the duplication.

## Inbound references (all must be repointed before deletion)

| Where | What |
|---|---|
| `components/app/account-menu.tsx:81` | "Advanced" menu entry — the main way in |
| `components/app/conversation/worker-worklog-flow.tsx:235` | post-worklog CTA |
| `app/[locale]/dashboard/page.tsx:23` | comment only |
| `components/app/dashboard-chrome.tsx:21` | comment; the route is in the `full` chrome group |
| `lib/product-gate/surface-registry.ts:239` | declared "documented module escape hatch" |
| `lib/guards/route-truth-map.test.ts:41` | pinned `REAL_LAUNCH_SURFACE` |

The last two mean deletion is a **guard-visible** change: the surface registry
and route-truth map must be updated in the same commit, which is the safety
property that makes this tractable.

## Target surfaces

The result registry already defines eight result kinds:
`player-card`, `journal`, `calendar`, `market`, `project`, `evidence`,
`reputation`, `invoice`. Most rows below map onto one of these; the ones that do
not are the honest reason W3 is a wave and not a patch.

## The matrix

Classification: `ALREADY` (already in the result surface) · `ABSORB` (must
become a result state) · `CHAT` (should be invoked through conversation and
rendered as a structured result) · `OBSOLETE` (duplicate, removable after
proof) · `DETAIL` (legitimate separate detail route, not a competing dashboard).

| # | Capability | Component(s) | Class | Target | State |
|---|---|---|---|---|---|
| 1 | Premium Hub person card | `PremiumHubScreen`, `premium-hub-person-card` | ABSORB | `player-card` result | TODO |
| 2 | Premium Hub company card | `PremiumHubCompanyCard` | ABSORB | new `organization` result kind | TODO |
| 3 | Premium Hub project card | `PremiumHubProjectCard` | ABSORB | `project` result | TODO |
| 4 | Premium Hub market map | `PremiumHubMarketMap` | **ALREADY** | `market` result (canonical `MarketMap`) | **superseded — verify then drop** |
| 5 | Job recommendations | `JobRecommendationsCard` | ABSORB | `market` result / new `opportunities` | TODO |
| 6 | Worker invitations | `WorkerInvitationsCard` | ABSORB | `calendar` or new `invitations` | TODO |
| 7 | Demand request create | `DemandRequestButton` | CHAT | already an action id — render result | TODO |
| 8 | Demand requests readback | `DemandRequestsReadback` | ABSORB | `project` result | TODO |
| 9 | Service requests next-action | inline + `listOwnCustomerRequests` | ABSORB | work context panel | TODO |
| 10 | Outgoing requests next-action | inline | ABSORB | work context panel | TODO |
| 11 | Booking responses next-action | inline | ABSORB | `calendar` result | TODO |
| 12 | Bookings next-action | inline | ABSORB | `calendar` result | TODO |
| 13 | Dashboard next action | `DashboardNextAction` | **ALREADY** | Context Panel work context | verify then drop |
| 14 | Chain actions | `DashboardChainActions` | CHAT | conversation chips | TODO |
| 15 | Current space header | `CurrentSpaceHeader` | **ALREADY** | workspace header | verify then drop |
| 16 | Identity actions | `IdentityActions` | ABSORB | account menu / profile result | TODO |
| 17 | Module grid | `DashboardModuleGrid` | **OBSOLETE** | this IS the second dashboard's navigation | delete with the route |
| 18 | "More" section | `DashboardMoreSection` | **OBSOLETE** | same | delete with the route |
| 19 | Status strip | `DashboardStatusStrip` | ABSORB | active-context status summary | TODO |
| 20 | Command finder | `CommandFinder` | CHAT | the conversation composer already is this | TODO — likely OBSOLETE |
| 21 | My zone | `MyZone` | ABSORB | `player-card` result | TODO |
| 22 | Privacy status | `PrivacyStatusCard` | DETAIL | `/dashboard/privacy` exists | repoint |
| 23 | Telemetry view | `TelemetryView` | DETAIL | admin surface | repoint |
| 24 | Trust insight | `TrustInsightCard` | ABSORB | `reputation` result (currently gated `unverified`) | TODO — blocked on reputation data |
| 25 | Demand intake section | inline, `demand-intake-section` | CHAT | structured demand flow | TODO |
| 26 | Control-room view model | `buildControlRoomViewModel` | — | server model, reusable by the result surface | keep |
| 27 | Card preferences | `getDashboardCardPreferences` | **OBSOLETE?** | preferences for a card grid that will not exist | decide during migration |

**Counts: 27 capabilities — 4 ALREADY · 15 ABSORB · 4 CHAT · 3 OBSOLETE ·
2 DETAIL. Zero migrated so far.**

## Honest reading of this matrix

`/dashboard/advanced` cannot be removed in one step, and any claim that it can
is a claim to delete 15 real capabilities. The route stays until each ABSORB row
has a result state with real data, real permissions and the full
idle/loading/empty/partial/error/retry set.

Two rows (24 `reputation`, and 2 which needs a new `organization` result kind)
have dependencies outside W3. They are named here rather than discovered halfway
through.

## Blocked-on

- Row 24 depends on the reputation model having real rows; the result registry
  currently marks `reputation` as `dataReadiness: "unverified"` for exactly that
  reason.
- Row 2 needs a new result kind, which is an addition to the registry — cheap,
  but it must not become a second registry.

## Next exact action for W3

```text
1. Implement row 4 first: prove PremiumHubMarketMap is fully superseded by the
   canonical MarketMap in the `market` result, then delete the component.
   It is the lowest-risk row and it validates the migration method.
2. Then rows 13 and 15 (also ALREADY) — verify, then drop.
3. Then the ABSORB rows in dependency order, each with its own browser proof.
4. Delete the route only when every row is MIGRATED or OBSOLETE-proven.
```
