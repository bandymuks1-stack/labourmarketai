# W3 — `/dashboard/advanced` CAPABILITY MIGRATION MATRIX

> **Status: 2 of 28 rows MIGRATED (rows 4 and 5). Rows 13 and 15 VERIFIED —
> no independent drop exists; they are removed by the route deletion.**
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
| 4 | Premium Hub market map | `PremiumHubMarketMap` | **ALREADY** | door to the real map | **MIGRATED 2026-07-31** — fake SVG removed, 159→72 lines, browser-proven |
| 5 | Job recommendations | `JobRecommendationsCard` | ABSORB | new `opportunities` result | **MIGRATED 2026-07-31** — result built, card deleted, browser-proven |
| 6 | Worker invitations | `WorkerInvitationsCard` | ABSORB | `calendar` or new `invitations` | TODO |
| 7 | Demand request create | `DemandRequestButton` | CHAT | already an action id — render result | TODO |
| 8 | Demand requests readback | `DemandRequestsReadback` | ABSORB | `project` result | TODO |
| 9 | Service requests next-action | inline + `listOwnCustomerRequests` | ABSORB | work context panel | TODO |
| 10 | Outgoing requests next-action | inline | ABSORB | work context panel | TODO |
| 11 | Booking responses next-action | inline | ABSORB | `calendar` result | TODO |
| 12 | Bookings next-action | inline | ABSORB | `calendar` result | TODO |
| 13 | Dashboard next action | `DashboardNextAction` | **ALREADY** | Context Panel work context | **VERIFIED 2026-07-31** — dies with the route, see below |
| 14 | Chain actions | `DashboardChainActions` | CHAT | conversation chips | TODO |
| 15 | Current space header | `CurrentSpaceHeader` | **ALREADY** | workspace header | **VERIFIED 2026-07-31** — dies with the route, see below |
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
| 28 | **NEW — found 2026-07-31** | `market-map-base` → `market-map-live` | **OBSOLETE?** | the canonical `MarketMap` | TODO — see below |

**Counts: 28 capabilities — 4 ALREADY · 15 ABSORB · 4 CHAT · 4 OBSOLETE ·
2 DETAIL. 2 MIGRATED (rows 4 and 5); 14 ABSORB rows remain.**

## Row 4 — DONE, and what it proved about the method

`PremiumHubMarketMap` drew a 400×260 `<svg>` "network" of dots. Its own comment
admitted the positions were decorative and not geographic: the number of dots
was real, every position was invented. A picture of a map is not a map — the
canonical doctrine forbids "an SVG illustration standing in for a map", and this
is what the owner command means by *fiktyvūs grafikai*.

It was **not** replaced with a second `<MarketMap>`. This route is leaving;
mounting a real Leaflet instance inside it would add weight to a dying surface.
Everything real survives — the three signal counts, the honest empty state, and
the door to `/dashboard/market-map`. **159 → 72 lines**, and two dead i18n keys
(`map.activePoint`, `map.points`) removed from 5 locales.

Proven in the browser (`tests/e2e/w3-second-dashboard.spec.ts`, 2 scenarios):
the advanced route still renders, the panel still shows its real branch —
whichever of the two the identity lands in — the door still resolves, and the
`viewBox="0 0 400 260"` drawing is gone.

**Row 28, found while writing that proof.** `/dashboard/market-map` does NOT
render the canonical `<MarketMap>`. It renders `market-map-base` →
`market-map-live`, a **second real Leaflet chain**. `market-map.tsx`'s own header
says it was meant to collapse `market-map-live.tsx` into itself; that collapse
never finished. Both are real maps, so no user is misled — but two Leaflet
implementations is one too many and it is now tracked rather than a surprise.

## Rows 13 and 15 — verified, and the verification changed the plan

Both were classified `ALREADY`, and both are: the Context Panel's work context
carries the same next-action content (headline, facts, recommendations with a
chip that dispatches into the conversation), and the workspace header carries
the active space.

What the verification actually established is that **neither can be dropped on
its own.** Each has exactly ONE mount, and it is inside
`/dashboard/advanced`:

```text
DashboardNextAction   → advanced/page.tsx:491        (1 mount)
CurrentSpaceHeader    → advanced/page.tsx:599, :914  (2 mounts, same page)
```

