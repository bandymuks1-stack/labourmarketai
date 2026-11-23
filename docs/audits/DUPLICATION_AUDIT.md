# Duplication audit (2026-11-23)

**Status: SUPPORTING.** This is a point-in-time audit under `docs/OWNER_TARGET_ARCHITECTURE_V1.md` §9
(`docs/audits/**`), and not an architecture. It **proposes only**: nothing here deletes, merges or
changes code, data or permissions, and no entry is approved by being listed. The phased plan that
acts on it is deliverable E, `docs/architecture/SIMPLIFICATION_PLAN.md` (issue #3679).

| | |
|---|---|
| Brief | Issue #3679, deliverable C (owner P0, 2026-11-23) |
| Owner of this file | Lane E |
| Code basis | `main` at `125e21827` (lane D read `f65c572`, lane H `8bcda5bed`; the lane rows say so) |
| Production basis | Lane D, read-only catalogue reads (`pg_proc`, `has_function_privilege`, `prosrc` callers), 2026-11-23 05:11–05:16 UTC. Lane H, the production migration ledger, 2026-11-23. Nothing else here was verified in production. |
| Supersedes as a register | `docs/audits/duplication-freeze-register-2026-08-17.md` and `docs/audits/canonical-paths-duplicate-flow-audit.md` (see §12). Both files stay where they are, because guards cite them by path and section. |

## 1. How to read an entry

Paths are under `apps/web/` unless they start with `supabase/`, `docs/`, `.github/` or `apps/mobile/`.

Every entry has the brief's seven fields:

| Field | What it holds |
|---|---|
| Function | What it does |
| Implementations | Exact files |
| Usage | Callers |
| Problem | Why it is a duplicate |
| Proposal | Merge, keep or remove |
| Risk | What could stop working |
| Evidence | Code, tests or production |

**Two labels on every entry:**

- **Finding:**
  - CONFIRMED: both implementations were shown to serve the same function for the same audience.
  - SUSPECTED: the overlap is visible, but something is unproven; the entry says what.
  - NOT A DUPLICATE: the entry is kept so that nobody merges it by mistake.
- **Class**, from the brief:
  - PROD: verified in production, with the read named.
  - MAIN: on `main`, not verified in production.
  - PR: in an open PR (#n).
  - PLAN: doc only.
  - UNUSED-OR-DUP: unused or duplicated, with proof.

**"Used" means proven:**

- by importers and call sites (grep of import specifiers, relative and dynamic imports, `rpc("…")` and `.from("…")` names);
- by reachable routes;
- or by SQL callers.

A similar name was never taken as evidence. Where two things look alike but differ in rights or purpose, they are listed in §11.

**Sources:**

- **Lane E's own sweep:** five read-only searches over `main` (navigation and pages; AI, chat and notifications; sign-up, search and hire; CV, skills and history; APIs, RPCs and dead code).
- **Lane sections:** sent to Lane E by A, B, D and H (and M, C, G and S, see §13).

Each entry names its source.

## 2. Summary

| ID | Area | Finding | Class | Proposal in one line |
|---|---|---|---|---|
| REG-1 | Function registers | CONFIRMED | MAIN | Keep both files, one fact each, linked by capability id |
| NAV-1 | Organization areas, two lists | CONFIRMED | MAIN | One list (`ORGANIZATION_WORK_AREAS`) |
| NAV-2 | Organization home, area list twice | CONFIRMED | MAIN | The header is the one navigation |
| NAV-3 | Admin link twice in the header | CONFIRMED | MAIN | Keep one |
| NAV-4 | Two first screens for an organization | SUSPECTED | MAIN | `/dashboard` is the home |
| NAV-5 | Customer page, two need forms | SUSPECTED | MAIN | Fold the draft into the submitting form |
| NAV-6 | "Candidates" names two pages | CONFIRMED (label) | MAIN | Rename one |
| NAV-7 | My invitations on two pages | SUSPECTED | MAIN | `/dashboard/start` is canonical |
| NAV-8 | Photo evidence in two places | SUSPECTED | MAIN | Keep the gallery canonical |
| NAV-9 | Phone vs web main destinations | SUSPECTED | MAIN | Owner decision |
| NAV-10 | Routes nothing links to | CONFIRMED | UNUSED-OR-DUP | Link them or retire them |
| NAV-11 | Stale navigation descriptions | CONFIRMED | PLAN | Update the contract and the comments |
| AI-1 | Chat actions vs capabilities | CONFIRMED (10 wired twice) | MAIN | Move the 10 hand-written capabilities onto the bridge, or share their mappers |
| AI-2 | Demand create, chat vs MCP | CONFIRMED | MAIN | One mapper and one base schema; MCP loses start/end date and team split today |
| AI-3 | Journal "log work" mapper | CONFIRMED | MAIN | One exported mapper |
| AI-4 | Second AI provider stack (always no-op) | CONFIRMED | MAIN | Route estimate-clarify through `runAiAgent`, or retire it on owner decision |
| AI-5 | Phrase matchers: intent router vs command registry | SUSPECTED | MAIN | Measure the overlap first; do not merge yet |
| AI-6 | MCP door module | CONFIRMED, resolved | PR #3164, #3219 | Merge #3164 before #3219 |
| AI-7 | Vacancy translation at import | CONFIRMED unused | UNUSED-OR-DUP | Remove, or point it at the read-time runtime path |
| MSG-1 | MCP conversation readers | CONFIRMED | MAIN | MCP calls the web inbox and thread readers |
| MSG-2 | Contact permission, web vs MCP | CONFIRMED | MAIN | One resolver; the web rule is the superset |
| MSG-3 | Work-instruction messages | CONFIRMED (no notification) | MAIN | Call the shared notify helper after the RPC |
| MSG-4 | Second message insert | CONFIRMED | MAIN | Keep (guard-pinned); later route through the core |
| MSG-5 | Email sending | CONFIRMED | MAIN | Route raw SMTP callers through `sendTransactionalEmail` |
| MSG-6 | Owner alert for a public need | CONFIRMED | MAIN | One alert next to `persistPublicCompanyNeed` |
| MSG-7 | Two message threads about one offer | SUSPECTED | PROD + PR #3647/#3657 | The messaging lane's anonymous thread replaces the named one before the client answers |
| AUTH-1 | Phone sign-up vs web sign-up | CONFIRMED divergence | MAIN | One shared rules module for both clients |
| AUTH-2 | Buyer setup vs company setup as client | SUSPECTED | MAIN | Owner chooses the canonical path |
| HIRE-1 | Company → employee invitation | CONFIRMED | MAIN | Merge onto `invitations`, after HIRE-3 and HIRE-4 |
| HIRE-2 | Agency → worker legacy invitation | CONFIRMED unreachable writer | UNUSED-OR-DUP | Remove the writer; keep accept until 0 pending rows |
| HIRE-3 | Two acceptance chains | CONFIRMED | MAIN | Merge into `accept_invitation_apply_v2` |
| HIRE-4 | Project staffing authority | SUSPECTED gap | MAIN | Read the employee engagement row (security-relevant) |
| HIRE-5 | Booking accept and employment shapes | CONFIRMED | MAIN | Booking accept also opens the engagement row |
| HIRE-6 | Governance invitations (System C) | NOT A DUPLICATE | MAIN | Keep; the fold plan needs an owner decision |
| OFFER-1 | Proposals vs offer terms | SUSPECTED | PROD | Owner decides which is the commercial record |
| OFFER-2 | Agency candidates, two stores | SUSPECTED | PROD + PR #3651 | Keep the new one as the anonymous stage |
| OFFER-3 | Three request/answer flows | SUSPECTED | PROD | Keep the team offer as the path to a project |
| OFFER-4 | Interest by a person vs an organization | SUSPECTED | PROD | Keep; unify the client's view only |
| OFFER-5 | Personal vs organization commercial lane | SUSPECTED | PROD | The plan decides which is the subcontract chain |
| CV-1 | `workers.experience_years` shown to employers | CONFIRMED (no writer) | MAIN | Replace with a consented figure from the one reading |
| CV-2 | Second skill-evidence ladder | CONFIRMED | UNUSED-OR-DUP | Remove, or rebuild on `deriveEvidenceTier` |
| CV-3 | "Supported by work" rule | SUSPECTED | MAIN | Build on `deriveEvidenceTier` |
| CV-4 | Per-organization hours on the CV | SUSPECTED | MAIN | Take the hours from the one reading |
| CV-5 | CV narrative hours | SUSPECTED (confusing) | MAIN | Optionally cite the total |
| CV-6 | Living CV shows skills and history twice | CONFIRMED | MAIN | One on-screen place; print keeps its sections |
| CV-7 | Three ways to add a skill | CONFIRMED | MAIN | Fold the capability-section add into the text-first flow |
| CV-8 | Two journal composers | CONFIRMED (one write) | MAIN | Keep both doors; extract the shared steps |
| CV-9 | Two editors for an existing entry | CONFIRMED | MAIN | The compact editor is canonical |
| CV-10 | Two education write paths | CONFIRMED | MAIN | The CV import calls the form's core (row cap) |
| CV-11 | Past work, two forms | CONFIRMED (one write) | MAIN | Keep; share one field spec |
| CV-12 | Work card, two editors | CONFIRMED (one write) | MAIN | `WorkCardEditor` canonical in the chat |
| CV-13 | Journal empty states | CONFIRMED | MAIN | One empty state when there are no entries |
| CV-14 | `worker_skills` writers | CONFIRMED writers | MAIN | Later, one write core |
| SQL-1 | Old RPC versions already closed | CONFIRMED | PROD | Drop in one reviewed migration, or leave |
| SQL-2 | Old and new both executable, old as fallback | CONFIRMED | PROD | Revoke old, then remove the fallback, family by family |
| SQL-3 | Old version executable, no caller | CONFIRMED | PROD | Revoke first (reversible), drop later |
| SQL-4 | Two invitation-creating RPCs | SUSPECTED | MAIN | Merge into v2 |
| SQL-5 | Three booking-response RPCs | SUSPECTED | MAIN | One function with optional arguments |
| SQL-6 | Company setup v2/v1 branches | SUSPECTED unreachable | MAIN | Remove once production has v3 |
| SQL-7 | Stale lists of unapplied tables and RPCs | CONFIRMED | PROD | Remove the stale entries |
| SQL-8 | One-off backfill table | CONFIRMED | PROD | Owner decides keep or drop |
| SQL-9 | Retired agency board RPCs | CONFIRMED | UNUSED-OR-DUP | Remove after the audit (RED) |
| DEAD-1 | App and UI components with no importer | CONFIRMED | UNUSED-OR-DUP | Remove (one kept on purpose) |
| DEAD-2 | Marketing components with no importer | CONFIRMED | UNUSED-OR-DUP | Remove after the landing guards |
| DEAD-3 | `market-map-shell.tsx` guarded but not rendered | CONFIRMED | UNUSED-OR-DUP | Remove; point 16 guards at the live page |
| DEAD-4 | Lib modules with test-only importers | SUSPECTED | MAIN | Case by case; many are guard infrastructure |
| DEAD-5 | Translation namespaces never referenced | CONFIRMED (3) / SUSPECTED (7) | MAIN | Remove with their guards |
| DEAD-6 | Literal dashboard links | NOT A DUPLICATE (0 dead) | MAIN | Keep; template literals unchecked |
| BYP-1 | Voice transcription outside the AI egress gate | SUSPECTED | MAIN | Record it in the egress register |
| SEC-1..3 | Security items | handed to the owning lane | | §10 |

## 3. Registers

### REG-1 · Two function registers, each called "the one"

Finding: CONFIRMED, an overlap of purpose with no shared key. Class: MAIN. Source: Lane E, at the
coordinator's request (item 1).

| Field | Content |
|---|---|
| Function | Saying, for each product function, whether it exists and whether it is proven |
| Implementations | **(a)** `docs/program/FUNCTION_REGISTER.md`:<br>- 290 per-function rows from line 923 (288 planned + 2 `DUPLICATE`);<br>- an eight-value status, `LIVE_VERIFIED` … `OPTIONAL_TEST`;<br>- line 3 calls it "the ONE canonical per-function register (owner order 2026-10-28)".<br>**(b)** `lib/product-gate/capability-register.ts`:<br>- 112 capabilities;<br>- a seven-state `status` plus `strongestEvidence`;<br>- its human half is `docs/CAPABILITY_INVENTORY.md` §6.<br>`docs/program/COORDINATION_REGISTER.md` is not a third function register: its table at lines 7–15 sends function status to (a) and capability status to (b). |
| Usage | **(a)** is read by `.github/scripts/function-map.mjs:22`, `.github/scripts/system-register.mjs:13` and `.github/scripts/status-report.mjs:39`. Guards: `lib/guards/function-map-tool.test.ts`, `system-register-tool.test.ts`, `catalog-status-evidence.test.ts` and `product-readiness.test.ts`. `AGENTS.md` tells every session to read it.<br>**(b)** is read by `.github/scripts/product-truth.mjs` and the `Product truth` step in `quality.yml`. Guards: `lib/guards/capability-register.test.ts` and `product-graph-journeys.test.ts`. |
| Problem | Both describe the same product, function by function, and each claims to be the source. Nothing links them.<br>Measured on `main` with a script over both files:<br>- only **12 of 290** rows name any capability id;<br>- **101 of 112** capabilities are named by no row.<br>With no shared key, their statuses cannot be compared by a machine.<br>The one clash that can be measured is not real. Row 7.5 "Live charging" (`LIVE_VERIFIED`) points at `MKT-7` (`BLOCKED`), but row 7.5 states the difference itself: "the charge itself; self-serve purchase … stays off by owner decision MKT-7".<br>The two vocabularies measure different things: (a) records production proof, (b) records build state and the strongest evidence. A reader comparing "200 LIVE_VERIFIED" with "34 BUILT_AND_USABLE" sees a contradiction that is really two different axes. |
| Proposal | **Keep both files, one fact each, one key. Delete nothing.**<br>- (b) is the single source for *what exists*: build state, evidence level and anchors.<br>- (a) is the single source for *production proof per function*.<br>- Add a `Capability` column to every row of (a), naming exactly one existing capability id. Many rows may map to one capability.<br>- Add a guard:<br>  - every row names a real id;<br>  - every capability is named by at least one row, or carries a written "no function row" reason;<br>  - a `LIVE_VERIFIED` row never points at an `ARCHITECTURE_ONLY` or `RETIRED` capability;<br>  - a capability claiming `HUMAN_UI_PROVEN` has at least one `LIVE_VERIFIED` row.<br>- `product-truth.mjs` prints both axes side by side.<br>Until this lands, #3682 tells agents to update both files. |
| Risk | Three scripts parse the table in (a) by column position. The new column must update `function-map.mjs`, `system-register.mjs`, `status-report.mjs` and their tool tests in the same PR.<br>Mapping 290 rows to 112 ids is a judgement. Each mapping needs a reviewer, because a wrong link would fake agreement. |
| Evidence | **Method** (reproducible on any checkout):<br>1. Take the `id`/`status` pairs from `capability-register.ts`.<br>2. Take the rows of the form `\| n.n \| … \| STATUS \|` in `FUNCTION_REGISTER.md`, from the first `## Identity, sign-up` heading after line 900.<br>3. Match capability ids as whole words.<br>**Row statuses:** LIVE_VERIFIED 200, BLOCKED 41, NOT_IMPLEMENTED 21, NOT_VERIFIED 14, FAIL 7, PASS_CI_ONLY 4, DUPLICATE 2, OPTIONAL_TEST 1.<br>**Capability statuses:** BUILT_AND_USABLE 34, PARTIAL 72, BLOCKED 2, ARCHITECTURE_ONLY 2, BUILT_NOT_CONNECTED 1, RETIRED 1. These match `product-truth.mjs`. |

## 4. Navigation and pages

Source: Lane E's navigation sweep. The count of every navigation implementation, the canonical carousel and
the migration plan belong to deliverable D (`docs/design/CAROUSEL_NAVIGATION_SPEC.md`, lane A2). This section lists
only the duplicates.

### NAV-1 · Two lists of an organization's areas feed three navigation surfaces

Finding: CONFIRMED. Class: MAIN.

| Field | Content |
|---|---|
| Function | Moving between an organization's areas: people, projects, needs, marketplace, calendar, partners, history and the rest |
| Implementations | List A: `lib/navigation/work-areas.ts:73-90` (`ORGANIZATION_WORK_AREAS`).<br>List B: `lib/company/organization-doors.ts:49-66` (`ORGANIZATION_DOOR_ROUTES`). Its order, `ORGANIZATION_DOOR_ORDER` (`:70`), has 10 doors: now, people, work, needs, market, calendar, partners, education, history, settings.<br>Renderers:<br>- the header's "More" menu and phone sheet (`components/app/conversation/chat/conversation-header.tsx:120-126`, `organizationHeaderAreas`), from list A;<br>- `components/app/area-switcher.tsx:47` (a carousel), from list A;<br>- `components/app/organization/organization-doors.tsx` (a strip), from list B. |
| Usage | The header is mounted on every dashboard route. `AreaSwitcher` has 2 callers: `components/app/organization/company-model-screen.tsx:84` (list A) and `components/app/today/today-screen.tsx:244` (a personal list). `OrganizationDoorsServer` is mounted at `app/[locale]/dashboard/company/layout.tsx:31` and `app/[locale]/dashboard/projects/page.tsx:452`. |
| Problem | Two lists describe the same organization's areas for the same person. The repo admits it in `lib/guards/organization-door-routes-agree.test.ts:8-18`: "The organization's doors are listed twice … Until the P1 unification".<br>The same id leads to different places: door `work` ("Work") goes to `/dashboard/projects`; area `work` ("Work & hours") goes to `/dashboard/hours`.<br>Only list B has `now` and `settings`. Only list A has `offer`, `candidates`, `capacity`, `results` and `messages`.<br>On every `/dashboard/company/*` page, the header's "More" (list A) and the door strip (list B) render together, with different labels for the same pages. |
| Proposal | One list. `ORGANIZATION_WORK_AREAS` is canonical: the header already uses it, and the guard maps onto it. The door strip reads from it. Choose one name and one route for "work". |
| Risk | These guards pin the door list: `lib/company/organization-doors.test.ts`, `lib/guards/company-context-is-company.test.ts`, `product-ia-anti-slop.test.ts` and `organization-door-routes-agree.test.ts`. The education door is gated by capability. Staffing agencies see a different needs label (`organization-doors-server.tsx:30-35`). |
| Evidence | Importer greps for each renderer; both lists read; the guard's header (checked by Lane E); EN labels (`organizationDoors.work` "Work", `companyModel.work` "Work & hours"). |

### NAV-2 · The organization's home shows the same area list twice

Finding: CONFIRMED. Class: MAIN.

| Field | Content |
|---|---|
| Function | The organization's areas on the signed-in home, `/dashboard` |
| Implementations | The header's "More" menu and phone sheet (`conversation-header.tsx:120-126`; list A minus messages and calendar, 11 items).<br>The `AreaSwitcher` carousel in `company-model-screen.tsx:84` (all of list A). |
| Usage | `CompanyModelScreen` is mounted at `app/[locale]/dashboard/page.tsx:414` when the active workspace is an organization and the identity is "company". The header's acting role is then "company" too, so both render. |
| Problem | The same list, for the same person, on the same page, in two shapes. |
| Proposal | Keep the header as the one navigation system, as `dashboard-chrome.tsx` documents. Drop the carousel from the company home, or reduce it to the top actions. The carousel spec (deliverable D) decides the final shape. |
| Risk | The carousel's `company-model-*` test ids are pinned in guards. |
| Evidence | `page.tsx:400-470`, `company-model-screen.tsx:60-110` and `work-areas.ts:161-187` read. |

### NAV-3 · The admin console link appears twice in the header

Finding: CONFIRMED. Class: MAIN.

| Field | Content |
|---|---|
| Function | The link to `/dashboard/admin` |
| Implementations | `components/app/account-menu.tsx:118-120` (shown when `isAdmin && !adminUiHidden`).<br>`lib/config/navigation.ts:200-205` (`ADMIN_NAV_ITEM`), added through `getHeaderOverflowNavItems({isAdmin})`, which `conversation-header.tsx:132` calls under the same condition (`:103`). |
| Usage | Both sit inside the one `ConversationHeader`; the avatar menu is imported at `:26`. |
| Problem | Same link, same condition, same person, in both "More" and the avatar menu. |
| Proposal | Keep one. The `dashboard-chrome.tsx` comment says the admin link lives in the avatar menu, so that one is canonical unless the owner decides otherwise. |
| Risk | Tests use the test id `account-menu-admin-link`. |
| Evidence | Code read. |

### NAV-4 · Two first screens for an organization

Finding: SUSPECTED. The approvals card and the decisions strip were not compared line by line. Class: MAIN.

| Field | Content |
|---|---|
| Function | The organization's first screen: what needs me, the main action, where I can go |
| Implementations | `/dashboard` for the company identity (`company-model-screen.tsx`: the approvals card, the need door and the area carousel).<br>`/dashboard/company` (`app/[locale]/dashboard/company/page.tsx`, header at lines 1-24: a decisions strip, four main actions and the doors; it renders `OrganizationTodayView` at `:154`). |
| Usage | The logo goes to `/dashboard` (`conversation-header.tsx:171`). Non-test code has 63 string references to `"/dashboard/company"`; `lib/conversation/action-registry.ts` has the most (9). |
| Problem | Both answer the same three questions for the same company owner. |
| Proposal | Merge them, with `/dashboard` as the canonical home under decision 0017. |
| Risk | The 63 references. |
| Evidence | Both pages read. |

### NAV-5 · The customer page has two "state a need" forms

Finding: SUSPECTED. It is unproven whether the private draft is meant as a separate pre-submit step. Class: MAIN.

| Field | Content |
|---|---|
| Function | A customer says what they need |
| Implementations | `app/[locale]/dashboard/buyer/page.tsx:80` (`BuyerRequestsSection` → `saveBuyerRequestAction`) and `:398` (`DemandDraftForm draftType="buyer_request"` → `saveDemandDraftAction`) |
| Usage | `DemandDraftForm` has 1 importer, this page. The company has its own path: `/dashboard/company/needs` → `DemandRequestButton` → `submitDemandRequestAction`. |
| Problem | One page and one role, but two forms that write different records. |
| Proposal | Keep `BuyerRequestsSection`, which submits, and fold the private draft into it. See also AUTH-2. |
| Risk | Drafts that already exist. |
| Evidence | Importer and action greps. |

### NAV-6 · "Candidates" names two different pages

Finding: CONFIRMED as a label collision; not a page duplicate. Class: MAIN.

| Field | Content |
|---|---|
| Function | Candidate work for an organization |
| Implementations | Area `candidates` ("Candidates") → `/dashboard/company/scouting` (`work-areas.ts:84`).<br>The page `/dashboard/candidates` ("Candidate & provider drafts", private drafts of people who are not registered), linked from `app/[locale]/dashboard/company/planning/page.tsx:297`, `components/app/setup-role-choice.tsx:77`, `components/app/project-operations-board.tsx:798` and `lib/navigation/command-registry.ts:875`. |
| Usage | As above. |
| Problem | One label leads to two different functions, depending on where it is clicked. |
| Proposal | Keep both pages and rename one. |
| Risk | Low. |
| Evidence | Greps; EN labels. |

### NAV-7 · Invitations addressed to me appear on two pages

Finding: SUSPECTED. It is unproven whether the settings mount is meant for members switching organization. Class: MAIN.

| Field | Content |
|---|---|
| Function | Accepting or declining a governance invitation addressed to me |
| Implementations | `MembershipInvitationsPanel`, with 2 importers: `app/[locale]/dashboard/start/page.tsx:137` and `app/[locale]/dashboard/company/settings/page.tsx:108`. Both pass `listMyMembershipInvitations()`, the invitee's side. |
| Usage | As above. |
| Problem | The same accept and decline action sits on the setup hub and on an organization's settings page. |
| Proposal | `/dashboard/start` is canonical for invitations addressed to the person. |
| Risk | Low. |
| Evidence | Importer grep. |

### NAV-8 · Photo evidence in two places

Finding: SUSPECTED. It was not checked whether the documents page renders the photos itself. Class: MAIN.

| Field | Content |
|---|---|
| Function | Showing journal photo evidence |
| Implementations | `/dashboard/gallery` (journal photo evidence, F13) and `/dashboard/documents`, whose header says it consolidates "journal photo evidence" |
| Usage | Both are routes. |
| Problem | Possibly two views of the same photos. |
| Proposal | Keep both if the documents page only links to the gallery. Otherwise, the gallery is canonical. |
| Risk | Low. |
| Evidence | The pages' header comments. |

### NAV-9 · The phone app and the web use different main destinations

Finding: SUSPECTED. It is a divergence for the same people, not code duplication; `opportunities.tsx` was not read. Class: MAIN.

| Field | Content |
|---|---|
| Function | The main navigation for a worker |
| Implementations | Phone: `apps/mobile/app/(shell)/_layout.tsx`, with the tabs today, journal, profile and settings.<br>Web: the header core (`lib/config/navigation.ts`, `CORE_NAV_IDS`): chat, journal, calendar and messages. The phone app also has both `jobs.tsx` (which calls `jobs.search`) and `opportunities.tsx`. |
| Usage | Every one of the 29 phone shell screens has at least one link or is a tab. |
| Problem | The same person finds different main destinations on the phone and on the web. |
| Proposal | An owner decision on whether the phone app mirrors the web's core loop. Check `jobs.tsx` against `opportunities.tsx`. |
| Risk | The phone release. |
| Evidence | Link grep across the phone screens. |

### NAV-10 · Routes that nothing links to

Finding: CONFIRMED for the first three; SUSPECTED for `/dashboard/learning`. Class: UNUSED-OR-DUP.

| Field | Content |
|---|---|
| Function | Pages with no way in |
| Implementations | `app/[locale]/dashboard/admin/import-sandbox/page.tsx` and `admin/intelligence-observations/page.tsx`: 0 hrefs, and the admin index (`admin/page.tsx:217-358`) lists neither.<br>`/dashboard/talent`, a sample-data preview: `lib/product-gate/capability-register.ts:594` says it has "NO inbound link".<br>`/match-preview`: listed only in `app/sitemap.ts:38`.<br>`/dashboard/learning`: its only door is a chat chip for employers with a non-empty review queue (`lib/conversation/opening-brief.ts:522`), although the page says workers see their own suggestions there. |
| Usage | As above. |
| Problem | These pages can be reached only by typing the URL. |
| Proposal | Link each one from the right index, or retire it. For `/match-preview`, link it from a public page or drop it from the sitemap. |
| Risk | Only typed-URL access changes. |
| Evidence | A repo-wide grep for each slug. |

### NAV-11 · Stale navigation descriptions

Finding: CONFIRMED. Not duplicates, but they mislead the next audit. Class: PLAN.

| Field | Content |
|---|---|
| Function | Documents and comments that describe navigation |
| Implementations | `docs/launch/role-aware-navigation-contract-v1.md:43-58` describes a six-item primary nav with a bottom bar and dashboard tabs. The code has a four-item core plus "More" (`CORE_NAV_IDS`). No `BottomNav` or `DashboardTabs` component exists, and the doc's `components/app/company-locations-section.tsx` does not exist.<br>The comments `components/navigation/goal-navigation.tsx:22` (claims the signed-in home mounts it; its 1 importer is `components/marketing/landing-intent-choice.tsx:5`), `components/app/header-search.tsx:16` (claims the dashboard embeds `CommandFinder`; its 1 importer is `header-search.tsx:7`) and `components/app/page-quick-nav.tsx` (claims the profile uses it; its 1 caller is `app/[locale]/cv/page.tsx:7`).<br>`app/[locale]/dashboard/layout.tsx:264-270` builds five header nav labels, but only `nav.chat` is read (`conversation-header.tsx:157`). |
| Usage | — |
| Problem | Stale descriptions of what exists. |
| Proposal | Update the contract to the one-header model (deliverable D), fix the three comments, and cut the label type down to `chat`. |
| Risk | None. |
| Evidence | Greps; `ls`. |

**Dead links.**

- **Dashboard paths.** Every literal `/dashboard…` string in non-test code was matched against the real routes, and 15 did not match a page:
  - 6 are covered by permanent redirects in `next.config.ts:148-153`;
  - `company/institution-report` is a `route.ts`;
  - the rest occur only in comments or as plain text on the admin project-truth page (`page.tsx:787-909`), which still lists retired routes.

  No live broken link was found (see DEAD-6).
- **Public paths.** All 28 distinct public `href` paths resolve to a page.

**Doors to the journal: not a duplicate** (Lane A, A-7). Several links lead to the one journal page: the header shortcut
(`components/app/conversation/chat/conversation-header.tsx:443`), the core nav, `home-regions.tsx:385`,
`home-trace.tsx:163`, `profile-hub-overview.tsx:655,689` and the station card. They are doors, not implementations.
How many doors there should be is decided by the carousel spec (deliverable D, A2).

## 5. AI assistants and tools

### AI-1 · Chat actions and MCP capabilities: ten actions are wired twice around one write core

Finding: CONFIRMED. Class: MAIN. Sources: Lane E sweep and Lane B (D-B3).

| Field | Content |
|---|---|
| Function | What a person can do by chat (`CONVERSATION_ACTIONS`), and what an MCP or phone client can call (`CAPABILITIES`) |
| Implementations | `lib/conversation/action-registry.ts`, with 58 action ids.<br>The capability registry, `lib/capabilities/registry.ts:1938-2014`, with modules in `lib/capabilities/*.ts`.<br>The bridge, `lib/capabilities/conversation-action-bridge.ts:345`, and its carve-out list `ALREADY_CAPABILITIES` at `:62-73`. |
| Usage | `app/api/mcp/route.ts` imports `exposedCapabilities` and `runCapability`.<br>The phone app calls `/api/mcp` (`apps/mobile/src/domain.ts:21`, `config.ts:23`). |
| Problem | Lane B: the bridge exposes 56 chat actions as capabilities and skips every action that a dedicated capability already covers, so one act is never two *tools* (guard `lib/guards/mcp-execute-allowlist.test.ts`).<br>Lane E: 10 actions have their own hand-written capability: create, close and reopen demand; create project; assign worker; keep assignment; shortlist candidate; express interest; save work card; log work. Each one carries its own confirmation-token flow (`mintCapabilityConfirmation`), state fingerprint and input mapping. The write cores are shared; this was proved for 4 of the 10 (AI-2, AI-3). Everything around each core is written twice. |
| Proposal | Keep both registries; they serve different callers by design. Over time, move the 10 carve-outs onto the bridge, or pull each input mapper into one shared function. |
| Risk | Today every field change has to be made twice.<br>Renaming tools would break MCP and phone clients whose toolset fingerprint is pinned (`docs/integrations/MCP_TOOLSET_FINGERPRINTS.md`). |
| Evidence | Lane B imported the real registries and counted 241 MCP tools.<br>Lane E counted 75 static `id:` lines in `lib/capabilities/*.ts`. The counts differ by method: the runtime registry includes the bridged and generated entries.<br>Lane E counted 58 `id:` lines in `action-registry.ts`; Lane B counted 58 chat actions. |

### AI-2 · Demand create: the chat and MCP field mappings have drifted apart

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Submitting an employer's worker need |
| Implementations | Chat executor: `lib/conversation/company-executors.ts:165-240`. It builds `structuredV2` with `opportunity_type`, `team` and `time.start_earliest`/`end_date`.<br>MCP: `lib/capabilities/registry.ts:1745-1811` (`demand.create_confirm`). It builds only `{ opportunity_type }` (`:1810`).<br>Two schemas in `lib/conversation/company-schemas.ts`:<br>- `:38` `companyCreateDemandFields` (MCP): no start date, end date, team count or team size; the country is 2–80 characters;<br>- `:69` `companyCreateDemandSchema` (chat): has those fields; the country is exactly 2 characters. |
| Usage | Both paths end in `submitDemandRequestCore` (`lib/demand/demand-request.ts:259`). The chat goes through `submitDemandRequest` (`:243`); MCP calls the core directly. |
| Problem | The write is shared, but a need created through MCP or the phone loses its start date, end date and team split. |
| Proposal | One mapper next to `submitDemandRequestCore`, and one base schema that both paths extend. The chat mapper is canonical because it is the complete one. |
| Risk | MCP resolves country names (`withResolvedCountry`); the merged mapper must keep that. |
| Evidence | Both functions and both schemas were read. |

### AI-3 · Journal "log work": the FormData mapper is copied

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Turning a work-log input into the FormData that `createJournalEntryCore` reads |
| Implementations | `lib/conversation/worker-executors.ts:259` (`logWorkFields`, with the voice fields).<br>`lib/capabilities/registry.ts:828` (`journalConfirmFields`, without voice). |
| Usage | Chat: `worker-executors.ts:250` → `createJournalEntry` → `createJournalEntryCore` (`lib/journal/actions.ts:68`).<br>MCP: `registry.ts:949` → the core directly. |
| Problem | The two are the same line for line, apart from voice. Issue #1689 (time not saved from the chat) was exactly this kind of drift. |
| Proposal | One exported mapper, with voice optional. `logWorkFields` is canonical. |
| Risk | Low. |
| Evidence | Both functions were read. |

### AI-4 · A second AI provider stack that always answers "no AI"

Finding: CONFIRMED (inert). Class: MAIN. Sources: Lane B (D-B1) and Lane E sweep.

| Field | Content |
|---|---|
| Function | Choosing and calling a model provider |
| Implementations | **(a) Canonical:** `lib/ai/run-agent.ts` → `lib/ai/runtime/run-core.ts`, which handles the provider chain, egress gate, budget and audit, with the adapters in `lib/ai/runtime/providers/`.<br>**(b) Legacy:** `lib/ai/provider.ts` (`getAiProvider`) → `lib/ai/noop-provider.ts`, plus `types.ts`, `legacy-assist-schemas.ts` and `lib/config/ai.ts` (flag `AI_ASSIST_ENABLED`). |
| Usage | (a) has 10 callers outside `lib/ai` (Lane B, by import).<br>(b) has one chain: `lib/ai/estimate-clarify-actions.ts:19,39` ← `components/app/estimate-clarify-assist.tsx` ← `components/app/estimate-builder.tsx` ← `components/app/demand-request-button.tsx`. |
| Problem | (b) always returns the no-op (`provider.ts:1-25`), so the estimate clarify assist can never use the runtime's egress, budget and audit path. Two places decide whether AI runs. |
| Proposal | Make estimate-clarify a task in `lib/ai/runtime/task-routing.ts`, called through `runAiAgent`, then retire (b). The retirement is already planned in `lib/ai/README.md`, phases 4–6.<br>If the owner wants estimate-clarify permanently off, record that and drop the dead schemas instead. |
| Risk | The estimate builder's clarify button must stay honest: no fake AI (doctrine §7). |
| Evidence | Importers were grepped. The fence is `lib/guards/ai-runtime-boundary.test.ts`. No production claim is made. |

### AI-5 · Two phrase-to-destination matchers

Finding: SUSPECTED; the overlap is not measured. Class: MAIN. Source: Lane B (D-B4).

| Field | Content |
|---|---|
| Function | Turning typed words into a place or an action |
| Implementations | (a) `lib/conversation/intent-router.ts` → `intent-registry.ts`, with 95 intents (chat).<br>(b) `lib/navigation/command-registry.ts`, with 60 commands (`matchCommands` at `:2072`). |
| Usage | (b) is used by `components/app/command-finder.tsx:301` and `lib/search/dashboard-search-model.ts:28`. |
| Problem | Both score free text against hand-kept keyword lists, per locale. The intent router names the command registry only in a comment (`intent-router.ts:1086`), so their destinations and vocabularies can drift apart. |
| Proposal | Do not merge: the purposes differ (an intent can run a read or a draft; a command opens a page). First measure the route-kind intents whose destination is missing from `COMMAND_REGISTRY`, and the reverse. Then decide. |
| Risk | Chat routing in 7 locales, covered by the `lib/conversation/*intent*` tests. |
| Evidence | Code only. |

### AI-6 · Two MCP door modules, resolved in the PRs

Finding: CONFIRMED, already resolved. Class: PR #3164, #3219. Source: Lane B (D-B2).

| Field | Content |
|---|---|
| Function | The MCP HTTP door: identity, CSRF and MIME check, protocol, tool call |
| Implementations | #3164 moved `app/api/mcp/route.ts` into `lib/mcp/door.ts` (`mcpDoor(profile)`).<br>#3219 had moved the same body into `lib/mcp/http-door.ts` (`createMcpDoor`).<br>`main` still has the door inline. |
| Usage | PR only. |
| Problem | Two copies of the authentication-bearing door, if both PRs merge as first written. |
| Proposal | Already done on #3219's head `87838accc`: `http-door.ts` is deleted, and the ChatGPT door is `mcpDoor("chatgpt")` on #3164's module. Merge #3164 first, then #3219, which is stacked on it. |
| Risk | Merging #3219 first brings #3164's refactor with it. That costs review scope, not a function. |
| Evidence | `git diff origin/main...87838accc`; CI green on that head (Lane B). |

### AI-7 · Vacancy translation at import time has no provider

Finding: CONFIRMED (never produces a translation). Class: UNUSED-OR-DUP. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Translating vacancy text |
| Implementations | Import time: `lib/translation/translation-service.ts` (`translateInstruction`, `NO_PROVIDER_CONFIGURED`), used at `lib/vacancy-import/vacancy-importer.ts:672`.<br>Read time: `lib/vacancy-store/vacancy-translation-read.ts:170`, through `runAiAgent("vacancy_translation")`. |
| Usage | No caller passes `translationProvider:`; it exists only as a type field in `vacancy-presentation.ts`. |
| Problem | A second translation interface that always returns `unavailable`. |
| Proposal | Remove the import-time translation, or point it at the read-time runtime path, which is canonical. |
| Risk | The import report fields that record translation status. |
| Evidence | Grep for `translationProvider:` and `translation-service"`. |

## 6. Chat, notifications and sending

### MSG-1 · MCP conversation readers re-implement the web inbox and thread readers

Finding: CONFIRMED that the readers are separate; SUSPECTED that the missing translation is unintended. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Listing my conversations; reading one thread |
| Implementations | MCP: `lib/capabilities/messaging-capabilities.ts:80` and `:163-195`, with inline `.from("conversation_messages")` and `.rpc("conversation_counterpart_identities")`.<br>Web: `lib/conversation/messages-chat.ts` (`getConversationPreviews`, `getUnreadConversationIds`, `readCounterpartIdentities`) and the thread page `app/[locale]/dashboard/communication/[conversationId]/page.tsx:126`. The thread page orders by `created_at` then `id` and runs `resolveViewerTexts`. |
| Usage | `resolveViewerTexts` has 4 callers: `lib/communication/translation-read.ts`, `translation.ts`, `dashboard/instructions/page.tsx` and the thread page. None of them is MCP. |
| Problem | The same person reads their own messages through a second reader that returns the raw body, with no translation, no unread state and no `id` tiebreak. |
| Proposal | The MCP readers call the `lib/communication` readers. |
| Risk | The MCP output shape and the toolset fingerprint change. |
| Evidence | Code read; grep of `resolveViewerTexts`. |

### MSG-2 · Two contact-permission resolvers give different answers

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Deciding whether this caller may open a new direct thread with this person |
| Implementations | Web: `lib/communication/contact-permission.ts:57` (`resolveContactPermission`). It counts the employer-owner and company-employs links.<br>MCP: `lib/communication/direct-conversation-core.ts:175` (`planDirectContact`). It counts only project, shared team and admin.<br>`callerIsAdmin` exists twice: `contact-permission.ts:131` and `direct-conversation-core.ts:159`. |
| Usage | `getOrCreateDirectConversation` (`lib/communication/direct-conversation.ts:34`) has 4 callers: `request-worker-conversation.ts`, `contact-interested-worker.ts`, `chat-open-conversation.ts` and `open-conversation-action.ts`.<br>The MCP core has 1 caller: `messaging-capabilities.ts:388`. |
| Problem | An employer can message their own employee on the web but is refused through MCP or the phone. The MCP rule is the narrower one. |
| Proposal | One caller-explicit resolver in the core, which `resolveContactPermission` wraps. The web rule is canonical because it is the superset. |
| Risk | This is a permission change, so it needs an authority review before it lands. |
| Evidence | Both functions read. |

### MSG-3 · Work-instruction messages send no "new message" notification

Finding: CONFIRMED that the notification is missing; SUSPECTED that this is unintended. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Putting a row into `conversation_messages` |
| Implementations | Canonical: `lib/communication/communication-core.ts:368` (`sendMessageCore`) → `notifyOtherParticipants` (`:602`) → `emitMessageReceivedNotifications`.<br>Instructions:<br>- `lib/instructions/actions.ts:63` (`sendWorkInstructionAction`), through the RPC `send_work_instruction[_to_project]` (`supabase/migrations/20260608150000_work_instructions.sql:131`, `20261003150700_brigade_journal_context_v1.sql:540`);<br>- `:118` (`requestInstructionClarificationAction`), a direct insert. |
| Usage | `emitMessageReceivedNotifications` has exactly one caller (`communication-core.ts:352`).<br>The instruction actions are used by `components/app/manager-instruction-composer.tsx`, `worker-instruction-card.tsx`, `project-field.tsx` and `lib/conversation/company-executors.ts:505`. |
| Problem | The instruction path copies the rate cap and the language fallback by hand, but sends no notification: none in the app, none by push, none by email. No migration inserts into `notification_events`. |
| Proposal | Keep the RPC, which creates the thread. After it succeeds, call the shared notify helper, or route the clarification reply through `sendMessageCore`. |
| Risk | Workers start receiving new notifications. |
| Evidence | Grep of `emitMessageReceivedNotifications` and of the migrations. |

### MSG-4 · A second direct insert into `conversation_messages`

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Inserting a message |
| Implementations | `lib/communication/communication-core.ts:486/500/512` (the canonical send) and `lib/instructions/actions.ts:159/171` (the clarification reply) |
| Usage | 2 insert sites. Of the 10 files that use `from("conversation_messages")`, the other 8 only read. |
| Problem | The rate cap and the language-column fallback are copied into the second path. |
| Proposal | Keep for now: the guard `lib/guards/messaging-abuse-caps.test.ts:36,88` pins the cap on "the one other message-insert path". Later, route it through the core; MSG-3 does the same. |
| Risk | Low. |
| Evidence | Grep. |

### MSG-5 · Two ways to send email

Finding: CONFIRMED that the paths are separate; the impact is SUSPECTED, because the production mail configuration was not read. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Sending outbound email |
| Implementations | Canonical: `lib/email/transactional.ts:104` (`sendTransactionalEmail`). It handles Resend or SMTP, suppresses synthetic addresses and writes the ledger (`lib/email/send-ledger-store.ts:91`).<br>Raw: `sendSmtp` (`lib/email/smtp.ts:130`), called directly in `lib/staffing/request-door-actions.ts:32` and `app/api/cron/privacy-erasure/route.ts:41`. |
| Usage | `guardedSendTransactionalEmail` has 5 callers: `invitations/actions.ts`, `external-referral-receive.ts`, `delivery-retry-run.ts`, `external-referral-reprocess-run.ts` and `company-claim-capabilities.ts`. |
| Problem | Erasure mails skip the ledger and the synthetic-address check. On a deployment that sends only through Resend, the two direct callers send nothing. |
| Proposal | Route both through `sendTransactionalEmail`. |
| Risk | The erasure cron's `mailboxConfigured` logic. |
| Evidence | Grep of `sendSmtp(`. |

### MSG-6 · Two owner alerts for the same "public company need stored" event

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Telling the team that a public need was stored |
| Implementations | `lib/staffing/company-need-form-actions.ts:185` sends to Telegram (`sendCompanyNeedOwnerAlert`).<br>`lib/staffing/request-door-actions.ts:62` sends SMTP to the info mailbox.<br>Both store the row through `persistPublicCompanyNeed` (`company-need-public-intake.ts:83`). |
| Usage | `app/[locale]/(marketing)/company-need/page.tsx`; `components/marketing/landing-v3.tsx` |
| Problem | One event goes to two channels, depending on which form was used. |
| Proposal | One alert function next to `persistPublicCompanyNeed`. |
| Risk | Whoever watches one channel starts or stops seeing these alerts. |
| Evidence | Both files read; importers grepped. |

### MSG-7 · Two message threads about one offer

Finding: SUSPECTED. Class: PROD (the thread tables) plus PR #3647/#3657 (RED). Source: Lane H (D-7).

| Field | Content |
|---|---|
| Function | Conversation between the parties to one team offer |
| Implementations | (a) The team-offer thread: `supabase/migrations/20261012180000_conversation_message_team_offer_v1.sql` and `20261012110000_team_offer_thread_party_v1.sql` (both PROD); app code `lib/company/team-offer-conversation.ts:41`.<br>(b) The messaging lane's anonymous order thread, PR #3647/#3657 (RED). |
| Usage | (a) is live. (b) is in a PR. |
| Problem | If (b) applies, (a) stays reachable for the same offer. Before the client answers, (a) shows the client person's name; Lane H's local walk J4 showed this (see the launch register, #3265). |
| Proposal | (b) replaces (a)'s use before the client answers. The messaging lane owns this. |
| Risk | The offer conversation for existing offers. |
| Evidence | Lane H, read of the migration ledger and the local walk. |

## 7. Sign-up, sign-in, invitations and hiring

### AUTH-1 · The phone app's sign-up has drifted from the web's

Finding: CONFIRMED divergence. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Email-and-password sign-up and sign-in |
| Implementations | Web: `components/app/signup-form.tsx:287` and `components/app/login-form.tsx:204`.<br>Phone: `apps/mobile/src/auth-context.tsx:259` (sign in) and `:281` (sign up), used by `apps/mobile/src/screens/credentials-form.tsx:39` through `app/sign-in.tsx` and `app/register.tsx`. |
| Usage | One chain per client. |
| Problem | The phone's `signUp` sends no `emailRedirectTo`, no locale and no first-touch metadata. It also lacks the web's check for an address that is already registered (`identities.length === 0`), so an existing address is told "confirmation required". No onboarding step was found in the app. |
| Proposal | Keep both clients, but move the rules into one shared module: the redirect target, the metadata and the already-registered check. |
| Risk | The confirmation link falls back to the Supabase Site URL. |
| Evidence | Both chains read. |

### AUTH-2 · Two ways to set up as a buying client

Finding: SUSPECTED; the full rights were not compared. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Registering as a buying client |
| Implementations | `/dashboard/start/buyer`: `lib/buyer/customers.ts:135` (`save_customer_setup` → `customers`), then `save_customer_request` (`supabase/migrations/0028_customer_requests.sql:47`).<br>`/dashboard/start/company`: `lib/company/company-setup.ts:476` (`save_company_setup_v3` with `company_type = client_customer`, `lib/company/company-profile-shared.ts:28`). |
| Usage | Both are linked from `app/[locale]/dashboard/start/page.tsx` (the buyer link is at `:341`). |
| Problem | The same audience can end up as either a `customers` row or an organization, and the two get different capabilities. |
| Proposal | The owner chooses the canonical path. The organization route is the likely candidate (the organization demand spine). |
| Risk | The buyer-only flows: `dashboard/buyer` and service requests. |
| Evidence | Both paths read. |

### HIRE-1 · Two company → employee invitation writers, both reachable from the People page

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | A company invites a person by email to become its employee |
| Implementations | Legacy: `lib/company/actions.ts:72` (`inviteCompanyWorkerAction`) → `lib/company/company-workers.ts:318/328` (`rpc("invite_company_worker")`) → `company_worker_invitations`. The SQL was redefined in `20260924150000_invitation_management_delegation_v1.sql`.<br>Canonical: `lib/invitations/actions.ts:149` (`createAndSendInvitations`) → `create_invitation_v1` (`:203`) → `invitations`. |
| Usage | Legacy, 2 callers:<br>- the form in `components/app/company-workers-section.tsx:206` (shown at `:332` and `:607` to people who may manage invitations), on `app/[locale]/dashboard/company/people/page.tsx:326`;<br>- the chat action `lib/conversation/company-executors.ts:361` (`company.invite-worker`, registered at `action-registry.ts:665`).<br>Canonical, 5 callers: `components/app/invite-panel.tsx:258`, `lib/company/team-brigade-actions.ts:142`, `lib/organization-evidence/roster-link-actions.ts:216`, `company-executors.ts:683` and `action-registry.ts:1022`.<br>The same People page also links to the canonical form (`people/page.tsx:391` → `/dashboard/network?invite=1&type=join_as_employee`, `lib/navigation/work-areas.ts:130`). |
| Problem | One audience and one intent, but two stores and two kinds of delivery: the legacy path shows a share link to `/auth/signup` (`company-workers-section.tsx:310`), the canonical path sends a tokened email. They also produce two acceptance results (HIRE-3). The 2026-08-17 register planned to redirect the legacy writes; that has not happened. |
| Proposal | Merge onto `invitations` and `createAndSendInvitations`: point the People-page form and `company.invite-worker` at `join_as_employee`. **Only after HIRE-3 and HIRE-4.** |
| Risk | The legacy accept creates the `company_workers` row that project assignment depends on (HIRE-4). Redirecting the writes first would break staffing. |
| Evidence | Grep of the RPC names and importers; migration bodies read. |

### HIRE-2 · The legacy agency → worker invitation can no longer be sent, but can still be accepted

Finding: CONFIRMED (the writer is unreachable). Class: UNUSED-OR-DUP for the writer. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | An agency invites a worker |
| Implementations | Writer: `lib/agency/actions.ts:23` → `lib/agency/agency-workers.ts:224/234` (`invite_agency_worker`).<br>Accept: `lib/worker/invitations.ts:159` (`accept_agency_worker_invitation`). |
| Usage | The writer's only importer is `components/app/agency-workers-section.tsx`, which nothing imports. It is recorded as retired in `lib/product-gate/capability-register.ts:625`, and the guard `lib/guards/agency-model-b-canonical-v1.test.ts:47` keeps it unused.<br>The accept path is live: `lib/worker/invitation-actions.ts:21` is used by `components/app/worker-invitations.tsx:53` and `lib/conversation/worker-executors.ts:223`. |
| Problem | Dead writer code sits next to a live reader. |
| Proposal | Remove the writer. Keep the accept path until production has no pending `agency_worker_invitations` rows (the 2026-08-17 register recorded 0). |
| Risk | Low, but it needs a production row count first. |
| Evidence | Importer grep. |

### HIRE-3 · Two acceptance chains create the same employment relationship differently

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | An invited worker accepts a company invitation |
| Implementations | Legacy: `accept_company_worker_invitation` (latest body `20261003151000_email_verified_boundary_v1.sql:532-594`). It inserts a `company_workers` row (`:547`) and an employee `engagement_contexts` row (`:574`).<br>Canonical: `accept_invitation_apply_v2` (`20261021094000_invitations_follow_org_authority_v1.sql:196`). It inserts `engagement_contexts`, `project_worker_assignments`, `invitation_acceptances` and `demand_interest_signals`, but **no** `company_workers` row and **no** `company_memberships` row. |
| Usage | Legacy UI: `components/app/worker-invitations.tsx` (from `components/app/world-state/context-panel.tsx`).<br>Canonical: `/invite/[token]` (`lib/invitations/invite-page-actions.ts:74`), `components/app/onboarding-wizard.tsx:501`, `lib/invitations/signup-accept-action.ts:86` and `components/app/conversation/worker-invitation-action.tsx`.<br>The chat handles both (`worker-executors.ts:207-223`). Onboarding reads both (`app/[locale]/onboarding/page.tsx:155` legacy, `:78` canonical). |
| Problem | Whether a worker lands on the `company_workers` roster depends on which form the employer used. |
| Proposal | Merge into `accept_invitation_apply_v2`. It must take over, or make unnecessary, the `company_workers` side effect before the legacy path is retired. |
| Risk | The People roster (`company-workers.ts:100`) and `caller_manages_worker_by_roster` both read that row. |
| Evidence | Migration bodies read. |

### HIRE-4 · Project staffing authority depends on the legacy roster

Finding: SUSPECTED gap. The SQL shows it, but no other grant path was traced end to end. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Assigning one person to a project |
| Implementations | `lib/projects/actions.ts:120/140` → `assign_worker_to_project` (`20261002142000_manager_assigns_roster_worker_on_managed_project_v1.sql:72-98`). Its authority comes from `caller_manages_worker_by_roster` (`20260808150000…`, which reads `company_workers`/`agency_workers`), a booking engagement, or a manager branch that joins `company_workers` (`:81-84`). |
| Usage | `components/app/project-assignment-manager.tsx:370/422` |
| Problem | A worker who joined through a canonical `join_as_employee` invitation has an employee engagement row but no `company_workers` row. No path was found that lets a manager assign them by roster. This is the "three disjoint hire paths" gap of the 2026-08-17 register, §3, and it is still open. |
| Proposal | Keep the RPC, and widen its authority check to read the employee engagement row (the register's train L4). |
| Risk | Widening an authorization check is security-relevant. It goes through the RED process. |
| Evidence | Migration bodies read. |

### HIRE-5 · Booking accept still records employment only in the booking ledger

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | A worker accepts a booking, which hires them |
| Implementations | `respond_booking_request_v3` and `_v4`. The v4 header in `20260915180000_subject_contest_and_clash_receipt.sql:321` says "PREPARED, NOT APPLIED". Both insert only `company_worker_engagements`. |
| Usage | `lib/booking/booking-actions.ts:373` (v4, only when the person has acknowledged a calendar clash) and `:416` (v3). |
| Problem | The 2026-08-17 register planned that v4 would also open the engagement row; v4 was used for acknowledging calendar clashes instead. A booked person therefore lives in a third employment store, which `lib/booking/engagement-invariant.ts` only checks. An agency placement opens a `collaborator` engagement row (`20261002142000…:123`), which is a fourth shape. The People page shows three of these side by side (`people/page.tsx:40-53`): booked people (`company_worker_engagements`), the roster (`company_workers`) and members (`engagement_contexts`). |
| Proposal | Keep `company_worker_engagements` as the record of where a booking came from, and have booking accept also open the employee or collaborator engagement row as the canonical record. |
| Risk | Counting a person twice on the People page. |
| Evidence | Migration bodies read. |

### HIRE-6 · Governance invitations (System C): not a duplicate

Finding: NOT A DUPLICATE. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Inviting someone into an organization's governance roles (admin, manager and so on) |
| Implementations | `lib/company/memberships.ts:208/213` → `membership_invite_v1` (`20260806120000_company_membership_commands_v1.sql`) → `company_memberships` with status `invited` |
| Usage | `lib/company/membership-actions.ts:119/137`; `components/app/organization-members-section.tsx:125`; `components/app/membership-invitations-panel.tsx` (on `/dashboard/start` and `/dashboard/company/settings`); `lib/notifications/spine.ts:117` |
| Problem | None as a duplicate. It grants governance rights, which canonical invitations cannot grant today: they produce engagement rows only. The 2026-08-17 plan to fold this form into `create_invitation_v1` has not happened. |
| Proposal | Keep. The fold plan needs an owner decision. |
| Risk | None now. |
| Evidence | Code read. |

## 8. Offers, proposals and the commercial chain

All five entries come from Lane H (sections D-1 to D-4) and Lane D (section E). Lane H's code basis is `8bcda5bed`. PROD means the object is in the production migration ledger (Lane H) or the production catalogue (Lane D).

### OFFER-1 · A supplier's price and scope quote, kept in two stores

Finding: SUSPECTED; the rights and direction differ. Class: PROD.

| Field | Content |
|---|---|
| Function | A supplier tells a client the price, scope and dates for one need |
| Implementations | (a) `public.proposals` (`20260718190000_commercial_crm.sql`):<br>- an owner profile, an optional `customer_request_id`, the amount, the scope and a status;<br>- writer `create_proposal_v1`, through `lib/commercial/commercial-actions.ts:60`;<br>- reader `lib/commercial/commercial.ts:41`;<br>- the MCP tools `proposal_create` and `proposal_status_set_*`.<br>(b) `public.team_demand_offer_terms` (`20261011200000_supply_offer_negotiation_v1`):<br>- versioned capacity, rate text, dates and scope, agreed by both parties;<br>- writer `propose_team_demand_offer_terms_v1`, through `lib/company/team-offer.ts:265`;<br>- PR #3649 adds explicit confirmation by both sides, and a place. |
| Usage | (a) is the supplier's own CRM record, which the client never sees. (b) is the two-party negotiation, which both parties see. Lane D's production count: 0 proposals, 0 contracts, 25 team offers, 48 terms versions. |
| Problem | Both carry a supplier's commercial terms for one need. An accepted proposal does not reach the offer, and agreed offer terms do not appear in the CRM. |
| Proposal | Keep both for now. The owner decides which one is the commercial record of an offer. One option: (a) reads (b) for proposals tied to an offer. |
| Risk | The CRM reports and the MCP tools depend on (a). |
| Evidence | Lane H read the ledger; Lane D counted production rows. |

### OFFER-2 · Named candidates proposed by an agency, in two stores

Finding: SUSPECTED. Class: PROD for (a); PR #3651, RED and not applied, for (b).

| Field | Content |
|---|---|
| Function | An agency proposes named individual candidates for a need |
| Implementations | (a) `agency_candidate_offers` (`20260723180000_agency_real_client_bridge_v1`). It requires a connection and a share (NOT NULL). Writer `submit_agency_candidate_offer_v1` (`lib/agency/bridge-actions.ts:365`).<br>(b) `team_demand_offer_candidates` (PR #3651): on the open board, with no connection; the client sees only a pseudonym. |
| Usage | (a) is read at `lib/agency/bridge-actions.ts:347,353`, `bridge-read.ts:442`, `conversation/dispatch.ts:393` and `capabilities/marketplace-capabilities.ts:763` (Lane E sweep). |
| Problem | Two stores for one function. |
| Proposal | Keep (b) as the anonymous pre-selection stage: the client's choice converts a candidate into an (a) row and reuses (a)'s accept path (`respond_agency_candidate_offer_v1`). The alternative, making (a)'s connection and share nullable, would loosen the assumptions of an applied RED table and is riskier. |
| Risk | The agency board. |
| Evidence | `lib/guards/agency-open-need-candidates.test.ts` (PR #3651) pins the reuse. |

### OFFER-3 · Three request-and-answer flows for "will you do this work for us"

Finding: SUSPECTED; the directions are opposite. Class: PROD.

| Field | Content |
|---|---|
| Function | A company and a supplier or brigade get in touch about work |
| Implementations | (a) Team enquiry, employer → brigade: `team_enquiries_v1` (`20260716131000`); `propose_team_enquiry_v1` (`lib/company/team-enquiry-actions.ts:57`); reply `respond_team_enquiry_v1` (`team-brigade-actions.ts:311`).<br>(b) Team offer, brigade or company → a need: `team_demand_offers` (`20261007150000`); `offer_team_to_demand_v1` (`team-offer.ts:191`).<br>(c) Service request, buyer → a listed service: `service_offering_requests` (`20260627145318`); `lib/marketplace/service-requests.ts:148`. |
| Usage | All three are live. |
| Problem | Three state machines differ by who starts and what is referenced (a team, a need, a listing). Only (b) leads to a project, through the hand-off. (a) and (c) end at accept. |
| Proposal | Keep (b) as the path that reaches a project. Let an accepted (a) or (c) open (b) or create a need, instead of growing its own path. Do not merge the tables: their rights and visibility differ. |
| Risk | Existing enquiries and service requests. |
| Evidence | Lane H. |

### OFFER-4 · Interest in a need, shown by a person and by an organization

Finding: SUSPECTED. Class: PROD.

| Field | Content |
|---|---|
| Function | "I can do this need" |
| Implementations | (a) `demand_interest_signals`: a worker raises a hand (`components/app/worker-my-interest-section.tsx`). One core: `lib/opportunities/interest.ts:204`.<br>(b) `team_demand_offers`: an organization offers. |
| Usage | The scouting page reads both, in two sections (`app/[locale]/dashboard/company/scouting/page.tsx:556`). |
| Problem | The same act by two kinds of subject, in two stores. |
| Proposal | Keep both: the subjects carry different rights and consents. Unify only the client's view, as one "who answered" list. |
| Risk | Low. |
| Evidence | Lane H; Lane E confirmed the single interest core. |

### OFFER-5 · The personal commercial lane vs the organization lane

Finding: SUSPECTED; this is two models of one business function, not a code duplicate. Class: PROD. Source: Lane D (section E).

| Field | Content |
|---|---|
| Function | The subcontract chain |
| Implementations | Personal lane: `service_offerings`, `service_offering_requests`, `proposals` and `contracts`. These are keyed by profile; proposals and contracts are visible to their owner only.<br>Organization lane: `team_demand_offers` plus `team_demand_offer_terms`, with two parties and versioning. |
| Usage | Production count: 0 proposals, 0 contracts, 25 team offers, 48 terms versions. |
| Problem | Two lanes for one chain. |
| Proposal | The simplification plan (deliverable E) decides which lane is the subcontract chain. |
| Risk | Existing offers. |
| Evidence | Lane D's production read. |

## 9. CV, skills, journal and history

**The decision-0025 rule holds:** every surface that states a person's own experience total reads
`lib/journal/professional-experience.ts` (20 non-test importers). That covers the CV page, the profile, the
player card, the journal page, Work-in-Numbers, `experience-figures.ts` and `verified-cv.ts`. The entries below
are the places around that one total.

### CV-1 · Employers see `workers.experience_years`, which nothing writes

Finding: CONFIRMED that it is shown and has no writer in the repo. Its production values are unknown. Class: MAIN. Source: Lane E sweep (spot-checked by Lane E).

| Field | Content |
|---|---|
| Function | Telling an employer or admin how experienced a worker is |
| Implementations | Shown on the company person page (`app/[locale]/dashboard/people/[workerId]/page.tsx:136,153,425-428`), the scouting page (`dashboard/company/scouting/page.tsx:945-947,1937-1943`), `components/app/candidate-pool-board.tsx:173` and the admin matching page (`dashboard/admin/matching/page.tsx:843-844`).<br>Read in `lib/market/match-subject.ts:349,654`, `lib/admin/matching-workbench.ts:290,411`, `lib/privacy/discoverability-preview.ts:66,90-91` and `lib/scouting/scout-safe-view.ts:214`.<br>Used in matching at `lib/market/match-v1.ts:1456-1468`.<br>The column is defined in `supabase/migrations/0001_initial_schema.sql:52` and returned by the discovery RPC (`20261018160000_worker_identity_split_v1.sql:109`). |
| Usage | 4 screens and 1 matching rule. |
| Problem | No code in `apps/web`, the migrations, the scripts or the seeds writes the column. The intake form collects years (`lib/staffing/worker-intake.ts:118,161`), but they go into AI prompt text, not the column. So the employer's view of experience is an unmaintained number, not the history that decision 0025 defines. |
| Proposal | Remove it from those surfaces, or replace it with a figure from the one reading, released only with the worker's consent. |
| Risk | Medium: it touches visibility (decision 0033) and matching. A replacement must never show organization records to the wrong viewer. |
| Evidence | Grep for writes in TypeScript and SQL. The only assignment, `people/[workerId]/page.tsx:153`, copies a value it read. |

### CV-2 · A second skill-evidence ladder that disagrees with the canonical one

Finding: CONFIRMED. Class: UNUSED-OR-DUP (product). Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Deciding a skill's evidence state |
| Implementations | `lib/profile/skill-evidence-state.ts:30-40`, beside the canonical `lib/evidence/evidence-tier.ts` (`deriveEvidenceTier`) |
| Usage | No product importer. It is used only by `apps/web/scripts/skills-evidence-report.ts` and its own test. |
| Problem | Line 35 labels a manager-sourced row that has no verification "manager_confirmed". The canonical ladder never raises such a row, and the CV shows it as "evidence" (`lib/cv-export/skill-tiers.ts:33-44`). So the script's report can overstate. |
| Proposal | Remove it, or rebuild it on `deriveEvidenceTier`. |
| Risk | Low: only the script uses it. |
| Evidence | Importer grep (0 product references, confirmed by Lane E); both files read. |

### CV-3 · "Supported by work" is worked out outside the canonical ladder

Finding: SUSPECTED. The drift risk is real, but no divergence exists today. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Deciding whether journal work backs a skill |
| Implementations | `lib/profile/skill-evidence.ts:38-48` (`isSkillSupportedByWork`), with its own set of allowed sources |
| Usage | `deriveSkillEvidence` is called from `app/[locale]/dashboard/profile/page.tsx:852`, `components/app/profile-hub-overview.tsx`, `lib/player-card/player-card.ts:666`, `evidence-visuals.ts` and `sample-card.ts`. |
| Problem | It matches the CV's "confirmed or evidence" rule today, but nothing ties the two together. |
| Proposal | Build it on `deriveEvidenceTier` plus the CV's rule. |
| Risk | Low. |
| Evidence | Both files read. |

### CV-4 · Per-organization hours on the CV are summed outside the one reading

Finding: SUSPECTED. No numeric mismatch was proven on real data. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | The hours on each organization-history line of the CV |
| Implementations | `lib/cv-export/organization-history.ts:170-212` sums day and period hours per group.<br>The one reading has its own per-organization rows (`organizations[].totalHours` in `professional-experience.ts`), used by `lib/cv-export/experience-stops.ts:97`. |
| Usage | `lib/cv-export/verified-cv.ts:1051` (the Living CV) and `lib/organization-evidence/company-person-read.ts:237` (the company view). Displayed by `components/app/cv/organization-history-lines.ts:76-85`. |
| Problem | These subtotals skip the reading's rule 1 (`professional-experience.ts:32-41`). They add day records already linked to a journal entry, and periods that overlap same-organization days. The lines are labelled "recorded" or "period", not as a total. The guard (`lib/guards/professional-experience-one-history.test.ts:193-215`) checks the labels, not the arithmetic. |
| Proposal | Keep the grouping, but take each group's hours from the reading's counted lines, or label them plainly as uncounted subtotals. |
| Risk | Medium: two CVs and the company view. |
| Evidence | Both files read. |

### CV-5 · The CV's narrative paragraph uses journal-only hours

Finding: SUSPECTED that it confuses readers; it does not break the rule. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | The CV's factual paragraph ("N h recorded…") |
| Implementations | `lib/cv-export/professional-summary.ts:52-58`, printed at `app/[locale]/cv/page.tsx:279-322` |
| Usage | 1, through `verified-cv.ts:987` |
| Problem | For a person whose experience is mostly organization history, the paragraph can show a small journal figure while the facts row (`cv/page.tsx:624-663`) shows the larger total. It is labelled "recorded", and journal figures beside the total are allowed. |
| Proposal | Keep it, or cite `professionalExperience.hours.total` when that is larger. |
| Risk | Low. |
| Evidence | Code read. |

### CV-6 · The Living CV shows skills twice and work history twice

Finding: CONFIRMED. Class: MAIN. Source: Lane A (A-1, A-2), on `main` at `125e2182`.

| Field | Content |
|---|---|
| Function | Showing the person's skills and work history on the Living CV |
| Implementations | Skills: `components/app/cv/premium-living-cv.tsx` (its capabilities block; empty text at `:115`) and the document section `app/[locale]/cv/page.tsx:1469` (`#cv-skills`).<br>Work history: the `experience` block of `premium-living-cv.tsx` (props at `cv/page.tsx:1091-1094`), `cv/page.tsx:1286` (`#cv-work-history`) and `cv/page.tsx:1830` (`#cv-proof`). |
| Usage | `<PremiumLivingCv>` at `cv/page.tsx:1073`, on the same page as the document sections. |
| Problem | One screen shows skills twice ("Gebėjimai · Ką mokate", then "Įgūdžiai"), each with its own empty text. Work history likewise appears in the hero block and again in the document sections. |
| Proposal | One on-screen place for each. Print and PDF keep the document sections, so hide the duplicates on screen only. |
| Risk | Print and PDF output and the `eu` template use the document sections. `#cv-proof` is also a jump target (`cv/page.tsx:433`). |
| Evidence | Local browser screenshot `cv__lt__390__light.png` (design audit 2026-11-22, branch `assets/cc/button-is-action-shots`). |

### CV-7 · Three ways to add a skill on the profile page, writing two stores

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | A worker adds a skill to their own profile |
| Implementations | Text-first flow: `components/app/profile-text-first-flow.tsx:395` (free-label claims through `saveProfileSkillClaimsAction`).<br>Capability section: a manual add at `components/app/capability-profile-section.tsx:142-170,348-370`, using the same action.<br>Catalogue picker: `components/app/profession-skills-picker.tsx:95` (`POST /api/workers/:id/skills` → `worker_skills`), inside `worker-trade-profile.tsx:332`. |
| Usage | All three mount on `app/[locale]/dashboard/profile/page.tsx` (lines 1363, 1372, 1715). |
| Problem | The same person, page and job has two free-label inputs. `profile-text-first-flow.tsx:90-105` itself records that two systems confused people. The 2026-06-02 audit found a single picker; the second free-label add is new since then. |
| Proposal | Fold the capability-section manual add into the text-first flow, which is canonical. Keep the catalogue picker as the one catalogued path. |
| Risk | Low to medium: the profile end-to-end tests. |
| Evidence | JSX mounts counted; action callers grepped. |

### CV-8 · Two journal composers, one write

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | A worker records a work entry |
| Implementations | `components/app/journal-entry-composer.tsx` (2,976 lines; `createJournalEntry` at `:1112`).<br>`components/app/conversation/worker-worklog-flow.tsx` (1,546 lines; dispatches `worker.log-work` at `:662/:681`, which calls `createJournalEntry` in `lib/conversation/worker-executors.ts:250`). |
| Usage | Composer: `app/[locale]/dashboard/journal/page.tsx:1462,1480`, `journal-entry-edit-launcher.tsx` and `journal-entry-compact-editor.tsx`.<br>Worklog flow: `app/[locale]/dashboard/journal/quick-record.tsx:161` and `conversation-chat.tsx:3811`. |
| Problem | One write path, but the parsing, context choice, photo and skill steps are implemented twice. |
| Proposal | Keep both: they are the deliberate fast door and detailed door (`?compose=full`, `page.tsx:1440-1447`). Extract the shared steps. |
| Risk | High: this is the core flow. |
| Evidence | Code read; JSX counted. |

### CV-9 · Two editors for an existing journal entry

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Correcting an unconfirmed entry |
| Implementations | The compact drawer `components/app/journal-entry-compact-editor.tsx:344` (`supersedeJournalEntry`), opened by `journal-entry-edit-launcher.tsx:101`.<br>The full composer in edit mode through `?editing=` (`app/[locale]/dashboard/journal/page.tsx:1460-1475`). |
| Usage | The launcher is used at `journal/page.tsx:2108,2128,2178`. `?editing=` links come from `components/app/journal-entry-row.tsx:204` and `components/app/journal-entry-skill-links.tsx:417`. |
| Problem | The same entry has two edit screens. The launcher's header (`:1-35`) says the full form caused a production incident, yet two links still open it. |
| Proposal | Make the compact editor canonical and point the `?editing=` links at it. |
| Risk | Medium: planning deep links rely on `?editing=`. |
| Evidence | Code read; links grepped. |

### CV-10 · Two education write paths; the CV import skips the row cap

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Saving an education row |
| Implementations | `lib/profile/cv-section-import-actions.ts:234-290` (direct insert at `:270`).<br>`lib/worker/worker-education-actions.ts:66-120` (insert at `:96`, row cap `EDUCATION_MAX_ROWS` checked at `:92`). |
| Usage | CV import: `components/app/cv-import-section-review.tsx:88,352`.<br>Form: `components/app/worker-education-section.tsx:99` and the chat executor `worker-executors.ts:98`. |
| Problem | The validation and insert logic are written twice, and the import path has no row cap. Languages, by contrast, share one RPC (`save_worker_language_v1`). |
| Proposal | The CV import calls the shared core of `saveWorkerEducationAction`. |
| Risk | Low. |
| Evidence | Both files read. |

### CV-11 · Past work: two forms, one write

Finding: CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | A worker adds a past job by hand |
| Implementations | The profile form `components/app/capability-profile-section.tsx:174-190,264` and the chat form `lib/conversation/worker-forms.ts:96`. Both write through `confirmCvWorkHistoryAction` (`worker-executors.ts:55-69`) → `save_self_declared_work_history_v1`. |
| Usage | Also used by `cv-import-section-review.tsx:78,304` and `journal-ai-suggestions.tsx`. |
| Problem | The two forms' month and relationship options are kept in step by hand. |
| Proposal | Keep both doors, the chat and the page, with one shared field spec. |
| Risk | Low. |
| Evidence | Code read. |

### CV-12 · The work card: two editors, one write

Finding: CONFIRMED. Class: MAIN. Sources: Lane E sweep and Lane A (A-4).

| Field | Content |
|---|---|
| Function | Editing availability, countries and pay on the work card |
| Implementations | `components/app/work-card-editor.tsx:128-131,274`, mounted on the profile page (`profile/page.tsx:1485`) and in the chat (`components/app/workspace/player-card-result.tsx:178`).<br>The chat's inline form `worker.save-work-card` (`lib/conversation/worker-forms.ts:157-200`; executor `worker-executors.ts:135`). |
| Usage | Both call `saveWorkerCardAction` → `lib/worker/work-card-core.ts:99`. One more direct caller of the RPC: `lib/profile/cv-section-import-actions.ts:464` (Lane A). |
| Problem | Two editors for the same card inside the chat, with the prefill and partial-save rules copied (`worker-forms.ts:170-188`). |
| Proposal | Make `WorkCardEditor` canonical inside the chat. Optionally route the CV import through `work-card-core` (Lane A). |
| Risk | Low to medium. |
| Evidence | Imports and the action read. |

### CV-13 · The journal stacks up to four empty messages

Finding: CONFIRMED. Class: MAIN. Source: Lane A (A-3).

| Field | Content |
|---|---|
| Function | Telling a worker with no entries that the journal is empty |
| Implementations | `components/app/journal/journal-calendar.tsx:237,333` (`dayEmpty`, `periodEmpty`); `app/[locale]/dashboard/journal/page.tsx:1786-1796` (`journal-day-empty`); `journal/page.tsx:1802` (`EmptyState`, `listEmptyTitle`); and the numbers card at `journal/page.tsx:1566`. |
| Usage | All on `/dashboard/journal`. |
| Problem | Up to four "nothing here yet" messages on one screen. |
| Proposal | One empty state for a worker with no entries. Each block keeps its own message once entries exist. |
| Risk | Low. |
| Evidence | Local screenshot `journal__lt__390__light.png` (Lane A). |

### CV-14 · `worker_skills` is written from six places with no canonical writer

Finding: CONFIRMED that the writers exist; SUSPECTED that this is harmful duplication, because the purposes differ. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Inserting, updating or deleting a worker skill |
| Implementations | `app/api/workers/[workerId]/skills/route.ts:167,179`; `lib/profile/claim-catalog-promotion-actions.ts:115`; `lib/journal/skill-pipeline.ts:494`; `lib/journal/skill-pipeline-actions.ts:390`; `lib/organization-evidence/competency-signal-actions.ts:91`; `lib/journal/skill-source-apply.ts:65`. There is no RPC. |
| Usage | The API route is called from `components/app/profession-skills-picker.tsx:95` and `lib/conversation/action-registry.ts:232`. |
| Problem | The writers carry different sources (self-declared, journal, manager) and no single place enforces the source and verification rules. `lib/product-gate/capability-register.ts:401` already records the two stores, `worker_skills` and `profile_skill_claims`, as "duplicated truth (debt)". |
| Proposal | Keep for now. Later, one `worker_skills` write core that enforces the source and verified rules. |
| Risk | Medium: evidence integrity. |
| Evidence | Grep of `.from("worker_skills")` writes. |

## 10. APIs, RPCs and SQL

**Method (Lane D).** A *family* is a set of functions whose names differ only by a trailing `_vN`. Production has
30 families in more than one version, 63 functions in total. Each row below states the rights, the SQL callers and
the app callers. A similar name alone proves nothing.

### SQL-1 · Old versions already closed

Finding: CONFIRMED. Class: PROD. Source: Lane D (section A).

| Field | Content |
|---|---|
| Function | Superseded versions of live functions |
| Implementations | `accept_invitation_v1`, `accept_invitation_by_id_v1`, `decline_invitation_v1`, `decide_organization_claim_v1`, `create_marketplace_listing_v1`, `update_marketplace_listing_v1`, `set_marketplace_listing_status_v1` (v2 is live for each), and `external_referral_reprocess_candidates_v1`, `_v2` and `_v4` (another SQL function calls v3; the family runs on a cron or service path) |
| Usage | In production, neither `authenticated` nor `anon` may execute them, and no SQL function calls them. A few code lines still name them, mostly comments or "needs migration" fallbacks. Those fail closed. |
| Problem | Dead versions. |
| Proposal | Drop them in one reviewed migration with a recreate rollback, or leave them. The risk is zero either way. |
| Risk | None. |
| Evidence | Lane D, production catalogue read 05:11–05:16 UTC. |

### SQL-2 · Old and new versions both callable, the old one kept as a "not installed yet" fallback

Finding: CONFIRMED in the repo and, for the grants, in production. Class: PROD. Sources: Lane D (section B), Lane H (D-6), Lane E sweep.

| Field | Content |
|---|---|
| Function | App fallbacks to an older RPC version when the newer one is missing |
| Implementations | The `respond_booking_request` family: v1 at `lib/booking/booking-actions.ts:350,443,454`, v2 at `:336`, v3 at `:416` (2 SQL callers), v4 at `:373`.<br>`withdraw_booking_request`: v1 at `:499,509`.<br>`propose_booking_request`: v1 at `:275`.<br>`save_company_setup`: v1 at `lib/company/company-setup.ts:499`, v2 at `:488`.<br>`create_work_task`: v1 at `lib/tasks/create-task-core.ts:130`.<br>`update_work_task`: v1 at `lib/tasks/task-actions.ts:302`.<br>`get_invitation_preview`: v1 at `app/[locale]/invite/[token]/page.tsx:311` and `lib/invitations/my-decision.ts:19`.<br>`create_org_document`: v1 at `lib/documents/org-document-actions.ts:210`.<br>`list_team_offers_for_request`: v1 at `lib/company/team-offer.ts:126`.<br>`save_demand_draft`: v1 at `lib/company/claim-public-intake.ts:248`.<br>`save_worker_availability_prefs`: v1 at `lib/worker/availability-prefs-actions.ts:146`.<br>The marketplace listing family at `lib/marketplace/listings.ts:509/515, 583/588, 653/658`.<br>`external_referral_reprocess` v4 → v3 → v2 at `lib/invitations/external-referral-reprocess-run.ts:53/58/61`. |
| Usage | Lane E counted 16 RPC base names called in two or more versions (grep `rpc("…_v[0-9]+"` over `app`, `lib` and `components`). |
| Problem | Where production has the newer version, the fallback branch is dead, yet the old version stays callable. On the fallback paths behaviour silently gets weaker; for example `booking-actions.ts:443` accepts with `engagement: "needs_migration"`. Some old versions are still called *directly*, not only as a fallback (`get_invitation_preview_v1`, and possibly some booking decisions). Those are live uses: it must be checked whether v1 and v2 differ in rights before either is called a duplicate. |
| Proposal | One family at a time, and only where production has the newer version: revoke `EXECUTE` on the old version from `authenticated` (reversible), then remove the app fallback. Three families are security-relevant and are handled under SEC (below), not here. |
| Risk | A stack where the newer version is not applied loses the function. Production has it, per Lane D's read. Local and preview stacks must be checked. |
| Evidence | Lane D's production grants; Lane E's and Lane H's code greps. |

### SQL-3 · Old versions callable but with no caller

Finding: CONFIRMED (strong). Class: PROD. Source: Lane D (section C).

| Field | Content |
|---|---|
| Function | Superseded versions with no runtime use |
| Implementations | `create_finance_record_v1`, `update_finance_record_v1`, `create_work_plan_entry_v1`, `end_company_worker_engagement_v1`, `list_agency_offered_candidates_for_request_v1`, `my_historical_organization_names_v1`, `journal_entry_supersede` (v1; v2 has one SQL caller), `submit_demand_request` (the v1 name has one SQL caller, which must be checked first) |
| Usage | None of them is called by `rpc(…)` or `readRows(…)` with that exact name anywhere in `apps/web` outside tests. Several are named in comments and types. |
| Problem | Dead but still executable. |
| Proposal | Revoke `EXECUTE` from `authenticated` first (reversible), drop later. |
| Risk | Low, apart from the two names with an SQL caller. |
| Evidence | Lane D, production catalogue and code grep. |

### SQL-4 · Two invitation-creating RPCs live side by side

Finding: SUSPECTED; the two call sites are CONFIRMED. Class: MAIN. Source: Lane E sweep (Lane D lists the same pair under B).

| Field | Content |
|---|---|
| Function | Writing a row to `invitations` |
| Implementations | `create_invitation_v1` (defined in 5 migrations) and `create_invitation_v2` (3). The same authority fixes went into both, for example `20261021094000` and `20261002141500` at lines 34 and 42–43. |
| Usage | v1 in `lib/invitations/actions.ts:203` (`createAndSendInvitations`, the batch email). v2 in `:723` (`createShareableInvitationAction`, which also takes `p_invited_email`). |
| Problem | This is not a fallback. Two live writers each need every security fix applied twice. |
| Proposal | Merge into v2, the superset. It is unproven that v2 covers v1's relationship-slug behaviour (`actions.ts:166,220`). |
| Risk | Medium: the email-send path. |
| Evidence | Migration grep; call sites read. |

### SQL-5 · Three booking-response RPCs in use

Finding: SUSPECTED that their logic diverges; the call sites are CONFIRMED. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Responding to a booking request |
| Implementations | `respond_booking_request_v2` (`20260711290000`), `_v3` (`20260723120000`, patched in `20260802150000` and `20260807140000`) and `_v4` (`20260915180000`). |
| Usage | `lib/booking/booking-actions.ts:336` (v2, decline with a reason), `:416` (v3, the default), `:373` (v4, after a calendar clash was acknowledged). Lane D found no app call to v4 in its grep; Lane E's sweep found the call at `:373`. Verify this before any change. |
| Problem | One decision is written by three functions, each with its own feature. Decline-with-reason goes through v2, which predates the engagement and organization resolution that v3 gained in `20260807140000`. |
| Proposal | One function with optional reason and acknowledgement arguments. Until then, v3 and v4 stay canonical. |
| Risk | High: booking is a core flow. |
| Evidence | Migrations and call sites read. |

### SQL-6 · The company setup v2 and v1 branches look unreachable

Finding: SUSPECTED; a hand-crafted direct POST is not ruled out. Class: MAIN. Sources: Lane E sweep and Lane D (section B).

| Field | Content |
|---|---|
| Function | Saving company setup |
| Implementations | `lib/company/company-setup.ts:476` (v3), `:488` (v2) and `:499` (v1). v2 runs only when `companyId` is undefined; the code says v2 "would RENAME another company". |
| Usage | The only form, `components/app/company-setup-form.tsx:307-308`, always posts `company_id`. Its only render site, `app/[locale]/dashboard/start/company/page.tsx:131`, defaults to `"new"`. `organization-rename.ts:225` and `domain-action-capabilities.ts:343` pass an explicit value. |
| Problem | v2 and v1 are reachable only by a hand-crafted server-action POST with the field left out. |
| Proposal | Remove the v2 and v1 branches, and treat a missing id as "needs an explicit target". |
| Risk | Low. |
| Evidence | Code read. |

### SQL-7 · Stale lists of tables and RPCs that do not exist in production

Finding: CONFIRMED. Class: PROD. Source: Lane D (section D).

| Field | Content |
|---|---|
| Function | Allow-lists and privacy maps |
| Implementations | Migration drafts on `main` whose tables are not in production: `company_locations`, `dashboard_preferences`, `demand_interest_seen`, `talent_source_records` and `identity_resolution_events`, and the RPCs `save_company_location_v1`, `remove_company_location_v1`, `mark_demand_interest_seen_v1` and `record_talent_source_v1`. |
| Usage | Still listed in `lib/security/canonical-authenticated-rpcs.ts:139,144,173` and `lib/privacy/personal-relations.ts:143,244,290,291`. |
| Problem | The references are stale. |
| Proposal | Remove the stale list entries. Keep or move the draft files (lane S has the ledger detail). |
| Risk | Low. A draft that is applied later needs its entries back. |
| Evidence | Lane D, production catalogue read. |

### SQL-8 · A one-off backfill table remains in production

Finding: CONFIRMED. Class: PROD. Source: Lane D (section D).

| Field | Content |
|---|---|
| Function | A record of the display-name backfill |
| Implementations | `worker_display_name_backfill_20260805` (RLS on, no policy) |
| Usage | Referenced only by `lib/privacy/personal-relations.ts` and the generated types. |
| Problem | A one-off object that outlived its job. |
| Proposal | The owner decides: keep it as an audit trail, or drop it after confirming that no personal data needs to stay. |
| Risk | None if kept. |
| Evidence | Lane D. |

### SQL-9 · The retired agency board (Model A) still has its RPCs

Finding: CONFIRMED. Class: UNUSED-OR-DUP. Source: Lane H (D-5).

| Field | Content |
|---|---|
| Function | The old agency board |
| Implementations | `list_open_demand_for_agencies` and `mark_agency_can_offer`; reader `lib/agency/pool.ts:298` |
| Usage | The route `/dashboard/agency/pool` has redirected since W1. The owner retired the board on 2026-09-14 (`lib/product-gate/capability-register.ts:622`). |
| Problem | The database objects are still in place. PR #3657 (messaging lane) revokes their execute grant. |
| Proposal | Remove after this audit, as a RED step. |
| Risk | None for users. |
| Evidence | Lane H; the capability register. |

### SEC-1..3 · Security items, handed to the owning lane

Three entries in this area are security-relevant. This repository is public, so the details are not written here
(the rule in `docs/program/FUNCTION_REGISTER.md`, line 7). They were found independently by Lane D's production read
and by Lane E's sweep. They are with Lane D and Lane E, to be handed to the auth/RLS lane (F) and the coordinator.
Each fix is RED and owner-gated. Status: open.

## 11. Dead code, translations and links

### DEAD-1 · App and UI components with no importer

Finding: CONFIRMED. Class: UNUSED-OR-DUP. Sources: Lane E sweep and Lane A (A-6).

| Field | Content |
|---|---|
| Function | Various UI pieces |
| Implementations | `components/ui/`: `StructureTree`, `GroupedList`, `Choice`, `EmptyState`, `Placeholder`, `ListRow`, `ResultShell` and `Table` (`.tsx`).<br>`components/app/`: `feature-availability-grid`, `setup-role-choice`, `labour-market-world-map`, `demand-preview-card`, `live-world-map`, `live-ticker`, `dashboard-section`, `agency-pool-preview`, `role-catalogue-card`, `open-in-waze`, `market-counters` and `live-map` (`.tsx`).<br>Also `components/app/cv/living-cv-story.tsx` (217 lines; last commit `acc2121ff`, 2026-11-08) and `components/app/agency-workers-section.tsx`. |
| Usage | No importer outside tests, for each file. |
| Problem | Dead code with no retirement marker. |
| Proposal | Remove them, **except** `agency-workers-section.tsx`: it is kept on purpose (`lib/product-gate/capability-register.ts:625`), and the guard `agency-model-b-canonical-v1.test.ts` checks that it stays unused. |
| Risk | Low. Tests that mention them must be updated in the same PR. |
| Evidence | Every import, dynamic-import and require specifier in non-test source was compared with each file's base name, and a repo-wide grep for `['"/]<name>['".]` was run. Lane E spot-checked `feature-availability-grid` and `living-cv-story`: 0 product references each. |

### DEAD-2 · Marketing components with no importer

Finding: CONFIRMED. Class: UNUSED-OR-DUP. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Landing-page sections |
| Implementations | `components/marketing/`: `proof-band`, `market-proof-band`, `product-chain-band`, `market-moment`, `starting-contexts-band`, `example-preview-frame`, `trust-band`, `landing-primary-actions`, `how-it-works-band`, `market-pulse`, `audience-value-sections`, `audience-page`, `draft-board`, `final-cta-band`, `public-market-map-band`, `service-offers`, `landing-three-ways`, `conversation-os-panel` and `two-sides-section` (`.tsx`) |
| Usage | No non-test reference, for each file. Some are named by guards; `market-proof-band` is named by 4. |
| Problem | Dead copy and code that still have to be maintained. |
| Proposal | Remove them after checking `lib/guards/landing-freeze.ts` and the other landing guards. |
| Risk | The landing guards pin some of these files. |
| Evidence | Same method as DEAD-1. |

### DEAD-3 · `market-map-shell.tsx` is guarded but not rendered

Finding: CONFIRMED. Class: UNUSED-OR-DUP. Source: Lane E sweep (spot-checked by Lane E).

| Field | Content |
|---|---|
| Function | The old market-map page shell |
| Implementations | `components/app/market-map-shell.tsx:74` (`MarketMapShell`, 342 lines) |
| Usage | No product importer. 16 guard files reference it (for example `clickability-actionability.test.ts:30`, `demand-location-capture.test.ts:47` and `market-map-atlas-binding.test.ts:18`). The live page `app/[locale]/dashboard/market-map/page.tsx` renders `WorldDiscovery` instead. |
| Problem | Those guards protect code nobody sees, so they give false assurance about the live map. |
| Proposal | Remove the component and point the guards at the live page. |
| Risk | The guards have to be rewritten. |
| Evidence | Grep. |

### DEAD-4 · Lib modules imported only by tests

Finding: CONFIRMED that only tests import them; SUSPECTED that they are dead, because many are test infrastructure. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Various |
| Implementations | `lib/lmc/wallet.ts`, `lib/lmc/compensation.ts`, `lib/employers/employer-identity.ts`, `lib/ai/runtime/run.ts`, `lib/ai/runtime/providers/adapter-contract.ts`, `lib/ops/control-authorization.ts`, `lib/planning/brigade-plan.ts`, `lib/journal/review-readiness.ts`, `lib/work-market/visual-concepts.ts`, `lib/staffing/contract-payment-readiness.ts`, `lib/staffing/service-model.ts`, `lib/config/suggestion-statuses.ts`, `lib/visual/industry-glyph.ts`, `lib/feedback/work-feedback-loop.ts`, `lib/intelligence/eurostat-activation-facts.ts`, `lib/player-card/sample-card.ts`, `lib/organization-evidence/object-mapping.ts`, `lib/migrations/parity-model.ts`, `lib/commercial/plan-adapters.ts`, `lib/forecast/forecast-demonstration.ts`, `lib/answer-engine/indexnow.ts`, `lib/eurostat-import/eurostat-importer.ts`, `lib/eurostat-import/eurostat-observation-writer.ts`, `lib/esco/evidence-correspondence.ts`, `lib/analytics/market-coverage-claims.ts`, `lib/structuring/language-packs/recognition-status.ts`, `lib/structuring/language-packs/core-slugs.ts`, `lib/product-gate/surface-registry.ts` and `lib/security/canonical-authenticated-rpcs.ts` |
| Usage | No non-test specifier references, repo-wide. Excluded because they are used: `lib/supply-bridge/feed-file.ts`, `lib/profile/skill-evidence-state.ts` and `lib/seo/seo-indexing-audit.ts` (scripts); `lib/learning/signal-queue-producer.ts` (a multi-line dynamic import at `lib/conversation/opening-brief.ts:513`); `lib/billing/providers/stripe-test.ts`; `lib/i18n/request.ts`. |
| Problem | Being test-only is not the same as being dead. The product-gate and security lists are guard infrastructure. |
| Proposal | Review case by case. `lib/lmc/wallet.ts` and `compensation.ts` stay under the LMC freeze (§12). |
| Risk | Guards import these modules. |
| Evidence | Specifier grep. |

### DEAD-5 · Translation namespaces never referenced in code

Finding: CONFIRMED for three namespaces; SUSPECTED for seven. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Top-level blocks in `messages/en.json`, which has 250 top-level namespaces |
| Implementations | Referenced nowhere: `processAssistant` (22 English leaves), `jobDiscovery` (12) and `livingCvStory` (10).<br>Referenced only by scripts or guards: `jobPostings` (42), `billingStatus` (7), `profileSkillClaims` (15), `heroCards` (12), `profileCvClarity` (16), `myWorkView` (40) and `landingJourney` (68, hash-pinned by `lib/guards/landing-freeze.ts:834`).<br>Total: 244 English leaves across the 10. |
| Usage | 0 matches for the namespace name in non-test `app`, `components`, `lib` and `content`. |
| Problem | Dead copy that the parity guards still force into every locale. |
| Proposal | Remove them, together with the guards that list them. `landingJourney` needs a deliberate landing-freeze re-hash. |
| Risk | A namespace built dynamically (`` t(`${x}`) ``) would be missed by this grep. |
| Evidence | Only top-level namespaces were checked, not unused keys inside live namespaces. No guard checks for unused keys: the i18n guards police missing keys and parity. |

### DEAD-6 · Literal dashboard links: none dead

Finding: NOT A DUPLICATE. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Literal `/dashboard/...` hrefs |
| Implementations | Every literal `href=`, `href:`, `pathname:` and `redirect(` value in `app`, `components` and `lib` |
| Usage | Each one was checked against `app/[locale]<path>/page.tsx` or `route.ts`: 0 are missing. |
| Problem | None. |
| Proposal | Keep. `primary-flow-dead-cta.test.ts` already polices `href="#"`. |
| Risk | Links built from template literals were not checked. |
| Evidence | Script over the literal values. |

### BYP-1 · Voice transcription sends audio out without the AI runtime's egress gate

Finding: SUSPECTED. Not a duplicate, but a second way personal data leaves the platform. Class: MAIN. Source: Lane E sweep.

| Field | Content |
|---|---|
| Function | Sending audio to a speech-to-text service |
| Implementations | `lib/voice/transcribe-action.ts:23` (`VOICE_TRANSCRIBE_URL`), beside the documented single gate `runAiAgent` / `data-egress.ts` (`lib/ai/README.md`) |
| Usage | None of the 11 `runAiAgent(` call sites covers voice. |
| Problem | Audio leaves through a path outside the documented single gate. The production transcription host is open owner decision COM-6/COM-8. |
| Proposal | Keep it, but record it in the egress register. |
| Risk | None from documenting it. |
| Evidence | Code read. Whether `no-direct-llm-client-call.test.ts` covers it was not checked. |

**Bypasses, otherwise.** Lane B found none in the AI area on `main`:

- no file outside `lib/ai` calls a provider host or SDK (grep for the OpenAI, Anthropic, Gemini, xAI, DeepL and Cloudflare AI hosts and their SDK imports: 0);
- model work goes through `runAiAgent`, except AI-4;
- every MCP tool runs through `runCapability`.

The other bypass-shaped findings are listed under their areas: MSG-3, MSG-4, MSG-5, CV-1, CV-4, CV-10 and CV-14.

## 12. Earlier registers: superseded, with their current state

The two files stay at their paths: `lib/guards/consolidation-no-new-truth.test.ts:26` and several modules cite the
2026-08-17 register by path and section number in their failure messages. Each file carries a "superseded by" note
at the top; its section numbers stay valid.

### `duplication-freeze-register-2026-08-17.md`

| § | Item | State on `main` 2026-11-23 | Where |
|---|---|---|---|
| §1 | Two membership truths (`company_memberships` governance, `engagement_contexts` employment) | Not re-measured. The boundary guard is still in force (`consolidation-no-new-truth.test.ts`). | — |
| §2 | `invitations` is the one transport | Partly. It now has 5+ writers, but the legacy company writer is still live. | HIRE-1 |
| §2 | Redirect the `company_worker_invitations` writes (L3) | Not done | HIRE-1 |
| §2 | Acceptance feeds both truths | Not done: canonical accept writes no membership row | HIRE-3 |
| §2 | `agency_worker_invitations` | Changed: the writer is unreachable; accept is live | HIRE-2 |
| §2 | Fold System C into `create_invitation_v1` | Not done; it grants different rights | HIRE-6 |
| §2 | No fourth invitation table | Still true. The guard allowlist (`consolidation-no-new-truth.test.ts:233-235`) still pins the two legacy writers. | — |
| §3 | `company_worker_engagements` written only by booking accept | Still true (v3 and v4 only) | HIRE-5 |
| §3 | Booking accept opens the engagement row (L4) | Not done; v4 was used for calendar clashes instead | HIRE-5 |
| §3 | `company_workers` roster as a frozen read-only duplicate | No longer accurate: it still gets rows from the legacy accept, and project authority depends on it | HIRE-3, HIRE-4 |
| §3 | New since the register | Two more employment shapes: the `collaborator` engagement row from agency placement, and `team_assignments` | HIRE-5 |
| §4 | Candidate stage derived, never stored | Still true. No migration matches `pipeline_stage\|candidate_stage\|pipeline_status`; `lib/pipeline/candidate-pipeline.ts` is imported by the scouting page, the employer workspace and `demand-journey-model.ts`. | — |
| §5 | `candidate_skills` | Still true: 0 `.from("candidate_skills")`; only comments, the erasure map (`lib/privacy/personal-relations.ts:163`) and `capability-register.ts:401` | — |
| §5 | `job_demands` | Changed: it has no reader now. `lib/market-map/project-results.ts` stopped reading it (header `:22-26`, `:58`, closed 2026-09-05). The register's "remaining reader" line is stale. | — |
| §5 | `matches` / `match_actions` | Still 0 writers. New: a count-only reader (`20261022150000_agentai_capability_readback_counts_v1.sql:37-38`, keys in `lib/api/capability-readback.ts:15`) and an erasure-map entry (`personal-relations.ts:358`). | — |
| §5 | `worker_skills.self_rated_level` | Still true for the app. End-to-end fixtures write it (`tests/e2e/integrated-fixes.spec.ts:419-442,1017`; `market-map-readiness-authenticated.spec.ts:95`). | — |
| §5 | LMC (`lmc_*`) | Changed: `lib/billing/lmc-flags.ts` now has product importers (`components/app/lmc-balance-section.tsx:3`, `lib/lmc/admin-ledger.ts:5`). The tables are read in `admin-ledger.ts:63,95` and `lmc-account.ts:161,179`, and `lmc_admin_grant_v1` is called at `admin-ledger.ts:174`; these render on `dashboard/admin/billing` and `dashboard/account`. `lib/lmc/wallet.ts` and `compensation.ts` still have no product importer. Arming stays MKT-7. | DEAD-4 |
| §5 | `talent_source_records` / `identity_resolution_events` | Still true; only the erasure map references them. Not in production. | SQL-7 |
| §5 | `agency_candidate_offers` | Still true: wired, not dead | OFFER-2 |

### `canonical-paths-duplicate-flow-audit.md` (2026-06-02)

**Still true:**

- `/dashboard/profile` is the one profile editing page;
- the dashboards link to it;
- the account page reads its role chips from `roleStatusChipKey`.

**No longer true:**

- **CV upload is real.** `/api/cv/extract` exists. `cv-import-upload.tsx` is mounted from `cv-input-panel.tsx` (the profile) and `conversation/worker-cv-flow.tsx` (the chat, `conversation-chat.tsx:5787,6319`). They share the same parts, which is acceptable.
- **The dev preview is gone.** `design/text-first/preview.tsx` no longer exists.
- **"Manual picker, single mount" fails.** There is now a second free-label add (CV-7).
- **The chat has its own front doors** for the CV, skills, work history, education and the work card. They share the write actions, but some UIs are doubled (CV-8, CV-11, CV-12).
- **Journal edit has two screens** (CV-9).

## 13. Checked, not duplicates

Each of these looks like a duplicate, but differs in purpose, rights or source. Do not merge them.

**Sign-in and sign-up**
- **Web sign-in and sign-up.** There is one login form, one sign-up form, one Google button (`components/app/google-button.tsx:238`) and one callback (`app/[locale]/auth/callback/route.ts:147/168`). The addressed-invite sign-up (`signup-accept-action.ts:86`) is a server-side branch that keeps the invited address out of the browser. The OTP in `lib/auth/email-verification-actions.ts:99` uses `shouldCreateUser:false` and only proves an email address.
- **Accepting an invitation after sign-up.** All four surfaces go through `acceptInvitationAction` or `acceptInvitationByIdAction`.
- **Claim invitations** ride on `invitations`, but grant ownership.

**Hiring, search and offers**
- **Booking requests** are the ONE path by which a worker is asked. The agency path reuses them (`respond_agency_candidate_offer_v1` → `propose_booking_request_v3`). Source: Lane H.
- **`team_assignments`** is the ONE path by which a crew joins a project. PR #3649 reuses it. Source: Lane H.
- **Expressing interest** has one core: `lib/opportunities/interest.ts:204`. `vacancy-interest.ts` writes the same table for imported ads, by design.
- **Candidate search** has one core: `runScoutingCore` (`lib/scouting/scouting.ts:263`).
- **Work search.** The public board and the worker's matches read different sources.
- **Offer stores.** Each has its own actor and object: `booking_requests`, `agency_candidate_offers`, `team_demand_offers`, `service_offering_requests`, `proposals` and `procurement_offers`.

**AI, chat and tools**
- **Confirmation tokens.** `lib/capabilities/confirmable.ts` and `lib/conversation/confirmation-token.ts` use the same `issueConfirmationToken`, with a separate secret on purpose.
- **The intent router and the LLM intent proposal** are layers. The LLM only proposes catalogue ids for sentences the router could not read.
- **`/dashboard/assist`** reads existing data and makes no AI call (`lib/assist/assist.ts:60`). It is not the chat assistant. Source: Lane B.
- **The MCP tool profiles** (`full`, `read`, `chatgpt`) are filters over ONE registry. Source: Lane B.
- **Sending a message.** MCP `message.send_confirm` and the web composer both call `sendMessageCore`.
- **Notifications** have one insert (`lib/notifications/events.ts:500`), and all 11 emitters are in `event-emitters.ts`. The in-memory send guard is the fallback inside the durable one. Push subscription and push dispatch are separate jobs.
- **The phone app** has no intent reader of its own. It goes only through `/api/mcp`.

**CV, profile and history**
- **`lib/journal/organization-all-time.ts`** is the organization-history sub-figure that the one reading cites.
- **`lib/player-card/context-hours.ts`** matches figures by id and adds nothing up.
- **The CV skill tiers and the evidence visuals** are both built on `deriveEvidenceTier`.
- **`historical-player-card`** is an organization's view of a person, for a different audience.
- **The availability preferences form and the work-card editor** edit different fields.
- **The avatar** has one uploader.
- **Languages** use one RPC.
- **Lane A's checks.** The consent card (`DiscoverabilityConsent`) and the consequence trace (`HomeTrace`) are each one component used on several pages.
- **The journal calendar and the historical calendar** (Lane A, A-5): SUSPECTED only. One is the person's own journal; the other is organization-supplied history, with different data and rights. Trace both before any merge.

**Other**
- **The waitlist** has one writer (`app/api/waitlist/route.ts:76`).
- **API routes.** None of the 30 `app/api/*/route.ts` files re-implements a server action.
- **Native date inputs** appear in 45 files with no shared picker. That is a consistency question, not a proven duplicate.

**Navigation and pages**
- **The public site nav.** `IntentMegaMenu` (desktop) and `MobileNavMenu` are two responsive halves of one menu, fed from the same `PUBLIC_INTENTS` (`components/layouts/site-nav.tsx:111-270`).
- **`GoalNavigation` and the site header.** One is the public first-screen chooser, the other persistent navigation.
- **The dashboard header.** `ConversationHeader` mounts once per mode; conversation mode returns its children bare (`dashboard-chrome.tsx`).
- **Search.** `HeaderSearch`, `CommandFinder` and the command registry make one search with one mount.
- **Small, single-purpose pieces.** `MySpaceRow` (pinned chat shortcuts), `PageQuickNav` (anchors on `/cv`), `period-nav` (a date-period selector) and `JournalCalendar` (a day picker) are not navigation systems.
- **Route pairs that differ by audience or job:**
  - `/jobs` (public) vs `/dashboard/opportunities` (signed in, fit-assessed);
  - `/company-need` (anonymous intake) vs `/dashboard/company/needs`;
  - `/dashboard/inbox` (journal review) vs `/dashboard/communication` (threads);
  - `/dashboard/planning` (the one calendar) vs `/dashboard/company/planning` (capacity; guard-pinned);
  - `/dashboard/learning` vs `/dashboard/company/education`;
  - `/dashboard/account` vs `/dashboard/profile` vs `/cv` (print);
  - `/dashboard/company/settings` vs `/dashboard/start/company`.
- **Language controls.** The avatar-menu language control (`md:hidden`) and the header `LocaleSwitcher` (`hidden md:flex`) complement each other.
- **Not judged:** the public worker pages `/for-workers`, `/work-opportunities`, `/work-abroad`, `/create-cv` and `/worker-intake` overlap in audience, but look like separate search and funnel pages.

## 14. Inputs and provenance

| Lane | Area | Received (UTC) | Basis |
|---|---|---|---|
| E | Own sweep (five read-only searches) and REG-1 | 05:15–05:30 | `main` `125e21827` |
| A | Worker UI | 05:13 (#3679 comment 7092221320) | `main` `125e2182` |
| H | Offers, proposals, team offers | 05:14 | `origin/main` `8bcda5bed`; production migration ledger |
| D | SQL functions, RPCs, tables | 05:16 (read time corrected 05:17) | `origin/main` `f65c572`; production catalogue 05:11–05:16 |
| B | AI assistants, tool registries, MCP | 05:17 | `main` `125e21827`; production build `430bd475` |
| M | Employer and agency UI | promised before 09:00 | — |
| C | Hiring | not yet received | — |
| G | CV and AI | not yet received | — |
| S | Technical architecture input | not yet received | — |
