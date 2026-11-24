# Marketplace Precision & Booking — Source-First Gap Map v1

Programme: `marketplace-precision-booking-execution-goal-v1`
Base audited: `origin/main` = `29e45fa3aefac1bced8117ce2a716ec8385ee5a7` (2026-07-11)
Production migration ledger verified against live Supabase project (`supabase_migrations.schema_migrations`, last applied: `20260711081250 privacy_consent_text_v2_controller_identity`).

Classifications used (per goal spec):
`LIVE_COMPLETE` · `LIVE_PARTIAL` · `ABSENT_REPO_SAFE` · `ABSENT_NEEDS_MIGRATION` · `EXTERNAL_PROVIDER_GATED` · `OWNER_DECISION_GATED`

---

## 0. Verified current state (source-traced, not filename-inferred)

### 0.1 Canonical truth owners (must not be duplicated)

| Concern | Canonical owner | Key evidence |
|---|---|---|
| Structured demand (company/agency/buyer) | `customer_requests` (+ `payload` jsonb, `kind`, status machine) | `0028_customer_requests.sql`, `20260530150000_demand_intake_consolidation.sql` ("exactly ONE way to express structured demand") |
| Anonymous pre-auth demand | `company_need_public_intakes` (deliberately separate, deny-all RLS, service-role read) | `20260707120000_company_need_public_intake.sql` |
| Supply listings (services) | `service_offerings` (+ `service_offering_requests` loop) | `20260627121713`, `20260627145318` |
| Worker capability/CV | `workers` + `worker_professions` + `worker_skills` + `journal_entries*` + `worker_documents` + `engagement_contexts` | `0001`, `0008`, `0013`, `20260610170000` |
| Teams/brigades | `organizations` rows with `organization_type='team'` (no separate table) | `20260705220000_team_brigade_org_spine.sql` |
| Availability | columns on `workers` (8 pref columns + `availability_status`/`available_from`) | `20260613184013` (applied in prod) |
| Locations | `preferred_locations` (worker) + `company_demand_locations` (demand geo child) | `20260617180711`, `20260615194110` |
| Booking | `booking_requests` + `booking_request_events` (+ `_seen`) | `20260613184106` (applied in prod) |
| Conversations | `conversations`/`_participants`/`_messages` + source relation | `0021`, `20260706210000` |
| Matching | read-time pure engine `lib/market/match-v1.ts` + `lib/market/fit.ts` (never persisted) | `matchWorkerToNeed`, `computeContextFit` |
| Notification spine | derived count-gated signals `lib/notifications/spine-signals.ts` (NO notifications table, by design) | `spine-signals.ts:1-14` |
| Module registry | `lib/dashboard/dashboard-module-registry.ts` (grid/nav/command finder derive from it) | `dashboard-module-registry.ts:125-361` |
| Privacy/discovery gate | `privacy_consent_events` (append-only) + `worker_profile_discoverable()` + `can_view_worker()` fail-closed RLS | `20260711064506` (applied in prod) |

### 0.2 Dead / deprecated / dormant — do NOT build on

- `job_demands` — legacy, no lib reads it (`lib/projects/operations-centre.ts:52`), superseded by `customer_requests`.
- `matches` / `match_actions` — dormant 0-row legacy of the neutralized job-postings flow; guarded by `lib/guards/matching-ui-neutralized.test.ts`. The live matching engine deliberately does not use them.
- `pilot_drafts` — folded into `customer_requests` by `20260530150000`; 0 rows.
- Legacy `consents` table + `profiles.consent_*` booleans — superseded by the privacy-consent ledger.

### 0.3 Gated PRs #708 / #714 (inspected, not applied)

| PR | Migration | State | Contract vs main consumers |
|---|---|---|---|
| #708 | `20260711210000_work_tasks_v1.sql` (+ paired rollback) | OPEN draft, `MERGEABLE`, **1 ahead / 8 behind main** | `lib/tasks/tasks.ts` `SELECT_COLUMNS` exactly mirrors proposed table; degrades to `needs-migration`; planning task lane `unavailable`; spine signal 0. Contract still matches. |
| #714 | `20260711230000_finance_records_v1.sql` (+ paired rollback) | OPEN draft, `MERGEABLE`, **1 ahead / 3 behind main** | `lib/finance/finance.ts` mirrors table; integer-cents; `overdue` derived only. Contract still matches. |

