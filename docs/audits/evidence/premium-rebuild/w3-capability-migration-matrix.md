# W3 — `/dashboard/advanced` CAPABILITY MIGRATION MATRIX

> **Status: 3 of 28 rows MIGRATED (rows 4, 5 and 6). Rows 13 and 15 VERIFIED —
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
| 5 | Job recommendations | `JobRecommendationsCard` + the chat thread's `EmployerMatchCard` | ABSORB | `opportunities` result | **ABSORBED + CONSOLIDATED 2026-07-31** — renderers 2→1, action surfaces 2→1, production LOC net −103 (#932, #934) |
| 6 | Worker invitations | `WorkerInvitations` (was `WorkerInvitationsCard` ×2 mounts) | ABSORB | Context Panel work context | **ABSORBED 2026-07-31** — card deleted, mounts 2→0, no result kind, browser-proven with the REAL accept RPC |
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
2 DETAIL. 3 MIGRATED (rows 4, 5 and 6); 13 ABSORB rows remain.**

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
| 1 | Premium Hub person card | Player Card | **AUDITED, next** — see the Player Card audit |
| 21 | My zone | Player Card | TODO |
| 24 | Trust insight | Player Card (reputation) | blocked on real reputation rows |
| 11 | Booking responses | Calendar | TODO |
| 12 | Bookings | Calendar | TODO |
| 16 | Identity actions | Profile update | TODO |
| 19 | Status strip | Return to chat (active context) | TODO |
| 14 | Chain actions | Return to chat | TODO |
| 28 | Second Leaflet chain | (cross-cutting) map collapse | TODO |

**P1 — EMPLOYER JOURNEY**: rows 7, 8, 25 (demand create / readback / intake).
**P2 — COMPANY JOURNEY**: rows 2, 9, 10 (organization card, service and
outgoing requests).
**P3 — ADMIN JOURNEY**: rows 22, 23 (privacy detail, telemetry) — both DETAIL,
both already have real routes.

Rows 17, 18, 20, 27 are OBSOLETE (the second dashboard's own navigation) and die
with the route. Rows 4, 13, 15 are settled.

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
