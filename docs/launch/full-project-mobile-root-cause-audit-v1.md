# LabourMarket.ai — Full-project mobile root-cause audit v1

> Generated 2026-07-06. Source-grounded audit of the whole app as a mobile-first
> product (routes, components, data model, copy, flows). **Docs only — no
> implementation in this PR.** Six parallel read-only audit passes (clickability
> ×2, copy, concept/status model, dashboard/visual, end-to-end flows) plus
> independent verification of the load-bearing claims and a full run of the
> repo's non-destructive checks.
>
> Method note: file:line references were verified against `origin/main`
> @ c7ed384 at audit time. Severity: **RED** = user cannot continue a real
> flow; **ORANGE** = can continue only by guessing; **YELLOW** = confusing but
> not blocking; **GREEN** = acceptable.

---

## 1. Executive summary

The app is far more honest and connected than typical "looks done, isn't"
products: **zero fake data reaches authenticated surfaces**, every audited
`href`/`router.push` resolves to a real route, all repo checks are green
(7,813 unit tests), and the creation half of every core flow (offerings,
requests, demand, journal, bookings, company setup) is real code over real
tables with RLS.

The root problem is systemic and singular: **every flow's completion half
stops one step short.** Statuses change silently, terminal states ("accepted",
"contacted", "proposed") offer no next action, and messaging/booking/journal
exist as parallel silos instead of connective tissue. On top of that sit four
structural defects:

1. **A design-token break** — 211 usages across 47 files of utility classes
   (`bg-surface-1`, `border-border-subtle`, `bg-surface-muted`,
   `border-border-default`, `border-border`) that are defined nowhere
   (`tokens/colors.ts`, `tailwind-preset.ts`, `globals.css` all lack them;
   Tailwind 3.4 emits no CSS). Half the cards — including the owner-approved
   dashboard action grid (`my-zone.tsx:103`) — render with transparent
   backgrounds and fallback gray borders. This is why visual grouping feels
   inconsistent.
2. **Static dashboard ordering** — the owner-approved "Ką galite padaryti
   dabar" grid starts 1.5–2 screens below the fold at 390px; an accepted
   request (the strongest possible state) renders as a one-line row at
   position 8 of 9; nothing reorders by user state.
3. **Fabricated numbers on public marketing pages** — animated counters
   ("318K workers", "84 matches today"), fake per-country map tooltips, and
   fake demand/pool cards on the sales pages, with only small "illustrative"
   captions. The placeholder registry (~150 entries) has never promoted a
   single entry to real data.
4. **No notification spine** — the header bell is hard-coded to an empty
   array, unread only means "never opened", and interest/booking status
   changes are invisible until the user happens to revisit a page.

None of this requires a rebuild. The fixes are well-localized: a token repair,
a marketing-honesty pass, ~10 small clickability repairs, next-action CTAs on
terminal states, and a state-driven dashboard top slot.

**The app must not be described as "almost 100% complete."** Honest status:
core loops are real but end one step early; marketing pages overstate live
activity; PWA/mobile-app readiness is zero.

---

## 2. Current state: what works (verified)

- **Honesty spine.** Count-gated dashboard cards never show fake badges;
  empty states refuse invented examples (`lt.json:4980-4987`, `5136`);
  "never a dead button" discipline is real (interest button only renders when
  its table exists — `opportunities/page.tsx:179-207`; unavailable export
  formats are stated as text, not dead buttons — `documents/page.tsx:295-338`).
- **No dead routes.** Every `href`/`router.push` in the audited tree resolves
  to a real `page.tsx`, redirect stub, or existing anchor. The command
  registry's 30+ routes are guard-tested (`lib/navigation/command-registry.ts`).
- **Journal flow is exemplary.** Atomic RPC with hash chain
  (`lib/journal/actions.ts:97-393`), edit/delete with confirm + pending +
  `deleteBlocked` explanation (`journal-entry-row.tsx:94-121`), real manager
  confirmation side-effects (`confirm-actions.ts:114-142`).
- **Data-scope isolation is real.** Server actions derive company from
  session (`getOwnCompany()` everywhere), journal is always profile-keyed,
  build-time contract guards pin it (`lib/guards/workspace-scope-isolation.test.ts`).
  No personal/company data leakage found.
- **Skill recognition is real** (rule-based LT lexicon, 3 honest tiers, no
  AI claims — `lib/structuring/recognition-tiers.ts:51-108`) and CV tiers
  require `verified === true` for "confirmed" (`lib/cv-export/skill-tiers.ts:25-37`).
- **Opportunities feed is real data** (verified-company `customer_requests`
  via `list_open_demand_for_workers` RPC) — empty because supply is thin,
  not because it is fake.