Both are textbook RED-class human-gated drafts (`@human-gate-approved`, RPC-only writes, paired `supabase/rollbacks/*.down.sql`). **Action taken by this programme: rebase branches onto current main to keep them apply-ready; NO apply, NO merge — owner gate unchanged.** No compatibility need discovered that would require editing their SQL.

### 0.4 Guard rails every new slice must pass (verified from guard sources)

- `route-truth-map.test.ts` — every new `dashboard/**/page.tsx` must be classified; primary nav must stay 4 entries.
- `no-duplicate-top-level-entries.test.ts` — no new top-level nav entry, no second map engine, no second search; `/dashboard/marketplace` must keep redirecting to `market-map`.
- `fit-not-rating.test.ts` (doctrine §19) — bans `worker_rating|company_rating|trust_score|overall_score|...` identifiers and any global person score.
- `matching-ui-neutralized.test.ts` — bans resurrecting `dashboard/discover`, `lib/job-postings/*`; forbids dropping dormant tables.
- `landing-freeze.test.ts` — frozen marketing files/namespaces (`hero, journey, labourMarket, live, map, draft, marketPulse, playercards` in lt/en/ru) untouchable.
- `migration-safety.mjs` (required CI check) — RED classifier: SECURITY DEFINER, GRANT/REVOKE, policy changes etc. → needs `@human-gate-approved` + paired rollback + draft PR. Never `db push`.
- i18n — new keys in all 11 locale files same-PR; LT↔EN parity guard; `[EN]` ratchet for DA/DE.
- `no-live-payments.test.ts`, `no-secret-leakage.test.ts`, `marketplace-security-definer-boundary.test.ts`, `marketplace-migration-rls.test.ts`.
- Constitution: features ship real and reachable (self-entry), or explicitly `GATED_PREVIEW` with zero inbound links.

---

## 1. CAPABILITY A — Structured opportunity & company demand

Canonical write path: `save_demand_draft` / `submit_demand_request` (both accept arbitrary `payload` jsonb, owner-scoped SECURITY DEFINER — **applied in prod**). Canonical worker read path: `list_open_demand_for_workers()` — returns a **closed whitelist**: role_text, country, team_size, start_period, accommodation, transport, location_label, required_tools[], company_name, route_status (`20260705210000` latest def, applied).

Key consequence: **capturing** richer structured demand is repo-safe today (typed `payload` keys through existing RPCs + zod contract in app code). **Exposing** new fields to workers requires redefining `list_open_demand_for_workers` → RED-class human-gated migration.

