# OWNER RETURN PACKAGE — Full product / security / vision completion audit, 2026-09-19

One consolidated package for the owner-away mission "LABOURMARKET.AI — FABLE
FULL PRODUCT / SECURITY / VISION COMPLETION MISSION" (2026-09-19). Not a
diary: each section states truth at the proof level it was actually reached.

Proof levels used exactly: CODE_PROVEN < BUILD_PROVEN < LOCAL_BROWSER_PROVEN
< PRODUCTION_DEPLOYED < PRODUCTION_BROWSER_PROVEN < HUMAN_UI_PROVEN.
LOCAL_BROWSER_PROVEN here means the production build (`next build` +
`next start`) against the PRODUCTION Supabase backend, walked with Playwright
as the allow-listed synthetic QA identity, desktop 1360 px + mobile 390 px.

Method: the previous receipts were NOT trusted. Seven independent read-only
investigations traced real code and real authority (server action → data
layer → RLS / SECURITY DEFINER / triggers) across security, the worker and
employer marketplace loops, the agency bridge, the company OS, the four-role
onboarding and zero-data states, i18n / mobile / a11y, data integrity,
notifications, GDPR export and deletion, public discoverability, and test
quality. Production was read directly (Supabase MCP, read-only SQL; the
public site in a browser). Everything GREEN that was found was fixed on ONE
branch in six journey-batched commits; everything else is classified below.

---

## A. CURRENT PRODUCTION