- **Guards exist and pass**: placeholders:check (173 entries), i18n-debt
  ratchet, primary-route-smoke (22 routes, dead-href + copy-leak checks),
  pilot/pricing honesty copy checks, 498 test files.
- **Bottom nav** is clean: 4 real tabs, 64px targets, real unread badge.

## 3. RED blockers

| # | Blocker | Evidence | Impact |
|---|---|---|---|
| R1 | **Learning review queue is blind.** Manager Approve/Reject/Apply-policy buttons render next to a row that shows ONLY a status chip — `subjectWorkerId`, `subjectSkillId`, `suggestionKind`, `journalEntryId`, `reviewNote` are in the payload but never rendered. | `components/app/learning-review-section.tsx:135-175`; payload `lib/learning/learning-shared.ts:37-51` | Manager is asked to approve a skill suggestion without seeing what or whose it is. The flow cannot be completed responsibly. |
| R2 | **Marketplace loop dies at acceptance.** Accept/decline buttons render only while `status === "sent"`; accepted rows are inert — no Message, no Book, no next step for either party. | `components/app/marketplace-loop-section.tsx:342-361` (incoming), `:265-274` (outgoing) | Both parties see "accepted" and the product offers nothing. The core marketplace flow has no step 6. |
| R3 | **Design-token break.** 211 usages / 47 files of `bg-surface-1`, `border-border-subtle`, `bg-surface-muted`, `border-border-default`, `border-border` — defined in neither `tokens/colors.ts` nor `tailwind-preset.ts` nor `globals.css`; Tailwind 3.4.19 generates no CSS for them. Independently verified by grep in this audit. | e.g. `my-zone.tsx:103`, `identity-actions.tsx:83`, `evidence-status-strip.tsx:36`, `buyer-requests-section.tsx:537-645`, `journal/page.tsx:543` | A large share of cards/inputs — including the owner's reference action grid — render transparent with fallback gray-200 borders. Any theme swap fractures further. |
| R4 | **Fabricated live-market numbers on public pages.** Animated counters "318K→323K workers / 1,180→1,262 open demands / 84→129 matches today" (10px "illustrative" caption); ~90 map hover tooltips with fake per-country counts; `/for-companies` fake demand card "47 ranked matches · HOT"; `/for-agencies` fake pool "86 workers · 31 active". | `content/placeholders.ts:679-718, 201-360, 923-947, 949-975`; `components/app/market-counters.tsx:90-95`; `(marketing)/page.tsx:116` | The public site simulates a live market that does not exist. Screenshots strip the captions. Direct credibility risk with partners (owner + Ramūnas presentation context). |

## 4. ORANGE confusing flows

1. **Silent role-bounce.** `requireRoleOrRedirect` (`lib/auth/require-role.ts:44-46`)
   redirects to `/dashboard` with no notice. Cross-role links inherit it:
   market-map → opportunities (`market-map/page.tsx:232-236`), service-requests
   "matching" (`service-requests/page.tsx:141-145`), search → company routes
   (`search/page.tsx:21-32`). Company-only users are teleported home and can
   only guess why. The `?notice=` banner pattern already exists
   (`communication/page.tsx:54-57`) — the gate just doesn't use it.
2. **`/dashboard#demand-intake` is branch-dependent.** The section renders only
   in the non-worker dashboard branch (`dashboard/page.tsx:357-380`), but
   `company/page.tsx:731-737` ("submit the saved draft for real") and the
   agency-mode "offer" (`:444`) link to it. An active-role=worker user with a
   held company role dead-ends on the worker home. This compounds the
   self-documented **F-D1**: the company-page draft form saves `demand_drafts`
   that can never reach submitted state (`company/page.tsx:601-643`, admitted
   at `:728-736`).
3. **Deep links land on collapsed `<details>`.** Six senders link to
   `/dashboard/profile#capabilities` (`work-card.tsx:322`,
   `journal-entry-composer.tsx:810/1111/1369`, `worker-player-card.tsx:353`,
   `readiness-steps.ts:28`) but the target (`profile/page.tsx:605`) is a
   collapsed `<details>` — browsers don't open it on hash navigation.
4. **Work-card "+" chips scroll to themselves.** Availability/location/pay
   chips get `href="#work-card"` — the card they're inside — instead of
   opening the editor (`work-card.tsx:37-40, 377-388`).
5. **"Contacted" without contact.** Company can mark interest
   `reviewed`/`contacted` (`scouting/page.tsx:456-471`) but no conversation is
   created and the worker gets no badge — the status claims an event the
   product never mediated. Worker-side feedback is entirely silent
   (button relabels only on revisit — `opportunities/page.tsx:435-453`).