| Requirement cluster | Status | Detail / safe path |
|---|---|---|
| Opportunity type (employment/temp/project/subcontract/service) | LIVE_PARTIAL | `kind` (4 values) + `engagement_type` (public intake) exist; no per-request opportunity-type enum on canonical path → add `payload.structured_v2.opportunity_type` (repo-safe capture) |
| Target supply (individual/multi/team/company) | LIVE_PARTIAL | exists only in non-persisted preview `lib/staffing/company-need.ts:23` → persist as `payload.structured_v2.target_supply` (repo-safe) |
| Headcount | LIVE_COMPLETE | `customer_requests.team_size`; public intake `headcount` |
| Urgency | LIVE_COMPLETE | `start_period` enum + public intake `urgency` |
| Worksite/project type | ABSENT_REPO_SAFE | new payload key + closed slug set |
| Final-client-confirmed state | ABSENT_REPO_SAFE | payload key + honest "unconfirmed" default; no self-certified claims |
| Responsible org & contact | LIVE_PARTIAL | company identity via Model A verified join; contact stays consent/route-gated (do not expose) |
| Visibility & application rules | LIVE_PARTIAL | Model A approved-route gate + status machine; talent-pool flag absent → payload key + disclosure copy (repo-safe capture) |
| Region/city; single/multi-site; mobile work | LIVE_PARTIAL | `company_demand_locations` (multi-row = multi-site, signal-only writes); explicit mobile/multi flag absent → payload key |
| Distance-from-accommodation, travel-between-sites, radius | ABSENT_REPO_SAFE | payload keys (capture); worker exposure via RPC v2 gate |
| Relocation/commute/remote/hybrid | ABSENT_REPO_SAFE | payload key (closed enum) |
| Engagement/legality (direct/agency/temp/posted-worker/self-employed/subcontract) | LIVE_PARTIAL | `ENGAGEMENT_MODELS` (3 values) persisted on public intake only → widen closed enum in `payload.structured_v2.engagement_form`; neutral factual fields, verification state separate (doctrine: no self-certified "legal work" marketing) |
| Contract country / governing arrangement / probation / right-to-work reqs / permits / onboarding checks | ABSENT_REPO_SAFE | payload keys; `country_document_requirements` table exists (empty) for future doc-requirement joins |
| Time: start + flexible range, duration/end, extension, hours/wk, min guaranteed hours, shifts/day-night/weekend/overtime, rotation, schedule notice, application deadline, response time | LIVE_PARTIAL | only `start_period`, `duration` persisted → payload cluster `time_v2` (repo-safe capture); deadline/response-time also feed honest expiry display (Cap F) |
| Compensation: min/max, currency, gross/net, unit, guaranteed base, OT/night/weekend rates, bonuses/per-diem, holiday pay, frequency, first payment, deductions, accommodation/transport/insurance deductions, take-home | ABSENT_REPO_SAFE (capture) | richest gap. Preview-only `rateRange` exists in `lib/staffing/company-need.ts:43`; nothing persisted. → `payload.compensation_v2` with integer-cents amounts, explicit currency, `basis: gross|net|unspecified`, itemized deductions[]; **honesty rule: missing min/guaranteed-hours/basis/deductions render as visible "not provided" flags** (spec: no unexplained "up to") |
| Accommodation detail (price/period, room type, occupancy, distance, amenities, registration, deposit, family, agreement/damage, dates) | LIVE_PARTIAL | worker-exposed enum `provided_free|paid|deducted|not_provided` exists → `payload.accommodation_v2` detail cluster; photos EXTERNAL: no storage/upload path exists for demand photos → gate |
| Transport split (international travel, pickup, daily, between sites, company vehicle, fuel, own-vehicle requirement, licence category, driver supplement, parking, return travel) | LIVE_PARTIAL | daily-transport enum exists on worker path → `payload.transport_v2` split cluster; licence-category closed set (reuses tool-slug pattern) |
| Candidate requirements (required/preferred professions+skills, exp years, similar-project, independent work, drawings, leadership, languages+levels, one-speaker-per-team, certificates+expiry, education, equipment permissions, own tools/vehicle/workwear, references, physical/medical) | LIVE_PARTIAL | `role_or_work_type` + `payload.structured_need.skill_slugs` + `required_tools[]` persisted; languages free-text without CEFR; the rest preview-only → `payload.requirements_v2` (professions/skills reuse ESCO + catalogue slugs; languages get closed lang+CEFR enum) |
| Recruitment & response (method, documents, stages, test, verification, decision owner, deadline, start confirmation, active-vs-talent-pool disclosure) | ABSENT_REPO_SAFE | payload cluster `process_v2`; talent-pool disclosure mandatory when set |
| Worker-side exposure of all new structured fields | ABSENT_NEEDS_MIGRATION | `list_open_demand_for_workers` v3 redefinition (SECURITY DEFINER → RED, human-gated) returning widened whitelist incl. compensation summary, time cluster, requirement chips |
| Public intake parity (company-need form) | ABSENT_REPO_SAFE | extend `submit_company_need_public_v1`? NO — that RPC change is RED. Repo-safe: keep anon form as-is; operator promotion into structured payload is app-side |

Compatibility: old records (structured columns + old payload keys) remain readable — new clusters are additive `payload.*_v2` keys; readers treat absence as "not provided" and never fabricate. Rollback: payload keys are data-only, no schema change; RPC v3 ships with paired rollback restoring v2 definition.

Tests: zod contract round-trip, old-record readback, publish-honesty flags (missing min/basis/deductions), whitelist non-regression on the worker RPC.

---

## 2. CAPABILITY B — Mirrored worker / team / company data

