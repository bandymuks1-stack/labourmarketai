# FULL PRODUCT SURFACE INVENTORY — labourmarket.ai

Pinned at `origin/main` `779357aac31a28704c169bba2a03265a2f104f42`. Built from
the pinned worktree's route tree plus a real browser pass over the surfaces
marked **[measured]**. Everything not marked `[measured]` is a static read of
the route file and is labelled as such.

Counts: **16 marketing routes · 4 auth routes · 4 standalone routes · 35
`/dashboard` routes · 20 `/dashboard/admin` routes · 11 chat result kinds.**

## Chrome model — the structural finding

`DashboardChrome` (`components/app/dashboard-chrome.tsx`) picks one of three
shells per route:

| mode | routes | chrome rendered |
|---|---|---|
| `conversation` | `/dashboard` only | **none** — children bare; the chat supplies a header with *no nav items* |
| `panel` | `/dashboard/{communication,planning,profile,journal}` | `ConversationHeader` + a back arrow. No tabs, no bottom nav |
| `full` | **every other route (~50)** | sticky header, `DashboardTabs` (7 tabs), `HeaderSearch`, `LocaleSwitcher`, `NotificationPanel`, `RoleSwitcher`, `AccountMenu`, `BottomNav`, Rexora credit |

So the product ships **two competing navigation systems**, and the primary
navigation changes identity when the user moves between them. `navigation.ts`
comments record that this was already identified once ("people lose orientation
when the primary tabs change between screens") and that the fix was to give both
shells the same core list — that fix landed in `getCoreNavItems()` but the
`conversation` and `panel` shells **render no nav at all**.

`dashboard/page.tsx:32` documents "its own simple-mode header + bottom nav (the
5-item nav)". **[measured]** `/lt/dashboard` contains **0 `<a>` elements** for a
worker and 4 for a company. `ConversationHeader` accepts `nav` and uses only
`nav.chat` as the back-arrow `aria-label`. That bottom nav does not exist in the
DOM.

## A. Public / marketing

| route | intended user | primary task | obvious in <5 s? | verdict |
|---|---|---|---|---|
| `/[locale]` | first-time visitor | understand + sign up | not measured | keep |
| `/auth/login` **[measured]** | returning user | sign in | **yes** | keep — **but see P0-1 below** |
| `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password` | new / locked-out | credential flow | static read | keep — same P0-1 |
| `/onboarding` | new user | first setup | not measured | keep |
| `/business/[slug]` | anyone | view a company | static read | keep |
| `/cv` | worker | export CV | static read | candidate for `?result=` |
| `/invite/[token]` | invitee | accept invitation | static read | keep |
| `(marketing)/` ×16 — `about, company-need, for-agencies, for-companies, for-workers, labour-market, match-preview, pricing, professions, questions, skills, vision, work-abroad, work-opportunities, worker-intake` | prospects | inform / capture | static read | out of this audit's browser scope; flagged for a marketing-IA pass |

**P0-1 — credentials can reach the URL.** All four auth forms are
`<form onSubmit={…} noValidate>` with **no `method`**
(`login-form.tsx:116`, `signup-form.tsx:167`, `forgot-password-form.tsx:75`,
`reset-password-form.tsx:108`). A submit issued before React hydrates falls back
to the browser default — a **GET to the current URL with every field as a query
parameter**. Reproduced in a real browser:
`http://127.0.0.1:3450/lt/auth/login?email=dev.worker%40local.test&password=password`.
The password then sits in browser history, the server access log and any
`Referer`. On a slow phone the hydration window is exactly when an impatient
user presses Enter.

**A11y note [measured]** — on `/auth/login` the email and password fields expose
no accessible name in the a11y tree.

## B. Personal workspace

| route | lines | primary task | chrome | notes |
|---|---|---|---|---|
| `/dashboard` **[measured]** | 155 | ask the AI anything | `conversation` | see `CHAT_FIRST_DASHBOARD_V1.md`. **0 links** |
| `/dashboard/profile` **[measured]** | 1007 | edit identity + CV | `panel` | 6.8 / 10.9 folds — see `W7_PROFILE_FULL_INVENTORY.md` |
| `/dashboard/journal` **[measured, company]** | — | log work | `panel` | 2.6 folds, 3 sections. Healthy |
| `/dashboard/planning` **[measured, company]** | 858 | calendar | `panel` | 1.6 folds, 2 `<h2>` ("Vėliau", "Dar be datos"). Thin |
| `/dashboard/communication` | 466 | messages | `panel` | static read |
| `/dashboard/opportunities` | **1111** | find work | `full` | largest worker page; not browser-measured |
| `/dashboard/account`, `/privacy`, `/documents`, `/gallery`, `/absences`, `/activity`, `/assets`, `/learning`, `/inbox`, `/instructions`, `/listings`, `/network`, `/services`, `/service-requests`, `/start`, `/tasks`, `/reports`, `/intelligence`, `/assist`, `/talent`, `/market-map` | 60–732 | varied | `full` | **21 routes reachable only via 7 tabs, the account menu or quick-search** |

`market/` and `people/` are directory nodes with **no index page** — sub-routes
only. Not defects; noted so a future IA pass does not link them.

## C. Organization workspace