6. **Booking proposal/response has zero notification wiring** in either
   direction (`booking-actions.ts:59-104, 146-184`); after accept there is no
   calendar entry, journal link, or CTA. Accepted is a terminal dead-end.
7. **Demand submit success is a dead end** — no link to the created request;
   the server-rendered read-back below is stale until manual reload
   (`demand-request-button.tsx:311-326`).
8. **Instruction "clarify" fails silently** and never links to the
   conversation the worker just wrote into (`worker-instruction-card.tsx:115-135`).
9. **Manager-only learning controls render for workers**, whose clicks return
   a generic error; the built worker-transparency copy is never rendered
   (`learning-review-section.tsx:148-175`; `learning/page.tsx:53-56`).
10. **"Keisti vaidmenį / Tvarkyti erdves" points at a page that can't switch
    roles** (`identity-actions.tsx:166-177` → `/dashboard/account`, where
    roles are read-only chips; switching lives in the header RoleSwitcher).
11. **Chain actions miss their anchor.** "Pakviesti darbuotoją" / "Įjungti
    peržiūrą" land on the top of the longest page in the app instead of the
    existing `#company-team` anchor (`dashboard-chain-actions.tsx:22-42`;
    anchor at `company/page.tsx:682`).
12. **Journal never receives work.** `journal_entries.engagement_context_id`
    exists but no FK or UI path connects a completed booking/request to "log
    this work" — marketplace work never becomes CV evidence.
13. **Two disconnected demand pipelines.** Buyer `demand_requests`
    (`lib/demand/actions.ts`, `/dashboard/buyer`) never reach the worker
    opportunities feed, which reads only `customer_requests`. A buyer's need
    is invisible to workers.
14. **Visibility is enforced but never explained.** 8 visibility levels are
    stored and really gate scouting/conversations
    (`lib/visibility/worker-profile-visibility.ts`), yet no surface answers
    "who can see me" — and map copy promises "add your location to appear on
    the market map" while **no cross-user map read exists** (`signals.ts:15-22`).
    The pin the map renders is localStorage-only, a third location model
    (`market-map-base.tsx:50-51, 99-102`).

## 5. YELLOW visual/copy polish

- Notification bell is permanent no-op chrome: `notifications: []` hard-coded
  (`dashboard/layout.tsx:119`), no notifications table, `markAllRead` mutates
  local state (`lib/auth/context.tsx:101-104`).
- No locale switching on mobile dashboard (`hidden md:flex`, `layout.tsx:139`).
- Decision-critical buttons under 40px: marketplace accept/decline/request/
  withdraw ~26px (`marketplace-loop-section.tsx:270, 348-359`); booking
  accept/decline ~24px (`booking-respond-buttons.tsx:66-93`); quick-nav chips
  ~26px (`page-quick-nav.tsx:41-47`).
- `/dashboard/start` hardcodes LT/EN inline (RU users get EN) and leaks DB
  jargon ("blokuojama duomenų bazės lygmenyje") — `start/page.tsx:76-79`.
- Onboarding country select shows raw ISO codes (`onboarding-wizard.tsx:222-228`).
- Icon collisions: `FileText` = journal in nav but documents in grid;
  `Inbox` vs `MessageSquare` for messages; `Map` vs `MapPin` for map
  (`navigation.ts:64-67` vs `my-zone.tsx:45-51`).
- 4 independent status-chip systems (`STATUS_RING`, `EvidenceStatusStrip`,
  start-page ✓ badges, WorkCard `LEVEL_BADGE`); off-token raw
  `emerald-500`/`amber-700` colors (amber-700 near-illegible on dark ink).
- `card-border` identical on static and clickable cards; differentiator is
  hover-only (invisible on touch); `focus-visible` mostly missing.
- Shared `EmptyState` component exists but is used in only 4 files;
  communication and the marketplace loop use bare boxes with no next step.
- Copy leaks internal vocabulary to users: "(M5)" in legal draft notes
  (`lt.json:4068,4160`), "PR2 pending" (`en.json:6168`), "ChiefOperator"
  (`lt.json:1790`), "owner production smoke" (`vision` banner, copy-gated not
  auth-gated), Placeholder tooltip exposes registry ids in prod
  (`components/ui/Placeholder.tsx:60`).
- "Dar nepradėjome veiklos…" ("we haven't started operating") on the public
  pricing page (`lt.json:4030`; `en.json:5965/6226`) — the single most
  launch-undermining sentence; rewrite to pilot framing.
- `rolesHub`: 6 of 9 role tiles say "Will be enabled later / Ruošiama";
  `spaces.*` has a wall of 12 "will be enabled later" empty states
  (`en/lt/ru.json:2380-2395, 3401-3420`).