| Requirement | Status | Detail / safe path |
|---|---|---|
| Desired professions/specializations | LIVE_COMPLETE | `worker_professions` (primary flag) + universal catalogue |
| Skills + experience + evidence | LIVE_COMPLETE | `worker_skills` (+verified), journal evidence loop, `profile_skill_claims` (owner-only), ESCO layer |
| Languages + levels | **ABSENT_NEEDS_MIGRATION** | no worker languages store anywhere (verified). New table `worker_languages` (worker-owned, closed lang set + CEFR enum, RLS owner + `can_view_worker`) → RED draft |
| Countries/regions/radius | LIVE_PARTIAL | `workers.preferred_countries[]` + `preferred_locations` (no numeric radius column; radius lives client-side in map store) → radius as `preferred_locations` column is migration; repo-safe interim: keep in intents/labels |
| Legal work eligibility / right-to-work | ABSENT_NEEDS_MIGRATION (column) | no structured flag; only posting-doc categories in `worker_documents`. Neutral fact fields (citizenship-area enum + permit doc link), never a self-certified "legal" badge |
| Engagement forms accepted | LIVE_PARTIAL | `preferred_contract_type` (employment/subcontract/temporary/any) exists on `workers` (applied) — **orphaned, no UI** → wire UI (ABSENT_REPO_SAFE) |
| Min compensation + gross/net preference | LIVE_PARTIAL | `salary_min_eur/max` live; gross/net preference column absent → migration for column; interim capture repo-safe? NO server store → classify column ABSENT_NEEDS_MIGRATION |
| Hours/shifts/rotation willingness; nights/weekends/overtime/travel | ABSENT_NEEDS_MIGRATION | no columns; `max_trip_days`/`willing_to_relocate` exist (orphaned) → wire existing (repo-safe) + add missing columns (draft migration) |
| Earliest start + availability | LIVE_COMPLETE (fields) / LIVE_PARTIAL (UI) | `availability_status`, `available_from` written by work card; 8 pref columns orphaned |
| Accommodation need + acceptable cost/type | LIVE_PARTIAL | `needs_accommodation` bool live+orphaned; cost/type detail absent (migration) |
| Transport need; driving licence; own vehicle; tools | LIVE_PARTIAL | `has_transport` live+orphaned (conflates); licence category/own-vehicle/own-tools columns absent (migration) |
| Certificates + expiry | LIVE_COMPLETE | `worker_documents.valid_until` + verification axis |
| Solo/partner/team preference | LIVE_COMPLETE (fields, orphaned) | `solo_available`, `team_available` → wire UI |
| Hard exclusions | ABSENT_NEEDS_MIGRATION | no store; needs bounded closed-enum exclusion list, worker-owned |
| **Wiring the 8 orphaned availability-pref columns + `save_worker_availability_prefs` RPC into a real structured-preferences form** | **ABSENT_REPO_SAFE — highest-leverage slice** | RPC + columns applied in prod, zero UI (`save_worker_availability_prefs` referenced only in generated types) |
| Team: members/roles/lead/size | LIVE_PARTIAL | team = org row; membership via `engagement_contexts`; `get_team_capability_summary_v1` honest counts; no roles/lead flag → repo-safe UI on existing model; lead/role columns = migration |
| Team combined professions/skills/languages/vehicles/tools/certs/mobility/window/min duration/price basis/capacity | LIVE_PARTIAL→ABSENT | derived-from-members display is repo-safe (honest aggregation); stored team-level claims need migration; price basis follows `rate_text` free-text doctrine |
| Company services/professions | LIVE_COMPLETE | `service_offerings` |
| Company capacity/lead time/min engagement/pricing/insurance/licences/portfolio/service radius | ABSENT (mixed) | structured pricing deliberately free text (`rate_text`) — changing that is OWNER_DECISION_GATED (payment-adjacent); insurance/licence/portfolio stores = migration; capacity signal exists per-demand only |
| No duplicate CV/profile/skill/availability store | RULE | all work extends `workers`/`preferred_locations`/`worker_documents`/org spine |

Privacy: every new worker preference field enters the `can_view_worker` + disclosure-whitelist regime; fields beyond the 7-item disclosure whitelist stay owner-only until owner-gated whitelist change (RED migration).

---

## 3. CAPABILITY C — Explainable two-sided matching

