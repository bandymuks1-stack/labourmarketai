# Carousel navigation spec (deliverable D, issue #3679)

Owner: lane A2. Status: SUPPORTING document under
`docs/OWNER_TARGET_ARCHITECTURE_V1.md`. It is not a competing architecture.
Date: 2026-11-23. Base: `main` at `125e21827`.

The spec covers the three-level horizontal carousel that should serve every
public and signed-in surface:
- what has been decided;
- what exists, with files and callers;
- the canonical implementation;
- the gaps against the owner rules;
- a migration plan in small PRs that keeps every existing function reachable.

**Evidence classes** (brief §Evidence):
- PROD: verified in production with a run id.
- MAIN: on `main`, not verified in production.
- PR: only in an open PR.
- PLAN: in a document only.
- UNUSED-OR-DUP: unused or duplicated, with proof.

**Limits:**
- No production walk was run for this spec, so nothing below is marked PROD.
- The A2 browser audit (`docs/audits/A2_DESIGN_AUDIT_2026-11-22.md`) ran
  against a local stack, so its findings are MAIN.
- Lane A's section is in §8.1. Lane M's parts 1 and 2 are in §8.2.

---

## 1. The owner-approved source

### 1.1 What is written down

| Item | Source | Class |
|---|---|---|
| Six top-level **intents** (verbs, not identities) | `apps/web/lib/navigation/public-intents.ts:7-11`, "owner P0 2026-11-12, premium navigation"; "owner window 11 §16" took Workers · Companies · Agencies out of the bar | MAIN |
| The structure: one goal rail plus one active panel under it | `apps/web/components/navigation/goal-navigator.tsx` (doc comment above `GoalNavigator`), "owner-approved structure, 2026-11-12" | MAIN |
| One card rail for goals, a goal's functions and catalogues, public and signed-in | `apps/web/components/navigation/card-rail.tsx:64-80`, "owner concept 2026-11-12" | MAIN |
| The goal set after D1, variant A | `public-intents.ts:95-118`: "orders" folded into "services" (the provider); "contractors" is the buyer goal (owner decision D1, variant A, 2026-11-13). `docs/program/launch/P0_REGISTER.md:135` records "V3 landing (design, D1 variant A, approved LT–EN copy, six locales)" | MAIN |
| The education institution's door sits inside "partners", not as a seventh goal | `public-intents.ts:126-137` (owner 2026-11-19, UX gap I-6) | MAIN |
| Six goals on the first screen as the V2 acceptance | `docs/program/launch/LAUNCH_COMPLETION_ROADMAP.md:20`: "produkcijoje šeši tikslai pirmame ekrane" (six goals on the first screen in production) | PLAN |
| One navigation in both parts; goals visible on the phone without scrolling | `LAUNCH_COMPLETION_ROADMAP.md:22` | PLAN |
| Inner-page goal bar: owed and mandatory | `docs/program/launch/P0_REGISTER.md:17`, `:169` | PLAN |
| Seven visual defects of the signed-in home (cut cards, carousel in carousel, unclear horizontal navigation) | `P0_REGISTER.md:18` | PLAN |
| Role goals decided by server rights | `P0_REGISTER.md:16` (IN PROGRESS, A2) | PR (#3270) |
| One header for every dashboard route; priority plus "More", never a sideways-scrolling tab row | owner order 2026-10-25, `apps/web/lib/guards/one-header-navigation.test.ts:18-33` | MAIN |
| No interface noise | `docs/DECISIONS/0032-no-interface-noise.md` | MAIN |

### 1.2 The six approved goals: exact names and assignments

Ids come from `PUBLIC_INTENT_IDS`
(`apps/web/lib/navigation/public-intents.ts:33-40`). Labels come from
`siteNav.intents.<id>.short` in `apps/web/messages/en.json` and `lt.json`.
Functions are the level-2 links of each goal (`public-intents.ts:72-147`).

| # | id | EN | LT | Level-2 functions (link id → route) |
|---|---|---|---|---|
| 1 | `work` | Find work | Ieškau darbo | jobs → `/jobs`; workOpportunities → `/work-opportunities`; createCv → worker profile door (account; signed-out → sign-up); workAbroad → `/work-abroad`; forWorkers → `/for-workers` |
| 2 | `workers` | Find workers | Ieškau darbuotojų | companyNeed → `/company-need`; forCompanies → `/for-companies`; labourMarket → `/labour-market` |
| 3 | `services` | Offer services | Siūlau paslaugas | myServices → `/dashboard/services`; serviceRequests → `/dashboard/service-requests`; marketListings → `/dashboard/listings`; commercial → `/dashboard/commercial` (all account) |
| 4 | `contractors` | Find services or contractors | Ieškau paslaugų ar vykdytojų | b2bEnquiry, projectEnquiry → request-door fragments on the landing (no account) |
| 5 | `partners` | Find partners | Ieškau partnerių | network → `/dashboard/network` (account); partnerWithUs → request door; setUpInstitution → institution setup (account; signed-out → sign-up) |
| 6 | `agencies` | For agencies | Agentūroms | forAgencies → `/for-agencies`; setUpAgency → agency setup (account) |

The assistant entry is not a goal. It is `ASSISTANT_HREF = "/dashboard"`
(`public-intents.ts:159`) and, signed out, `ASSISTANT_GUEST_HREF =
"/#find"` (`:167`).

### 1.3 What is NOT written down

These are stated as gaps. No names are invented for them.

1. **No standalone decision record** (`docs/DECISIONS/*`) holds the goal
   names or the three-level rule. The names live in code and catalogs, with
   owner dates in comments (§1.1), and in the register rows cited there.
2. **No signed-in goal set is approved in writing.** The coordinator's brief
   (#3679 §D) says "the same principle public and signed-in". No document
   maps the six public goals, or any role-specific goals, onto the signed-in
   areas. #3270 proposed one; it is a PR, not a decision.
3. **Level 3 is defined only for `work`.** `CATALOGUE_GOALS = new
   Set(["work"])` (`apps/web/components/navigation/goal-navigation.tsx:14`)
   gives "Find work" the Professions tab: search, sector chips, profession
   rail and full list. No other goal has a level 3 in code or docs.
4. **An older signed-in contract** describes a different "six-item" primary
   nav: overview, market_map, journal_text_first, communication, planning,
   network (`docs/launch/role-aware-navigation-contract-v1.md:40-56`). The
   current header (`apps/web/lib/config/navigation.ts:146-151`) shows four
   core items plus "More". That contract is out of date and is not a goal set.

**Owner decision OD-1, DECIDED 2026-11-23 as (a) (§7):** the signed-in level-1 set. There are two
options:
- **(a)** the same six goals for everyone, with level 2 filtered by role and
  rights;
- **(b)** role-specific goal sets.

This spec assumes neither. §6 works under both until the owner chooses.

---

## 2. Inventory of every navigation implementation

"Callers" means importers or JSX mounts, found by `grep` on `main` at the
base commit.

### 2.1 Public site

| # | Implementation | File | Callers | What it is | Class |
|---|---|---|---|---|---|
| P1 | `GoalNavigation` (server half) | `components/navigation/goal-navigation.tsx` | `components/marketing/landing-intent-choice.tsx` → `app/[locale]/focus-landing/focus-landing.tsx` (the home) | Resolves labels; feeds `GoalNavigator` from `PUBLIC_INTENTS` | MAIN |
| P2 | `GoalNavigator` (client) | `components/navigation/goal-navigator.tsx` | P1 only | Level 1 goal rail; level 2 panel with function cards; level 3 Professions tab (search, sector chips, profession rail) for `work`; `#goal=<id>` fragment state | MAIN |
| P3 | `CardRail` | `components/navigation/card-rail.tsx` | P2 (goal rail, "more" rail, function rail, profession rail) | The one horizontal rail: native scroll-snap, compact cards, right-edge fade, dots plus "swipe" hint, arrows only on overflow and non-touch; optional `pin` toggle (no caller passes it) | MAIN |
| P4 | `IntentMegaMenu` (desktop goal bar) | `components/layouts/intent-mega-menu.tsx` | `components/layouts/site-nav.tsx` | Header "More" panel of the six intents, plus the "Ask the assistant" link (`intent-bar-assistant`, label shown from `xl`) | MAIN |
| P5 | `MobileNavMenu` | `components/layouts/mobile-nav-menu.tsx` | `site-nav.tsx` | Phone menu: the intents plus the assistant entry (`mobile-nav-assistant`) | MAIN |
| P6 | `SiteNav` | `components/layouts/site-nav.tsx` | `app/[locale]/(marketing)/layout.tsx`, `focus-landing.tsx` | Public header hosting P4 and P5 | MAIN |
| P7 | `SiteFooter` | `components/layouts/site-footer.tsx` | the same two layouts | Legal and contact links, language | MAIN |
| P8 | Auth shell | `app/[locale]/auth/layout.tsx` | auth routes | Logo plus language only; no way back to the goals (`docs/design/UX_UNIFICATION_STATUS.md:62`) | MAIN |
| P9 | `PageQuickNav` | `components/app/page-quick-nav.tsx` | `app/[locale]/cv/page.tsx` | In-page section jumps on `/cv` (lane A) | MAIN |

### 2.2 Signed-in product

| # | Implementation | File | Callers | What it is | Class |
|---|---|---|---|---|---|
| S1 | `ConversationHeader` (the one header) | `components/app/conversation/chat/conversation-header.tsx` | `components/app/dashboard-chrome.tsx` ← `app/[locale]/dashboard/layout.tsx`, `app/[locale]/dashboard/page.tsx` | Back-to-chat, logo, workspace chip, core row, "More", phone sheet, search, language, notifications, avatar | MAIN |
| S2 | Core row and "More" lists | `lib/config/navigation.ts:146-198` (`CORE_NAV_IDS` = overview · journal · planning · communication; `getHeaderOverflowNavItems`) | S1 | Primary items by priority; overflow in "More" and the phone sheet; admin only for admins | MAIN |
| S3 | Role doors in "More" | `lib/navigation/work-areas.ts`: `organizationHeaderAreas` (`:161`), `customerHeaderDoors` (`:206`), `personalHeaderDoors` (`:242`) | S1 | Re-ordering of "More" by acting role; no primary item added | MAIN |
| S4 | `AreaSwitcher` (3D carousel) | `components/app/area-switcher.tsx` | `components/app/today/today-screen.tsx:244` (personal stations), `components/app/organization/company-model-screen.tsx` (organisation areas) | Positioned card chooser on the homes; not a scroller | MAIN |
| S5 | `OrganizationDoors` | `components/app/organization/organization-doors.tsx` via `organization-doors-server.tsx` | `app/[locale]/dashboard/company/layout.tsx`, `app/[locale]/dashboard/projects/page.tsx` | Door chips of the organisation context (now · people · work · needs · market · calendar · partners · learning · history · settings); one row on a phone with the next door peeking (#3613) | MAIN |
| S6 | Command finder | `lib/navigation/command-registry.ts` → `components/app/header-search.tsx` | S1 | Typed search to any real route | MAIN |
| S7 | `AccountMenu` | `components/app/account-menu.tsx` | S1 | Profile, settings, theme, language, CV, admin, sign-out | MAIN |
| S8 | Header place, active item | `lib/navigation/header-place.ts` | S1 | Which item is "you are here" | MAIN |
| S9 | Signed-in home on `GoalNavigator`, role goals, pins | branch `feat/cc/nav-v2` | #3270 (open, draft; conflicts with `main` in ≥ 11 files; Lane R: changes needed) | The earlier attempt at one navigation for both parts | PR |
| S10 | Pin shortcuts, visible assistant entry, home walk, org quick access | #3264, #3267, #3268, #3269 | closed, not merged | Superseded attempts | — |

### 2.3 Data sources that drive navigation

| Source | File | Read by |
|---|---|---|
| Public intents (six goals) | `lib/navigation/public-intents.ts` | P1, P4, P5 |
| Profession sectors | `lib/navigation/profession-sectors.ts` | P1 |
| Card icons | `lib/navigation/nav-card-icons.ts` | P1 |
| Feature catalogue → primary nav | `lib/config/feature-availability.ts`, `lib/config/navigation.ts` | S1, S2 |
| Work areas (personal and organisation) | `lib/navigation/work-areas.ts` | S1, S3, S4 |
| Organisation doors | `lib/company/organization-doors.ts:49` (`ORGANIZATION_DOOR_ROUTES`) | S5 |
| Role-gated prefixes | `lib/auth/role-gated-routes.ts` | middleware; pages re-check rights |

### 2.4 Counts

- **9 public implementations (P1–P9).** Two of them are carousels: P2 runs
  on P3.
- **8 signed-in implementations on `main` (S1–S8)**, plus 5 smaller worker
  surfaces from Lane A (S11–S15, §8.1). Two are carousels or strips: S4, and
  S5 on phones.
- **1 open PR (S9)** and **4 closed PRs (S10)**.

Horizontal card systems on `main`: **3**.
- `CardRail` (P3) — public only.
- `AreaSwitcher` (S4) — signed-in homes.
- `OrganizationDoors` (S5) — organisation pages.

They differ in behaviour:
- P3 is a native scroller with peek and fade.
- S4 is a positioned 3D chooser with no scroller.
- S5 is a single row with the next door peeking.

That is the "carousel in carousel" and "unclear horizontal navigation" in
`P0_REGISTER.md:18`.

---

## 3. The canonical implementation

**`GoalNavigator` on `CardRail`** (P2 + P3), fed by `PUBLIC_INTENTS` through a
server half like `GoalNavigation` (P1).

It is canonical because:
- it is the only implementation that the owner-dated comments name as the
  navigation system for "the public site and in the signed-in app"
  (`card-rail.tsx:64-67`);
- it already holds all three levels (§4);
- it keeps the URL as the state (`#goal=<id>`, `goal-navigator.tsx`, doc
  comment above `GoalNavigator`).

`ConversationHeader` (S1) stays the one header for every dashboard route
(`one-header-navigation.test.ts`). The carousel goes under it, never in it.
The header must not scroll sideways (`:59`).

`AreaSwitcher` (S4) and the phone row of `OrganizationDoors` (S5) are the
other horizontal systems. They are candidates to be merged into `CardRail`.

To prove UNUSED-OR-DUP, each needs a caller-by-caller migration with a guard
first (§6). This spec does not delete either.

---

## 4. Gaps against the owner rules (#3679 §D)

| Rule | Today on `main` | Gap | Evidence |
|---|---|---|---|
| Phone: all six goals in ONE carousel, no "More options" | Home passes `phoneMore={{ ids: ["partners","agencies"] }}` and `phoneLayout="grid"`. A phone shows a 2-column grid of 4 goals plus a "More options" disclosure. | **Gap.** Drop `phoneMore` and `grid` on the landing; `CardRail` already scrolls. | `focus-landing.tsx:102-105`; `goal-navigator.tsx:317-360`; audit metric `goalsFirstScreen` = 4 at 375/390 (`docs/audits/evidence/a2-design-audit-2026-11-22/metrics-public.tsv`) |
| Next card peeks, subtle edge fade, scroll hint | `CardRail` has all three: compact cards about 3½ per view, right-edge mask, dots plus "swipe". The grid layout above switches them off. | Comes back with the fix above. | `card-rail.tsx:69-74`, `:208`, `:320-330` |
| Tablet (768) | One rail; 3½ goals visible; arrows on overflow | Meets the carousel rule. Not all six are on the first screen without a swipe, which is accepted on tablets unless the owner says otherwise. | audit `home-*-768-*` contact sheets |
| Level 2 opens immediately | Choosing a goal sets `#goal=<id>` and renders the panel in place, with no page load. Function cards link to the function itself. | None on public. Signed-in has no level 1, so nothing to open. | `goal-navigator.tsx` (doc comment above `GoalNavigator`) |
| Level 3: categories and filters | Only `work` has a catalogue: Functions \| Professions tabs, search, sector chips, profession rail, full list | **Gap** for the other five goals. No level-3 content is approved for them (§1.3.3). | `goal-navigation.tsx:14` |
| The same principle public and signed-in | Public: P2/P3. Signed-in: header S1 plus S4/S5 strips; no goal rail on any signed-in page (audit: `goalNav=False`, `intentBar=False` on all 15 signed-in screens). | **Gap.** The owed inner-page goal bar (`P0_REGISTER.md:17`). Needs OD-1. | `metrics-institution.tsv`, `metrics-student.tsv` |
| Role-aware | Public: `account` links go through sign-in or sign-up with `?next=`; pages re-check rights. Signed-in: "More" re-ordered by acting role (S3); doors decided server-side (S5). | Partly. Goals are not yet filtered by server rights; that is #3270, not on `main`. | `public-intents.ts:13-25`; `work-areas.ts:161-249`; `P0_REGISTER.md:16` |
| Pin, unpin, reorder | `CardRail` renders a pin toggle as a sibling of the card link (44 px, its own name), but no caller passes `pin`, and nothing stores pins. Reorder does not exist. | **Gap.** Storage is the open question: decision 0024 allows no second memory, so pins must live in the canonical profile tables under RLS. That needs a migration, which is RED, not GREEN. | `card-rail.tsx:51-60`, `:273-280`; #3264 closed |
| AI entry on every needed screen | Public: header link from `xl`; at ≤ 768 only inside the menu. Signed-in: the home is the assistant (`/dashboard`); inner pages reach it through "My space" or the back arrow, unmarked. | **Gap.** The phone header has 6 px to spare at 320 px (`conversation-header.tsx:287-288`: 282 of 288 px), so a new icon does not fit. Proposal: mark "My space" (core item `overview`) with the assistant mark, and add the assistant as the first card of level 1. Needs OD-2. | audit `aiVisible`; `public-intents.ts:159-167` |
| No page-wide horizontal scroll | None found in 2,688 shots | Holds. Must stay held (guard plus walk). | audit `sideways` column |
| Deep links preserved | `#goal=<id>` with `GOAL_ID_ALIASES` (`orders` → `services`); `?next=` through sign-in or sign-up; request-door fragments; every href checked against the route tree | Holds on public. Signed-in goal fragments do not exist yet; they must reuse the same `GOAL_FRAGMENT_PREFIX`. | `public-intents.ts:174-206`; `lib/guards/public-intents.test.ts` |
| Every card does a real action | Every intent href is an existing route (guard); a function card opens the function | Holds. | `public-intents.ts:13-14` |

---

## 5. Target behaviour (as built on the canonical component)

1. **Level 1, the goals.** One `CardRail`, six cards, the same ids and labels
   as §1.2.
   - Phone: one row, compact cards, the next one peeking, a right-edge fade,
     dots and the swipe hint.
   - Desktop: one row of six.
   - No "More options" anywhere.
   - Signed in: the same rail at the top of the home and under the header on
     inner pages, subject to OD-1.
2. **Level 2, the functions.** Choosing a goal opens its panel in place,
   with the address `#goal=<id>`. Back closes it; a shared link reopens it.
   - Signed in, the function list is the goal's functions that the person's
     server-side rights allow.
   - A function the person cannot use is left out, not shown disabled.
3. **Level 3, categories and filters.** On `work`: the existing Professions
   tab. On other goals: only when the owner approves content for them; until
   then, none.
4. **Pins.** A person may pin a level-2 function to the front of their
   level 1, unpin it, and reorder pins.
   - Pinned cards are real links, and unpinning never removes access.
   - Storage under RLS in the canonical tables (decision 0024) is RED and
     needs a human gate.
5. **Assistant.**
   - Public: visible as a card or header link at every width.
   - Signed in: the home is the assistant, and "My space" carries the
     assistant mark on every page (OD-2).
6. **The header stays the one header.** The carousel is page content under
   it. Nothing in the header scrolls sideways.

---

## 6. Migration plan in small PRs

Every step keeps every existing function reachable by the same or a shorter
path. Each step ships with:
- a guard or e2e test;
- 375/390/768/1440 screenshots in light and dark;
- before and after heights;
- an R3 review.

Steps marked RED stop for a human gate.

| Step | Scope | Class | Keeps access because | Guard or test |
|---|---|---|---|---|
| N1 | Landing: drop `phoneMore` and `phoneLayout="grid"`, so the six goals sit in one rail on phones. Remove the now-unused `moreChoices` copy only if no other caller reads it. | GREEN, A2 (home; coordinate with A, owner of the V3 landing) | All six goals stay in the same rail; `#goal=partners` and `#goal=agencies` keep working | Update `lib/guards/landing-intent-choice.test.ts`, `landing-entry-story.test.ts`, `tests/e2e/landing-intent-choice.spec.ts`, `landing-v3.spec.ts`, `landing-mobile-overflow.spec.ts` to assert one rail and six cards |
| N2 | Public assistant entry visible at ≤ 768 (header icon in `SiteNav`, which has room on public pages) | GREEN, A2 | Additive link to the existing `ASSISTANT_HREF` / `ASSISTANT_GUEST_HREF` | Extend `public-intents.test.ts` and the mobile e2e |
| N3 | Signed-in: mark "My space" with the assistant mark (icon plus accessible name), no new control | GREEN, A2; after OD-2 | Same route, same item | `one-header-navigation.test.ts`, `nav-chrome-labels-localized.test.ts` |
| N4 | Signed-in goal rail on the home: mount `GoalNavigation` under the header in `today-screen` and `company-model-screen` **beside** the `AreaSwitcher` (no removal yet). Take #3270's server-rights filter, re-based on `main`, not its whole branch. | GREEN, A2 with A (worker home) and M (company home); after OD-1 | Additive | A role walk counting navigation actions (≤ 2 to the start of any function), from #3268's closed spec |
| N5 | Inner pages: the same rail as a compact strip under the header in `dashboard-chrome` panel mode, collapsed to level 1. An earlier attempt rendered pages twice; it must mount once in the layout, not per page. | GREEN, A2; after N4 | Additive | A guard that `GoalNavigator` mounts once per page; e2e that no page renders twice |
| N6 | Replace `AreaSwitcher` on the homes with level 2 of the rail, caller by caller: today-screen first, then company-model-screen | GREEN per caller; A or M review | Every station or area becomes a level-2 card of the same goal, the same route. Remove a caller only after N4 shows the same set. | A guard listing every former `AreaSwitcher` href as reachable from the rail |
| N7 | `OrganizationDoors` rendered through `CardRail` (Option A, §8.2). One label key per route with the header areas (M1). Fix the stale doors docblock. | GREEN, M | Same doors, same server list, same routes | Update `page-pattern-consistency.test.ts:43-55`, `phone-journeys-isolated` doors block, `prod-mobile-surfaces` M-6 |
| N7a | Mount the doors on `/dashboard/planning` and `/dashboard/service-requests` for an organisation context (M2) | GREEN, M | Additive | A guard: every door target mounts the doors |
| N11 | Listings group tabs and scouting filter chips: through `CardRail`, or wrap (M3) | GREEN, M | Same tabs and filters | Add both to `page-pattern-consistency` |
| N8 | Level 3 for further goals: only after the owner approves the categories | PLAN | — | — |
| N9 | Pins: store, unpin, reorder | **RED** (new columns or table under RLS, decision 0024) | Pins only add a shortcut | Migration-safety, RLS tests, and a human gate |
| N10 | Remove the code left with no caller after N6/N7 (`AreaSwitcher` if it has no caller, `phoneMore` and `goal-rail-more`) | GREEN; only with a caller-grep proof in the PR | No caller left | `e2e-testid-orphans.test.ts`, typecheck |

Order: N1 → N2 → N7a → N11 → OD-1/OD-2 → N3 → N4 → N5 → N6 → N7 → N10; N8 and N9 when
decided. #3270 is not merged as is: N4 takes only its server-rights filter.

---

## 7. Owner decisions needed

| id | Question | Options | Default until decided |
|---|---|---|---|
| OD-1 | The signed-in level-1 set | **DECIDED (a)**, owner P0 2026-11-23: "Visi šeši pagrindiniai tikslai turi būti pasiekiami viešuose ir prisijungusių vartotojų ekranuose. Funkcijos pritaikomos pagal naudotojo vaidmenį." (All six main goals must be reachable on public and signed-in screens. Functions are adapted to the user's role.) The same six goals for every role; level 2 filtered by server rights. | — |
| OD-2 | The signed-in AI entry | **DECIDED (a)**, owner P0 2026-11-23 ("AI asistentas aiškiai matomas ir pasiekiamas", the AI assistant clearly visible and reachable), with the variant chosen by the coordinator: "My space" carries the assistant mark. A seventh header control does not fit at 320 px. | — |
| OD-3 | Level 3 for goals other than `work` | the categories per goal | None |
| OD-4 | Pins storage (RED) | a profile column or a table under RLS | No pins |
| OD-5 | Retire `docs/launch/role-aware-navigation-contract-v1.md` §"Primary navigation — the six-item contract" | mark SUPERSEDED by this spec and `lib/config/navigation.ts` | It stays, out of date |

---

## 8. Lane sections

### 8.1 Lane A (worker home, sign-up, job search, CV)

Received 2026-11-23 05:13 UTC from Lane A (session message). The full table
is in issue #3679, comment 7092221505. Class MAIN, base `125e2182`; local
browser click-through, `lt`, 390 and 1440 px.

**The one signed-in header (S1).**
- Mounted by `components/app/dashboard-chrome.tsx` and
  `components/app/conversation/chat/conversation-chat.tsx` (checked: these
  are the two JSX mounts). The dashboard layout renders it through the chrome.
- Three presentations: the core row on desktop, "More" (`:508`) and the phone
  area sheet (`:621`), plus the worker journal shortcut (`:443`).
- Items come from **two models**: `lib/config/navigation.ts`
  (`getCoreNavItems` `:155`, `getHeaderOverflowNavItems` `:183`) and
  `lib/navigation/work-areas.ts` (`organizationHeaderAreas` `:161`,
  `customerHeaderDoors` `:206`, `personalHeaderDoors` `:242`).

**Card carousels.** Two implementations, confirming §2.4:
- `AreaSwitcher`, used by `today-screen.tsx` and `company-model-screen.tsx`;
- `CardRail`, used by the public goals.

**Further worker surfaces, not in §2:**

| # | Surface | File | Class |
|---|---|---|---|
| S11 | Command finder UI | `components/app/command-finder.tsx` (data: S6) | MAIN |
| S12 | Notification panel | `components/app/notification-panel.tsx` | MAIN |
| S13 | Planning connections on bookings | `app/[locale]/dashboard/bookings/page.tsx:327` (`PlanningConnections`) with `components/ui/premium-action-card.tsx` | MAIN |
| S14 | Profile destinations row | `app/[locale]/dashboard/profile/page.tsx:995` (`profile-destinations`) | MAIN |
| S15 | Page back link | `PageBack`, 23 files mount it (grep `<PageBack`) | MAIN |

S11 and S12 are header utilities. S13 and S14 are in-page link rows, not
navigation systems. They stay as they are; none of them is a carousel.

**Browser results (Lane A, local, not PROD):**
- Phone sheet: 8/8 links open the right page.
- Desktop "More": 4/4 links open the right page.
- Stations: 6/6 cards open; arrows and touch swipe work; the page does not
  move sideways.
- Public goals: 6/6 cards open their panel.
- Phone: 4 goal cards show, with 2 under "Daugiau pasirinkimų" (More
  options). This matches §4 row 1 and the A2 audit.

**Not checked by Lane A:**
- company, agency, subcontractor and institution navigation (Lane M, §8.2);
- pin and unpin (`card-rail.tsx:273-280`, covered in §4).

**Effect on the plan:**
- N6 (`AreaSwitcher` → rail on the worker home) is Lane A's area. Lane A
  reviews it.
- The two item models in the header stay. N3–N5 change neither.

### 8.2 Lane M (company and agency workspaces, need and service forms)

Received 2026-11-23 05:24 UTC from Lane M, part 1 of 2 (session message).
Class MAIN, base `125e21827`: code reading plus a local walk. Lane M
re-checked four claims by hand; A2 re-checked the starred ones (★) by grep.

**Count.** 30 navigation surfaces on employer and agency screens:
- 11 inside the one header: back arrow, logo, workspace chip, place crumb,
  core row, "More", phone sheet, search, language, bell, account menu;
- 19 on pages.

Four model files feed them:
- `lib/config/navigation.ts`;
- `lib/navigation/work-areas.ts`;
- `lib/company/organization-doors.ts`;
- `lib/navigation/command-registry.ts`.

There is no sidebar and no bottom bar. `CardRail` has no signed-in
importer ★.

**Page surfaces beyond §2:**
- `PageBack`;
- "My spaces" (`company/page.tsx:281-287`);
- `company-primary-actions` and `company-decisions-strip`;
- `CompanyActionNextActions`;
- `PremiumActionDeck` (a grid);
- projects Active/Finished;
- calendar views and filters;
- roster timeline;
- scouting need picker and filter chips;
- reports window switch;
- finance filters;
- listings group tabs;
- history neighbours;
- chat chips;
- My Space row.

Most are in-page controls, not navigation systems. Three matter for this
spec:

| # | Finding | Evidence | Effect on the plan |
|---|---|---|---|
| M1 | Doors (S5) and header "More"/sheet list the same destinations on the same screen, with different labels and ids (`work` means projects in the doors, hours in the areas). The code calls it a duplicate pending "the P1 unification". | `lib/guards/organization-door-routes-agree.test.ts:8-13` ★; labels in §10, item 3 | N6/N7: one item model and one label key per route |
| M2 | **The doors vanish behind two of their own doors.** `calendar` → `/dashboard/planning` and `market` → `/dashboard/service-requests` do not mount `OrganizationDoorsServer`. This breaks `company/layout.tsx:12-13` ("a person never loses the doors while standing inside one of them"). | grep count 0 in both pages ★ | New step N7a (GREEN, M) |
| M3 | **Listings group tabs scroll sideways at every width**, with no snap and no guard (`marketplace-listings-section.tsx:427-430`, plus rows at 458 and 486). The scouting filter chips are a second sideways row on phones (`company/scouting/page.tsx:682`). | ★ both | New step N11 (GREEN, M): CardRail or wrap; add a guard |

**More overlaps (code; not walked):**
- **Up to five links home on `/dashboard/company`:** back arrow, logo, core
  overview, `PageBack` and "My spaces" (`company/page.tsx:280-287`).
- **No way back to the company hub from the home's menus:**
  `/dashboard/company` (door `now`) is not in `ORGANIZATION_WORK_AREAS`, so
  not in "More", the sheet or `AreaSwitcher`.
- **Gate mismatch:**
  - the doors use `resolveEmployerCompanyContext` (membership);
  - the header areas use `actingRoleForWorkspace` (membership plus a held
    role);
  - so a manager without a held role gets the doors but no organisation areas
    in "More".

**The snap question, decided here (canonical component, freeze rule):**
- Lane M offered two options:
  - **Option A:** move the doors onto `CardRail`.
  - **Option B:** widen the one-rail guard so the doors may snap on their own.
- **This spec chooses Option A** for N7. `CardRail` is the canonical rail
  (§3), and the brief forbids a new alternative. Option B would keep a second
  snapping strip.

What Option A changes:
- `aria-current="true"` replaces `"page"`;
- `data-card-id` replaces the `organization-door-*` test ids;
- icon-on-top cards with dots and a swipe hint on phones;
- an arrowed row instead of wrapping from `sm`.

Tests to update:
- `lib/guards/page-pattern-consistency.test.ts:43-55`;
- `tests/e2e/phone-journeys-isolated.spec.ts:1826-1867`;
- `prod-mobile-surfaces` M-6.

`lib/guards/shared-ui-system.test.ts:69-82` needs no change. Lane M builds
it after this spec merges.

**Stale text, fixed together with N7:**
- `organization-doors.tsx:33-35` still says "WRAPPING at every width".
- `page-pattern-consistency.test.ts:5-15` says "no navigation strip scrolls
  sideways", which M3 contradicts.

**Contract versus code (`docs/launch/role-aware-navigation-contract-v1.md`):**
- The six-item catalogue holds (`compact-nav-marketplace-ia.test.ts:39`).
- No `BottomNav` or `DashboardTabs` exists; the rendered core row has 4
  items.
- `components/app/company-locations-section.tsx` does not exist; locations
  are at `#company-locations`.
- "No second calendar" holds.
- This supports OD-5.

**A2 audit items, as Lane M sees them on employer screens:**
- Item 3 (no assistant control on inner pages) holds for employers too.
- Item 10: the settings checkboxes are 13 × 13, but each sits inside a label
  of 309 × 60–83 px, so the tap target is the label. Not a defect.
- Item 11 (calendar prev/next 35–40 px) is shared with employers.

**Part 2 of 2** (received 05:24 UTC): Lane M's design audit of 2026-11-22.
- **Coverage:** 1,160 screens, 29 routes, employer and agency accounts.
- **Base:** `f65c5721`, on the local stack. Not production.
- **Evidence:** a private artifact page owned by the owner, shared on request.
- **Already merged:** #3660, #3661, #3662, #3665, #3666, #3613 and #3678.
  These are local-verified only.

**Subcontractor.**
- There is no separate subcontractor workspace. A subcontractor is an
  organisation acting as a provider through the same company workspace:
  `/dashboard/services`, service-requests, listings, commercial.
- Those screens were audited under the employer and agency accounts.
- No subcontractor-only account was seeded, so subcontractor gating was
  **not walked**.

**Remaining defects.** Cause codes:
- OLD/NEW: an older and a newer component do the same job on one screen.
- NAV: competing navigation.
- LOCAL: a single-component defect.

A2 spot-checked ★ items. The others are Lane M's, not re-checked here.

| # | Defect | Where | Cause | Navigation-relevant |
|---|---|---|---|---|
| 1 | Three ways to start a project; "no projects yet" said twice | `dashboard/projects/page.tsx:487`, `:547-551` ★, `project-assignment-manager.tsx:484` | OLD/NEW; owner decision on which way stays | C5 (one action, one entry) |
| 2 | The agency home leads with the employer's actions: "Describe a need" and the "What we need" card first | `company-model-screen.tsx:78` ★ (`NeedDoorLink`), `ORGANIZATION_WORK_AREAS` order | LOCAL; the role order is not applied (product decision) | **C5: FAIL for agency** |
| 3 | Approvals card reads as a contradiction ("0 … no employees" beside 12 linked people); duplicated with `arena/confirm-pulse.tsx` | `organization-today-view.tsx:180` | LOCAL copy plus OLD/NEW | no |
| 4 | Status legend shown on an empty queue; the empty state said twice | `dashboard/inbox/page.tsx:308` → `evidence-status-strip.tsx` | LOCAL | no |
| 5 | Two "How this works" folds on candidate drafts | `candidate-drafts-manager.tsx:282`, `company-action-next-actions.tsx:57` | OLD/NEW | no |
| 6 | Workforce planning stat labels wrap to 4 lines on phones | `organization-today-panel.tsx` | LOCAL | no |
| 7 | Commercial add rows cramped on phones; the placeholder is cut | `commercial-panel.tsx` | LOCAL | no |
| 8 | Many available-workforce rows read "Work type not stated" | `available-supply-section.tsx` | LOCAL copy or data | no |
| 9 | "Assign to a project" wraps under a long name (+23 px per card) | `identity/person-identity-card.tsx` | LOCAL | no |
| 10 | Pricing notice repeated in every plan | `marketing/pricing-table.tsx` | LOCAL; price and legal text, owner's call (A2 audit item 6 too) | no |
| 11 | The worker "visible to employers" consent block shows on a company owner's privacy page | `dashboard/privacy/page.tsx:214` | LOCAL role gate; consent text, owner's call | C5 |
| 12 | Connected apps failed to load (local only) | `connected-apps-section.tsx:35` | unknown; not checked in production | no |
| 13 | Consent banner on top until answered | — | by design | no |

The NAV-cause defects are M1, M2 and M3 above, plus the five links home and
the missing hub entry.

Lane M checked these and found no defect:
- 0 screens scroll sideways at page level;
- 0 script errors and 0 raw keys;
- every small-target hit is a checkbox inside a label at least 40 px tall.

Under the freeze, Lane M fixes items 1–13 only with the coordinator's OK.
They go to the simplification plan (E).

---

## 9. Verification checklist per role (owner P0 addendum)

This checklist is also the click script for lane L's production walks
(devices 375/390/768/1440, light and dark).

**Base:** `main` `125e21827`.

**Evidence keys:**
- `A2` — this lane's local audit (`docs/audits/evidence/a2-design-audit-2026-11-22/`, contact sheets plus `metrics-*.tsv`).
- `LA` — Lane A's local click-through (§8.1).
- `code` — the file and line given.

"Not measured" means nobody has looked yet; it is not a pass.

### 9.1 The seven checks

| id | Check | PASS when |
|---|---|---|
| C1 | Six goals in one level-1 carousel | One rail with all six goals of §1.2 at every width. No "More options". On phones the next card peeks, the right edge fades and the swipe hint shows. |
| C2 | Level-2 function carousel | Choosing a goal opens its function cards in place; the address carries `#goal=<id>`; Back closes it. |
| C3 | Level-3 categories and professions | The goal's catalogue tab (search, sector chips, profession rail) works where level 3 exists; nothing empty is shown where it does not. |
| C4 | AI assistant always reachable | One visible tap from every screen opens the assistant: `/dashboard`, or `/#find` when signed out. |
| C5 | Role-appropriate functions | Level 2 shows only what the person's server-side rights allow; every card opens a working page for that role. |
| C6 | Pin and reorder | A permitted function can be pinned, unpinned and reordered; this persists across sessions; access never depends on a pin. |
| C7 | Same behaviour public and signed-in | C1–C3 behave the same on the public home and in the signed-in product. |

### 9.2 Current state per role

The signed-out state is the same for every role: the public home.

| Role / mode | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
|---|---|---|---|---|---|---|---|
| Any role, signed out | **FAIL** on phones: 4 goals plus "More options" (`focus-landing.tsx:104`; A2 `goalsFirstScreen`=4 at 375/390; `public-home-390-*`). Desktop 6 in one row (A2 1440). Tablet one rail, 3½ visible. | PASS: 6/6 panels open (LA); `#goal=` state (code) | PASS for `work` only; none for the other five (`goal-navigation.tsx:14`) | **FAIL** at ≤ 768: only inside the menu (A2 `aiVisible`=False); PASS at 1440 | n/a; account links go through sign-up with `?next=` (`public-intents.ts:13-25`) | **FAIL**: not built (`card-rail.tsx:273-280`, no caller) | baseline |
| Worker, signed in | **FAIL**: no goal rail; home shows `AreaSwitcher` stations instead (`today-screen.tsx:244`; A2 `goalNav`=False) | **FAIL**: no level 2; stations are single links (LA 6/6 open) | **FAIL**: none | Home: PASS (the home is the chat). Inner pages: **FAIL**, unmarked "My space" only (A2) | Partly: "More" re-ordered by role (`work-areas.ts:242`); LA 8/8 sheet, 4/4 More | **FAIL** | **FAIL** (different component) |
| Student, signed in | **FAIL**: same as worker (A2 `student-dashboard-*`) | **FAIL** | **FAIL** | Home PASS; 5 inner pages **FAIL** (A2 `aiVisible`=False on learning, network, inbox, planning, profile) | Partly: same as worker | **FAIL** | **FAIL** |
| Employer, signed in | **FAIL**: no goal rail; organisation `AreaSwitcher` (`company-model-screen.tsx`) and `OrganizationDoors` | **FAIL** | **FAIL** | Home: PASS, the company home shares the assistant column (#3665, Lane M). Inner pages: **FAIL**, back arrow or logo only (Lane M, §8.2) | Partly: doors decided server-side (`organization-doors.ts`); "More" by acting role (`work-areas.ts:161`) | **FAIL** | **FAIL** |
| Agency, signed in | **FAIL**: same components as employer | **FAIL** | **FAIL** | As employer | **FAIL**: the agency home leads with the employer's actions (§8.2, defect 2) | **FAIL** | **FAIL** |
| Subcontractor, signed in | As employer: no separate subcontractor workspace exists; a provider uses the company workspace (§8.2) | As employer | As employer | As employer | **Not walked**: no subcontractor-only account (§8.2) | **FAIL** | **FAIL** |
| Institution, signed in | **FAIL**: organisation `AreaSwitcher` plus `OrganizationDoors` with Learning (A2 `institution-dashboard-*`, `institution-dashboard_company_education-*`) | **FAIL** | **FAIL** | Home PASS (A2 `aiVisible`=True); 8 inner pages **FAIL** (A2) | Partly: the education door only with the capability (`work-areas.ts:115-120`) | **FAIL** | **FAIL** |

### 9.3 Click script (for lane L)

Run it per role, per device (375, 390, 768, 1440), per theme (light, dark).

1. Signed out, open `/<locale>`:
   - count the goal cards in the first viewport and in the rail;
   - assert that no "More options" control exists (C1);
   - swipe or scroll the rail: assert the next card peeks and the page does
     not scroll sideways (C1).
2. Tap each goal:
   - assert `#goal=<id>` and the panel with its function cards (C2);
   - open each card: assert HTTP 200 and the page's `h1`, or sign-up with
     `next=` for account cards (C2, C5);
   - press Back: the panel closes (C2).
3. On `work`, open Professions:
   - type into search, choose a sector chip, open one profession card (C3).
4. Find the assistant entry without opening a menu; tap it:
   - `/#find` when signed out, `/dashboard` when signed in (C4).
5. Sign in as the role. On `/dashboard`, and on three inner pages of that
   role, repeat steps 1–4 (C7). Today they fail; record FAIL with the
   screenshot.
6. On each level-2 card, assert that it opens a page the role may use, and
   that no card the role may not use is shown (C5).
7. Pin one function, reload, reorder, unpin (C6). Today the control does not
   exist; record FAIL.

---

## 10. Where the remaining design defects come from

Each cause below is evidenced from the code. One is not established.

1. **Competing navigations: YES.** Three horizontal card systems behave
   differently (§2.4):
   - `CardRail` scrolls natively;
   - `AreaSwitcher` is a positioned 3D chooser;
   - `OrganizationDoors` is a single row of chips.

   The signed-in header draws from two item models (`lib/config/navigation.ts`
   and `lib/navigation/work-areas.ts`, §8.1). That produces "carousel in
   carousel" and "unclear horizontal navigation" (`P0_REGISTER.md:18`) and
   the C7 failures.
2. **Old versus new workspace components: YES.**
   - `OrganizationDoors` comes from 2026-09-16
     (`organization-doors.tsx` doc comment).
   - `AreaSwitcher` comes from 2026-10-25 (`area-switcher.tsx` doc comment).
   - `CardRail` and `GoalNavigator` come from 2026-11-12.

   The signed-in homes still use the two older ones. The newer one exists
   only on the public home.
3. **Duplicate translation keys for one destination: YES, in navigation
   labels.** The same route carries different names in the two signed-in
   models (`apps/web/messages/en.json`):

   | Route | `companyModel.*` (`AreaSwitcher`) | `organizationDoors.*` (doors) |
   |---|---|---|
   | `/dashboard/company/people` | People & team | People |
   | `/dashboard/projects` | Projects & objects | Work |
   | `/dashboard/company/needs` | What we need | Needs |
   | `/dashboard/company/partners` | Clients & suppliers | Clients & partners |

   A person sees two names for one place. The fix is one label key per route,
   reused by the rail. That is a copy and translation change in 11 catalogs,
   part of N6 and N7.
4. **Duplicate notification mechanisms: NOT ESTABLISHED.** No navigation
   surface sends or renders notifications other than the one header bell
   (`components/app/notification-panel.tsx`, S12). Whether other notification
   paths duplicate each other is outside this spec and was not checked here
   (deliverable C, lane E).

These findings go to lane E for `docs/audits/DUPLICATION_AUDIT.md`.

---

## 11. Acceptance

**Not yet confirmed by people.** "Done" for each step means:
- the guard and e2e listed in §6 pass;
- screenshots at 375/390/768/1440 in light and dark are attached;
- an R3 review is recorded.

PROD only with a production walk run id.