- Stale comments: `bottom-nav.tsx:54-56` (wrong tab list),
  `booking-state.ts:4-7` (claims "NOT wired" while live).
- Visual-OS preview chrome (superadmin-gated) borrows interactive styling:
  sidebar divs with `aria-current`, sample cards with hover elevation
  (`visual-os-shell.tsx:72-89`, `visual/worker-card.tsx:37`).
- Nested `<main>` on opportunities (`opportunities/page.tsx:68`);
  journal DOM order ≠ visual order via `order-*` CSS; map h1 `text-2xl` vs
  siblings' `text-3xl`.

## 6. Clickability audit table (RED/ORANGE + notable rows)

| Area | Label | Looks clickable? | Is clickable? | Expected target | Actual target | Source | Severity | Fix direction |
|---|---|---|---|---|---|---|---|---|
| Learning | Approve/Reject/Apply | Yes | Yes | review a visible suggestion | acts on an invisible payload | `learning-review-section.tsx:135-175` | RED | render kind+skill+worker+entry link |
| Service loop | accepted row | implied | No | message/book next step | inert row | `marketplace-loop-section.tsx:342-361` | RED | Message + Propose-booking CTAs |
| Work card | `+ availability/location/pay` chips | Yes | technically | open inline editor | `#work-card` self-anchor | `work-card.tsx:37-40,377-388` | ORANGE | open editor on click |
| Profile deep links | Skills tile, `addManuallyCta`, readiness step ×6 senders | Yes | Yes | see capabilities | collapsed `<details>` | senders above; `profile/page.tsx:605` | ORANGE | auto-open on hash |
| Cross-role links | "matching", opportunities, search paths | Yes | Yes | target page | silent bounce to `/dashboard` | `require-role.ts:44-46` + 3 senders | ORANGE | `?notice=` banner or role-filter |
| Company | "submit draft for real" | Yes | Yes | demand wizard | worker home (no wizard) for active-role=worker | `company/page.tsx:731-737` | ORANGE | role-independent target |
| Dashboard org | inviteWorker / enableReview | Yes | Yes | invite form / review toggle | page top, control far below | `dashboard-chain-actions.tsx:22-42` | ORANGE | use `#company-team` |
| IdentityActions | "Tvarkyti erdves" | Yes | Yes | switch roles | read-only settings page | `identity-actions.tsx:166-177` | ORANGE | point at RoleSwitcher / rename |
| Demand wizard | success panel | partial | no link | view created request | dead end + stale read-back | `demand-request-button.tsx:311-326` | ORANGE | "Peržiūrėti užklausą →" |
| Instructions | clarify | Yes | Yes | send + see thread | silent failure, no thread link | `worker-instruction-card.tsx:115-135` | ORANGE | error copy + conversation link |
| Learning (worker) | manager buttons | Yes | Yes (server rejects) | not offered | generic error | `learning-review-section.tsx:148-175` | ORANGE | `isManager` flag |
| Header | notification bell | Yes | Yes (opens panel) | real notifications | permanently empty panel | `layout.tsx:119` | YELLOW | wire first source or hide |
| Bookings | Accept/Decline | Yes | Yes | respond | works; ~24px targets, no spinner | `booking-respond-buttons.tsx:66-93` | YELLOW | 44px + pending state |
| Bottom nav / MyZone / journal / account / documents / admin / communication | all primary surfaces | Yes | Yes | real routes | all verified real | multiple | GREEN | — |

Full route verification: no `href="#"`, no console.log-only handlers, all
`router.push` targets exist. The existing route-smoke guard covers only 22
routes and literal dead hrefs — none of the classes above.

## 7. Future-stage / unfinished copy table (top risks)

Active locales are **lt/en/ru only** (`lib/i18n/config.ts:38`); lt/en/ru have
full key parity. 8 dormant catalogs carry 10,200 literal `[EN] ` markers —
debt, not live exposure (ratchet tracks only da/de; extend `TRACKED_LOCALES`).