| Requirement | Status | Detail |
|---|---|---|
| Deterministic engine | LIVE_PARTIAL | `matchWorkerToNeed` (`lib/market/match-v1.ts:240`): skills Jaccard + evidence tiers + location/radius + country/mobility + availability + language hard block + pay ceiling + accommodation; statuses `strong|possible|weak|insufficient_data`; `reasons[]/gaps[]/missingData[]` |
| Hard vs weighted vs negotiable classification | ABSENT_REPO_SAFE | engine has hard blocks (language, country) but no formal three-tier contract → extend to `MatchCriterionResult{criterion, class: hard|weighted|negotiable, outcome, source, freshness}`; hard failure can never be outscored (already structurally true — status computed before ordering) |
| Result exposure (eligible, matched hard, blocking, strengths, negotiables, missing info, sources+freshness, calc version) | LIVE_PARTIAL | reasons/gaps/missing exist; sources/freshness/calc-version absent → add `calcVersion` const + per-criterion source refs (repo-safe) |
| Four directions (worker→opp, opp→worker, demand→team/company, supply→demand) | LIVE_PARTIAL | worker→opp (`opportunities`), opp→worker (scouting, admin workbench) live; demand→team/company + team/company→demand ABSENT_REPO_SAFE (same engine over team capability summary + service_offerings) |
| Never % alone; score secondary after explanation | LIVE_PARTIAL | worker board already band-only; scouting/admin show pct with basis; keep, ensure explanation-first ordering in new UI |
| No ML/AI claim; no fabricated match on missing data | LIVE_COMPLETE (doctrine+guards) | `fit-not-rating`, `matching-trust-explainer`, `insufficient_data` status; AI agent explains only |

All Capability C work is repo-safe (pure lib + UI). New pure module proposal: extend `match-v1.ts` in place (no second engine — duplicate-subsystem rule).

---

## 4. CAPABILITY D — Marketplace discovery experience

| Requirement | Status | Detail |
|---|---|---|
| Opportunity-first entry + profession/service search | LIVE_PARTIAL | worker `dashboard/opportunities` board exists (fit-sorted cards); no filters UI; ESCO typeahead exists as component |
| Filters: location/radius, date, comp range, engagement, accommodation/transport, language, certificates, individual/team/company, availability mode | ABSENT_REPO_SAFE | client-side filtering over the gated RPC result set + URL params; new fields filterable only after RPC v3 (migration-dependent fields degrade honestly) |
| Map secondary | LIVE_COMPLETE (doctrine) | one map engine rule; map = own-signal only today |
| Result cards (identity+trust, location, start, comp/price basis, engagement, hours/duration, accommodation/transport summary, language/certs, response mode, match explanation, save/compare) | LIVE_PARTIAL | cards exist with match signals; comp/hours/accommodation-detail chips blocked on RPC v3 exposure; save/compare needs persistence (Cap G) |
| Detail page w/ progressive disclosure | ABSENT_REPO_SAFE | no opportunity detail route today (cards only) → new route (register in route-truth + module registry) |
| Sort (relevance/earliest/distance/comp/freshness) | LIVE_PARTIAL | relevance (`compareMatches`) only → add client sorts where data exists |
| Filter chips, active count, reset, empty state naming hard filters | ABSENT_REPO_SAFE | pure UI |
| Saved search + notification choices | ABSENT_NEEDS_MIGRATION + OWNER_DECISION_GATED (notifications) | no persistence; no user notification channels exist at all (in-app spine only) |
| No artificial scarcity/popularity/sponsored | LIVE_COMPLETE (doctrine) | honesty guards |

---

## 5. CAPABILITY E — Fast entry & assisted import