| route | primary task | measured | finding |
|---|---|---|---|
| `/dashboard` (company identity) **[measured]** | ask the AI | 1440: greeting y=388, chips y=481, composer y=545; panel 352 px holding a 319×272 map | **the organisation is named only in the header chip.** The `<h1>` is the worker-flavoured "Labas, Dev. Kuo šiandien galiu padėti?"; the main column never states which organisation the next action will affect |
| `/dashboard/company` **[measured]** | run the organisation | **7028 px / 7.8 folds at 1440; 10419 px / 12.8 folds at 375**; 18 cards, 22 sections, **16 `<h2>`**, 13 unlabelled inputs, 65 sub-44 px targets; TTFB 15.2 s local | one page carrying: company identity, "what you can do here", staffing agencies, readiness, operations space, teams/brigades, employees, locations, gallery, readiness signals, members & review, public profile, worker search, submitted needs, internal support requests, candidate search. **This is the employer's whole domain on one scroll.** |
| `/dashboard/candidates` (110), `/bookings` (461), `/projects` **[measured]**, `/buyer` (396), `/finance` (668), `/commercial` (43) | pipeline, booking, delivery, billing | projects: 4219 px, 24 cards, 60 sub-44 px | `/projects` renders a section headed "**Ruošiama** — projektai ir komandos" ("in preparation") inside an active surface |

## D. Admin (20 routes)

`agent-os, billing, candidate-pool, company-need-intakes, company-verification,
import-sandbox, intelligence-observations, language-feedback, launch-readiness,
league, market, matching, need-structuring, pilots, pipeline, project-truth,
readiness, support, telemetry, users/[id]`

| route | measured | finding |
|---|---|---|
| `/dashboard/admin` **[measured]** | 3855 px, 21 cards, 8 `<h2>`, 46 sub-44 px, TTFB 24 s local | Six KPI tiles (active people, incomplete profiles, companies, open demand, awaiting review, skill declarations) with an explicit note that **numbers without a link lead nowhere and change nothing**. Honest, but six dead ends occupy the first fold of the operator's home |
| `/dashboard/admin/company-verification` **[measured]** | 2547 px, 6 cards, 24 buttons, **36 unlabelled inputs** | **P1-A** — the count line renders `pendingCount` with `count: 0`, whose LT plural is "**Nėra užklausų, laukiančių patvirtinimo**" ("no requests awaiting approval"), printed directly above six organisations each carrying live *Patvirtinti / Palikti nepatvirtintą / Grąžinti į laukiančias* controls. The operator is told there is nothing to do while looking at an actionable list. `empty` (the true empty state) has different, correct copy |
| `/dashboard/admin/pipeline` **[measured]** | 900 px, 6 cards | Good: states "review only", explains that counts come from really-loaded rows, names the per-source caps |

Admin chrome is the `full` shell plus an "Admin režimas — valdote platformą"
banner and a "← Grįžti į savo erdvę" escape. Role context is clear. Consequence
copy, required-reason capture and success/error feedback per queue are **not**
uniformly present — company-verification exposes an optional note field with no
label and no stated consequence for each of the three buttons.

## E. Chat result kinds (`lib/conversation/result-registry.ts`)

`calendar · candidates · engagements · evidence · experiences · invoice ·
journal · market · opportunities · player-card · project`

Eleven surfaces already render **inside** the conversation rather than as
routes. This is the mechanism the "should this be a page or a chat result?"
column below should target — it exists and works.

## F. Page vs chat-result verdicts

| surface | verdict | why |
|---|---|---|
| `/dashboard/planning` | **become `?result=calendar`** | the result kind already exists; the route is 1.6 folds of two headings |
| `/dashboard/candidates` | **already a result** (`candidates`) — the route duplicates it | 110 lines |
| `/dashboard/gallery`, `/assets`, `/learning`, `/listings`, `/services`, `/absences` | **reduce** | 60–116 lines each, reachable only through tabs/search |
| `/dashboard/company` | **split** | 16 sections is not one task |
| `/dashboard/profile` | **stays a page, shrinks** | see W7-S1 |
| `/dashboard/market-map` | **stays a page, becomes the map's full surface** | see `MAP_STRATEGIC_PRODUCT_MODEL.md` |
| `/dashboard/opportunities` (1111 lines) | **audit separately** | not browser-measured in this window |

## G. Cross-cutting defects

| id | defect | evidence |
|---|---|---|
| **P0-1** | auth forms fall back to GET → password in URL | reproduced, §A |
| **P0-2** | `/dashboard` has zero navigation; 4 core destinations are computed and passed but never rendered | 0 `<a>`; `conversation-header.tsx` |
| **P1-1** | primary nav changes identity between the two shells | `dashboard-chrome.tsx` |
| **P1-2** | employer home never names the active organisation outside the header chip | §C |
| **P1-3** | admin verification queue's zero-count line reads as an empty state | §D |
| **P1-4** | profile: five redundant readiness summaries ≈1350 px | `W7_PROFILE_FULL_INVENTORY.md` §4 |
| **P1-5** | mobile composer shifts 195 px downward after interactivity | `CHAT_FIRST_DASHBOARD_V1.md` |
| **P2-1** | unlabelled inputs: 34 (profile) / 36 (admin verification) / 13 (company) | measured |
| **P2-2** | 46–73 sub-44 px targets per surface | measured |
| **P2-3** | `/dashboard/market-map` renders two `<h1>` | measured |
| **P2-4** | `/dashboard/projects` shows a "Ruošiama" (in-preparation) block on an active surface | measured |