| | |
|---|---|
| main SHA at start | `d1618339` (#1788) — main = prod, `/api/health` ok (auth + db), region dub1 |
| CI on main | Quality Gates green (run 35380066714); health-probe green |
| migration ledger | 291 applied = 291 repo files; **this mission applies ZERO migrations, ZERO RLS changes, ZERO authority changes** |
| Supabase security advisors | 9 anon SECURITY DEFINER functions = the deliberate public preview set; `worker_absence_scheduling` definer view = documented load-bearing exception; leaked-password protection OFF (owner setting); two `usage_cost_events_*` trigger functions without pinned `search_path` (packet item R-13) |
| branch | `fix/cc/completion-privacy-journey-2026-09-19` — PR #1789 (GREEN class: code, tests, i18n, docs; no migration; squash auto-merge armed) |
| merged | 2026-09-19 08:32 UTC, squash `e37adc9f` (#1789) — quality 9 m 7 s, migration-safety, e2e-smoke, mobile, CodeQL all green |
| production SHA after merge | `e37adc9f` — `/api/health.build` verified (see §C proof line) |

Live production reality read on 2026-09-19 (counts): 56 profiles, 56 workers,
17 organizations, 14 companies, 20 demands, 6 interest signals, 1 booking,
9 projects, 40 journal entries, 147 organization evidence records (the 800 h
period record among them), 5 conversations / 18 messages, 22 notification
rows, 99 970 active public vacancies. `matches`, `match_actions`,
`job_demands` = 0 rows (dead tables, already deny-listed by guards).

## B. WHAT WAS FOUND

### B1. Security (the receipt is §D)
- **HIGH, RED:** `company_workers_write` and `agency_workers_write` are
  `FOR ALL … with check (owns_company(...) or is_admin())` — live-verified in
  `pg_policies`. A company owner can INSERT an `active` roster row naming ANY
  discoverable worker with no invitation and no consent. The forged row then
  satisfies `caller_manages_worker` (project assignment, absences, task
  eligibility), the roster branch of `can_view_worker`, and the agency
  candidate-offer roster check. The 2026-09-18 consent trigger protects
  `organization_people` only.
- MEDIUM, GREEN (fixed): a self-recorded, unverified document counted as a
  valid credential → `formalRequirementMet: true` (self-award of formal
  standing, SEP-6).
- MEDIUM, GREEN (fixed): invitation and partner-referral links (raw token
  inside) were built on the request's `X-Forwarded-Host`.
- LOW, GREEN (fixed): cron secret compared with `===`; ESCO lookup let `%`
  reach an `ilike` prefix scan over a million-row table.
- MEDIUM, OWNER: commercial handoff rows with `proposition_consent.given =
  false` are still dispatched to the partner (design doc treats them as
  "review employer approach"); the code comment claiming nothing leaves the
  platform was stale (fixed) — the rule itself is an owner call (R-14).
- LOW (accepted / owner semantics): CSP report-only with `unsafe-inline`;
  logout accepts GET; any account may self-declare `active_role=company` and
  thereby read discoverable worker rows (consent wording says "employers");
  conversation creator may add any participant; `grant_org_manager` needs no
  acceptance; in-memory per-instance rate limits.
- GDPR export completeness (P1, GREEN, fixed): the register and its guard only
  saw columns literally named `profile_id`/`worker_id`; ~50 person-keyed
  relations (consent ledger, disclosures, notifications, experience records,
  organization roster + evidence, confirmations authored, billing, work
  assigned) were neither exported nor named.
- Verified-CV retraction (P1, GREEN, fixed): a later rejection did not remove
  an earlier confirmation from "Confirmed Work Proof".
- Two consents had no withdrawal path in the product (GREEN, fixed): the
  contact-detail disclosure grant (`withdraw_employer_data_disclosure` had
  zero callers since July) and a confirmed roster link.

### B2. Functional / disconnected / unreachable
- Direct-booking employer cannot see, review or confirm the booked worker's
  journal: an accepted booking mints `company_worker_engagements`, the
  journal review gate reads `engagement_contexts`, and nothing bridges them
  (RED, R-2). Roster/invitation-path workers are fine.
- The work card (availability status, available-from, country, pay — the
  fields matching reads) had ONE editor, reachable only through the chat's
  player-card result, not from `/dashboard/profile` (GREEN, fixed).
- `projects.start_date / end_date / country` had no write path at all, so
  the calendar band, the operations "dates" chip and the booking-overlap
  check could never work ("No project dates — booking overlaps not
  checked"). A direct RLS update was tried and reverted: the admin-action
  guard requires gated RPCs and RLS would exclude managers who may manage the
  project. Needs `update_project_facts_v1` (RED, R-3).
- Roster invite / role assignment: the TS gate admitted managers, the
  `owns_company` RPCs refused them (GREEN, fixed: gate matches SQL).
- Inline project create skipped the manage-projects capability the dedicated
  route enforces (GREEN, fixed).
- `/dashboard/company/needs` and `/people` let an unnamed company shell
  through while the hub did not (GREEN, fixed).
- MCP `context.switch` writes only the DB pointer and was shadowed by the
  browser cookie in an open web session (GREEN, fixed: DB pointer wins when
  set; the personal sentinel still lives in the cookie).
- Chat: no sentence path for the CLIENT to accept an agency connection or
  share a request (agency side is complete); `write-employer` is honestly
  blocked; booking by sentence absent (buttons only). GREEN_MISSING, not done
  (chat file is 6 100 lines; batched for a chat slice).
- Membership-only managers see the journal review queue but
  `review_journal_entry` requires an active engagement context →
  `no_reviewer_engagement` (RED, R-4, SQL predates the membership widening).
- Post-approval skill-confidence recompute runs under the manager's client
  against owner-only `worker_skills` RLS → silent zero-row update (RED, R-5:
  needs the recompute inside the definer RPC).
- Skill recognition reject captured no reason and `learning_signals` had
  zero writers (BUILT_NOT_CONNECTED). GREEN, fixed in the follow-up PR
  #1790 (merged 2026-09-19, squash `98bbefc7`): both worker decisions append an observation, the saved-entry card
  offers an optional "why not?".
- Notifications: every emitter has a caller and the service_role grant is
  applied (memory said otherwise — corrected). MISSING event types: journal
  confirmation, new human message (both need the `notification_events`
  CHECK widened — RED, R-6). E-mail channel `not_configured` (no provider).
- Dead code confirmed with zero callers: `lib/agency/pool.ts` chain,
  `lib/esco/evidence-correspondence.ts` chain, ~20 exports listed in the
  agent reports; `project_members` table has no reader/writer;
  `buildBrigadePlan` unreachable (brigade-as-unit = existing RED).

### B3. Data integrity / privacy
- 800 h period record: ONE canonical record, monthly projection sums to
  800.00, no code path turns it into day rows (re-verified, guarded).
- Subject dispute policy (`20260915185038`) IS applied although its file
  header still carries the pre-apply "PREPARED" banner (stale header text,
  a production fact is the ledger).
- No deletion executor exists; 57 `ON DELETE NO ACTION` FKs to profiles block
  a hard delete; no organization archival; a worker cannot end their own
  `company_workers` link; the applied `ai_runs` retention sweep redacts
  `output_excerpt` but leaves `profile_id` in place (redaction, not de-linking);
  `usage_cost_events`, `pilot_events`, `notification_events` and
  `conversation_messages` have no purge schedule (all RED, R-7…R-10).

### B4. UX / reachability / mobile / a11y
- `MobileSheet` (`role=dialog aria-modal`) moved no focus, had no trap and
  no return; two fixed bottom bars ignored the safe area; ten controls sat at
  32–36 px; five spinners ignored reduced motion; four fields had no
  accessible name; the dashboard tab bar's label was hard-coded English. All
  GREEN, fixed.
- Worker phone bar / stations have no map entry (map reached via a chat chip
  only). Tried; the station list is an owner-frozen IA contract (guarded) →
  owner decision R-11.
- Dead-end empty states (no next action): network relationships/search,
  communication, market-map "nothing advertised", team roster card. Not done
  (copy decision + five locales each) — GREEN backlog.
- i18n: LT/EN/RU/NL/DE parity 0 missing keys; `messages/fi/` is an orphan
  directory with no `fi.json`; six unrouted catalogs ~53 % `[EN]`. Owner
  housekeeping.

### B5. Public / SEO
- Five sitemap-listed pages exported no metadata (no canonical, no hreflang,
  homepage title); no Organization/WebSite JSON-LD anywhere on the marketing
  tree; public business profile had no canonical/hreflang/robots; invite
  token pages and OAuth consent were crawlable; the public-SEO guard's robots
  check was satisfied by a comment; questions sitemap lacked x-default; job
  detail pages fetched the preview twice per request; manifest said
  "construction"; llms.txt hard-coded a source country. All GREEN, fixed.
- Job detail pages (`/jobs/[id]`) declare no hreflang and overwrite the
  layout's OpenGraph object; the list title doubles the brand suffix. Those
  files are behind the owner's per-PR jobs waiver → R-12.
- `JobPosting` structured data cannot be emitted honestly while
  `hiringOrganization`/`jobLocation` are member-only (PR #1433 correctly
  emits WebPage/Occupation instead; it is 17 days behind main) → owner call.

### B6. Test quality
- 926 guards; ~21 assert source text only (by design); one guard was
  satisfiable by a comment (fixed); `self-confirmation-not-independent`
  deliberately pins a known defect (EVID-2, owner-gated).
- Four Playwright files in `testDir` were screenshot scripts with zero or
  permanently-red assertions; one screenshot-only test ran in the CI subset
  and counted toward the floor; two specs passed silently when the surface
  was absent. All fixed.
- CI runs 6 of 96 Playwright specs (authenticated ones need a session); the
  live secdef / migration-parity gates stay skipped until the owner adds the
  read-only `SUPABASE_DB_URL` secret (GOV-1, unchanged).
- Local full vitest baseline on main: 23 771 pass, 8 fail — 7 are >5 s load
  timeouts of the local-flake class, 1 is the CRLF Windows-only class; CI is
  green on the same tree.

## C. WHAT WAS FIXED (one branch, six commits, zero migrations)

| Commit | Journey | Files | Guards added / changed |
|---|---|---|---|
| `aa3cfa8d` | Privacy: export completeness, CV retraction, two consent withdrawals | 20 | `privacy-export-completeness` rewritten (FK-based sweep, actor-only class, column existence), `consent-withdrawal-reachable` new, `confirmation-standing.test` new |
| `a7b1ccff` | Security + recognition honesty | 13 | `worker-project-asks.test` (+4 cases), ledger test updated |
| `a0479b5e` | Public discoverability | 16 | `seo-indexing-audit` anchored on code |
| `e0095565` | Company OS / marketplace connections | 5 | existing 103 test files green |
| `f165bf7d` | Mobile / a11y / workspace pointer | 28 | — |
| `d5efb412` | Test hygiene | 9 | orphan-testid waivers shrink by 2 |

Proof: typecheck green after every commit; targeted vitest sets green
(privacy 33, security 405, SEO 578, company-OS 2 028, mobile guards 3 082,
e2e guards 185); full `lib/guards` suite on the branch: 917 of 919 files / 16 370 of 16 372 tests pass — the two failures are the pre-existing Windows-only CRLF case in `booking-atomic-double-booking` (green in CI) and the roster-gate guard, corrected in `26cb534c` before the PR;
LOCAL_BROWSER_PROVEN walk (production build, production backend, QA
identity, 1360 px + 390 px): `/en/legal/terms`, `/lt/labour-market/lt`,
`/en/match-preview` — canonical + hreflang (lt/en/ru/nl/de/x-default) +
Organization/WebSite JSON-LD; `/robots.txt` lists `/*/invite` and
`/*/oauth`; `/en/invite/<token>` = `noindex, nofollow`; manifest description
cross-sector; `/lt/dashboard/profile` renders the work-card editor inside
the availability block on both viewports with zero horizontal overflow;
`/lt/dashboard/privacy` renders; the export bundle downloads as an
attachment with 106 relations incl. `notification_events` (2 rows for the QA
identity), `privacy_consent_events`, `organization_people`,
`organization_evidence_records/_events`, `journal_entry_confirmations`,
`billing_customers`, and names the message tables under `withheld`. The
withdrawal controls could not be rendered with the QA identity (it holds no
granted disclosure and no confirmed roster link) — CODE_PROVEN + guarded;
Donatas's walk (§K) is the first render with real rows. The landing
JSON-LD moved to the locale layout after the walk (the landing is a frozen
composition outside the marketing group) — BUILD_PROVEN, not walked locally.

PRODUCTION_BROWSER_PROVEN 2026-09-19 08:38 UTC (anonymous, after Vercel
served `e37adc9f`): `/en/legal/terms` canonical + six hreflang +
Organization/WebSite JSON-LD; `/en` carries the JSON-LD; `/robots.txt`
lists `/*/invite` and `/*/oauth`; `/en/invite/<bad token>` renders with
`noindex, nofollow`; manifest description cross-sector; `/api/health.build =
e37adc9f`. Authenticated surfaces (profile work card, privacy withdrawals,
export bundle) are PRODUCTION_DEPLOYED; their PRODUCTION_BROWSER_PROVEN is
Donatas's walk (§K).

## D. SECURITY RECEIPT

CRITICAL = 0 · HIGH = 1 (unresolved, RED) · MEDIUM = 2 fixed + 1 owner ·
LOW = 3 fixed + 5 accepted/owner-semantics.

> **CORRECTION 2026-09-19 (third window, §M):** H1 / R-1 is **CLOSED** —
> applied to production (ledger `20260919104526`), hostile contract proven
> live (5 × 42501), merged (#1791). A second HIGH of the same class was found
> and is RED draft #1794 (R-16, `add_org_member` forge — §M3). The headline
> therefore stays HIGH = 1, but it is a different issue with a prepared,
> dry-run-proven fix awaiting one approval sentence.

| # | ISSUE | ATTACK / FAILURE PATH | AFFECTED | CURRENT PROTECTION | WHY INSUFFICIENT | FIX | STATUS | PROOF |
|---|---|---|---|---|---|---|---|---|
| H1 | Roster forge on `company_workers` / `agency_workers` | owner POSTs `{company_id: own, worker_id: victim, status: active}` to PostgREST; row now proves a relationship everywhere | every worker; consent axioms | RLS `owns_company` — the forger IS the owner | authority to write the row is the company's own | revoke insert/update from `authenticated`; make `accept_worker_invitation` the only writer, or BEFORE INSERT/UPDATE trigger refusing `active` unless `auth.uid()` = worker's profile or a matching accepted invitation exists; base `caller_manages_worker` on `company_worker_engagements` | **RED R-1** | live `pg_policies` read 2026-09-19 |
| M1 | Self-award of formal standing from own document | worker records "certificate ready" → `valid_credential`, `formalRequirementMet: true` | deployment decisions | none | reviewer verification never consulted | credential requires `verification='verified'`; provenance states it | FIXED `a7b1ccff` | unit tests |
| M2 | Token links on attacker host | `X-Forwarded-Host` reaches link builder | invitees / referrals | Vercel normalisation (unverified) | header trusted | `outboundLinkOrigin` | FIXED `a7b1ccff` | unit tests |
| M3 | Handoff of non-consented rows | dispatcher posts every `queued` row | worker pseudonymous fingerprint | partner contract | consent flag ignored by dispatch | owner rule (R-14) | OWNER | code read |
| L1 | cron `===` | timing probe | scheduler | fail-closed when unset | not constant-time | `timingSafeEqual` | FIXED | tests |
| L2 | ESCO `ilike` wildcard | `%` → full scan | availability | none | cost | strip metacharacters | FIXED | tests |
| L3 | Logout via GET | cross-site `<img>` signs the visitor out | any user | — | CSRF-able | POST only | ACCEPTED (documented "direct link" use) | — |
| L4 | CSP report-only + inline | stored XSS unmitigated (none found) | all | XFO/nosniff/HSTS | no enforced CSP | nonce pipeline | OWNER | — |
| L5 | Self-declared employer reads discoverable rows | set `active_role=company` | discoverable workers | consent text v-current | wording says "employers" | narrow or reword consent | OWNER | — |
| L6 | Unsolicited participant add / manager grant | creator adds any profile; owner grants manager w/o acceptance | any profile | RLS scoped to creator/owner | no subject acceptance | acceptance step | OWNER | — |
| L7 | Per-instance rate limits | serverless instance memory | anon RPCs | DB limiter on need intake only | not shared | shared store | OWNER | — |

VERIFIED BLOCKED (with citations in the security report): employer cannot
consent for worker; manager cannot forge `organization_people`; agency /
client cannot accept a booking for the worker; institution cannot enrol a
learner; org A cannot mutate org B; worker cannot read another worker's
journal / evidence / documents; anonymous cannot read contact data; chat and
MCP run under the caller's RLS with re-resolved organization at execution;
imports cannot link a person; admin escalation trigger-guarded; open
redirects pinned; Stripe webhook signature + event idempotency; machine
doors fail closed; PostgREST filter interpolation is server-derived only;
invitation tokens hashed; all 450 last-defined SECDEF functions pin
`search_path` (two trigger functions on the cost ledger do not — R-13).

## E. MARKETPLACE RECEIPT

WORKER: SUPPLY **LIVE_PARTIAL** (five stores; work card now reachable from
profile; geography on the map page) → MATCH **LIVE** (deterministic,
score-free, `strong/possible/missing_requirement/conflict/not_assessed`) →
OPPORTUNITY **LIVE** (internal demand + 99 970 external vacancies) →
INTEREST/APPLY **LIVE** (one table, employer notified) → COMMUNICATION
**LIVE** (employer-initiated from interest or shortlist; worker→employer
`write-employer` blocked in chat) → OFFER **LIVE** (`booking_requests`) →
COMMITMENT **LIVE** (worker-only accept, atomic, clash receipt) → WORK
**LIVE** (journal; auto-links project when exactly one assignment) →
EVIDENCE **BROKEN for direct-booking employers / LIVE for roster workers**
(R-2) → NEXT OPPORTUNITY **LIVE_PARTIAL** (confirmed skills change the
evidence label, never fit order).

EMPLOYER: DEMAND **LIVE** (one RPC intake; public intake rejoins via claim)
→ MATCH **LIVE** → PEOPLE **LIVE (anonymised by design)** → INSPECT
**PARTIAL** (person page exists; no link from the match list by design) →
CONTACT **LIVE** → SHORTLIST **LIVE** → OFFER **LIVE** (not from the person
page) → COMMITMENT **LIVE** → ASSIGNMENT **LIVE (manual, from /projects)** →
WORK **LIVE** → OUTCOME **BROKEN for direct booking** (R-2) → NEXT DEMAND
**LIVE_PARTIAL** (prefill from last demand; no per-request clone).

AGENCY: invite client **LIVE** (UI+chat) → client accepts **LIVE (UI only)**
→ share request **LIVE (UI; chat read-only)** → propose candidate **LIVE**
(roster gate = the forgeable `company_workers` row, R-1) → client decides
**LIVE** (auto-creates booking) → worker consent **LIVE** (worker-only RPC)
→ deployment **PARTIAL** (generic project assignment, no agency hop).
Model-A `agency_clients` migration deliberately unapplied (draft #1741 era).

## F. COMPANY / WORKFORCE OS RECEIPT

What a real employer can do TODAY (all LIVE): set up the organization and
declare capabilities; invite governance members (from `/dashboard/start`)
and workers (invitation or legacy roster); offer roster links from imported
history and see the person accept/refuse/withdraw; create projects, set
status (draft→live→paused→completed), name a responsible person; assign and
end people (roster ∪ booking engagements); stages + Gantt + tasks + readiness
checklist + operational status; post demand, match, shortlist, contact,
offer, see acceptance; record hours (allocations) and import timesheets;
review and confirm journal entries (engagement-context managers); attest
imported evidence; run reports (org counts, per-person journal window, CSV
exports); approvals workflow (timesheets etc.); communication threads.

Added this mission: work card reachable (worker side of the same loop);
roster gates honest; unnamed shell blocked; capability gate on inline create.

Still missing for the approved Company OS: editable project facts (dates /
place — R-3, the calendar and overlap check depend on it); required headcount
/ open positions on a project (no column; RED); booked-worker journal
visibility (R-2); membership-only manager confirmation (R-4); allocated-vs-
journaled hours reconciliation view (GREEN backlog); per-request demand
clone (GREEN backlog); project-bound communication thread (owner-gated copy
says so); brigade-as-unit assignment (existing RED); employer-initiated
partner/client records (no schema; RED); notification on confirmation /
message (R-6).

## G. FOUR ROLES

| Role | E2E journey | Blockers | Production proof | Human proof | First useful action | First value | Remaining gaps |
|---|---|---|---|---|---|---|---|
| WORKER | sign-up → onboarding (name, country, profession) → Today → journal / opportunities / profile | none for the loop; evidence→matching only labels | PRODUCTION_DEPLOYED (main); this PR LOCAL_BROWSER_PROVEN (privacy + profile) | PENDING (Donatas) | "Write" / first journal entry; opportunities board | matched needs + external vacancies; interest → employer notified | withdrawal controls just added; map station (R-11) |
| EMPLOYER | wizard → company setup (legal name) → doors: need / project / invite / import | project dates (R-3); booked-worker journal (R-2) | PRODUCTION_DEPLOYED | PENDING (Donatas / Klinkerio) | post a need → scouting | matched anonymised candidates, interest signals | R-2, R-3, R-4 |
| AGENCY | same as employer with `staffing_agency` → partners door | roster forge exposure (R-1); role inversion in prod (Ramūnas must flip company type) | PRODUCTION_DEPLOYED | PENDING (Ramūnas) | invite client / propose candidate | client decision → booking → worker consent | chat share/accept for client (GREEN backlog) |
| INSTITUTION | company with `training_provider` → education door → programme → invite learner → learner accepts → cohort | zero real programmes (adoption, not code) | PRODUCTION_DEPLOYED; two-sided INTERNAL_UI_PROVEN 2026-09-18 | PENDING (first real institution) | create programme | learner accepts personally; cohort membership | formal RPL (existing RED); competency→qualification (RED) |

## H. FULL VISION — classification

| Capability | Status | Canonical impl | Entry | Data | Authority | Verified | Fixed here | Remains | Proof |
|---|---|---|---|---|---|---|---|---|---|
| AUTH | LIVE_COMPLETE | Supabase auth, `middleware.ts`, callback route | /auth/* | auth.users, profiles | cookie + bearer, fail-closed | redirects pinned; logout GET accepted | — | CSP enforce (owner) | PRODUCTION_DEPLOYED |
| ONBOARDING | LIVE_COMPLETE | onboarding-wizard, `complete_onboarding` | /onboarding | profiles.onboarded_at | RPC self | one hard gate only | unnamed-shell gate on needs/people | — | PRODUCTION_DEPLOYED |
| CHAT_FIRST | LIVE_PARTIAL | intent-registry (76), action-registry (52), dispatch.ts | /dashboard | same readers/writers as UI | dispatcher re-checks roles + org | no parallel writes; LLM classify-only | pointer resolution | client bridge intents, booking by sentence | PRODUCTION_DEPLOYED |
| ACTIVE_CONTEXT | LIVE_PARTIAL | active-organization.ts | chip / MCP | profiles + cookie | membership-validated per request | surface gate, not row scope (owner design) | DB pointer wins | row-scoping of demand/shortlist/bookings by org (owner) | PRODUCTION_DEPLOYED |
| WORKER_IDENTITY | LIVE_COMPLETE | ProfileHubOverview, TrustBlock | /dashboard/profile | workers, worker_skills, journal | self + can_view_worker | no fake rating/photo/score | work card + link withdrawal | — | LOCAL_BROWSER_PROVEN |
| WORK_HISTORY | LIVE_COMPLETE | organization_evidence + work spine | profile | organization_evidence_records | linked subject | 800 h invariant | export + withdrawal | — | PRODUCTION_DEPLOYED |
| JOURNAL | LIVE_COMPLETE | create_journal_entry_full | /dashboard/journal + chat | journal_entries + metrics | owner RLS | deterministic recognition | — | reject reason, learning_signals writer | PRODUCTION_DEPLOYED |
| EVIDENCE | LIVE_PARTIAL | journal_entry_confirmations, evidence events | inbox | append-only | manages_organization + engagement | latest-wins | CV retraction | R-2, R-4, R-5 | PRODUCTION_DEPLOYED |
| SKILLS/ESCO | LIVE_PARTIAL | skill-pipeline, esco_* | journal/profile | worker_skills | self; verified via RPC only | provenance tiers | ilike hardening | evidence-correspondence chain dead; rank unaffected by evidence | PRODUCTION_DEPLOYED |
| OPPORTUNITIES | LIVE_COMPLETE | load-worker-opportunities | /dashboard/opportunities | RPC + public_vacancies | SECDEF + RLS | fit bands, no score | — | — | PRODUCTION_DEPLOYED |
| MARKETPLACE_WORKER | LIVE_PARTIAL | §E | — | — | — | — | work card reach | R-2 | PRODUCTION_DEPLOYED |
| MARKETPLACE_EMPLOYER | LIVE_PARTIAL | §E | — | — | — | — | — | R-2, R-3 | PRODUCTION_DEPLOYED |
| DEMAND | LIVE_COMPLETE | submit_demand_request_v2 | /company/needs + chat | customer_requests | has_org_demand_access; UPDATE owner-only (R-15) | one intake | — | colleague close/reopen | PRODUCTION_DEPLOYED |
| SUPPLY | LIVE_PARTIAL | five stores | profile / map | workers cols, preferred_locations | RPC self | — | work card on profile | one declaration surface (owner) | LOCAL_BROWSER_PROVEN |
| MATCHING | LIVE_COMPLETE | match-v1 (2.2) | scouting / board | tables only | RLS | categorical, no opaque score | — | evidence as tiebreaker (owner) | PRODUCTION_DEPLOYED |
| PEOPLE | LIVE_COMPLETE | roster sections | /company/people | four relationship tables | RLS + RPCs | — | gates honest | company_workers removal UI | PRODUCTION_DEPLOYED |
| TEAM | LIVE_PARTIAL | team brigades (organizations type=team) | /company/people | engagement_contexts | RPC | — | — | brigade→project (RED) | PRODUCTION_DEPLOYED |
| PROJECTS | LIVE_PARTIAL | projects + lifecycle RPC | /dashboard/projects | projects | can_manage_project | — | capability gate | R-3 facts, headcount (RED) | PRODUCTION_DEPLOYED |
| FIELD | LIVE_COMPLETE | operations page | /projects/[id]/operations | assignments, stages, tasks | can_manage_project | people vs slots | — | dates (R-3) | PRODUCTION_DEPLOYED |
| CALENDAR | LIVE_PARTIAL | planning | /dashboard/planning | bookings, projects, journal, period | RLS | observed/committed/planned/unknown; no day items from aggregate | — | project dates (R-3) | PRODUCTION_DEPLOYED |
| MAP | LIVE_PARTIAL | market-map, world-read | /dashboard/market-map | demand, projects, own supply aggregates | owner-gated people feed | country ≠ city; no inferred coordinates | — | institution layer; phone station (R-11) | PRODUCTION_DEPLOYED |
| COMMUNICATION | LIVE_PARTIAL | conversations | /dashboard/communication | 0021 tables | creator/participant RLS + TS rules | original kept; translate-on-read | — | message notification (R-6) | PRODUCTION_DEPLOYED |
| NOTIFICATIONS | LIVE_PARTIAL | event-emitters (18) | bell / activity | notification_events | service_role writer | grant applied | — | R-6 types; e-mail provider (external) | PRODUCTION_DEPLOYED |
| EMPLOYER_OS / COMPANY_MANAGEMENT | LIVE_PARTIAL | §F | — | — | — | — | §F | §F | PRODUCTION_DEPLOYED |
| AGENCY | LIVE_PARTIAL | bridge-* | /company/partners | agency_client_* | owns_company + share | — | — | R-1 roster forge; client chat intents | PRODUCTION_DEPLOYED |
| INSTITUTION | LIVE_PARTIAL | education programs/cohorts | /company/education | education_* | training_provider | learner accepts personally | — | real data; RPL RED | PRODUCTION_DEPLOYED |
| RPL/RECOGNITION | RED_MISSING (formal) / LIVE_PARTIAL (read-only ledger) | capability-standing, requirement-ledger | opportunities/projects | documents + skills | reviewer verification | self-award closed | credential = verified only | equivalence table (RED); employer-side ledger (GREEN backlog) | LOCAL tests |
| PUBLIC_JOBS | LIVE_COMPLETE | jobs pages (waived) | /jobs | public_vacancies | anon SECDEF preview | 404s, canonical | preview cache() | hreflang/OG (R-12) | PRODUCTION_BROWSER_PROVEN (2026-09-18) |
| LANDING | LIVE_COMPLETE | (marketing) | / | static | — | — | JSON-LD | — | LOCAL_BROWSER_PROVEN |
| SEO | LIVE_COMPLETE | metadata.ts, sitemaps | — | — | — | hreflang all pages | 5 pages, robots, sitemap x-default | JobPosting (owner) | LOCAL_BROWSER_PROVEN |
| MULTILINGUAL | LIVE_COMPLETE (5 routed) | next-intl | — | messages/* | — | 0 missing LT/RU | new keys ×5 | fi orphan; unrouted 53 % EN | TEST_PROVEN |
| MOBILE/PWA | LIVE_PARTIAL | manifest, bottom nav | — | — | — | no SW (honest) | sheet focus, safe-area, targets | map station (R-11) | LOCAL_BROWSER_PROVEN (390 px) |
| PAYMENTS | LIVE_PARTIAL (env-gated) | billing/* | /dashboard/billing | billing_* | owner/admin | webhook idempotent; live events rejected in test | llms.txt truth | activation = owner act (MKT-7) | PRODUCTION_DEPLOYED |
| IMPORT | LIVE_COMPLETE | evidence import | /company/history | evidence_import_* | managers | source → preview → commit → attest | — | — | PRODUCTION_DEPLOYED |
| EXPORT/GDPR | LIVE_PARTIAL | export-data + register | /dashboard/privacy/export | ~100 relations | caller RLS | completeness guard now real | E-1 | deletion executor (R-7) | LOCAL_BROWSER_PROVEN |
| SECURITY | LIVE_PARTIAL | §D | — | — | — | — | M1 M2 L1 L2 | R-1 | — |
| PRIVACY | LIVE_PARTIAL | consent ledger, disclosures | /dashboard/privacy | privacy_consent_events | latest-wins RPCs | withdraw now reachable | C-1 C-2 | L5 wording | LOCAL_BROWSER_PROVEN |
| PERFORMANCE | LIVE_PARTIAL | — | — | — | — | bounded reads on map/vacancies | preview cache() | — | — |
| ACCESSIBILITY | LIVE_PARTIAL | — | — | — | — | text+colour chips | §B4 | heading levels in EmptyState; `<details>` primary actions (owner IA) | — |
| OBSERVABILITY | LIVE_PARTIAL | health probe, ai_runs, usage_cost_events | /api/health | — | — | health every 15 min | — | retention (R-10) | PRODUCTION_DEPLOYED |
| TESTING | LIVE_PARTIAL | 926 guards, 96 e2e (6 in CI) | CI | — | — | §B6 | §C | authenticated e2e in CI (needs secret/session) | — |

## I. CAPABILITY LOSS

None. No route, nav id, table, RPC, policy or protected surface was removed
or narrowed. Two attempted changes were reverted before commit (map station,
direct project-facts update). The only stricter behaviours are deliberate
and named: roster invite/assign now refuses managers at the gate (SQL already
refused them); a self-recorded unverified document no longer satisfies a
formal requirement; accept/refuse of a roster offer now acts only on an
offer row (a withdrawal is its own decision).

## J. OWNER DECISIONS — the RED packet (one batch)

| # | EDGE | WHY CURRENT ARCHITECTURE CANNOT SAFELY COMPLETE IT | MINIMUM CHANGE | SCHEMA / RLS / AUTHORITY | PRIVACY | MIGRATION / ROLLBACK | ALTERNATIVES | DECISION REQUIRED |
|---|---|---|---|---|---|---|---|---|
| R-1 | Roster forge (`company_workers`, `agency_workers`) — HIGH | write authority = the forger's own | `revoke insert, update on public.company_workers, public.agency_workers from authenticated;` keep select; writers = `accept_worker_invitation` / agency equivalent (owner-run SECDEF) — OR a BEFORE INSERT/UPDATE trigger like `roster_link_subject_consent_guard` refusing `status='active'` unless `auth.uid()` = the worker's profile or an `accepted` `company_worker_invitations` row exists for that worker | RLS narrowing + trigger; rebase `caller_manages_worker` on `company_worker_engagements` | closes an identity-relationship forgery | timestamped migration + `.down.sql` restoring the policy; dry-run with rolled-back forge as in #1772 | none safe without SQL | approve variant (revoke vs trigger) |
| R-2 | Booked worker's journal invisible to the booking employer | `company_worker_engagements` ≠ `engagement_contexts`; visibility = consent semantics | on `respond_booking_request_v3` accept, provision an `engagement_contexts` row (relationship `employee`, `journal_review_enabled=false`) for the booking's org — the worker still chooses that context when writing, and the org still has to enable review | additive insert inside an existing SECDEF RPC | new context row is visible to both parties only | migration redefining the RPC + down | worker opts into the context from the journal (GREEN, but the org row must exist) | approve the semantics |
| R-3 | Project dates / place / title editable | admin writes must be gated RPCs; RLS is owner-only while managers may manage | `update_project_facts_v1(p_project_id, p_title, p_city, p_country, p_start, p_end)` SECDEF gated by `can_manage_project`, `end >= start` check, completed = read-only | one function + grant to authenticated | none | migration + down (drop function) | — | approve |
| R-4 | Membership-only manager cannot confirm | `review_journal_entry` predates membership widening | replace the engagement-only reviewer check with `manages_organization` + a synthetic reviewer context or allow `company_memberships` role | SECDEF change | none | migration + down | — | approve |
| R-5 | Post-approval confidence recompute silently no-ops for managers | `worker_skills` RLS owner-only | move `computeConfidence` write into `confirm_entry_and_verify_skills` | SECDEF change | none | migration + down | leave as is (labels still correct) | approve or accept |
| R-6 | No durable notification for journal confirmation / new message | `notification_events_type_check` is a DB CHECK | widen CHECK with `journal_entry_confirmed`, `conversation_message` (+ emitters, GREEN after) | CHECK widening (canonical GREEN fixture class) | recipient-only rows | migration + down | derived bell counts only (unread already exists for messages) | approve |
| R-7 | Account deletion executor | none exists; 57 `NO ACTION` FKs block a delete | `alter … on delete set null` on actor columns; `execute_account_deletion_v1` implementing the E1–E8 classes in `deletion-plan.ts`; superadmin-only | FK changes + SECDEF | GDPR Art. 17 | migration + down (recreate constraints) | manual owner SQL per request | approve design |
| R-8 | Organization archival | no `archived_at`; 11 `NO ACTION` FKs | `organizations.archived_at` + read filters | column + policies | — | migration + down | membership revocation row by row | approve |
| R-9 | Worker cannot end own `company_workers` / `agency_workers` link | write policy owner-only | subject UPDATE policy to `status='removed'` on own rows | RLS additive | consent withdrawal | migration + down | — | approve |
| R-10 | Retention: `ai_runs.profile_id` never nulled; none for cost/pilot/notification/message tables | schedule + functions absent | extend the sweep; add purge functions with owner-set horizons | functions + cron | data minimisation | migration + down | — | set horizons |
| R-11 | Map on the worker phone bar / stations | station list is a frozen IA contract | add `{id:"map"}` station (5 label keys prepared) | none | — | none | chat chip only (today) | approve IA change |
| R-12 | `/jobs/[id]` hreflang + OpenGraph merge; `/jobs` title suffix | files under the per-PR jobs waiver | `buildPageMetadata({locale, path:/jobs/${id}, …})` in `generateMetadata`; drop the duplicated suffix on the list title | none | none | none | — | add this PR's follow-up number to the waiver list |
| R-13 | `usage_cost_events_forbid_mutation/_truncate` lack pinned `search_path` | advisor WARN | `alter function … set search_path = public` | function attribute | — | migration + down | accept | approve |
| R-14 | Handoff dispatch of `proposition_consent.given=false` rows | owner design 2026-09-17 | skip in dispatcher (GREEN) and/or `where given='true'` in the RPC | policy | worker consent | none / migration | keep as "review employer approach" | decide |
| R-15 | `customer_requests` UPDATE owner-only (colleague close/reopen) | policy predates org spine | widen UPDATE to `has_org_demand_access` | RLS widening | org-internal | migration + down | — | approve |

Also owner: `JobPosting` JSON-LD vs anonymous rule; consent wording "employers"
(L5); CSP enforcement (L4); `messages/fi/` orphan; `<details>`-hidden primary
actions on programmes/approvals; GOV-1 secret (unchanged).

## K. HUMAN WALK (Donatas, Ramūnas) — shortest real production paths

After this PR deploys (check `/api/health` build = merge SHA):

1. **Donatas, worker** — sign in → Profile. Above the history you will see
   "Confirmed links" with Labour market ai Sp. z o.o and a "This is no longer
   me — withdraw the link" button. Do NOT press it unless you mean it: the
   800 h history leaves your profile the moment it succeeds (the organization
   keeps its record). Open "Details" → the availability block now starts with
   the work card editor (status, available from, country, pay).
2. **Donatas, privacy** — Privacy page → "Contact requests": any request you
   ALLOWED now shows "Withdraw contact details". Press "Download my data":
   the bundle must list `notification_events`, `privacy_consent_events`,
   `organization_people`, `organization_evidence_records` under `data`, and
   `conversation_messages` under `withheld` with its reason.
3. **Donatas, employer** — /dashboard/company/needs with the unnamed shell
   (if you still have one) sends you to setup; with Klinkerio it renders as
   before. /dashboard/projects → create inline works for owner/admin only.
4. **Ramūnas, Nonstop** — /dashboard/company/people → "Invite" as a manager
   role now says it is owner/admin-only instead of failing after submit.
5. **Anyone, public** — view-source of `/en/legal/terms`: canonical + five
   hreflang + x-default; `/en`: two `application/ld+json` scripts
   (Organization, WebSite); `/robots.txt` lists `/*/invite` and `/*/oauth`.

Walk hygiene this mission: one minted QA session (allow-listed identity),
reads only, deleted after the walk; no production rows written.

---

## L. CONTINUATION DELTA — 2026-09-19, second directive ("exhaust the queue")

### L1. R-1 — proven, prepared, NOT applied
Rolled-back probe on production (DO block + RAISE, nothing persisted): as the
real owner of Labour market ai Sp. z o.o, `insert into company_workers
(company_id, worker_id, status) values (own, <QA worker>, 'active')` was
**ADMITTED — rows = 1**. Every legitimate writer of `company_workers` /
`agency_workers` is a SECURITY DEFINER RPC (`invite_*`, `accept_*_worker_
invitation`, `assign_*_worker_role`, `set_*_worker_journal_review`,
`accept_invitation_v2`); the application never writes either table with the
caller's own client (guard `red-roster-writes-rpc-only.test.ts` walks
lib/app/components: zero). **Draft PR #1791** (label `needs-human-gate`,
`migration-safety` = STRUCTURAL-GREEN / RISK-ACKNOWLEDGED) carries migration
`20260919100000_roster_writes_rpc_only_v1` (revoke insert/update/delete from
`authenticated` on both tables; drop `company_workers_write` and
`agency_workers_write`; select policies untouched), its verbatim rollback, the
hostile-test contract, and ONE approval statement:

> **Apply 20260919100000_roster_writes_rpc_only_v1 to production.** I approve
> revoking insert/update/delete on `public.company_workers` and
> `public.agency_workers` from `authenticated` and dropping the policies
> `company_workers_write` and `agency_workers_write`, so that a roster
> relationship can only be created through the invitation → worker-acceptance
> RPCs and managed through the owner-gated RPCs. Rollback file acknowledged.

Hostile contract to run live (rolled back) right after apply — FAIL 42501:
owner inserts an arbitrary active company_workers row; agency owner inserts an
arbitrary active agency_workers row; owner updates an existing row's status /
worker directly. PASS: invite → the worker accepts → row exists → role /
journal-review by the owner → project assignment. Reads unchanged.

### L2. GREEN queue — closed (PR #1792, merged 2026-09-19, squash `e37e531e`; three CI rounds: a script import of a "dead" module, a test cast, and the inquiry-terminology guard on the repeat link)
| Item | Shipped | Proof |
|---|---|---|
| A · client side of the agency bridge by sentence | intent `agency-invites` → `loadClientBridgeForChat` (the partners page's three reads) → chips over NEW dispatcher actions `company.accept-connection` / `decline-connection` / `share-request` = the canonical `bridge-actions` (token-confirmed; client company from the ACTIVE workspace; RPCs re-check ownership + invited e-mail) | router sentences ×5 locales; no-direct-write; registry 76→78, actions 52→55; 55 conversation test files green |
| B · booking by sentence | intent `propose-booking` → the candidates panel of the open need; the panel's token-confirmed `company.propose-booking` button is the offer (a sentence never picks a person) | router ×5; registry |
| C · empty states | communication → network; market-map empty pool → work directions; team-roster card → the invitation it described | guard `empty-states-lead-somewhere`; communication exit LOCAL_BROWSER_PROVEN (§L4) |
| D · employer requirement ledger | scouting renders MET (matchedHard + strengths) beside FAILED (blocking) and UNKNOWN (missing facts) + "evidence comparison — not a qualification, not a ranking"; no new read, no score | guard |
| E · hours reconciliation | already exists on `/dashboard/company/people` (`team-recorded-work`: journal hours and the organization ledger per member, beside, never added). Nothing to build without new accounting semantics — proven unnecessary | code read |
| F · per-request demand clone | "Repeat this need" on readback rows → `?repeat=<id>#demand-intake` → `getOwnDemandPrefillById` (own row, same workspace gate, same mapper); urgency and every date/deadline cleared; signals / offers / bookings / messages / evidence never read | `demand-repeat.test.ts` |
| G · dead code | `lib/worker/reactivation-model.ts` (+test) removed. `lib/profile/skill-evidence-state.ts` was removed and RESTORED — `scripts/skills-evidence-report.ts` imports it; the audit's "orphan" list omitted `scripts/`, so the rest of that list stays untouched | CI typecheck |

### L3. Notifications — final verified truth (worker interest → employer)
Emitter `emitDemandInterestNotification` fires inside `expressInterestCore`;
the store's service_role grant is applied (ledger 20260908061619). Per signal
on the real demands: Klinkerio `a2ffd425` — signal 2026-07-05 17:56 HAS a
durable `demand_interest_expressed` row (unread by Donatas); signal 17:46 has
none; the Nonstop demand's 2026-07-05 and 2026-08-25 signals have none; every
signal since the grant (2026-09-17 ×2) has its row. The three missing rows
fall in the pre-grant window and cannot be re-emitted by the code (dedupe by
signal id is the only emit path); an owner-run backfill is possible but is a
production write and is NOT done here. Employer awareness does not depend on
the durable row: the needs page shows "interest waiting" per demand and the
scouting view reads the signals directly (Donatas sees 2 on Klinkerio).

### L4. Proof
- typecheck + lint green on every touched file; product gate PASS_WITH_SCOPED_TRANSITIONAL_WAIVER; migration-safety GREEN (queue) / STRUCTURAL-GREEN RISK-ACKNOWLEDGED (#1791)
- first CI run of #1792 caught two things the local run missed: a script import of a "dead" module and a test cast — both fixed in the same PR
- LOCAL_BROWSER_PROVEN (production build, production backend, QA identity, 1360 + 390 px): `/lt/dashboard/communication` renders the empty state with the network exit (localized href `/lt/dashboard/network`), zero horizontal overflow; the map's empty-pool exit could not be rendered with the QA identity (its pool is not empty) — guarded
- PRODUCTION: `/api/health.build = e37e531e` at 2026-09-19 10:19 UTC (auth + db ok); `/robots.txt` still lists the invite/oauth exclusions from #1789. Authenticated surfaces of #1792 are PRODUCTION_DEPLOYED; their PRODUCTION_BROWSER_PROVEN is the human walk (§K): Donatas — /dashboard/company/needs "Repeat this inquiry" on a past request; scouting cards now show "Requirements met"; in the chat, "agentūra mane pakvietė" and "pasiūlyti darbą kandidatui". Ramūnas — same chat sentences from the Nonstop workspace once an agency invitation exists.

### L5. Capability loss
None. R-1 changes nothing until approved. The chat gained three actions that
exist as page forms already; no intent, action, route or table was removed.
The one deletion (`reactivation-model.ts`) had no importer anywhere.

---

## M. CONTINUATION DELTA — 2026-09-19, third window ("continue → secure → complete → verify → deploy")

Proof levels exactly as §preamble. Nothing in this section re-audits; every
line is a targeted trace that was needed to implement or verify one edge.
§A–§L above are history and stay as written; where this section corrects
them, the correction is here (owner section 19 rule).

### M1. PRODUCTION

| | |
|---|---|
| main at start | `55e97654` = production build, health ok |
| main at close | `b2702a40` (#1796) — sequence: #1793 `db859bc7` → #1791 `b68348ab` → #1796 `b2702a40`; docs commit on top |
| production | `/api/health.build = b68348ab` at 11:56 UTC (auth 145 ms, db 447 ms, dub1); `b2702a40` deploying at close — verify `build` before the walk |
| migration ledger | **293 applied** (was 292): `20260919104526 roster_writes_rpc_only_v1` — the ONLY apply of this window; repo files 292 + 4 prepared RED files on draft branches (not on main) |
| Supabase advisors | unchanged except the R-1 policies are gone; R-13 WARN still present (draft #1797) |

### M2. R-1 — CLOSED (applied, hostile-proven, ledgered, merged)

Owner approval received verbatim in the window handoff. Drift check before
apply: #1791 was 2 commits behind main (no migration among them); every SQL
writer of both tables is SECURITY DEFINER (0031, 0033, 0036, 20260829120000,
20260902230000); zero app-side direct writes (guard). The migration matched
the approval sentence line for line.

- **Applied** via MCP `apply_migration` (target `gorgitwvdzxbnaxhrsrw` verified
  by project listing): ledger `20260919104526 roster_writes_rpc_only_v1`.
- **Readback:** `company_workers` relacl `authenticated=r` (was `arwd`);
  policies left `company_workers_select` + `agency_workers_select` only.
  **Correction to §B1/§L1:** `agency_workers` NEVER had an `authenticated`
  grant (relacl was NULL) — its `_write` policy was inert; `company_workers`
  was the only live hole. The migration's agency half was a harmless no-op.
- **Hostile contract, live, rolled back** (real actors under
  `set local role authenticated` + JWT claims): owner Donatas direct INSERT
  active row naming an isolated E2E worker → **42501**; direct UPDATE
  `status` → **42501**; direct UPDATE `worker_id` → **42501**; direct DELETE →
  **42501**; owner SELECT of own roster → 1 row (reads unchanged); agency owner
  Ramūnas direct INSERT `agency_workers` → **42501**.
- **Legitimate path, live, rolled back:** `caller_manages_worker` false →
  `invite_company_worker` → the WORKER's `accept_company_worker_invitation` →
  active row → `caller_manages_worker` true → `assign_company_worker_role`
  (row shows `foreman / Brigadininkas`) → `assign_worker_to_project` →
  `project_worker_assignments` active row. `set_company_worker_journal_review`
  returned its pre-existing text precondition `role_not_allowed` (needs
  `company_admin` + engagement context) — not an R-1 effect.
- **Merged** #1791 squash `b68348ab` after two CI rounds (a `require()` lint
  in the guard; the marked-migration ratchet list). `docs/APPLIED_LEDGER.md`
  carries the entry with sha256 `558cd636d618…`.
- Proof level: PRODUCTION_DEPLOYED for the app; the authority change itself
  is PRODUCTION-PROVEN by the rolled-back contract above.

### M3. NEW HIGH FOUND WHILE TRACING R-2 — R-16 (RED draft #1794, NOT applied)

`add_org_member(p_org_id, p_worker_id)` — SECURITY DEFINER, granted to
`authenticated`, callable by an org owner/manager — mints an ACTIVE
`employee` `engagement_contexts` row for ANY worker id. **Proven live, rolled
back:** as Donatas, for the E2E worker with NO roster row and NO invitation →
`added`, forged rows = 1. `relationship_types.employee.grants_worker_visibility
= true`, so the forged context satisfies the membership branch of
`can_view_worker` (private worker row readable without discoverability
consent), appears in the person's own context picker as a claim they never
made, and is the row the review toggle acts on. Same class as R-1, one table
over; R-1 and the 2026-09-18 trigger do not reach it. The UI never offers it
(the members panel's `addable` list is roster-derived — consent-backed since
R-1); the RPC called directly does not apply that rule.

Draft #1794 `20260919120000_add_org_member_requires_consented_roster_v1`:
one function body gains `return 'not_linked'` unless an ACTIVE
`company_workers` / `agency_workers` row exists on the organization's legacy
company or agency; no exemption for any role; rollback = prior body
verbatim. **New body dry-run on production (aborted transaction):** forge →
`not_linked`, 0 rows; invite → the worker accepts → context exists (the
accept RPC provisions it; `add_org_member` → `already_member`, idempotent).
Guard `red-add-org-member-consent.test.ts`; ratchets 293.

Security receipt (§D) after this window: **CRITICAL 0 · HIGH 1 (R-16, RED
draft, NOT applied) · H1 CLOSED** · MEDIUM/LOW unchanged (M3 owner, L3–L7
owner/accepted). SECURITY_COMPLETE is NOT declared.

### M4. GREEN halves shipped (merged to main)

| Edge | PR | What | Proof |
|---|---|---|---|
| R-2 GREEN — booked people visible | #1793 `db859bc7` | `/dashboard/company/people` lists the company's ACTIVE `company_worker_engagements` (RLS-only, bounded 50, roster rows excluded); per person the honest state: **not a member** → "Journal not reviewable yet: a booking does not create a work context. Invite this person to join as an employee — the moment they accept, the context exists… You cannot create it for them." + exit to the canonical `join_as_employee` invitation; **already a member** → governed in the members panel. `OrgMember.profileId` added. Copy ×5. | guard 15/15 incl. static render of both states; 24 guards on touched files 637/637. Production has ONE active booking whose worker is also on the roster → the non-empty state cannot be shown on real data without fabricating a booking; the QA identity is a worker. PRODUCTION_DEPLOYED; browser proof = human walk. |
| R-4 GREEN — confirmation authority | #1796 `b2702a40` | `getOrgMembersData.governanceWithoutReviewer` (active memberships with the roles `manages_organization()` accepts, minus reviewer-engagement holders, minus the registered owner) + `viewerIsRegisteredOwner`; members panel block "Confirmation authority" drawn ONLY for the registered owner → EXISTING owner-only `grant_org_manager` (had no UI caller). Inbox + quick-confirm: `no_reviewer_engagement` is its own sentence naming who can change it. Role labels `admin` / `external_manager`. Copy ×5. | guard; 18 guards on touched files 462/462; full guards project 16408/16409 (the one failure is the Windows-CRLF-only `booking-atomic-double-booking`, identical on untouched main, green in CI). **Real production case:** the admin `875eb16b` of Labour market ai Sp. z o.o has no reviewer engagement — Donatas will see exactly one person in the block. |

### M5. RED packets prepared as draft PRs (NOT applied; one approval sentence each, in the PR body)

Stack (each draft's base is the previous one; ratchets 293 → 296; merge in
this order after apply, or rebase whichever is approved first):

| # | PR | Migration | What it closes | Dry run on production (aborted transaction, zero residue) |
|---|---|---|---|---|
| R-16 | #1794 | `20260919120000_add_org_member_requires_consented_roster_v1` | the second forge (M3) | forge → `not_linked`; consent-backed → context exists |
| R-3 | #1795 | `20260919130000_update_project_facts_v1` — ONE SECDEF write for title / city / country / start / end, `can_manage_project`-gated (anti-oracle shape), validation before read, completed = read-only after auth, `granularity` kept truthful (city vs country), never a coordinate, idempotent, audited; **+ the form** (`ProjectFactsForm` in the operations manage strip, `setProjectFactsAction`, copy ×5) so approval + apply = a complete edge | calendar band, dates chip, overlap check, location block — all 9 production projects have country NULL and no dates | stranger → `not_found`; "Lithuania" → `invalid/country`; end < start → `invalid_dates`; 1-char title → `invalid`; owner write → `updated/changed=true` (LT, 2026-10-01→11-30, gran=city); again → `changed=false`; completed → `completed_read_only` |
| R-13 | #1797 | `20260919140000_usage_cost_trigger_search_path_v1` — `alter function … set search_path = public` on the two cost-ledger trigger functions | advisor WARN | static classifier: zero risk findings (would be GREEN); kept on the gate because the packet lists it |
| R-9 | #1798 | `20260919150000_end_roster_link_v1` — the worker withdraws the relationship they accepted / the owner removes a person; `end_org_membership_v1` authority ladder (admin / owner of THAT org / subject); `status → removed`, review cleared, the employee engagement ended in the same transaction, audited, never a DELETE; **+ the UI** ("My teams — I no longer work here" on the profile in the existing parallel stage; "Remove from the roster" on the owner's roster rows; one two-step control, authority never a prop) | R-9 + the §F "roster removal UI" gap (the same missing write — since R-1 nobody could end a link) | stranger → `not_found`; worker → `removed/self`, engagement ended; again → `already_removed`; owner's `caller_manages_worker_by_roster` → false; owner → `removed`; wrong kind → `not_found` |

R-2 (booking context provisioning), R-5, R-6, R-7, R-8, R-10, R-11, R-12,
R-14, R-15 — unchanged packets, no GREEN half found beyond what shipped.

### M6. Capability loss

None. No route, nav id, table, RPC, policy or protected surface removed or
narrowed by anything merged. The one stricter behaviour is R-1 itself
(direct roster writes refused), which no product path ever used.

### M7. Human walk additions (Donatas, Ramūnas) — after `/api/health.build = b2702a40`

- **Donatas, employer (Labour market ai):** `/dashboard/company/people` →
  the members panel now ends with **"Confirmation authority"** listing ONE
  person (the admin). Press "Grant confirmation authority" only if that
  person should be able to confirm journal entries; afterwards their review
  refusals stop. "Booked people" will NOT appear for this company (no direct
  booking exists) — that is correct, not missing.
- **Donatas, worker (Journal inbox):** nothing changes for the owner; a
  membership manager without authority now reads the new sentence instead
  of "not allowed".
- **Ramūnas (Nonstop):** `/dashboard/company/people` — same block if any
  governance member lacks confirmation authority; otherwise absent.
- The four RED drafts change nothing in production until approved.