| Requirement | Status | Detail |
|---|---|---|
| Quick-entry minimum publishable + advanced + conditional sections + section completion + missing-info warnings | ABSENT_REPO_SAFE | demand wizard exists (3-step); extend to progressive quick/advanced over structured_v2 clusters |
| Autosave draft; return-to-last-section | LIVE_PARTIAL | one-draft-per-kind autosave exists (`save_demand_draft`); section resume is UI state (repo-safe) |
| Reusable org templates; duplicate-and-edit | ABSENT_REPO_SAFE | duplicate-and-edit = prefill from own previous request (own-data read); stored named templates would need store → start with duplicate-last (repo-safe) |
| Preview as other side sees it | ABSENT_REPO_SAFE | render worker-whitelist projection of own draft |
| Mobile multi-step; language-independent structured values; LT/EN/RU/NL/DE copy | ABSENT_REPO_SAFE | slugs/enums already language-independent; 11-locale key rule |
| Assisted import (paste/PDF/image → proposed values, evidence, uncertainty, confirm-before-write) | EXTERNAL_PROVIDER_GATED | AI provider path exists but audit store (PR #379) unmerged; extraction must show evidence + never invent comp/legality; honest provider-disabled state required. Text-paste heuristic (non-AI, deterministic) could be repo-safe later — out of first wave |

---

## 6. CAPABILITY F — Availability, request and booking flow

Live core: `booking_requests` (proposed→accepted/declined/withdrawn; worker-only accept; overlap guard on accept; readiness snapshot; events audit; seen model; conversation on accept via `allowed_accepted_booking`). Convergence doctrine: services and opportunities converge on conversation → booking → journal (`docs/launch/marketplace-opportunities-bridge-v1.md`).

| Requirement | Status | Detail |
|---|---|---|
| Immediate clarity (what/who/where/when/price/confirmable/what-next) | ABSENT_REPO_SAFE | card + detail UI over existing data |
| Modes: direct application / request-to-discuss / request worker-team-company / propose dates / request booking | LIVE_PARTIAL | express-interest (`demand_interest_signals`), service request loop, propose-booking live; "propose dates" from worker side + demand-side application mode = repo-safe over existing tables? Worker cannot initiate booking (owner-only propose) → worker-initiated = interest signal + conversation (live); direct-application mode flag = payload + UI |
| Instant confirmation where enabled | OWNER_DECISION_GATED | no prerequisites system; skip in this programme (spec allows "only where explicitly enabled") |
| Real availability windows + capacity + conflict checks | LIVE_PARTIAL | overlap guard on accept only; windows = snapshot only; enforcement change = RPC redefinition (RED) |
| Timezone truth | LIVE_PARTIAL | `date`-only fields; document as date-precision truth (honest) — no fake time slots |
| Response deadline + honest no-response/expired | ABSENT (mixed) | `expired` enum exists, NO writer. Repo-safe: derived "stale/no response after N days" display state (no fake status write). True expiry writer = RED migration or scheduled job (OWNER gate on scheduler) |
| Cancellation/withdrawal + reason capture | ABSENT_NEEDS_MIGRATION | withdraw exists, reason column absent on `booking_requests`/events → additive column + RPC change (RED draft) |
| Reschedule / propose-alternative | ABSENT_NEEDS_MIGRATION | no flow; re-propose only after terminal state; new lifecycle = RPC changes (RED draft) |
| Calendar/planning integration | LIVE_PARTIAL | `getPlanning` composes bookings+projects+tasks (tasks lane gated on #708) |
| One linked conversation, no duplicates | LIVE_PARTIAL | app-side dedup (oldest shared direct conversation); no DB uniqueness — acceptable; add regression test |
| Reminders via approved channels | OWNER_DECISION_GATED | no user notification channels exist; in-app spine counts only |
| No payments/deposits/escrow | RULE (guarded) | `no-live-payments` |

---

## 7. CAPABILITY G — Trust, reviews and repeat actions

**Doctrine collision (must be decided by owner):** Platform doctrine §19 "Fit, ne reitingas" — *people are never rated*; `fit-not-rating.test.ts` bans rating identifiers; prior docs (`inspection-and-work-review-future-scope.md`, `partner-risk-and-reputation-policy.md`) explicitly park reputation as future scope, owner-gated. The goal spec itself requires review eligibility contracts, moderation, no aggregate scores when data insufficient.

| Requirement | Status | Detail |
|---|---|---|
| Reviews tied to completed real interaction | **OWNER_DECISION_GATED** (+ ABSENT_NEEDS_MIGRATION when approved) | no store exists. This programme delivers: eligibility + moderation + rights-of-reply **contract** (docs + pure lib + tests) and a draft RED migration decision pack. No review UI ships without owner approval of the doctrine reconciliation (structured factual experience records, dimension chips, NO numeric person score — compatible with §19) |
| Prevent ineligible/duplicate/self review, private-detail exposure, unverifiable aggregates | same | encoded in the contract + eligibility lib (pure, testable now) |
| Compensation/payment accuracy field | OWNER_DECISION_GATED | legal-risk review required (spec itself flags moderation + legal) |
| Repeat: reuse previous opportunity | ABSENT_REPO_SAFE | duplicate-and-edit own request |
| Recontact prior worker/team/company | LIVE_PARTIAL | shortlist + existing conversation reopen; "prior engagement" list derivable from bookings/engagements (own data) |
| Repeat service request / rebook / propose new period | ABSENT_REPO_SAFE | prefill new request/booking from own history |
| Save provider/opportunity | ABSENT_NEEDS_MIGRATION | company-side `demand_shortlist` exists; worker-side saved-opportunity store absent → small additive table (RED draft due to RLS/RPC) |
| Recently viewed / preserve filters | ABSENT_REPO_SAFE | URL params + localStorage (no personal data server-side; "persist only what is necessary and authorized") |

---

## 8. CAPABILITY H — Product polish & mobile-first completion

| Requirement | Status |
|---|---|
| One primary action, progressive disclosure, human labels, consistent cards/chips, skeletons, empty states, recoverable errors, preserved input, no dead cards, touch targets, no horizontal overflow, DE/RU long text | ABSENT_REPO_SAFE (pass over new + prior surfaces; several guards already enforce parts) |
| Keyboard/screen-reader | ABSENT_REPO_SAFE |
| Perf (no sequential reads, role-scoped loads) | LIVE_PARTIAL (spine already parallel; audit new pages) |
| Authenticated 390px worker + company proof | EXTERNAL_PROVIDER_GATED in part | local dev + seeded users possible; production authenticated proof needs smoke accounts — exact requirements will be reported if credentials unavailable |

---

## 9. Migration decision packs (draft, human-gated — NOT applied by this programme)

Ordered by leverage; each ships isolated, `@human-gate-approved`, paired rollback, RLS+RPC review, apply instructions, APPLIED_LEDGER row, post-apply verification:

1. **MP-1 `worker_languages`** — new worker-owned table (lang enum × CEFR level), RLS owner + `can_view_worker`, writes via RPC. Unblocks language matching (hard-block criterion currently starved of worker-side data).
2. **MP-2 worker preference columns v2** — additive nullable columns on `workers` (gross/net preference, shift/night/weekend/overtime willingness, driving-licence categories[], own_vehicle, own_tools, hard_exclusions[]) + `save_worker_availability_prefs` v2 redefinition.
3. **MP-3 `list_open_demand_for_workers` v3** — widened whitelist exposing structured_v2 demand clusters (compensation summary with honesty flags, time cluster, requirement chips). Depends on PR2 capture shipping first.
4. **MP-4 booking lifecycle v2** — `cancellation_reason`, `response_deadline_at` columns + `respond/withdraw` RPC updates + reschedule (`propose_booking_change`) flow + expiry writer decision.
5. **MP-5 worker saved-opportunities** — small additive table (worker-owned, RPC writes).
6. **MP-6 reviews/experience-records store** — ONLY after owner resolves §19 reconciliation (decision pack in canonical contract doc).

Existing gated packs unchanged: #708 `work_tasks`, #714 `finance_records` (rebased onto main by this programme, still owner-gated).

---

## 10. Sequencing consequence (delivery plan)

- **PR 1** (this): gap map + canonical contracts (docs only).
- **PR 2**: structured demand capture — `structured_v2` payload contract (zod), quick/advanced progressive demand form, preview-as-worker, duplicate-and-edit, publish-honesty flags. Repo-safe.
- **PR 3**: mirrored worker preferences — wire the 8 orphaned columns + `preferred_contract_type` into a structured preferences form; team capability display; company capability surface. Repo-safe. + MP-1/MP-2 draft packs.
- **PR 4**: matching contract v2 (hard/weighted/negotiable + calcVersion + sources) + discovery filters/sort/chips/empty-states + opportunity detail route. Repo-safe.
- **PR 5**: booking clarity — mode-explicit request UX, derived stale/no-response states, planning links, one-conversation regression tests. Repo-safe. + MP-4 draft pack.
- **PR 6**: repeat actions (duplicate-and-edit, rebook prefill, recently-viewed local, preserve filters) + review eligibility contract lib + MP-5/MP-6 draft packs. Repo-safe except stores.
- **PR 7**: polish + 390px authenticated proof + final audit.