| Key / file | Text (short) | Class | Recommendation |
|---|---|---|---|
| `counters.*` + `live.counters.previewNote` (`placeholders.ts:679-718`) | animated "318K workers… 84 matches today" | misleading | real counts, or kill animation + same-size label |
| `map.marker.*` / `map.country.counts.*` (~90) | fake per-country tooltips | misleading | remove numeric tooltips, keep honest tier chips |
| `demand.featured.1` (`placeholders.ts:923-947`) | "47 ranked matches · HOT" on /for-companies | misleading | worked-example framing, drop fake counts |
| `agency.pool.preview` (`placeholders.ts:949-975`) | "86 workers · 31 active" on /for-agencies | misleading | same |
| pricing "Dar nepradėjome veiklos…" (`lt.json:4030`, `en.json:5965/6226`) | "we haven't started operating" | unfinished claim | pilot framing: "Piloto etapas — prieiga suteikiama tiesiogiai" |
| `pricing.plan.*` "pricing TBD" | unfinished | honest but weak | "pricing set before launch — talk to us" |
| legal `draftNote` "(M5)" (`lt.json:4068,4160`) | milestone leak | jargon | drop "(M5)", keep draft honesty |
| `rolesHub` 6× "Will be enabled later" (`*:2380-2395`) | future wall | unfinished | demote to existing `comingLaterToggle` group |
| `spaces.*` 12× "will be enabled later" (`*:3401-3420`) | future wall | unfinished | connected next action where one exists |
| `companyDashboard.workers` "blocked at the DB layer" (`*:1174-1176`) | jargon | unfinished | plain-language rewrite |
| `lt.json:1790` "paklauskite ChiefOperator" | internal agent name | leak | rewrite |
| `en.json:6168` "PR2 pending" (admin) | PR numbering | leak | plain "not enabled in this environment" |
| `vision.internalPreviewBanner` (`*:2455-2456`) | "owner production smoke is PASSED" | leak | auth-gate or remove |
| KEEP: honest empty states, fictional-profile disclaimers, preview-host notice, pilot vocabulary (guarded), countryComingSoon | | honest | keep — this is the product's honesty spine |

**Placeholder system:** all ~150 registry entries are `status:"placeholder"`;
zero ever promoted (`placeholders:pending` prints "nothing pending" — true and
misleading). Orphaned entries (`screenshot.flow.*`, `team.onsite.*`,
`comm.thread.*`, `hero.action.*`, `stats.*`) inflate the count. Structured
payload paths (`placeholderCycle`, `getDraft`, `getDemand`, `getPool`) bypass
the per-value "sample" marker and rely on quiet section notes.

**Recommended copy model:** (1) three states per surface — works-today /
honest-empty + one connected action / not-built only in collapsed "Coming
later" or /vision; (2) empty state ≠ roadmap promise; (3) a rendered number is
a real DB count or it doesn't render; (4) fabricated personas labeled inside
the same visual unit; (5) no internal vocabulary in any locale string;
(6) locale activates only at `[EN]` count 0; (7) registry entries need a
promotion target or `pending-real` status.

## 8. Route/component map (orientation)

- Framework: Next.js app router + next-intl; routes under
  `app/[locale]/{(marketing)|auth|dashboard|cv|onboarding|design}`; ~50 pages
  (26 dashboard screens). Locales in `messages/` (12 catalogs; 3 active).
- Navigation truth: `lib/config/navigation.ts` (bottom nav + tabs),
  `lib/config/feature-availability.ts` (per-feature availability),
  `lib/navigation/command-registry.ts` (finder).
- Shared UI: `components/app/*` (~150 components), design tokens in
  `tokens/`, `tailwind-preset.ts`, `app/globals.css`.
- Data: Supabase; migrations in `supabase/migrations/`; **no Postgres enums**
  (`types.ts` `Enums: {}`) — all statuses are text+CHECK; server actions in
  `lib/*/actions.ts`.
- Guards: `scripts/placeholders.ts`, `check-i18n-debt.ts`,
  `check-primary-route-smoke.ts` (22 routes), pilot/pricing honesty checks,
  vitest contract guards (`lib/guards/*`), Playwright e2e (`tests/e2e`).
- Key nav facts: bottom nav = Overview / Map / Journal / Messages; marketplace
  is `safeToShowInPrimaryNav:false`; company workspace flagged "preparing";
  **5 of 8 dashboard-grid destinations have no nav presence** — reachable only
  via the below-fold grid.

## 9. Product concept collision table

