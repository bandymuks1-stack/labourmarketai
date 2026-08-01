# W3 — `/dashboard/advanced` CAPABILITY MIGRATION MATRIX

> **Status: 4 of 28 rows MIGRATED (rows 1, 4, 5 and 6). Rows 13 and 15 VERIFIED —
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
| `components/app/account-menu.tsx:81` | "Advanced" menu entry — admin-only escape hatch |
| ~~`worker-worklog-flow.tsx:235`~~ | **FIXED 2026-08-01** — the no-context CTA now opens `/dashboard/start`; ratchet guard `w3-return-to-workspace.test.ts` blocks new live doors |
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
| 1 | Premium Hub person card | `WorkerPlayerCard` (was `premium-hub-person-card` ×2 + a chat-thread embed) | ABSORB | `player-card` result | **ABSORBED 2026-07-31** — renderers 3→1, person mounts 2→0, production LOC net −47 (#942) |
| 2 | Premium Hub company card | `PremiumHubCompanyCard` | ABSORB | new `organization` result kind | TODO |
| 3 | Premium Hub project card | `PremiumHubProjectCard` | ABSORB | `project` result | TODO |
| 4 | Premium Hub market map | `PremiumHubMarketMap` | **ALREADY** | door to the real map | **MIGRATED 2026-07-31** — fake SVG removed, 159→72 lines, browser-proven |
| 5 | Job recommendations | `JobRecommendationsCard` + the chat thread's `EmployerMatchCard` | ABSORB | `opportunities` result | **ABSORBED + CONSOLIDATED 2026-07-31** — renderers 2→1, action surfaces 2→1, production LOC net −103 (#932, #934) |
| 6 | Worker invitations | `WorkerInvitations` (was `WorkerInvitationsCard` ×2 mounts) | ABSORB | Context Panel work context | **ABSORBED 2026-07-31** — card deleted, mounts 2→0, no result kind, browser-proven with the REAL accept RPC |
| 7 | Demand request create | `DemandRequestButton` | CHAT | one canonical intake presentation | **CONSOLIDATED 2026-08-01** — the FULL wizard moved to `/dashboard/company#demand-intake`; `DemandDraftForm`'s company mount absorbed by the wizard's save-draft leg; chat stays the thin intake; 5 stale `/dashboard#demand-intake` doors repaired; browser-proven (9/9 e2e ×2 runs) |
| 8 | Demand requests readback | `DemandRequestsReadback` | ABSORB | one canonical readback | **CONSOLIDATED 2026-08-01** — the ONE owner readback now on `/dashboard/company`, employer-kind-scoped (buyer rows stay in the buyer room); buyer + scouting readbacks retained as genuinely distinct actors/purposes; advanced mount removed |
| 9 | Service requests next-action | inline + `listOwnCustomerRequests` | ABSORB | work context panel | TODO |
| 10 | Outgoing requests next-action | inline | ABSORB | work context panel | TODO |
| 11 | Booking responses next-action | inline `<Link>` + count badge | **ALREADY** | the spine (bell + chips) already presents it; capability lives on `/dashboard/bookings` | **CONFIRMED 2026-08-01** — browser-proven with seeded real bookings, see below |
| 12 | Bookings next-action | inline `<Link>` + count badge | **ALREADY** | same | **CONFIRMED 2026-08-01** — same proof |
| 13 | Dashboard next action | `DashboardNextAction` | **ALREADY** | Context Panel work context | **VERIFIED 2026-07-31** — dies with the route, see below |
| 14 | Chain actions | `DashboardChainActions` | **ALREADY** | destinations survive layout/chat-level | **CONFIRMED 2026-08-01** — see the rows 19/14 audit |
| 15 | Current space header | `CurrentSpaceHeader` | **ALREADY** | workspace header | **VERIFIED 2026-07-31** — dies with the route, see below |
| 16 | Identity actions | `IdentityActions` | **ALREADY** | every destination keeps a LAYOUT-mounted door | **CONFIRMED 2026-08-01** — per-role browser pass, see the row 16 audit |
| 17 | Module grid | `DashboardModuleGrid` | **OBSOLETE** | this IS the second dashboard's navigation | delete with the route |
| 18 | "More" section | `DashboardMoreSection` | **OBSOLETE** | same | delete with the route |
| 19 | Status strip | `DashboardStatusStrip` | **ALREADY** | the spine IS the bell; extra doors survive layout-level | **CONFIRMED 2026-08-01** — see the rows 19/14 audit |
| 20 | Command finder | `CommandFinder` | CHAT | the conversation composer already is this | TODO — likely OBSOLETE |
| 21 | My zone | `MyZone` | **ALREADY / OBSOLETE** | readiness → the player-card result's work editor (richer 5-dim model); explainer dies with the route | **CONFIRMED 2026-08-01** — see the row 21 audit |
| 22 | Privacy status | `PrivacyStatusCard` | DETAIL | `/dashboard/privacy` exists | repoint |
| 23 | Telemetry view | `TelemetryView` | DETAIL | admin surface | repoint |
| 24 | Trust insight | `TrustInsightCard` | ABSORB | `reputation` result (gated `unverified`) | **BLOCKED** — missing data source documented 2026-08-01, see the row 24 note |
| 25 | Demand intake section | inline, `demand-intake-section` | CHAT | the advanced host of row 7 | **RESOLVED 2026-08-01** — died with row 7's move; the advanced page carries no demand surface (guard-pinned) |
| 26 | Control-room view model | `buildControlRoomViewModel` | — | server model, reusable by the result surface | keep |
| 27 | Card preferences | `getDashboardCardPreferences` | **OBSOLETE?** | preferences for a card grid that will not exist | decide during migration |
| 28 | **NEW — found 2026-07-31** | `market-map-base` → `market-map-live` | **OBSOLETE?** | the canonical `MarketMap` | TODO — see below |

**Counts: 28 capabilities — 10 ALREADY · 10 ABSORB · 3 CHAT · 4 OBSOLETE ·
2 DETAIL. 4 MIGRATED (rows 1, 4, 5 and 6); rows 11/12, 16, 19, 14 and 21
CONFIRMED 2026-08-01; rows 7/8/25 CONSOLIDATED 2026-08-01 (the employer
package — one wizard on `/dashboard/company`, one owner readback, zero
advanced demand mounts). 4 ABSORB rows remain: 2, 3, 9, 10 — plus row 24,
BLOCKED on data and transferred to W6 by owner ruling (it does not block W3
closure).**

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

## Migrated rows — the per-row record

One row per absorbed capability, with where it was, where it now canonically
lives, and what was actually proven in a browser. A row may not be marked
`ABSORBED` on anything less.

| Field | Row 4 | Row 5 |
|---|---|---|
| Capability | Premium Hub market map | Job recommendations ("Man tinkantys darbai") |
| Previous location | `PremiumHubMarketMap` in `/dashboard/advanced` | `JobRecommendationsCard` in `/dashboard/advanced` (1 mount) |
| New canonical location | the real `/dashboard/market-map` (the panel keeps only the door) | `opportunities` RESULT in the Context Panel (`?result=opportunities`); full screen stays `/dashboard/opportunities` |
| Status | **OBSOLETE** (the drawing) + door retained | **ABSORBED + CONSOLIDATED** |
| Browser proof | `w3-second-dashboard.spec.ts` — 2 scenarios | same file — **10 scenarios** |
| Desktop proof | `row4-market-panel-1440.png`, `row4-real-map-1440.png` | `row5-opportunities-result-1440.png`, `row5-opportunities-error-1440.png` |
| Mobile proof | not applicable (panel unchanged) | `row5-opportunities-result-375.png` — 375px, no horizontal overflow, 44px tap target, panel is one full-width surface with a working close |
| Dependent components remaining | none | `OpportunitiesShownMarker`, `WorkerInterestButton`, `loadOpportunitiesResultAction`, the canonical use case — all shared, none forked |
| Old mount safe to remove? | done — 159→72 lines | **done — card deleted, both halves guard-pinned** |

**What "7 scenarios" covers for row 5**: the result renders real rows with the
§19 basis; the card is gone from `/dashboard/advanced` and that route still
works; 375px has no overflow; close / Back / Forward / reload keep the result
honest and never strand it; "open full screen" reaches `/dashboard/opportunities`
and provably NOT `/dashboard/advanced`; loading announces itself (`aria-busy`),
a failed read renders the error state with a working retry and never an
emptiness; the phone panel is one clear surface, not a squeezed desktop column.
The loading and error states are forced at the transport level (the server
action is held, then aborted), so what is proven is the real component reacting
to a real failed read — not a mock of itself.

**Honest gap**: the `empty` state is not directly rendered in this environment,
because the local fixture worker HAS matches and fabricating a demand to force
an empty screen is exactly the invented data this platform bans. It is covered
by the state-exclusivity assertion (exactly one honest state may be on screen)
and by the unit guard that pins all four no-rows states as distinct. Recorded
as a gap rather than claimed as proven.

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

## Rows by JOURNEY — the owner's priority order (2026-07-31)

The matrix stays the canonical inventory, but work is now planned by USER
JOURNEY, not row number. A journey is finished when a person can complete it
end to end; a row is only a step inside one.

**P0 — EMPLOYEE JOURNEY.** Login → Onboarding → Player Card → Chat → Result →
Job → Calendar → Journal → Skill evidence → Profile update → Return to chat.

| Row | Capability | Journey step | State |
|---|---|---|---|
| 5 | Job recommendations | Chat → Result → Job | **DONE** |
| 6 | Worker invitations | Onboarding → Chat (joining an employer) | **DONE** |
| 1 | Premium Hub person card | Player Card | **DONE** |
| 21 | My zone | Player Card | **DONE** — CONFIRMED 2026-08-01; readiness ALREADY in the work editor, explainer OBSOLETE |
| 24 | Trust insight | Player Card (reputation) | blocked on real reputation rows |
| 11 | Booking responses | Calendar | **DONE** — CONFIRMED `ALREADY` 2026-08-01, browser-proven |
| 12 | Bookings | Calendar | **DONE** — same; and the `calendar` result shipped as its own slice |
| 16 | Identity actions | Profile update | **DONE** — CONFIRMED `ALREADY` 2026-08-01, per-role browser pass |
| 19 | Status strip | Return to chat (active context) | **DONE** — CONFIRMED `ALREADY` 2026-08-01 |
| 14 | Chain actions | Return to chat | **DONE** — CONFIRMED `ALREADY` 2026-08-01; stale advanced door fixed |
| 28 | Second Leaflet chain | (cross-cutting) map collapse | TODO |

**P1 — EMPLOYER JOURNEY**: rows 7, 8, 25 (demand create / readback / intake).
**P2 — COMPANY JOURNEY**: rows 2, 9, 10 (organization card, service and
outgoing requests).
**P3 — ADMIN JOURNEY**: rows 22, 23 (privacy detail, telemetry) — both DETAIL,
both already have real routes.

Rows 17, 18, 20, 27 are OBSOLETE (the second dashboard's own navigation) and die
with the route. Rows 4, 13, 15 are settled.

## Rows 11 / 12 — THE CALENDAR: the audit, before any code

Next in the P0 Employee Journey, audited first — the order that has now paid
three times.

**These two rows are NOT the shape rows 1, 5 and 6 were, and classifying them
as ABSORB was probably wrong.**

Rows 1/5/6 were capability RENDERERS that existed only on `/dashboard/advanced`
— delete the route and the capability dies, so each had to become a result
first. Rows 11/12 are neither components nor renderers. They are two **inline,
count-gated `<Link>` badges**:

| Row | What it is | Where | Opens |
|---|---|---|---|
| 11 | `bookingResponsesNextAction` — a `<Link>` + count badge, rendered only when `spineCounts.bookingResponsesNew > 0` | `advanced/page.tsx:351` | `/dashboard/bookings` |
| 12 | `bookingsPendingNextAction` — same shape, gated on `spineCounts.pendingIncomingBookings` | `advanced/page.tsx:700` | `/dashboard/bookings` |

**The capability is not in either of them.** Responding to a booking lives on
`/dashboard/bookings`: `BookingRespondButtons`, `BookingManageControls`,
`MarkBookingsSeen` — **one mount each**, a legitimate DETAIL route, not a
competing dashboard. Nothing about it is duplicated on the advanced page.

**The signal already survives the route deletion.** Both counts come from the
notification spine, and the spine's own signals carry real hrefs to the surface
that resolves them — `pending-bookings → /dashboard/bookings` and
`booking-responses → /dashboard/bookings`, both already pinned in
`dashboard-duplicate-removal.test.ts`. The status strip renders those chips on
both branches. So deleting the two link cards removes a **second presentation
of a signal that is already presented**, not a capability.

**Provisional reclassification: rows 11 and 12 are `ALREADY`, like rows 13/15**
— they have no independent drop and are removed by the route deletion. To be
confirmed, not assumed: the confirming check is that the status-strip chips
render for a worker with each signal non-zero, which needs a browser pass with
seeded bookings.

**What IS missing, and is a different piece of work.** `ResultBody` has no
`calendar` case — the kind exists, `dataReadiness: "real"`, `advancedRoute:
/dashboard/planning`, opened by `worker.review-bookings` /
`worker.respond-booking` — so "show me my calendar" falls through to
`result-body-pending` and the route. The chat's `startAgenda` →
`loadContextBrief` already renders the Time Engine as a SENTENCE in the thread;
a `calendar` result would render the same engine as a panel, which is the
"one calculation, two presentations" rule the work context already follows.

That is worth doing — but it is an addition, not rows 11/12, and it must not be
smuggled in under their number. Recorded here so the next slice starts from the
right question: **confirm 11/12 as ALREADY first, then decide the `calendar`
result on its own merits.**

### CONFIRMED 2026-08-01 — `ALREADY`, by browser proof with seeded real bookings

`tests/e2e/w3-calendar-rows-11-12.spec.ts` — REAL rows through the real tables
(`booking_requests`, `booking_requests_seen`), the fixture request
`99999999-…-01`, and the real RLS:

- **Row 12 (worker)**: with ZERO bookings, no badge, no strip chip, no bell
  signal — nothing renders a fake zero. With ONE seeded `proposed` booking the
  badge renders, its count equals the database count, its href is
  `/dashboard/bookings`, and the click lands on the ONE action surface
  (`BookingRespondButtons` on the bookings page). Back / Forward / reload hold.
  Keyboard focus works and the link carries a real accessible name. Desktop
  1440 and 375px mobile proven; screenshots
  `rows11-12-worker-badge-{1440,375}.png`, `rows11-12-bookings-detail-{1440,375}.png`.
- **Row 11 (company)**: with a `seen_at` stamped yesterday and the worker's
  real `accepted` transition today, the responses badge renders count 1 with
  the same href; zero state renders nothing.
- **The signal survives the route deletion**: the BELL (mounted in the
  dashboard LAYOUT, not on the advanced page) presents
  `notification-signal-pending-bookings` with the same count and the same
  href — proven on `/dashboard/bookings`, a page that is not
  `/dashboard/advanced`.
- **RLS**: a fresh authenticated outsider selects `booking_requests` and
  receives zero rows while the seeded booking exists.

**Verdict: rows 11 and 12 are `ALREADY`.** The two link cards are a second
presentation of an already-presented signal. They die with the route; no port,
no new renderer, no new result kind, no new route. The verifying spec is the
guard.

## Row 16 — IDENTITY ACTIONS: the audit, before any code

Audited 2026-08-01, the same read-only pass rows 6, 1 and 11/12 got.

**`IdentityActions` is not a capability renderer either.** One mount
(`advanced/page.tsx:583`, the `focusRole` variant), zero data reads of its own
(props only: `hasCompany`, `companyName`), zero action surfaces — it is a
**link catalogue** to nine existing routes. That makes it the THIRD navigation
presentation on the same page, next to the module grid (row 17, OBSOLETE) and
the command finder entry (row 20).

Where each destination's door survives the route deletion:

| Destination | Surviving doors (all mounted OUTSIDE /dashboard/advanced) |
|---|---|
| `/dashboard/profile` | account menu (dashboard LAYOUT + conversation header); `player-card` result's open-full |
| `/dashboard/opportunities` | `opportunities` result (chat); `journal-job-context`; `profile-hub-overview` |
| `/dashboard/documents` | header-search command registry — public `documents` entry (layout + conversation header) |
| `/dashboard/company` | chat company flows; `current-space-header`; `company-next-actions` |
| `/dashboard/candidates` | command registry `candidates` entry; `setup-role-choice`; company planning page |
| `/dashboard/buyer` | customer-role routing (`lib/config/roles.ts`); `next-action` model |
| `/dashboard/projects` | `project-map`; company/project cards; `project-assignment-manager` |
| `/dashboard/start` (+`/start/company`) | `setup-role-choice`; `company-next-actions`; command registry; canonical redirects |

**CONFIRMED 2026-08-01: row 16 is `ALREADY`** — the per-role browser pass
(`tests/e2e/w3-row16-identity-actions.spec.ts`, 6 scenarios, real fixture
sessions): every worker destination (profile / opportunities / documents /
start) and every company destination (company / candidates / projects /
start) is directly reachable with real permissions and no login bounce; the
account menu (real accessible name, keyboard-reachable) and the header
command finder — both LAYOUT-mounted — resolve profile and documents from the
canonical workspace; Back/Forward/reload hold; 375px renders without sideways
scroll; `/dashboard/buyer` answers a company session sanely (the page's own
contract). Coverage note stated in the spec: agency/customer subsets link
routes already covered by the two proven sessions. The catalogue is NOT
ported; the mount dies with the route.

**Caveat recorded, not smuggled**: `OpportunityDirectionsCard` mounts ONLY on
the advanced page — it belongs to the row 5 family and must be dispositioned
before the route deletion, under its own number.

**Not started beyond the audit.**

## P1 EMPLOYER — rows 7 / 8 / 25: the audit, before any code

Audited 2026-08-01. **These rows are the first since row 1 that are NOT mere
verification — a real consolidation slice is owed**, and the duplicate map
must be on the table before it starts.

**THREE demand write-forms exist today:**

| Form | Where | Weight | Writes |
|---|---|---|---|
| `DemandRequestButton` | `/dashboard/advanced` §demand-intake (row 25) — ONLY mount | **888 lines**: structured v2 advanced sections, estimate builder, drafts, prefill | `submit_demand_request` → `customer_requests` |
| chat inline form (`company.create-demand`) | conversation (`COMPANY_FORMS` → `InlineActionForm`) | light: description / role / location / team size, confirmation-token gated | the SAME canonical chain |
| `DemandDraftForm` | `/dashboard/company` | draft continuation (`getDemandDraft` → "continue here as a real draft demand") | same intake |

**THREE readbacks exist today:** `DemandRequestsReadback` (advanced, ONLY
company/agency mount), the buyer page's own list (customers), and scouting's
`listCompanyDemands` (per-demand scouting entry).

**What the consolidation slice must decide (next window, full context):**

1. The FULL form's canonical home. Its only mount is the dying page; the
   action's own `advancedRoute` is `/dashboard/company`, which already hosts
   the draft-continuation form — the natural move is ONE full form on the
   company surface, absorbing `DemandDraftForm`'s continuation duty, with the
   chat form remaining the light intake that hands off to it.
2. ONE readback for the demand owner. Scouting already lists company demands
   with the real follow-up (scout); `DemandRequestsReadback`'s unique honest
   copy (worker-visibility note, manage help) must move or die with proof.
3. Row 25 is only the advanced HOST of row 7 — it has no capability of its
   own and resolves automatically with row 7's move.
4. No new route, no new result kind unless the audit of `project` result fit
   proves otherwise; the estimate builder must not be duplicated.

**Nothing implemented yet — recorded so the next window starts at the
decision, not the discovery.**

### P1 EMPLOYER — CONSOLIDATED 2026-08-01 (the employer package)

What shipped, against the decisions above:

1. **The FULL wizard moved to `/dashboard/company#demand-intake`** — the
   action's own `advancedRoute`, inside the existing `#company-requests`
   section. Same component, ONE mount; every unique capability preserved
   (structured v2, estimate builder, `structureNeed` auto-suggest, honesty
   flags, worker preview, duplicate-and-edit prefill, draft auto-continue).
2. **`DemandDraftForm`'s company mount is absorbed**: the wizard gained a
   private save-draft leg on the SAME `saveDemandDraftAction` +
   `save_demand_draft` RPC and the same alias keys the chat leg and the
   prefill already shared (+`accommodation`, whose wizard values round-trip
   where the old form's never did). The component survives for the buyer
   (distinct actor). The dead `projectRole`/`languages` light-form fields had
   ZERO consumers (write-only payload; real language requirements live in
   `structured_v2.requirements.languages`, which match-v1 reads) — recorded,
   not ported. Dead i18n (`company.firstAction`, `company.draftForm`) removed
   across the 5 active locales.
3. **ONE owner readback** — `DemandRequestsReadback` on `/dashboard/company`,
   now **employer-kind-scoped** (`company_request`/`agency_offer`): the
   advanced mount ALSO leaked a dual-role user's buyer rows into the org
   view; the move fixed that. Buyer room (customer actor) and scouting
   (operations: matching, shortlist, lifecycle) retained as genuinely
   distinct — classification per §7: OWNER=company page, CANDIDATE=worker
   board, SCOUTING=scouting, advanced=REMOVED.
4. **Five stale doors repaired** — `openDemandIntakeAsCompanyAction`,
   scouting's no-demands CTA, agency-clients-section ×2, and the project
   cost calculator all pointed at `/dashboard#demand-intake`, an anchor that
   stopped existing when the root went chat-first (every one dead-ended on
   the chat). All now target `/dashboard/company#demand-intake`, which the
   role gate guarantees exists for every holder of the company role.
5. **Row 25 resolved with row 7**: the advanced page carries no demand
   surface (guard-pinned negative), and `wagon3`/`hierarchy`/`readback`
   guards were rewritten to pin the new topology.

**Browser proof** (`tests/e2e/w3-demand-consolidation.spec.ts`, 9/9 in two
consecutive runs on the local guarded stack, company + worker-only fixture
sessions): wizard + readback render on the company page; the save-draft leg
writes a REAL `customer_requests` draft row and survives reload
(auto-continue); describe → criteria (estimate builder) → review → submit
echoes the values, returns the done receipt, CLOSES the continued draft
(polled — the close is the same click's best-effort leg) and lands in the
readback with its scouting deep link; the advanced page renders neither
surface and Back returns to the anchored wizard; 375px no sideways scroll;
a worker without the company role is redirected with the honest
`needs_company_role` notice; an authenticated outsider reads ZERO
`customer_requests` rows (RLS negative proof against a non-empty table).
Legacy `demand-flow`/`estimate-flow` specs retargeted and green. Evidence:
`w3/rows7825-company-wizard-1440.png`, `w3/rows7825-owner-readback-1440.png`,
`w3/rows7825-company-wizard-375.png`.

**Honest gaps**: the chat inline intake was NOT re-proven in the browser — it
is UNCHANGED code (dispatcher + executor unit suites cover it) and its
`advancedRoute` already pointed at `/dashboard/company`. The buyer page was
not browser-proven (no customer fixture identity exists; the surface is
untouched and guard-pinned). The scouting no-demands CTA door is repaired and
guard-pinned but not browser-clicked (the fixture stack always has demands;
emptying it would fabricate state).

### Net complexity — rows 7/8/25

| Measure | Before | After |
|---|---|---|
| Full demand form presentations | 3 (advanced wizard · chat · company light form) | **1 full wizard + 1 thin chat adapter** |
| Estimate builders | 1 | 1 |
| Owner readbacks | 3 (advanced · buyer · scouting) | **1 owner** (+ buyer/scouting retained as distinct actors/purposes) |
| Advanced-page demand mounts | 2 | **0** |
| Draft stores / write paths | 1 / 2 (`save_demand_draft`, `submit_demand_request`) | 1 / 2 — **unchanged** |
| Validation schemas | 1 server-side | 1 — unchanged |
| Stale `/dashboard#demand-intake` doors | 5 | **0** |
| Routes / result kinds / registry entries added | — | **0** |
| Dead code removed | — | `COMPANY_FIELDS` + options + company `DemandDraftForm` mount, advanced demand section + readback labels/reads, 61 dead i18n lines × 5 locales |
| Production LOC (`git diff` app+components+lib, excl. tests/messages) | — | **+202 / −227, net −25** |

**Value created** — employer: one place to state a need, the draft they save
is the draft the wizard reopens, and the "submit for real" door no longer
dead-ends on the chat. Worker: one consistent demand pipeline feeds the
board. Company/tech: one form, one readback, kind-scoped room separation,
five dead doors gone, net-negative complexity.

## Row 21 — MYZONE: the audit and the confirmation

Audited and browser-confirmed 2026-08-01 (`lib/guards/w3-row21-myzone.test.ts`
5 guards; `tests/e2e/w3-row21-myzone.spec.ts` 2 scenarios).

**The row splits into two sub-capabilities and is not one label.**

`MyZone` is presentation-only (guard-pinned: no reads, no writes, no server
action) with exactly ONE mount, on the advanced page's worker branch. It
carries:

1. **Readiness status + missing-item deep links** (profession → profile,
   first entry → journal) — **`ALREADY`**. The canonical implementation is
   RICHER and already shipped with row 1: the work-card model
   (`lib/worker/work-card-state.ts`) inside the `player-card` RESULT tracks
   FIVE dimensions (work / availability / location / pay / evidence) against
   MyZone's two, derives ONE best next action, and explains WHY each step
   helps (`whyKey`) — at the point of action. Guard-pinned: `work` requires
   the profession, `evidence` requires journal entries with
   `/dashboard/journal` as its destination — MyZone's two dimensions are a
   strict subset. Browser-proven with the real fixture session on both
   surfaces, desktop + 375px, keyboard + accessible name, 0 console errors.
   The first-use branch is pinned by the model's own unit suite — a
   half-onboarded account is not fabricated for a screenshot (row 1
   precedent).

2. **"Kas ką gerina" explainer** (`MyZoneImproves`) — **`OBSOLETE`**. Static
   help copy whose only consumer is `my-zone.tsx` (guard-pinned), superseded
   by the per-dimension `whyKey` explanations attached to the actions
   themselves. Help detached from action dies with the route; deletion takes
   the copy cleanly.

**Not ported. No new hub. The mount dies with `/dashboard/advanced`.**

## Row 24 — REPUTATION: blocked, and exactly WHY

Documented 2026-08-01, so the block is a named fact and not a shrug.

**The missing data source**: the canonical reputation model (doctrine §5 —
one positive / one negative SUBJECTIVE experience, separated from objective
evidence, no stars, no total person score) has **no table and no rows**. The
database has no subjective-feedback store at all (`pg_tables` shows only
`language_feedback` and `learning_review_queue`); the only trust chain in the
product is the OBJECTIVE one — `lib/feedback/work-feedback-loop.ts`: work →
journal → manager/client confirmation → evidence → trust signal, which
computes no score by design.

**What must create it**: W6 (trust / reputation / disputes) — the subjective
feedback capability with its own table, RLS, provenance and dispute path.

**Minimum real-data acceptance to unblock row 24**: the W6 store exists with
RLS proven both ways; at least one REAL subjective experience row created
through the real flow by a real counterpart account (not seeded solely for
UI); the `reputation` result registry entry may then flip `unverified` →
`real`, and `TrustInsightCard` absorbs into the `reputation` result.

**Until then the UI stays honest**: `dataReadiness: "unverified"` keeps the
panel on its fallback — no placeholder charts, no fabricated balance.

## Rows 19 / 14 — RETURN TO CHAT: the audit and the confirmation

Audited and browser-confirmed 2026-08-01
(`tests/e2e/w3-rows19-14-return.spec.ts`, 4 scenarios).

**Neither row is a capability renderer.**

- Row 19 (`DashboardStatusStrip`, 2 mounts, both on the advanced page): its
  chips ARE the notification spine, which the LAYOUT-mounted bell already
  presents (proven with real seeded counts in the rows 11/12 pass). Its two
  extra doors survive layout-level: the bell panel's "view all" opens
  `/dashboard/activity` (browser-proven), and the primary nav carries the
  calendar tab.
- Row 14 (`DashboardChainActions`, 1 mount): a role-aware link card. Every
  destination survives — journal via the shell nav, `/dashboard/inbox`
  directly reachable with a company session (browser-proven) plus the chat
  action registry, `company#company-team` via the company page itself
  (row 16 pass).

**The return-to-workspace primitive already exists and is ONE thing**: the
shell's home entry (`/dashboard`) — the simple chrome's header link and the
advanced chrome's bottom-nav entry, both LAYOUT-mounted. Browser-proven:
detail route → home → the canonical chat workspace, desktop and 375px.
**No new component, no new route.**

**The documented result-state rule**: a `?result=` deep link carries state
(reload holds it — calendar spec); going HOME is a fresh workspace and does
not resurrect the last result; browser Back is how a result returns.
Browser-proven.

**One real stale door found and fixed**: the work-log flow's `no-context`
blocked state linked `/dashboard/advanced`; it now opens `/dashboard/start`
(the spaces hub). `lib/guards/w3-return-to-workspace.test.ts` is the RATCHET:
no source file may carry a live quoted `"/dashboard/advanced"` href outside
the three allowlisted survivors (the route's own segment, the admin-only
account-menu escape hatch, the surface-registry entry) — the allowlist is the
countdown for the route deletion, not a permission.

**Known pre-existing defect recorded, not hidden**: `/dashboard/journal`
emits a dev-only React "missing key" warning (`JournalEntryRow` children).
Reproducible on the baseline; named narrowly in the spec allowance; tracked
for its own fix.

## The calendar RESULT — the separate slice, on its own merits

Implemented 2026-08-01 (the same continuation, its own number — NOT rows
11/12). `ResultBody` gains its `calendar` case:

- `lib/planning/calendar-result.ts` — a server re-shaping of the SAME
  `getPlanning` → `buildAgenda` projection the planning page and the chat
  sentence read. Guard-pinned to import no supabase, no table, no RPC, no
  fetch — the anti-second-calendar rule as a test.
- `components/app/workspace/calendar-result.tsx` — the panel presentation:
  loading / error+retry / blocked / empty / partial (degraded sources NAMED) /
  ready with real conflict marks. No `<Link>`, no router; `onOpenFull` opens
  `/dashboard/planning`.
- `startAgenda` in the chat now EXPLAINS (the sentence stays) and OPENS the
  result — the same split rows 1 and 5 established. One calculation, two
  presentations, zero new routes, zero new result kinds (the kind existed).
- i18n: 10 keys × 5 active locales.
- Proof: `tests/e2e/w3-calendar-result.spec.ts` — seeded booking renders as a
  real agenda line; reload and Back/Forward hold via `?result=`; the
  full-screen door opens the canonical calendar; honest empty state (fixture
  absence lifted and restored verbatim); 375px with no sideways scroll.

## Row 1 — DONE, and what the audit had MISSED

Shipped in #942, deployed `4689f475`. The audit below was right about the
target and wrong about the count, and the correction is the useful part.

**The audit said the card had no inline renderer. It also had a renderer too
many.** `conversation-chat.tsx:695` embedded the CANONICAL `WorkerPlayerCard`
in the chat THREAD — the same component, the same data, pushed as a turn. The
audit found the hub's person block and the missing `ResultBody` case, and
missed that the capability was already being rendered twice.

That mattered, because a thread copy is **frozen at the moment it was pushed**.
Asking twice left two versions of the same person on screen, each claiming to
be current. This is the same defect row 5 removed from the job matches, one
surface later — and it is now the second time an ABSORB row's real work turned
out to be deleting a thread renderer rather than building a panel one.

**The preservation map, produced before any edit:**

| Mount | Props | Carried |
|---|---|---|
| `advanced:557` (org branch, folded) | `embedded` | person block, no editor |
| `advanced:827` (worker branch, main flow) | `embedded contextual workEditor` | person block **+ the only availability/location/pay editor in the product** |
| `conversation-chat:695` (thread) | — | the canonical card |

Shared: ONE `hubVm`; and the hub's person block already derived from
`getWorkerPlayerCard()`, so there was never a second data chain — only a second
rendering. Only mount B carried `workEditor`. Nothing had to remain distinct:
once the editor moved, A and B differed only by the `contextual` flag.

**What the row did NOT add**: `player-card` was already a result kind, already
`dataReadiness: "real"`, already opened by two registry actions. No kind, no
registry entry, no route, no data chain.

**The editor was the hard acceptance condition.** It moved into the result,
derived from the same reads, `null` for any identity without a worker row —
and the real authorization stayed exactly where it was, server-side in the save
RPCs. The null is a UI decision, never the security boundary.

**One quality fix using existing architecture.** The card carries two
side-by-side charts; at 22rem their axis labels wrapped to one word per line —
a chart the reader cannot read. The panel already has a `wide` mode for exactly
this (the market drill-down), so the card uses it. The SAME panel takes more of
the desktop column; no second surface.

**Proven in the browser, 27/27 in the file** (8 new): the chat opens the card
in the panel and draws none of its own (exactly ONE card in the document); the
worker keeps the editor; **the write is proven against the `workers` DATABASE
ROW**, not a re-rendered select; the person block and editor are gone from
`/dashboard/advanced` and that route still works; reload/close/Back/Forward
keep the result honest; loading announces itself and a real aborted read gives
error + a working retry; 375px has no overflow. Evidence:
`w3/row1-player-card-1440.png`, `w3/row1-player-card-375.png`.

**Honest gap**: the non-worker path is NOT browser-proven. Every local fixture
identity has a `workers` row, and inventing a half-onboarded account to make a
screenshot is the fabricated state this platform bans. Pinned in code at both
ends instead — the loader returns `null` without a worker row, the type makes
that representable, and the component gates on it.

**Recorded rather than normalised**: `WorkerPlayerCard` holds its own `<Link>`
deep-links (`/dashboard/profile#capabilities`,
`/dashboard/journal#journal-entries`). Those are the links it already had in
the thread and on the journal page, and the panel's own source still holds no
link and no router — but result bodies otherwise reach the full screen through
`onOpenFull`, so the exception is stated.

### Net complexity — row 1

| Measure | Before | After |
|---|---|---|
| Player Card renderers | 3 | **1** |
| `PremiumHubScreen` person mounts | 2 | **0** |
| Data flows | 1 | 1 |
| Components | — | **+1 / −1** |
| Routes / result kinds / registry entries | — | **0 added** |
| Duplicate CTA · duplicate profile editor | — | **0 · 0** |
| Dead code removed | — | `PersonVM`, `loadPerson`, 3 reads, the page's work-card derivation |
| Guards | — | 10 rewritten to pin both halves; 1 new (non-worker) |
| Production LOC | — | **+408 / −455 — net −47 (code-only net −103)** |

**Net complexity: NEGATIVE on architecture AND on lines. The project got
simpler.**

`PremiumHubScreen` mounts stay at 2, deliberately: after the person block
leaves they differ only by `contextual`, which is real role-driven behaviour,
and they still carry rows 2/3/4. Collapsing them means unifying the page's two
role branches, which belongs to the route deletion.

**Rows 21 and 24 were NOT bundled in.** Row 24 stays blocked on real reputation
rows. Row 21 (`MyZone`) is a navigation grid and the likeliest OBSOLETE
reclassification, but proving that needs its own check that the first-use
guidance survives elsewhere — folding a navigation-grid deletion into a Player
Card absorb would have made the diff unreviewable.

## Rows 1 / 21 / 24 — THE PLAYER CARD: the audit, before any code

Next in the P0 Employee Journey, audited first for the same reason row 6 was:
find out what already exists before porting anything.

**The result kind ALREADY EXISTS — and it is already declared honest.**

```ts
// lib/conversation/result-registry.ts
{ kind: "player-card",
  titleKey: "conversation.results.playerCard.title",
  openedBy: ["worker.complete-profile", "worker.save-work-card"],
  advancedRoute: "/dashboard/profile",
  contexts: ["personal"],
  dataReadiness: "real" }        // lib/player-card/* — 8 real modules
```

So this row does **not** add a result kind, a registry entry or a route either.
What is missing is narrower and more specific than row 6's: **`player-card` has
no inline renderer.** `ResultBody`'s switch handles `opportunities` and
`market`; everything else falls through to `result-body-pending` and the honest
`/dashboard/profile` fallback. The comment already names this row: *"Phase C
wires the canonical Player Card here; the rest follow."*

**Renderers and mounts today**

| # | Component | Where | Mounts |
|---|---|---|---|
| 1 | `PremiumHubScreen` → `PremiumHubPersonCard` | `advanced/page.tsx:557` (org branch, inside More) and `:827` (worker branch, `#work-card`, with `workEditor`) | **2 — duplicated again** |
| 21 | `MyZone` | `advanced/page.tsx:798` | 1 |
| 24 | `TrustInsightCard` | `advanced/page.tsx:89,105`, `company/planning:117`, `intelligence:217`, `opportunities:451` | 5, but on **different subjects** |

The `PremiumHubScreen` duplication is the third instance of the same defect in
this route (`CurrentSpaceHeader`, `WorkerInvitationsCard`, now this). The two
mounts are **not** identical: the worker one passes `contextual` and
`workEditor`. So unlike row 6 this is not a straight de-duplication — the
worker mount carries a real editing capability the org mount does not, and
collapsing them without preserving `workEditor` would delete it.

**Row 24 stays blocked.** `reputation` is still `dataReadiness: "unverified"`,
and `TrustInsightCard`'s other four mounts are legitimately about other
subjects (a demand's trust, the intelligence screen's, an opportunity's). It is
NOT part of rows 1/21 and must not be swept in.

**The real data already exists**: `lib/player-card/` is 12 modules —
`player-card.ts`, `readiness.ts`, `readiness-steps.ts`, `work-history.ts`,
`work-history-model.ts`, `evidence-visuals.ts`, `opportunity-signal.ts`,
`labels.ts` and their tests. Nothing here needs a new reader.

**Provisional shape of the work** (to be confirmed when the row starts):
write the `player-card` case in `ResultBody` over the existing
`lib/player-card/*` readers with the full idle/loading/empty/partial/error/retry
set, then remove the `advanced` mounts — `workEditor` first, since that is the
capability that would otherwise be lost. Row 21 (`MyZone`) is a navigation grid
for a dashboard that is being deleted; it is the likeliest **OBSOLETE**
reclassification in the matrix, but that must be proven, not assumed.

**Not started.** The audit is written down so the next slice does not redo it.

## Row 6 — the audit, before any code

Done first because the net-complexity rule says: find out whether the capability
already exists somewhere before porting anything.

**Renderers today: THREE.**

| Where | What it renders | Can accept? |
|---|---|---|
| `advanced/page.tsx:591` | `WorkerInvitationsCard` in the More section | YES |
| `advanced/page.tsx:748` | the SAME card again, as the state-driven top slot | YES |
| `onboarding/page.tsx:80` | a read-only note (`pendingInviteNote` + org name) | no |
| `journal/page.tsx:241` | `contextState="pending"` + org name, read-only | no |

**Action surfaces: ONE, already.** `acceptWorkerInvitationAction` has exactly
one caller — the `WorkerInvitations` client component. Unlike row 5 there is no
second write path to collapse, which makes this row cheaper than it looked.

**Reads: FOUR** (`listMyPendingWorkerInvitations`) — the card, onboarding,
journal and `notifications/spine.ts`. The spine one is a COUNT, not a renderer,
and is request-cached, so it is not duplication.

**The duplication that is real**: the same card mounted TWICE on one page —
the same defect already recorded for `CurrentSpaceHeader`. Whatever this becomes
must be mounted ONCE.

**Where it belongs, and why NOT a new result kind.** The matrix originally
guessed `calendar` or a new `invitations` result. The audit says otherwise: an
invitation is an ATTENTION item, not an answer someone asked for — nobody types
"show me my invitations", they are told. The Context Panel already has a work
context ("Tavo darbas dabar") whose whole job is what needs you now, and the
spine already counts pending invitations into it. Absorbing into that EXISTING
surface adds no registry entry, no result kind and no route, where a new result
would add all three. `WorkerInvitations` itself is REUSED, not rewritten, so the
accept UI and its single write path stay exactly as they are.

**Outcome states to preserve** (all already exist in `WorkerInvitations` and
must survive the move): `linked`, `already-linked`, `no-invitation`,
`no-worker`, `error`, and the `needs-migration` degradation.

## Row 6 — DONE, and what an ABSORB costs when the target already exists

The audit's conclusion held: this was the cheapest ABSORB so far, because the
capability had **one write path already** and needed **no new surface**.
`WorkerInvitations` is rendered by the Context Panel with the props it always
took — the accept form, the six outcome states and the single write path are
byte-for-byte the ones that existed. Nothing was ported.

What was removed: `worker-invitations-card.tsx` (the server wrapper, 47 lines),
BOTH of its mounts on `/dashboard/advanced`, that page's own invitations read,
and the `invitation` rung of the top-slot ladder. That last one is the row-5
lesson applied early: with no renderer on the page, `decideTopSlot` returning
`"invitation"` would have resolved to an empty slot — a ladder rung pointing at
nothing. It is asserted as an ABSENCE in `top-slot.test.ts` so a revert is
visible rather than silent.

**Two decisions the work forced, neither of them in the audit:**

1. **Attention before geography.** The panel body rendered `WorkspaceMap`
   first. On a phone the sheet body is `max-h-[45dvh]`, so behind the map the
   accept button sat below the fold — one scroll away from the notification
   that sent the person there. The invitation now leads the panel and the map
   follows. Caught in the browser, not in review: the first 375px screenshot
   showed it.
2. **The work context degrades without dropping the invitation.** If the Time
   Engine read fails, `resolveWorkContext` used to return `unavailable` and
   render one line. That would have hidden a pending invitation behind an
   unrelated failure. The failure is now the headline and the invitation still
   renders — the read it depends on succeeded.

**Browser proof** (`tests/e2e/w3-second-dashboard.spec.ts`, 8 new scenarios,
20 in the file green): a real seeded invitation appears in the panel with the
inviting organisation's real name and note; both mounts are gone from
`/dashboard/advanced` and that route still works; accepting drives the REAL
SECURITY DEFINER RPC and the `agency_workers` row is verified to exist in the
database afterwards; an org already on the roster returns `already_linked` in
the success tone with the button still present; an invitation deleted behind
the person's back returns `no_invitation` in the warning tone and writes
nothing; a corrupted org id produces a REAL Postgres failure and the `error`
state, again writing nothing; reload and close/reopen keep the state honest and
an accepted invitation does not come back; 375px shows the invitation above the
map with no horizontal overflow; zero console errors, zero failed requests.
Evidence: `w3/row6-invitation-panel-1440.png`, `w3/row6-invitation-panel-375.png`.

**Honest gaps.** Two of the six outcomes are NOT browser-proven here, and are
named rather than claimed:

* `no-worker` needs a signed-in identity with a profile but no `workers` row.
  Every local fixture identity has one, and inventing a half-onboarded user to
  make a screenshot is the fabricated state this platform bans.
* `needs-migration` needs the accept RPC to be absent (SQLSTATE 42883). Forcing
  it means dropping a function from the shared local database mid-suite.

Both are covered by the unit guard, which pins that the branch exists in the
control AND that the panel's server half supplies copy for all six outcomes —
so neither can silently render a raw key.

**One pre-existing break was found and repaired**: `w3-context-panel.spec.ts`
still waited 20s for `chat-employer-match-card`, which row 5 (#934) deleted. Its
own 30s budget expired before its `test.skip` could fire, so the spec had been
red on `main` since that merge. It now selects from the canonical
`opportunities` result, and waits for the entity read to SETTLE before asserting
content — the fifth harness defect of that family in this programme, and again
not a product defect.

### Net complexity — row 6

| Measure | Before | After |
|---|---|---|
| Renderers of an invitation surface | 3 (card, onboarding note, journal note) | 3 (panel, onboarding note, journal note) |
| Mounts of an invitation surface | 4 | 3 |
| Action surfaces | 1 | 1 |
| Duplicate mounts | 2 | **0** |
| Write paths | 1 | 1 |
| Components | — | **−1** (`worker-invitations-card.tsx`) |
| Routes | — | 0 added, 0 removed |
| Result kinds | — | **0 added** |
| Registry entries | — | **0 added** |
| Top-slot kinds | 6 | **5** |
| Reads on `/dashboard/advanced` | 6 | **5** |
| Production LOC | — | +129 / −76 all lines; **+80 / −56 code-only (net +24)** |

**Net complexity: NEGATIVE on architecture, mildly positive on lines.** Stated
that way on purpose. One component, one duplicate mount, one state kind and one
page read are gone, and nothing was added to the registry, the result kinds or
the routes. The +24 code lines are the label mapping the deleted card used to
get for free by being a server component: the panel is a CLIENT component, and
this codebase deliberately restricts which message namespaces reach the client
bundle (`BASE_CLIENT_MESSAGE_ROOTS`, guarded by
`client-messages-allowlist.test.ts`). Letting `WorkerInvitations` translate
itself would have deleted ~40 lines and shipped a whole namespace to every
dashboard page's JavaScript. The lines were the cheaper cost, and pretending the
count was negative would have been the easier report.

**Two read-only notes were deliberately KEPT**, against the "fewer renderers"
target, because the condition for keeping them is met: both give distinct
context on surfaces where the Context Panel does not exist, and neither exposes
an action. `/onboarding` names the inviting organisation to a user who has not
onboarded yet — who *cannot* accept, because the accept RPC requires a worker
profile they do not have. `/dashboard/journal` names the org the worker is
waiting on as the real reason there is no writable journal context. Deleting
either to move a number from 3 to 2 would have deleted a capability, which is
the exact failure row 5's guard was rewritten to prevent.

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
3. DONE — row 5 is the `opportunities` result, and the chat thread's duplicate
   job-card renderer is deleted with it: renderers 2 -> 1, action surfaces
   2 -> 1, production LOC net -103 (#932, #934).
4. DONE — row 6 is the Context Panel's work context. No result kind, no
   registry entry, no route, no second action surface: `WorkerInvitations`
   reused unchanged, mounts 2 -> 0 on the dying route, the server wrapper and
   the `invitation` top-slot rung deleted.
5. NEXT — the Player Card (rows 1 / 21; 24 stays blocked on real reputation
   rows). AUDITED, not started — see the Player Card audit above. The audit
   already settled that `player-card` is an EXISTING result kind marked
   `dataReadiness: "real"` with no inline renderer, that `PremiumHubScreen` is
   mounted twice with DIFFERENT props (the worker mount carries `workEditor`,
   which must not be lost), and that row 24 must not be swept in.
6. Row 28 — collapse market-map-live into the canonical MarketMap, finishing
   the collapse market-map.tsx's own header already describes.
7. Then the remaining 13 ABSORB rows in dependency order.
8. Delete /dashboard/advanced only when every row is MIGRATED or
   OBSOLETE-proven, updating surface-registry.ts and route-truth-map.test.ts in
   the same commit.
```