Nothing else imports either. So "verify then drop" was the wrong instruction to
give myself: there is no independent drop to perform. They are removed by the
route deletion, and removing them earlier would only break the route while it
is still the only home for 15 other capabilities.

Noted in passing: `CurrentSpaceHeader` renders **twice on the same page**. Not
worth a standalone fix on a surface being deleted, but it is a fair measure of
how the second dashboard grew.

**This is the difference between row 4 and rows 13/15.** Row 4 was a FAKE — a
drawing pretending to be a map — so it could simply go, and its removal was a
product improvement on its own. Rows 13/15 are real capabilities that already
have a canonical home; their removal is bookkeeping that belongs to the
deletion commit.

### What this means for sequencing

No further row can be MIGRATED without either absorbing an ABSORB row into the
result surface, or deleting the route. The cheap wins are done. The next real
W3 step is an ABSORB row — and the honest smallest one is row 5 (job
recommendations) or row 6 (worker invitations), each of which needs a result
state with real data and the full idle/loading/empty/partial/error/retry set.

## Row 5 — DONE, and what the first ABSORB cost

`JobRecommendationsCard` ("Man tinkantys darbai") had exactly ONE mount, on
`/dashboard/advanced`, and no canonical home anywhere else. That is what makes
it different from rows 13/15: deleting it would have deleted the capability. So
it became the `opportunities` RESULT first, and only then was the card removed —
in the same commit, with the guard rewritten to pin BOTH halves (the card is
gone from the route AND the result renders it). A guard that only checked the
first half would pass just as well if the capability had been thrown away.

**Not a port.** The card could legitimately render NOTHING when the owner-gated
worker-visibility RPC was unapplied. A result the person explicitly asked for
may not do that: silence there reads as "no jobs match you", a claim about data
that cannot exist yet. So each reason for having no rows became its own state —
`unavailable` (gated source), `no-worker` (no subject to match), `empty` (the
read worked, nothing matched) — plus `idle`/`loading`/`error`+`retry` and a
`partial` state for when the seen store read degrades and novelty can no longer
be claimed honestly. Every state offers the board, so none is a dead end.

**Two pieces of drift the work exposed rather than accommodated:**

1. `worker.express-interest` was listed under the `market` result, whose route
   is `/dashboard/market-map`. The action's OWN descriptor says
   `advancedRoute: "/dashboard/opportunities"` — action and result disagreed
   about where the capability lives, and `resultForAction` (first match wins)
   resolved it to the map. The action now opens the `opportunities` result,
   whose route is the one the action itself names.
2. `MARKETPLACE_SURFACES` declared four surfaces; with the card gone,
   `dashboard_recommendations` had no renderer. Rule 4 of
   `canonical-marketplace-use-case.test.ts` caught this on the first full run —
   it is the guard doing exactly its job. The entry was deleted rather than
   kept, and `getNewMarketplaceMatchCount` (which renders nothing) now passes
   NO surface instead of borrowing a render surface's name.

Proven in the browser at 1440 and 375 (`tests/e2e/w3-second-dashboard.spec.ts`,
3 new scenarios, all 5 in the file green): the result renders real rows with the
§19 basis, the advanced route still works without the card, and there is no
horizontal overflow on a phone. Evidence:
`w3/row5-opportunities-result-1440.png`, `w3/row5-opportunities-result-375.png`.

One harness defect was produced and fixed while writing the proof — a state
count read before the client-side read settled. That is the fourth of its kind
in this programme and, again, not a product defect.

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
1. DONE — row 4 (the fake map removed, browser-proven).
2. DONE — rows 13 and 15 VERIFIED. No independent drop exists; they are
   removed by the route deletion. See the section above.
3. DONE — row 5 (job recommendations) is the `opportunities` result; the card
   is deleted and both halves are guard-pinned. See the section above.
4. NEXT — row 6 (worker invitations), the next smallest ABSORB. It is heavier
   than row 5 in one specific way: it carries a WRITE (accept-invitation), so
   the result needs the outcome states the read-only result did not.
5. Row 28 — collapse market-map-live into the canonical MarketMap, finishing
   the collapse market-map.tsx's own header already describes.
6. Then the remaining 14 ABSORB rows in dependency order.
7. Delete /dashboard/advanced only when every row is MIGRATED or
   OBSOLETE-proven, updating surface-registry.ts and route-truth-map.test.ts in
   the same commit.
```