| # | Concept pair | Problem | Canonical recommendation |
|---|---|---|---|
| 1 | Work opportunity vs service request | Two unconnected "someone wants work" models: `customer_requests` → opportunities vs `service_offering_requests` → provider inbox; both read as "užklausa" | Opportunity = company demand; service request = buyer→provider ask on a published offering; longer-term merge intake into `customer_requests.kind` |
| 2 | Service request vs order | "Užsakymas/order" is a **phantom** — copy only, zero data model | Accepted `service_offering_request` IS the order; purge the word or alias explicitly |
| 3 | Order vs reservation | `booking_requests` binds to demand only; accepting a marketplace request creates no booking; stale comment claims module unwired (`booking-state.ts:4-7`) | Booking = scheduled engagement for a demand+worker pair; decide whether accepted service requests create one |
| 4 | Reservation vs calendar event | No calendar surface; `worker_availability_preferences` is dead schema (zero app refs); no scheduler exists for the `expired` transition | Bookings list first; calendar explicitly future; drop or wire the dead table |
| 5 | Profile vs work card vs player card | **Four parallel completeness engines** with different dimension sets → contradictory "what's missing" verdicts per surface | Profile = editor; cards = views; exactly one readiness module |
| 6 | CV vs journal vs skills | 5–6 skill stores with different status vocabularies flattened app-side; `profile_skill_claims.status` legally allows one value | Journal = evidence; skills = claims with evidence state; CV = export of confirmed claims; collapse behind one claims API |
| 7 | Journal evidence vs action | Sound design; dual legacy/new confirmation vocab mapped forever in jsonb | Backfill legacy `action` → `decision` once |
| 8 | Map visibility vs work location | **Three location models that never meet**: localStorage pin (what the map renders), `preferred_locations` (visibility), `company_demand_locations` (demand); copy promises cross-user visibility; no cross-user reader exists | One canvas, two layers from their own tables; stop promising visibility until a cross-user read ships |
| 9 | Company vs personal actions | Data isolation real; but gates check role *possession* while header shows *active* workspace — user can act as company under a "Personal space" label; org dashboard branch renders personal-scoped service cards | Workspace = scope; align gate and label; move service loop to personal workspace |
| 10 | Marketplace vs opportunities | Two full parallel supply/demand loops, disjoint tables, no bridge; config carries both `marketplace_hub` and hidden `marketplace` | "Opportunities" = work for workers (demand side); "Marketplace" = services catalogue (supply side); naming pass + bridge-or-separate decision |
| 11 | Messages: chat vs transaction step | Conversations have **no FK to any transaction** — context is a copied 120-char subject string (`request-worker-conversation.ts:103`); `/dashboard/inbox` is a journal-review queue, not messages; help requests + follow-ups are further silos | Communication = conversations only; rename inbox to "Peržiūros"; add transaction context FK when bridging statuses |
| 12 | Reports/documents | Two meanings (worker papers vs print-view hub); no server-side file generation anywhere (honestly labeled) | Split labels; keep honest "browser print" copy until real generation ships |

## 10. Status model table (gaps that matter)

| Status area | Source | Gap | Fix |
|---|---|---|---|
| Demand (`customer_requests`) | draft/submitted/in_review/needs_followup/approved/closed + DB transition trigger (`20260705150000:38-40`) | `approved` is a dead-end (nothing consumes it); `needs_followup` has no owner path back | owner "provide follow-up" action; define what approved unlocks |
| Opportunities (derived) | 3 overlapping per-card axes (fit / match band / route), none persisted | verdict soup on one card | collapse into one card verdict |
| Interest signals | interested/withdrawn/reviewed/contacted (`20260704230000:53-54`) | `contacted` creates no conversation, no worker badge | ack `contacted` → open conversation + badge |
| Bookings | proposed/accepted/declined/withdrawn/expired (`20260613100100`) | `expired` has no scheduler anywhere; `accepted` terminal with zero follow-on | post-accept step; implement or drop expired |
| Marketplace requests | sent/accepted/declined/withdrawn | `accepted` connects to nothing | bridge accepted → conversation minimum |
| Skill claims | `profile_skill_claims.status` CHECK allows only `'self_declared'` (`0015:42-43`) | one-value DB status; real ladder computed app-side | widen or drop the column |
| Company status | 6-state ladder (`20260604120000:79-91`) | `verified` silently doubles as Model-A route gate (`20260702170000:86`) — unexplained second meaning | surface the consequence in verification copy |
| Unread | `last_read_at IS NULL` only (`unread.ts:43-46`, `communication/page.tsx:179`) | new replies in opened threads invisible everywhere | compare latest message vs last_read (the code comment already describes it) |
| Seen/new counts | per-surface models (requests-seen table, last_read_at, nothing for interest) | no unified notification spine; bell hard-coded empty | one seen/notification model |
| Fake/unbacked | player-card sports statuses LIVE/DRAFTED (`player-card.tsx:33-44`); animated draft pipeline (`draft-board-columns.tsx:14-27`); orphaned `jobPostings.list.status.*` keys (dormant `job_demands`); frozen "PENDING"/"BLOCKED (issue #32)" strings in vision copy | UI-only vocab colliding with real `availability_status` | retire/label; delete orphans |
| Duplicate paths | dashboard triple-fetches service-request rows per render (`service-requests.ts:256-260, 307-315`); buyer card derives a priority state that exists nowhere else (`dashboard/page.tsx:135-150`) | divergence risk + waste | single loader per area |
| Consistent (verified) | manager review count + inbox share one RPC; admin interest counters share scouting's table | — | keep |

