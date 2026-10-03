# PRODUCT_CAPABILITY_MATRIX

Snapshot: `main` @ `9aac82f65` (2026-10-02). PR #2110 (`feat/cc/premium-public-slice`) compared against it.
Method: static read of 119 `page.tsx` + 21 `route.ts` and the nav/finder/module registries. Role columns are inferred from code gates (`role-gated-routes.ts`, `requireRoleOrRedirect`, `requireSuperadmin`); "All" = authenticated, real visibility may be narrower via RLS. Not yet human-walked per route.

## PR #2110 impact (global)

- Files added/removed under `app/` and `lib/`: **none** except the new guard `public-slice.test.ts`. No route created, deleted or redirected.
- Nav definitions (`lib/config/navigation.ts`, `feature-availability.ts`, `site-nav.tsx`, `site-footer.tsx`, `command-registry.ts`, module registry): **untouched**.
- Nav-adjacent changes: `account-menu.tsx` (own portrait + workspace label; all links kept), `dashboard/layout.tsx` (adds `OwnAvatarStream`).
- Therefore **no capability is hidden/removed by #2110 itself**. Per-surface restyling is listed in the PR file list; every restyled page keeps its route, gate and data source.
- Pre-existing discoverability gaps (NOT caused by #2110) are in section "Reachability gaps".

Columns below: CAPABILITY | ROUTE | ROLE | DATA | ENTRY POINT | PRESERVED (#2110) | VISUAL PROOF

## Navigation surfaces

| Surface | File | Entries |
|---|---|---|
| Primary tabs (desktop + mobile) | `lib/config/navigation.ts` | `/dashboard`, **`/market` (Discover, new)**, `/journal`, `/communication`, `/planning`, `/network` (+ `/admin` for admins). Six-tab contract re-pinned by `compact-nav-marketplace-ia.test.ts` + `discover-ia.test.ts` (map tab replaced by Discover; owner decision 2026-10-02). The one top bar every user gets (`ConversationHeader`) renders the core: chat, **Discover**, journal, calendar, messages |
| Discover registry | `lib/discover/discover-registry.ts` | role-aware list of the real offer/seek sections; rendered by `/dashboard/market` |
| Avatar menu | `components/app/account-menu.tsx` | profile (org: company settings), player card/CV, `/cv`, admin, account, privacy link, theme, feedback, logout |
| Command finder | `lib/navigation/command-registry.ts` | ~55 curated entries |
| Module registry | `lib/dashboard/dashboard-module-registry.ts` | ~27 modules, rendered as grid on `/dashboard/activity` |
| Bell + spine | `NotificationPanel`, `SpineStream` | → `/dashboard/activity` |
| Chat chips / intents | `conversation-chat.tsx`, `opening-brief.ts`, `intent-router.ts` | many routes reachable only here |
| Public header / footer | `site-nav.tsx`, `site-footer.tsx` | header: `/jobs`, `/#market`, `/#how-it-works`, `/pricing`, `/about`, `/vision`(gated); footer adds for-workers/companies/agencies + legal |
| Redirects | `next.config.*` | `/dashboard/marketplace`→`/market-map`; `/agency`→`/company`; `/agency/pool`→`/company#company-team`; `/player-card`→`/journal`; `/assistant`→`/dashboard` |

## Marketplace / discovery (explicit)

| Capability | Route | Role | Data | Entry | Preserved | Proof |
|---|---|---|---|---|---|---|
| Marketplace hub (concept) | `/dashboard/marketplace` → 308 `/dashboard/market-map` | All | `lib/market-map/*` | PRIMARY tab "map"; feature `marketplace_hub` | YES (unchanged by #2110) | TODO |
| Map-first discovery, signal capture | `/dashboard/market-map` | All | `world-read`, `world-model` | PRIMARY tab | YES | TODO |
| Offer/demand recognizer | `/dashboard/market/recognize` | All (C/A) | `customer_requests` | in-page from map only | YES; weak entry | TODO |
| Public job board + detail | `/jobs`, `/jobs/[id]` | Pub | `lib/vacancy-store/*` | site-nav, footer | YES | TODO |
| Worker opportunities | `/dashboard/opportunities` | W | `customer_requests`, `demand_interest_signals`, `match-v1` | finder `find_work`, chat, module (no tab) | YES; weak entry | TODO |
| Marketplace listings | `/dashboard/listings` | All | `marketplace_listings` + RPCs | finder, module, chat chip | YES; weak entry | TODO |
| Service offerings | `/dashboard/services` | All | `service_offerings` | finder, module | YES; weak entry | TODO |
| Service requests | `/dashboard/service-requests` | All | `service_offering_requests` + RPCs | finder, module | YES; weak entry | TODO |
| Workforce needs register | `/dashboard/company/needs` | C/A | `customer_requests`, claim-public-intake | company home | YES | TODO |
| Candidate discovery / shortlist | `/dashboard/company/scouting` | C/A | `demand_shortlist`, scout-safe view | finder `find_workers` | YES | TODO |
| Candidate drafts | `/dashboard/candidates` | C/A | `candidate_drafts` | finder | YES | TODO |
| Public company profile | `/business/[slug]` | Pub | `lib/company/public-profile` | deep-link | YES | TODO |
| Buyer workspace | `/dashboard/buyer`, `/start/buyer` | Cu | `lib/buyer/*` | role switch | YES; weak entry | TODO |
| Marketplace rules | `/legal/marketplace-rules` | Pub | static | footer | YES | n/a |
| Public SEO discovery | `/work-opportunities`, `/professions`, `/skills`, `/labour-market*`, `/work-abroad`, `/questions*`, `/match-preview`, `/calculators/project-cost` | Pub | seo libs | sitemap/finder only | YES; no header/footer entry | n/a |
| Matching/candidate pool (admin) | `/dashboard/admin/matching`, `/candidate-pool`, `/dashboard/talent` | Adm | `match-v1`, `candidate-pool` | admin only | YES | n/a |

### Marketplace model (verified from the repo, 2026-10-02)

Owner decision: the marketplace is the broader DISCOVER world (offer or seek work, people, services, work resources, opportunities), not only recruitment. Only production-real branches are active in the UI; no fake listings.

| Branch | Side | Status | Real basis | Discover card |
|---|---|---|---|---|
| Find work | seek (worker) | IMPLEMENTED | `/dashboard/opportunities`, ~38k imported `public_vacancies`, saved searches | yes (worker) |
| Public job board | seek (any) | IMPLEMENTED | `/jobs`, anonymous projection RPCs | yes |
| Find people | seek (org) | IMPLEMENTED | `/dashboard/company/scouting` (anonymised candidates, pipeline) | yes (company/agency) |
| Workforce needs | seek (org) | IMPLEMENTED | `/dashboard/company/needs` -> `customer_requests` (the one demand path) | yes |
| Candidate drafts | seek (org) | PARTIAL | private drafts, not a discovery surface | yes (org) |
| Service offers | offer | IMPLEMENTED in code, 0 prod rows ("Just opened") | `service_offerings` | yes |
| Service requests | seek | PARTIAL: complete loop, never exercised ("Just opened") | `service_offering_requests` | yes |
| Work-resource listings | both | PARTIAL / CODE_PROVEN, 0 prod rows ("Just opened") | `marketplace_listings`: kinds sale/rental/wanted; categories accommodation, premises, vehicle, tools, equipment, machinery, safety_equipment. **No consumer goods, no work offers, no moderation queue, no payments.** | yes |
| Companies | public showcase | IMPLEMENTED (opt-in) | `/business/[slug]` via `public_profile_enabled` | no card (deep link shared by the organisation) |
| Project/contract needs | - | projects IMPLEMENTED (operational), commercial PARTIAL | not discovery surfaces | no (stay in company workspace) |
| Network | both | IMPLEMENTED (relationships) | `/dashboard/network` | yes |
| Map | both | IMPLEMENTED (read-only, real layers only) | `/dashboard/market-map` | yes (spatial lens, first group) |
| Offer/need recogniser | both | PARTIAL (non-persisted hand-off) | `/dashboard/market/recognize` | yes |
| Buyer (customer) | seek | PARTIAL | `/dashboard/buyer` | yes (customer, "Just opened") |
| Learning / education | grow | PARTIAL, grow-type | learning stays CONTEXTUAL (EDU-5); education only for `training_provider` orgs | education card only |
| Recognition / RPL | - | **NOT IMPLEMENTED** (SKL-9 MISSING) | - | none (never presented) |
| Paid marketplace / checkout | - | NOT IMPLEMENTED (MKT-7 owner-gated) | - | none |

Architecture chosen: a **role-aware Discover destination** at `/dashboard/market` (second primary tab, second core item of the one top bar, finder starter, `marketplace` redirect target). It owns no data; it selects the real sections for the viewer's roles. The map is its spatial lens, no longer a tab. Why not the alternatives: hiding under the map keeps seven working sections invisible; a new tab per branch bloats the nav; finder-only access is not findability (see memory `nav-catalogue-renders-only-in-admin-chrome`).

## Capabilities by area (all PRESERVED by #2110; restyled where listed in PR files)

| Area | Routes | Roles | Data / libs | Entry |
|---|---|---|---|---|
| Public marketing | `/`, `/about`, `/pricing`, `/vision`, `/for-workers`, `/for-companies`, `/for-agencies`, legal ×8 | Pub | static, `player-card/sample-card`, `demand-preview-card` | site nav/footer. **#2110 restyles** home, for-workers, for-companies |
| Auth / onboarding | `/auth/*`, `/oauth/consent`, `/onboarding` | Pub/All | Supabase auth | CTAs |
| Conversation home | `/dashboard` | All | `conversation/chat/*` | primary |
| Spaces/setup | `/dashboard/start`, `/start/company`, `/start/buyer` | All | `company-setup` | finder |
| Activity/notifications | `/dashboard/activity` (+bell, spine, prefs in `/account`) | All | `notifications/spine` | bell |
| Assist | `/dashboard/assist` | All | `assist` | finder/module |
| Account, LMC, connected apps | `/dashboard/account` | All | `lmc-account` | avatar |
| Privacy centre | `/dashboard/privacy` (+export) | All | `lib/privacy/*` | finder, avatar link |
| Intelligence | `/dashboard/intelligence` | owner | `lib/intelligence/*` | **no nav** |
| Today / work world | `/dashboard` + today sections | W | restyled by #2110 | primary |
| Journal | `/dashboard/journal` (+voice, export, hours) | W | `journal_entries`, evidence | primary. **restyled** |
| Review/confirmation | `/dashboard/inbox`, `/inbox/quick`, `/inbox/report` | W/mgr | `review-queue` | finder |
| Hours | `/dashboard/hours`, `/work-in-numbers` | W | `work-hours` | **chat/in-page only** |
| Gallery | `/dashboard/gallery` | W | `personal-gallery` | in-page |
| Tasks | `/dashboard/tasks` | W/C/A | `lib/tasks` | finder |
| Instructions (translated) | `/dashboard/instructions` | All | `lib/instructions` | in-page |
| Absences | `/dashboard/absences` | W/C/A | `lib/leave` | finder |
| Documents/credentials | `/dashboard/documents` | All | `lib/documents`, country-readiness | finder |
| Assets | `/dashboard/assets` | W/C/A | `assets` | finder |
| Finance | `/dashboard/finance` (+export) | W/C/A | `lib/finance`, trips | finder |
| Bookings | `/dashboard/bookings` | All | `lib/booking` | finder (removed from avatar earlier) |
| Commercial / agreements | `/dashboard/commercial` | C/A | `proposals`, `contracts` | finder |
| Calendar | `/dashboard/planning` (+timesheets export) | All | `lib/planning`, `timesheets` | primary. **restyled** |
| Workforce planning | `/dashboard/company/planning` | C/A | `lib/workforce` | finder |
| Messages | `/dashboard/communication`, `/[id]` (translation) | All | `lib/communication` | primary |
| Living CV / profile | `/cv`, `/dashboard/profile` | W | `cv-export`, `worker_skills` | avatar. **restyled** |
| Evidence report | `/dashboard/reports/evidence`, `/dashboard/reports` | All | `evidence-report` | finder |
| Person page | `/dashboard/people/[workerId]` | C/A/mgr | `can_view_worker` | deep-link |
| Company workspace | `/dashboard/company`, `/settings`, `/people`, `/partners`, `/history`, `/education`, `/projects/new` | C/A | `company/*`, `agency/*` | in-page; **restyled** company home |
| Network | `/dashboard/network` | All | `invitations/network` | primary |
| Projects | `/dashboard/projects`, `/[id]`, `/[id]/operations` | C/A/W | `lib/projects` | finder; **restyled** |
| Learning | `/dashboard/learning` (+`company/education`) | All / institutions | `learning_review_queue` | **chat chip only** |
| Billing | `/pricing`, `/dashboard/account#lmc`, `/dashboard/admin/billing`, `/api/billing/*` | Pub/All/Adm | Stripe plumbing; no checkout UI (OWNER-GATED MKT-7) | various |
| Integrations | `account#connected-apps`, `/api/mcp`, referrals, supply-feed, crons, vacancy sources | — | — | account |
| Admin | 22 routes under `/dashboard/admin/*` | Adm | — | admin nav |
| Manager / Agency | no dedicated routes; share company + projects surfaces; `/dashboard/agency` redirects | — | `organization-authority` | — |

## Reachability (static scan of all 119 `page.tsx`, before vs after the Discover slice)

Classes: PRIMARY = in the one top bar for every user; SECONDARY = avatar menu, Discover, module grid, public header/footer, or catalogue; FINDER = command search only; CONTEXTUAL = linked from the page that owns it; DEEP-LINK ONLY = addressed by id/token/email; ORPHANED = no inbound at all; ADMIN = reached from the admin hub. Method: `lib/guards/discover-ia.test.ts` ("reachability" block) now fails if a non-admin dashboard page is in no nav surface and has no declared, real contextual inbound.

| Class | Before | After |
|---|---|---|
| PRIMARY | 4 | 5 (Discover added) |
| SECONDARY | 30 | 36 |
| FINDER | 10 | 11 |
| CONTEXTUAL | 38 | 32 |
| DEEP-LINK ONLY | 13 | 13 |
| ADMIN (hub) | 22 | 22 |
| ORPHANED (static scan) | 2 (`company/education`, `learning`) | 0 (`learning` is conditional by owner decision EDU-5: reached through the manager brief chip while reviews are pending) |

Weak routes, resolved: `opportunities`, `listings`, `services`, `service-requests`, `market/recognize`, `company/needs`, `company/education`, `buyer`, `candidates`, `company/scouting` -> Discover (role-aware) + finder; `hours`, `work-in-numbers`, `instructions` -> finder entries (+ existing in-page links); `intelligence`, `assist` -> already in module grid, `intelligence` also a Discover card.
Remaining by design: `learning` (EDU-5), `gallery`/`journal/voice`/`inbox/*`/company sub-pages (CONTEXTUAL), `projects/[id]`, `people/[workerId]`, `communication/[id]` (DEEP-LINK).
Remaining gaps: public SEO pages (`/work-opportunities`, `/professions`, `/skills`, `/labour-market*`, `/work-abroad`, `/questions*`, `/match-preview`, `/company-need`, `/worker-intake`, `/create-cv`) have no header/footer entry (landing owner); `/dashboard/network` and `/dashboard/market-map` no longer tabs but are Discover cards; AGENCY identity still unavailable for a walk.

## Open items

- Per-route PRESERVED/VISUAL-PROOF columns marked TODO need rendered screenshots (next step).
- Role inference needs a walk with QA identities; AGENCY identity unavailable (see memory: no workaround).
- Dead references to verify: `/dashboard/admin/experience-moderation`, `/dashboard/advanced`, `/dashboard/quality`, `/dashboard/visual-os`, `/dashboard/experiences`.