## 11. Mobile dashboard hierarchy recommendation

Current (static, worker branch): space explainer → command finder → WorkCard →
action grid → invitations → 3 count-gated rows → marketplace hub. At 390px the
approved grid starts 1.5–2 screens down; an accepted request is a one-line row
at position 8/9; help renders before action; nothing reorders by state.

Recommended:

1. **State-driven top slot** (exactly one card): pending invitation →
   accepted request → pending incoming request/booking → new-user next action
   → compact status. All the data already loads server-side
   (`dashboard/page.tsx:96-150, 428, 450`); only ordering logic is missing.
2. WorkCard (collapsed to hero + ring + one next action when the slot is
   occupied).
3. **Action grid within one swipe.**
4. Remaining count-gated rows.
5. Marketplace hub.
6. Space explainer, "Kas ką gerina", command finder — bottom (or header icon).

Org branch: `DashboardNextAction` first, chain actions, identity strip,
demand intake (currently position 11!), explainers last.

Per-user-state top block: new user → work-card next action; profile-complete →
opportunities/visibility nudge; accepted request → accepted card with
message/book CTA (needs PR3); incoming request → respond card; has company →
pending-review/next-action; active booking → booking card; no marketplace
activity → publish/discover hub.

## 12. Visual system recommendation

Order matters: **token repair first** — everything else builds on it.

1. **Repair the token break (R3):** either define `surface-1`,
   `surface-muted`, `border-subtle`, `border-default` in `tokens/colors.ts` +
   preset (fastest, honors current intent), or migrate 47 files to existing
   `ink-*` classes. Add a guard (grep for undefined class families in CI) so
   this cannot regress.
2. **Five reusable patterns**, all extracted from existing code, not invented:
   - `ActionCard` (extract the MyZone card: icon + short title + one-line
     description, ≥44px, focus ring) — replaces IdentityActions cards,
     marketplace hub links, map connection links.
   - `StatusChip` (variants neutral/waiting/attention/success/danger, mapped
     only to `state-*`/`brand-orange`/`ink` tokens) — replaces the 4 chip
     systems and raw emerald/amber.
   - `AttentionRow` (the count-gated row already repeated 4× nearly verbatim)
     — becomes the state-driven top slot.
   - `EmptyState` — already exists; adopt in communication + marketplace loop.
   - `SectionHeader` (mono eyebrow + display heading, already repeated 4+×).
3. **Icon rules:** one icon per destination everywhere (journal, messages,
   map, documents each currently have 2–3 icons).
4. **Clickability affordance rule:** non-clickable cards lose hover/border
   affordances; clickable cards get `focus-visible` rings and ≥44px targets —
   including marketplace/booking row buttons.
5. **Premium player-card direction** is already consistent where tokens are
   used (WorkCard is the reference); the token repair restores it elsewhere.

## 13. Bottom nav recommendation

Keep the 4-tab core (it is clean and honest). Fixes:

- Selected state: add a pill/bar (currently color-only, `bottom-nav.tsx:81`),
  matching the desktop treatment.
- Add mobile-reachable locale switching (account menu).
- Decide a home for the service loop + bookings: either a fifth "Veikla"
  tab or explicit persistent entry on the Messages/overview surface —
  currently 5 of 8 grid destinations have no nav presence at all.
- Fix the stale comment (`bottom-nav.tsx:54-56`).
- Align nav and grid icon vocabulary (one icon per destination).

## 14. Mobile app readiness notes

Effectively **zero PWA readiness** (verified):

- `public/` still contains create-next-app defaults (`next.svg`, `vercel.svg`,
  `globe.svg`…); no `manifest.webmanifest`, no service worker, no app icons
  beyond `favicon.ico`/`icon.svg`, no `theme-color`/`viewport`/`appleWebApp`
  metadata anywhere.
- No push wiring (`PushManager`/`Notification.requestPermission`: zero hits) —
  consistent with no notification spine (R-adjacent; the product gap and the
  platform gap should be solved together).
- Upload/camera flows exist (avatar, CV import, journal composer, buyer
  attachments) — file inputs work on mobile browsers; no `capture=` hints yet.
- Auth/session middleware is standard Supabase SSR — PWA-compatible.
- Recommendation (PR9): manifest + icons + theme/viewport metadata + minimal
  offline fallback page first (cheap, no architecture change); defer
  Capacitor/TWA decision until after the notification spine exists, since
  store-worthy apps need push.

## 15. Exact PR sequence

| PR | Scope | Risk |
|---|---|---|
| **PR1 (this)** | Audit doc only; locks blockers + order | none |
| **PR2 — Marketing honesty** | Remove/replace fake counters, map tooltips, demand/pool cards; pricing "haven't started" → pilot framing; purge jargon leaks (M5, PR2, ChiefOperator, DB layer, owner smoke); registry hygiene (delete orphans) | low (copy + marketing components) |
| **PR3 — Design-token repair** | Define missing `surface/border` tokens (or migrate 47 files); add CI guard against undefined class families | low, mechanical, high leverage |
| **PR4 — Clickable surface repair** | R1 learning queue payload rendering + `isManager`; collapsed-`<details>` anchors auto-open; work-card "+" chips open editor; role-bounce `?notice=` banner; chain-action anchors; manage-spaces link; demand-success link + refresh; clarify error+link; 44px row buttons | low-medium |
| **PR5 — Status & CTA consistency** | R2: Message + Propose-booking CTAs on accepted rows; `contacted` → conversation + worker badge; booking respond → notification/conversation; unread = latest-message comparison; single service-request loader | medium (touches actions) |
| **PR6 — Mobile dashboard hierarchy** | State-driven top slot; grid above fold; explainers demoted; org branch reorder | low-medium (ordering only, data already loaded) |
| **PR7 — Concept & naming cleanup** | Rename `/dashboard/inbox` → reviews; purge phantom "order" copy; marketplace/opportunities naming pass; single readiness module consumed by all four surfaces; backfill legacy confirmation vocab | medium |
| **PR8 — Visual pattern system** | ActionCard/StatusChip/AttentionRow/EmptyState/SectionHeader extraction + adoption; icon rules; affordance rules | medium (wide but mechanical after PR3) |
| **PR9 — PWA basics** | Manifest, icons, theme/viewport metadata, offline fallback; store checklist doc; Capacitor/TWA decision memo | low |

Regression protection to add along the way: extend the route-smoke guard to
(a) all dashboard routes, (b) anchor-target existence, (c) undefined-class
scan (PR3), (d) "interactive style requires handler" lint for cards.

## 16. What should not be rebuilt

- The journal flow (composer, confirmation chain, review queue) — the best
  flow in the product.
- The honesty spine: count-gated cards, honest empty states, "never a dead
  button" discipline, placeholder marker component, honesty copy guards.
- Bottom nav structure and the navigation/feature-availability config layer.
- Booking state machine, demand transition trigger, company verification
  ladder — the data models are sound; they need *connection*, not redesign.
- RLS/session-derived scoping (verified clean) and the guard-test culture
  (`lib/guards/*`).
- The command finder + registry.
- Map location capture UX (progressive disclosure is good) — it needs honest
  copy and a cross-user read someday, not a rebuild.
- lt/en/ru catalogs (full parity) and the i18n-debt ratchet mechanism.

## 17. What owner must decide

1. **Fake marketing numbers (PR2):** real DB counts (small numbers, honest) vs
   non-numeric capability claims. Recommendation: real counts once >0,
   capability claims until then.
2. **Two loops:** bridge marketplace ↔ demand/booking, or keep visibly
   separate products? (Affects PR5/PR7 scope.)
3. **Buyer pipeline:** should buyer `demand_requests` feed worker
   opportunities (merge into `customer_requests`), or stay an ops-only queue?
4. **Notification spine:** invest now (one seen/notification model + bell
   wiring) or after pilot? PR5 does the minimum without it, but push (PR9)
   needs it.
5. **Pricing copy:** approve pilot framing wording (owner voice required).
6. **Dormant locales:** freeze (remove from switcher expectations) or fund
   translation? Extend the ratchet either way.
7. **Role-gate semantics:** should active workspace become the gate (switch
   prompt on entry), or is held-role access with a corrected header label
   enough?
8. **Wrapper strategy:** PWA-only pilot vs Capacitor/TWA — defer until after
   PR9 groundwork, decision needed before store submission work.

---

## Checks run (Phase 9, all non-destructive, 2026-07-06)

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm placeholders:check` | PASS — 173 entries, metadata complete (but 0 ever promoted to real) |
| `pnpm check:i18n-debt` | PASS — within baseline (da=843, de=843, ru=0) |
| `pnpm check:primary-route-smoke` | PASS — 22 routes, 0 blocking (guard covers only literal dead hrefs on 22 of ~50 routes) |
| `vitest run` | PASS — 498 files, 7,813 tests, 75s |
| Playwright e2e | NOT RUN (requires live dev server; out of scope for read-only audit pass) |

All existing failures: none. The green checks confirm the audited issues live
*below* current guard coverage — that is itself a finding (see §15 regression
protection).
