# LabourMarket.ai — Full Product / Architecture / Production-Readiness Audit

**Date:** 2026-09-12
**Audited baseline:** `main = ceafd33feef7c7ed6fa6433a954bbf3129b51203` (2026-09-12 19:07 UTC), production project `gorgitwvdzxbnaxhrsrw` (eu-west-1, Postgres 17.6, ACTIVE_HEALTHY)
**Mode:** read-only. No code, schema, PR, CI, deployment or data was changed to produce this document. One new file (this report) is the only change.
**Method:** repository at the SHA above, live production database readbacks (read-only SQL via Supabase MCP), the production migration ledger, Supabase security/performance advisors, GitHub PR/issue/Actions state, and seven parallel code audits (security, worker journey, employer/staffing journey, education/lifelong, evidence/ESCO/matching, communications/calendar/documents/billing/admin, reliability/tests/architecture). Every strong claim below was re-checked against production where a readback could settle it; where it could not, the item is marked **UNVERIFIED** and the reason is stated.
**Status vocabulary:** `IMPLEMENTED` · `PARTIAL` · `STUB` · `PLANNED` · `MISSING` · `BROKEN` · `UNVERIFIED`. Persona readiness: `YES` · `YES WITH LIMITATIONS` · `NO`. Work class: `CONNECT` · `FIX` · `COMPLETE` · `EXTEND` · `NEW`. Priority: `P0` · `P1` · `P2` · `P3` · `FUTURE`.

Prior audits this one supersedes for planning purposes (they remain valid evidence): `labourmarket-master-audit-2026-09-01.md`, `FULL_PRODUCT_VISION_AUDIT_2026-09-02.md`, `FULL_PRODUCT_VISION_AUDIT_2026-09-03.md`, `docs/launch/INSTITUTION_AUDIT_2026-09-09.md`. Where this audit disagrees with them, current evidence won and the disagreement is recorded.

---

## 1. Executive truth summary

**What LabourMarket.ai is today.** A working, RLS-hardened **evidence and identity engine** (auth, Work Journal, deterministic skill recognition, Living CV, employer demand, worker interest, employer scouting, consent-gated contact) with a very large, largely correct, mostly **unused** operations, education and marketplace layer behind it. The evidence half of the flywheel is in sustained real use; the execution half (bookings, projects, timesheets, agreements, agency placements, cohorts, invoices) has run only in tests and one-off proofs.

**Population reality.** 57 auth users, of which at most about 19 look like real people (38 profiles are plus-addressed or test-named). 10 people have written 62 journal entries; 26 of those in the last 30 days; 11 users signed in during the last 7 days. This is a live product with a handful of real users, not a launched product.

**What changed since the 2026-09-03 audit.** 50 commits, almost all in the journal "work in numbers" train (#1689). The flapping health probe (that audit's P0-1) is **fixed**: the probe is a constant-cost lookup, the vacancy count is a pg_cron-maintained row, and the last 30 scheduled probes are all green. Three RED migrations were applied with owner approval (evidence recursion fix, employer supply discovery, programme correction). The production ledger and repository both hold 280 migrations, but nine repository files remain deliberately unapplied (issue #1222) and the parity snapshot is 7 rows stale.

**Re-derived release state.**

```
CUSTOMER_SAFE_RELEASE      = YES, WITH FOUR OPEN P0s (all fix-drafted or small; none needs new infrastructure)
PUBLIC_ACQUISITION_READY   = PARTIAL (5 of 11 locales routed, Google-only social auth, no e-mail delivery from the app)
WORKFORCE_PRODUCT_COMPLETE = NO (no interview/scheduling object, nothing after "accepted", agency loop unused, manager persona blocked)
EDUCATION_COMPLETE         = NO (programme/cohort exist; 0 cohort members; no RPL, no credential issuance, no placement object)
LIFELONG_OS                = NO (architecture allows it; capacity/forecast/reservation, mentoring, RPL and team objects are MISSING)
```

**The four things that must be true before real pilot users are invited at any scale, and are not yet:**

1. Machine inference can still silently become a worker declaration (chat/MCP auto-adds recognised skills as `self_declared`; a compact re-save promotes machine-read fragments to explicit selections; a second RPC writes skill links with NULL provenance — 9 such rows exist in production).
2. A person who has ever recorded consent **cannot be erased** (append-only consent ledger blocks the cascade; issue #856; deletion is a read-only preview).
3. Every signed-in user can read every company's contact e-mail, phone, registration code, VAT number and address (K2-1; confirmed live at column-grant level; fix drafted in PR #1430, unapplied).
4. Self-confirmation reaches `verified = true` (3 of 13 production confirmations are self-confirmations; EVID-2 owner decision open).

None of these requires new infrastructure or spend. All four are `FIX`/`COMPLETE` on code and schema that already exists.

---

## 2. Repository and production truth

### 2.1 Repository

| Fact | Value | Source |
|---|---|---|
| `main` SHA | `ceafd33` | `git rev-parse origin/main` |
| Audit branch | `claude/labourmarket-product-audit-iwjyy0` at the same SHA | |
| Commits since 2026-09-03 audit | 50 (≥30 journal/structuring fixes under #1689) | `git log` |
| CI on `main` | Quality Gates / E2E Smoke / CodeQL / Mobile all green on the four commits preceding `ceafd33`; `ceafd33` runs in progress at audit time | GitHub Actions |
| Local checks (this session) | vitest **1,308 files, 22,310 tests, 0 failed** (302 s); typecheck pass; lint pass (1 warning) | run offline |
| Code | 3,168 TS/TSX files, 639,853 LOC; product (non-test) 387,477; tests 230,078 of which **guards 152,723** | `find`/`wc` |
| Surfaces | 112 page routes, 26 route handlers, 258 `"use server"` modules | `find` |
| Migrations | 280 files (35 legacy `000N`, 245 timestamped); 212 rollback pairs; 191 files carry `@human-gate-approved` | `supabase/` |
| Docs | 915 markdown files, 296 MB (audits alone 173 MB) | `du` |
| Locales | routed `lt en ru nl de` (11,868 keys each, **0 missing**); `da et lv no pl sv` declared, not routed (4,748 keys, 7,134 missing each) | `messages/*.json`, `lib/i18n/config.ts:44` |
| Mobile (Expo) | sign-in, register, today, log-work, journal, profile, settings; journal write via `/api/mcp` draft→confirm; no inbox, push, camera, EAS or store | `apps/mobile/app` |
| Open PRs | 28: 15 owner-gated RED drafts (unapplied migrations), 9 dependabot, 4 parked design | GitHub |
| Open issues | #1222 schema drift (9 repo migrations not in ledger), #856 erasure blocked, 3 stale | GitHub |

### 2.2 Production database (read 2026-09-12)

| Fact | Value |
|---|---|
| Size / tables / policies | 888 MB · 204 public tables · **0 with RLS off** · 342 policies |
| Functions | 464 public, **424 SECURITY DEFINER**, 0 without pinned `search_path`, 9 anon-executable (= the documented allowlist exactly) |
| `using (true)` policies | reference tables only (skills, countries, plans, types) + `waitlist` anon insert |
| Storage | 5 private buckets with MIME allowlists and 5–10 MB limits; 17 objects total |
| Users | 57 auth (53 confirmed); 21 created in 30 d; 11 active in 7 d; 10 Google identities; 3 banned; ~38 test-like |
| Journal | 62 entries / 10 authors / 26 in 30 d · 300 metrics (253 `worker_input`, 54 `ai_extracted`) · 76 entry-skill links (39 `recognized`, 2 `confirmed`, 1 `manual`, **36 NULL of which 9 post-provenance-migration**) · 13 confirmations (all `confirmer_role=owner`, 3 self) · 10 photos · 58 worker skills (35 `work_journal`, 22 `self_declared`, 2 `manager_confirmed`; 2 verified) |
| Demand / supply | 20 customer requests (12 submitted, 4 draft, 4 closed; 3 in 30 d) · 5 interest signals · 1 shortlist · 88,827 public vacancies (414 MB) · 1.045 M ESCO labels (408 MB) |
| Organisations | 17 organizations / 14 companies (6 construction, 4 other, 4 staffing_agency) · 15 roles (10 employer, 3 workforce_provider, 2 training_provider) · 19 memberships (17 owner, 1 admin, 1 manager) · 81 engagement contexts (63 employee, 17 owner, 1 student) |
| Execution | 9 projects (**all draft**) · 5 assignments · 2 tasks · 2 timesheets (1 approved) · 5 hour allocations · 1 workflow instance (24 definitions) · 1 booking (accepted) · 1 engagement · 0 absences · 0 agreements · 0 finance records |
| Agency | 3 agencies · 0 agency workers · 2 client connections · 2 candidate offers · 0 supply declarations |
| Education | 1 programme · 1 cohort · **0 cohort members** · 0 training rows |
| Communication | 5 conversations · 18 messages · 8 notification events (6 weekly digest, 2 interest) · 0 preferences · 0 disclosure requests |
| AI | 58 runs (57 Gemini `gemini-3.5-flash-lite`/`2.5-flash-lite`, 1 blocked `cost_unpriced`); tasks: 51 `propose_conversation_intent`, 6 `explain_market_demand`, 1 `explain_match`; lifetime actual cost **≈ $0.045** |
| Economics | all 7 LMC/payment flags `false` · 1 billing customer · 0 subscriptions · 0 webhook events |
| Scheduled work | pg_cron: `ai_runs` retention daily, vacancy count every 10 min · Vercel cron: weekly digest Mon 07:00 · GitHub Actions: health probe every 15 min (30/30 green), vacancy ingestion 3×/day, CodeQL weekly |
| Absent in production (repo-only) | `agency_clients`, `worker_opportunity_seen`, `journal_profession_templates`, `dashboard_preferences`, `company_locations`, `worker_external_profiles`, `demand_interest_seen`, `workspace_pins`, `work_plans`, `assistant_transcripts` |

### 2.3 What could not be verified from this session

- Live HTTP behaviour of production routes (egress from this session to `labourmarket.ai` is denied by policy). The 15-minute health probe workflow is the evidence used instead.
- Vercel/GitHub environment values (`INVITE_EMAIL_PROVIDER`, `CRON_SECRET`, `SUPABASE_DB_URL`, `VACANCY_SCHEDULE_ENABLED`, `AI_PROVIDER_MODE`). Behaviour was inferred from production rows (e.g. Gemini runs exist, no app-sent e-mail exists).
- Supabase Auth dashboard settings beyond the advisor line (leaked-password protection is **off**).
- Whether the Gemini key is on a plan-included or billed tier. The code comment in `lib/ai/runtime/data-egress.ts:106-125` says paid tier, owner-approved 2026-09-05; the ledger shows about 4.5 US cents lifetime.
- Mobile on-device behaviour and store presence.
- Bundle sizes (`next build` not run here).

---

## 3. Architecture map

```
                         ┌──────────────────────── SURFACES ────────────────────────┐
  Web (Next 15, Vercel dub1)  ·  Chat/assistant (same registry)  ·  /api/mcp (ChatGPT/agents)
  Expo mobile (journal write via MCP)  ·  Public SEO (jobs, questions, sitemaps, llms.txt)
                         └───────────────────────────┬───────────────────────────────┘
                                                     │ "use server" actions (258) + 26 route handlers
                         ┌───────────────────────────┴───────────────────────────────┐
  IDENTITY  profiles · profile_roles (worker/company/agency/customer/admin) · engagement_contexts
            (owner/employee/student/…) · organizations ⇄ companies (mirror) · organization_roles
            (employer/workforce_provider/training_provider/…) · company_memberships (governance)
  EVIDENCE  journal_entries ─ journal_entry_metrics (provenance) ─ journal_entry_skills ─ worker_skills
            ─ journal_entry_confirmations · journal_entry_photos · experience_records · organization_evidence_*
  SEMANTICS skills / professions / profession_skills · ESCO (occupations, skills, labels 28 locales) —
            meaning and provenance only, never a score · lib/structuring deterministic lexicons (lt en ru + 9 packs)
  DEMAND    customer_requests (kinds incl. agency_offer) · company_need_public_intakes · demand_interest_signals
            · demand_shortlist · public_vacancies (ingested) · first_party_supply_declarations
  MATCH     lib/market/match-v1 (deterministic, explainable, no global score) used by worker board,
            recommendations, external vacancies, employer scouting (consent-gated pool)
  EXECUTION projects · stages · work_objects · work_tasks · project_worker_assignments · booking_requests
            → company_worker_engagements · work_hour_allocations → timesheets → workflow engine (24 defs)
  TIME      planning projection (8 sources) · capacity three-state read · absences · booking exclusion constraint
  COMMS     conversations/participants/messages · notification_events (20 types, in-app only) · weekly digest
  EDUCATION education_programs · education_cohorts · education_cohort_members · institution_learner_outcomes (k=5)
  PRIVACY   privacy_consent_events (append-only) · personal_data_disclosures · contact_disclosure_requests · export
  AI        runAiAgent → provider chain (local-first, default-deny egress, one Gemini grant) → ai_runs + usage_cost_events
  MONEY     Stripe (test mode, live hard-blocked) · plans · entitlements (3 gates) · LMC ledger (dormant)
                         └──────────────── Supabase Postgres 17, RLS everywhere, 424 SECDEF RPCs ────┘
  GOVERNANCE capability-register.ts (106) + journey-register.ts (6 chains) + product-truth.mjs + 860 guard tests
```

**Where authorization lives.** Almost entirely inside PL/pgSQL SECURITY DEFINER functions (424 of 464), with RLS as the outer wall. This is consistent and well pinned (search_path, revoked from anon), but it means per-function authorization correctness is verified by hand-written guards that pin *migration text*, not by an automated behavioural corpus.

**Where the doctrine is enforced.** `product-truth.mjs`, the capability and journey registers, and the guard suite. This machinery is unusually strong; its weakness is that 807 of 860 guards read source or docs as text, so they catch drift in wording and bytes, not in behaviour.

---

## 4. Current capability map

Register totals (`apps/web/lib/product-gate/capability-register.ts`, 106 rows): `BUILT_AND_USABLE` 33 · `PARTIAL` 55 · `BUILT_NOT_CONNECTED` 6 · `BLOCKED` 3 · `ARCHITECTURE_ONLY` 2 · `MISSING` 7 · `HUMAN_UI_PROVEN` 17. Journeys: 29 live links, 11 broken/unbuilt. The register is broadly honest; the deviations this audit found are listed in §12 as register-truth fixes.

| Domain | Status | Production evidence | One-line truth |
|---|---|---|---|
| Auth, onboarding, locale | IMPLEMENTED | 57 users, 53 confirmed; Google + password | PKCE, token-hash confirm, honest fail-closed role reads. Leaked-password protection off, min length 8, no MFA. |
| Profile / Living CV / CV import / EU export | IMPLEMENTED (PARTIAL editors) | 57 workers; 28 claims; 4 education; 2 achievements | Projection of evidence holds (I-5). `headline`/`bio` have no editor; work card editable only in chat. |
| Work Journal (form, compact, chat, MCP, photo, document; voice env-gated) | IMPLEMENTED | 62 entries, 300 metrics, 10 photos | One write core, one fragment builder (since #1719). Provenance drift remains on three paths (§7). |
| Deterministic recognition → skills | IMPLEMENTED | 76 links, 58 skills | Accept/Reject/Correct exist; **no reason capture, no learning consumer** (`learning_signals` has no writer). Users cannot edit rules (none in DB). |
| Manager confirmation / evidence tiers | IMPLEMENTED (owner-gated defect) | 13 confirmations, 3 self | Self-confirmation reaches `verified`; read-time classification mitigates journal class only. Review enabled on 5 contexts / 4 orgs. |
| Organisation evidence import + subject view | PARTIAL | 0 rows (recursion fix applied 09-08) | Import chain proven in rolled-back transactions; subject **cannot refuse** (no INSERT policy admits the subject; PR #1646 RED). |
| Experience records + right of reply | PARTIAL | 2 records, 1 response | RLS resolves the wrong `moderation_status` (EVID-6, PR #1641 RED). |
| ESCO | IMPLEMENTED | 1.045 M labels, 3,039 occupations | Meaning/provenance only. **No hidden ranking** anywhere (verified in every matching path). |
| Matching | IMPLEMENTED | 20 requests, 5 interests | One deterministic engine, reasons and gaps shown, coverage % visible not hidden; `/match-preview` is a frozen second fork. |
| Employer demand intake | IMPLEMENTED, fragmented | 20 requests + 2 public intakes | 7 UI entry paths and 2 tables into one canonical model. |
| Scouting / shortlist / contact / disclosure | IMPLEMENTED | 1 shortlist, 5 conversations, 0 disclosure requests | Consent-gated pool; shortlist scoped to owner, not organisation. |
| Organisation, memberships, roles | PARTIAL | 17 orgs, 19 memberships | Four role vocabularies; **accepted manager cannot open employer surfaces** (needs `profile_roles.company`). Team management not on the hub. |
| Agency: client bridge, candidate offers | IMPLEMENTED (thin) | 2 connections, 2 offers | Works only for `company_type=staffing_agency`; roster = `company_workers`; dedicated `agencies`/`agency_workers` stack dead; `agency_clients` table unapplied while its UI ships gated. |
| Supply direction (`agency_offer`, employer discovery) | IMPLEMENTED, dead-end | 3 agency_offer rows; RPC live | Employer sees six anonymous columns and has **no follow-up act**. |
| Projects, stages, objects, tasks, assignments | IMPLEMENTED | 9 projects all draft, 5 assignments | No role/headcount requirement object; no assignment overlap rule. |
| Bookings → engagement | IMPLEMENTED | 1 accepted | Hard exclusion constraint on overlap (contradicts SEP-2 warn/override for bookings); nothing after `accepted`; expiry RPC has no scheduler. |
| Hours, allocations, timesheets, approvals | IMPLEMENTED | 5 allocations, 2 timesheets, 1 workflow instance | Timesheet decision UI on a different page than the timesheet. |
| Planning / calendar / capacity | PARTIAL | 0 absences | Real projection, three-state capacity read; **no override object, no alternatives, no planned-vs-actual, no shifts, no reservation, no user timezone** (fixed UTC). |
| Interview / scheduling | MISSING | — | "Interview" = an open conversation (`lib/pipeline/candidate-pipeline.ts:37-39`). |
| Messaging | IMPLEMENTED | 18 messages | Polling only; attachments read-only (no upload action); participant revocation schema-only. |
| Notifications | PARTIAL | 8 events | In-app only. **App-level e-mail provider unset; no outbox/drain; no SMS; no push.** Supabase Auth SMTP (Resend) handles auth mail only. |
| Documents | IMPLEMENTED | 1 worker document, 0 files | Full validity model; consent toggle; signed 60 s URLs; **no user-facing delete**; no malware scan (policy). |
| Education | PARTIAL | 1 programme, 1 cohort, 0 members | Programme create+update, cohort create, member assign exist and are reachable; **no cohort/programme archive, no supervisor role, no credential issuance, no RPL, no placement object, no export**. Register notes stale (still say "no update function"). |
| Privacy / consent / export / deletion | PARTIAL | 8 consent events; export route exists | **Deletion is preview-only**; consent ledger blocks cascade (#856). No age/guardian data or gate anywhere. |
| Billing / entitlements / LMC | BLOCKED by design | flags all false | Stripe test chain live; live charging needs two owner acts; LMC dormant; 3 entitlement gates wired. |
| Admin / support | IMPLEMENTED | 65 audit rows | 22 admin routes; support conversations; CLI superadmin grant; **admin actions unevenly audited**; no impersonation. |
| Observability | PARTIAL | health probe 30/30 | JSON-line errors to stdout, Telegram owner alerts, no aggregator, **no PITR (Free plan per docs), no restore drill**. |
| AI runtime | IMPLEMENTED (narrow) | 58 runs, ≈$0.045 | Single entry, default-deny egress, one task-scoped Gemini grant, cost ledger. Not a prerequisite anywhere (I-7 holds). |
| Mobile | PARTIAL | builds green | 7 screens; journal write proven via MCP; no store, no push, no camera. |
| Localisation | PARTIAL | 5 routed | Parity perfect on routed locales; 6 declared locales are 60 % untranslated. No RTL. |
| Governance / CI | IMPLEMENTED (two gates inert) | — | Live anon-SECDEF allowlist and migration-parity gates **skip** without `SUPABASE_DB_URL`; RLS behavioural proofs (`scripts/db-proof/*`) run nowhere in CI; 5 of 95 E2E specs run in CI. |

---

## 5. Persona readiness matrix

"Can a real person register today and reach meaningful value without developer intervention?"

| # | Persona | Verdict | Evidence (paths relative to `apps/web/`) | What stops YES |
|---|---|---|---|---|
| 1 | Individual worker / job seeker | **YES WITH LIMITATIONS** | signup → confirm → 2-step onboarding → chat → journal → skills → CV/EU export → opportunities (internal + 88.8 k public) → interest → conversation; 7 screens / ~9 actions to first entry, first skill on the same save | No interview/offer object; confirmation impossible without an org engagement and `external_confirmation` is `preparing` (`lib/config/feature-availability.ts:198`); reject has no reason; `/dashboard/learning` orphaned |
| 2 | Employed worker | **YES WITH LIMITATIONS** | manager review (`review_journal_entry`), tasks, absences, employee requests, timesheets | Org must enable review per context (5 of 81 enabled); self-confirmation allowed; absences 0 rows |
| 3 | Freelancer / contractor | **YES WITH LIMITATIONS** (thin) | service offerings, booking accept → engagement, listings, finance records | Nothing after `accepted`; no agreements UI; no invoice from journal; no payment |
| 4 | Employer (organisation owner) | **YES WITH LIMITATIONS** | org setup → need → scouting → shortlist → contact → booking → engagement → confirmation; need→match→shortlist HUMAN_UI_PROVEN | No interview/calendar; no project role requirement; pool depends on worker discoverability consent; team management only on `/dashboard/start` |
| 5 | Employer manager / team leader | **NO** | `membership_accept_v1` never writes `profile_roles`; `/dashboard/company*` calls `requireRoleOrRedirect(locale,"company")` on `profile_roles` only; `getOwnedCompanyById` admits creator/owner/admin (`lib/company/company-setup.ts:262-275`) | Verified live: the one `manager` and one `admin` membership in production both belong to accounts that also hold `company`; a fresh non-owner member is bounced |
| 6 | Staffing / temporary-employment organisation | **YES WITH LIMITATIONS** | `company_type=staffing_agency`; client bridge → share → candidate offer → client decision (`lib/agency/bridge-actions.ts`); supply declaration reaches employers | No compliance/rotation/replacement/reporting surface; supply discovery has no follow-up act; representation consent = roster acceptance only |
| 7 | Recruitment organisation | **NO** (as a distinct persona) | `submit_agency_candidate_offer_v1` raises `not_agency` unless `company_type='staffing_agency'` (live body read) | Must misdeclare industry; `recruitment_partner` role unlocks nothing (ORG-2 owner decision) |
| 8 | Educational institution (school/VET) | **YES WITH LIMITATIONS** | onboarding intent `education` → `training_provider` → programme (create/update), cohort, invite learner, assign member, demand per profession, k-anonymous outcomes | No cohort/programme archive; no learner review enablement reachable; no export; no learner attestation |
| 9 | University / college | **YES WITH LIMITATIONS** | identical to #8 | No level/credits/duration; indistinguishable from VET |
| 10 | Teacher / lecturer / supervisor | **NO** (no such role) | a supervisor is an org `manager`; `confirmer_role` CHECK admits manager/owner/external_manager only | Confirmation is indistinguishable from employer confirmation; review toggle unreachable for student contexts |
| 11 | Student | **YES WITH LIMITATIONS** | intent `student` → education row → learning compass; accepts institution invite into `student` context; journal under student context; internships as opportunity type | No credential, no RPL; institution cannot place them without granting employer view |
| 12 | Training / qualification provider | **YES WITH LIMITATIONS** | training register on `/dashboard/documents`; `assign_training_v1`; certificates | Cannot assign to a learner linked by `student` context (needs `company_memberships`); training never writes to the skill ladder |
| 13 | RPL / competency-recognition organisation | **NO** | `verification_provider` role exists but is not self-declarable; equivalence hard-coded `false` (`lib/projects/worker-project-access.ts:299`) | No RPL object, RPC or surface |
| 14 | Institution / programme / cohort administrator | **YES WITH LIMITATIONS** | authority = `manages_organization`; chat executors mirror the forms | No per-programme scope; missing archive writers |
| 15 | Young learner / guardian-controlled context | **NO — deliberately absent** | no DOB, age or guardian concept anywhere; `student` withholds worker visibility by design; guardian roles explicitly excluded pending design | Must stay NO until an owner/legal decision defines age capture, guardian consent and jurisdiction rules (§6.3) |
| 16 | Older / retired person | **NO** as a distinct value; **YES WITH LIMITATIONS** as a worker | self-declared history, volunteer practice, CV export | No mentoring, legacy/knowledge-transfer or "not seeking" state |
| 17 | Platform administrator / support / compliance | **YES WITH LIMITATIONS** | 22 admin routes, support conversations, verification, privacy queue, CLI superadmin grant | Uneven audit trail on admin actions; privacy requests live in `customer_requests`; no impersonation; no erasure executor |

---

## 6. End-to-end journey gaps

### 6.1 Worker

| Step | Status | Gap class |
|---|---|---|
| Discover → register → confirm → onboard | IMPLEMENTED | — |
| Profile / Living CV / import / export | PARTIAL | headline/bio editor missing; work card only in chat (`CONNECT`) |
| Documents | IMPLEMENTED | adoption 1 row; no delete (`NEW`) |
| Journal | IMPLEMENTED | voice UNVERIFIED (env-gated external service); export not linked from journal (`CONNECT`) |
| Recognition Accept/Reject/Correct | PARTIAL | no reason; no learning consumer; chat/MCP auto-add without per-skill acceptance (`FIX`, P0) |
| Confirmation | PARTIAL | orgless workers cannot get anything confirmed (`COMPLETE`, P1); self-confirm reaches verified (`FIX`, P0, owner) |
| Availability / mobility | IMPLEMENTED (split) | four vocabularies (`EXTEND`) |
| Opportunities → interest | IMPLEMENTED | no saved searches/alerts (`EXTEND`) |
| Messaging | IMPLEMENTED | no e-mail delivery → an away user never learns of interest (`CONNECT`, P1) |
| Interview / calendar | MISSING | no object (`NEW`, P2 for pilot, P1 for complete product) |
| Offer / start | PARTIAL | booking = offer; nothing after accepted (`COMPLETE`) |
| Outcome → profile | PARTIAL | experience reply withheld by RLS defect (EVID-6, owner); subject cannot refuse imported record (EVID-7, owner) |

Dead-ends and hidden actions: enabling journal review for a context is only reachable from roster UIs; `identify_verifier` lands on a section that cannot invite anyone; `/dashboard/learning`, `/dashboard/talent`, `/dashboard/hours`, `/dashboard/reports` and 15 other pages have no inbound link.

### 6.2 Employer

Register → team → need → scouting → shortlist → contact → booking → engagement → confirmation is reachable and partly HUMAN_UI_PROVEN. Breaks: non-owner members bounce (§5 #5); team management off the hub; seven parallel intake entries; no interview object; no project role requirement; assignment overlap unchecked; timesheet decision on another page; supply discovery dead-ends; forecasting derived only.

### 6.3 Staffing / recruitment

Client bridge → share → offer → decision works for `staffing_agency` companies. Breaks: pool is the generic roster; dedicated agency stack dead; explicit representation consent and disclosure record absent; recruitment organisations locked out by industry enum; no compliance, rotation, replacement or placement reporting; brigade/team offer NOT_BUILT.

### 6.4 University / education

Institution → programme → cohort → invite → accept → practice journal → competency → outcomes is built and reachable, walked by nobody (0 members). Breaks: no cohort/programme archive; no reachable review enablement for learner entries; supervisor confirmation indistinguishable from employer; training register cannot target learners; no institution↔employer placement object (placing a learner today would grant the employer view and defeat least-privilege); no credential issuance; no RPL; no export; `worker_education` unlinked to `education_programs`.

### 6.5 Lifelong individual

Education (self-declared) → competencies → work/volunteer → professional development (org-side training only) → transitions (advice copy) → mentoring (nothing). The person model (`engagement_contexts`, practice relationships, verified CV) supports the arc; the objects for transitions, mentoring, RPL and later-life participation do not exist.

### 6.6 Minor / guardian boundary (facts)

No date of birth, age, or guardian data exists in schema, auth metadata, onboarding or copy. The `student` relationship deliberately withholds worker visibility because "a student is very often a minor" (`20260827210000_learner_visibility_least_privilege_v1.sql:88`). Guardian confirmer roles are explicitly excluded pending a minor-safety design (`20260602130000_confirmation_role_check.sql:14-15`, `docs/design/universal-confirmation-roles-v1.md`). Consent purposes carry no education/guardian purpose. **This boundary is correctly closed and must remain closed until an owner/legal decision.** Nothing in this audit recommends collecting age data.

---

## 7. Security / privacy / trust findings

Classes: **TC** = technical control (exists / partial / missing), **POL** = policy needed, **LEG** = legal review needed.

| # | Finding | Evidence | Sev | Class |
|---|---|---|---|---|
| S1 | Company contact columns readable by every signed-in user | live: `companies_select = (auth.uid() IS NOT NULL)`; `authenticated` holds column SELECT on `contact_email, contact_phone, registration_code, address, vat_number`; fix in PR #1430 (RED, unapplied) | **P0** | TC missing (fix drafted) |
| S2 | No end-to-end erasure; consent ledger blocks cascade | live trigger `privacy_consent_events_append_only`; `lib/privacy/deletion-plan.ts` issues zero writes; issue #856 | **P0** | TC missing + LEG |
| S3 | Self-confirmation reaches `verified=true`; `confirm_entry_and_verify_skills` verifies any owned skill, not only entry-linked | `20260720150000_journal_photo_continuity_v1.sql:494-620`; 3 of 13 production confirmations self | **P0** | TC partial (owner decision EVID-2) |
| S4 | Admin privilege model rests on one trigger pair | **verified present and enabled in production** (`trg_profile_roles_admin_grant_guard`, `trg_profiles_admin_grant_guard`) | P2 (was conditional P0) | TC exists — add a guard that fails if it disappears |
| S5 | Admin actions unevenly audited; no TS writer of `audit_logs`; document-verification and moderation RPCs write no audit row | `lib/admin/*-actions.ts`; 35 migrations write audit rows | P2 | TC partial |
| S6 | Token-path invitation acceptance not bound to invited e-mail (by-id path is) | `20260827200000_relationship_invitations_v1.sql` vs `20260902230000_…binds_org_membership_v1.sql` | P2 | POL + TC |
| S7 | Rate limiting per serverless instance; DB-side bounds only on three anon writes | `lib/security/rate-limit.ts:20-35`; `20260829130000_anon_write_bounds_v1.sql` | P2 | TC partial |
| S8 | 385 authenticated SECDEF functions with hand-written authorization; no behavioural corpus in CI; `scripts/db-proof/*` run nowhere | advisor; `.github/workflows` | P1 | TC partial |
| S9 | Live CI gates inert (anon-SECDEF allowlist, migration parity) without `SUPABASE_DB_URL`; parity snapshot 7 rows stale | `quality.yml:167-202`; snapshot 273 vs prod 280 | P1 | TC exists, not wired (`CONNECT`) |
| S10 | No age gate, no guardian concept (correctly closed) | §6.6 | P2 | LEG |
| S11 | `is_employer()` derives from user-writable `active_role`; mitigated by discoverability consent branch | `0003_multi_role.sql`; `20260827210000` | P3 | TC exists — document |
| S12 | `structureRequestNeed` admin action has no admin gate; owner can stamp `structured_by: admin` | `lib/admin/structure-need-actions.ts:45-115` | P3 | TC missing (`FIX`) |
| S13 | Uploads: MIME from `File.type` only, no magic-byte sniff, no malware scan; private buckets, size caps, 60 s signed URLs | `lib/documents/document-file-actions.ts:87-101` | P3 | POL |
| S14 | Auth hygiene: leaked-password protection off, min length 8, no MFA, `CRON_SECRET` compared with `===` | advisor; `components/app/signup-form.tsx:36`; `lib/api/cron-auth.ts` | P3 | POL + `FIX` |
| S15 | Service-role key held by a GitHub Actions job (vacancy ingestion); a walk script under `docs/` reads live Stripe keys from a key file | `.github/workflows/sweden-supply-cadence.yml:59-62`; `docs/launch/pilot-feedback/walks-2026-09-05/stripe-agent-prod.cjs:26` | P3 | POL (secret custody) |
| S16 | Two trigger functions with mutable `search_path` | `20260728114353_…:120` | P3 | `FIX` |
| S17 | `ai_runs` keeps rows and `data_categories_sent` indefinitely (excerpt redacted at 90 d); PR #1266 delink unapplied | `20260808130000_…:47-58` | P3 | POL |
| S18 | Journal entries filed under an employer context are readable by that organisation's managers by default; no per-entry visibility flag; `visibility_scope` always `closed` and never consulted | live `journal_entries_select`; all 63 entries carry an engagement context | P1 | POL (product decision) + TC (`EXTEND`) |
| S19 | AI egress: one task-scoped Gemini grant for free-text conversation intent, paid tier, owner-approved 2026-09-05; every other personal task refused vendorless | `lib/ai/runtime/data-egress.ts:106-125`; 51 runs | — | POL confirmed; DPA/terms review LEG |

**What is genuinely strong (do not rewrite):** PKCE + token-hash confirmation with a closed OTP allowlist; fail-closed role reads; ownership/relationship-scoped RLS with consent basis per branch; `journal_entry_photos_insert with check (false)` + register RPC; admin/self-only ledgers (`ai_runs`, `usage_cost_events`, `audit_logs`, `worker_documents`); anon surface of exactly nine reviewed SECDEFs; invitations with 32-byte tokens, sha256 storage, expiry, single use, per-inviter caps; `/api/mcp` on the caller's RLS client; Stripe webhook signature on raw body with live mode hard-blocked; service role `server-only` with `isSuperadmin()` re-checks; default-deny AI egress with a grant table; SHA-pinned Actions with `contents: read`; migration-safety self-tested and fail-closed.

**Supabase advisors (read 2026-09-12).** Security: 1 ERROR (`security_definer_view` on `worker_absence_scheduling`, by design and documented), 9 anon-SECDEF WARN = allowlist, 385 authenticated-SECDEF WARN, 2 mutable search_path, leaked-password protection off, 4 RLS-no-policy INFO (deny-all, correct). Performance: 218 multiple-permissive-policy warnings (47 tables), 159 `auth_rls_initplan` (99 tables incl. hot ones), 192 unindexed FKs (104 tables), 97 unused indexes.

---

## 8. Data / evidence / provenance findings

The stated invariant: *machine inference must never silently become `worker_input` or human-confirmed evidence.* Verified state:

| # | Finding | Evidence | Sev | Class |
|---|---|---|---|---|
| E1 | Chat and MCP journal writes auto-add every exact/synonym recognition as `worker_skills.source='self_declared'` with no per-skill acceptance; reconcile then promotes to `work_journal` tier; a later rejection does not remove the row | `lib/conversation/worker-executors.ts:227-245`, `lib/capabilities/registry.ts:635-647`, `lib/journal/skill-pipeline.ts:463-486` | **P0** | `FIX` |
| E2 | Compact re-save marks every persisted `ai_extracted` fragment `selected`; the supersede RPC writes those as "explicit worker selection" | `lib/journal/compact-edit-model.ts:279-288`; RPC `…photo_continuity_v1.sql:279-291` | **P0** | `FIX` |
| E3 | `journal_entry_supersede_v2` writes `journal_entry_skills` outside the ONE link writer with NULL provenance | **live: 9 NULL-provenance links created after the provenance migration** (27 older are historical) | P1 | `FIX` (new migration) |
| E4 | `quantity_source` not carried on compact or full re-save; defaults to `worker_input` | `compact-edit-model.ts:306-322`, `journal-entry-composer.tsx:298-304, 930-935`, `journal-write-core.ts:429-433` | P1 | `FIX` |
| E5 | Full composer ignores `editingEntry.activities`; re-parses text | `journal-entry-composer.tsx` | P1 | `COMPLETE` |
| E6 | The 3-value CHECK (`worker_input`, `ai_extracted`, `manager_corrected`) cannot express "deterministic machine"; the same recognizer is stamped `worker_input` in the pipeline and `ai_extracted` in intake; `manager_corrected` has no writer | `0013:151`; `skill-pipeline.ts:531-656`; `intake-work-time.ts:42-46` | P1 | `EXTEND` (additive CHECK value) |
| E7 | Recognition feedback loop dead: `learning_signals` has no writer; `apply_learning_auto_confirmation` needs a queue nothing fills; reject/correct carry no reason | migrations + `lib/learning/learning.ts` | P1 | `CONNECT` + `NEW` (reason) |
| E8 | Nine parallel evidence vocabularies (metric source, worker skill source, link provenance, render source, ProvenanceClass, EvidenceTier, org-evidence state, experience dispute, document verification) | `lib/evidence/*`, `lib/organization-evidence/*`, `lib/trust/*` | P2 | `EXTEND` (one typed module) |
| E9 | Subject of an imported organisation record cannot refuse it; org-evidence dispute/verify events have no writer | `20260907114500`; PR #1646 RED | P1 | `COMPLETE` (owner-gated) |
| E10 | Field-level minimisation absent: managers read full `original_text`; no "tools/systems + duration + context" projection | `lib/journal/review-queue.ts:70` | P2 | `NEW` |
| E11 | Reputation: no star rating anywhere; `performance_reviews` forbids score columns; `workers.trust_score` column dormant (no reader/writer) | guards `fit-not-rating.test.ts` | — | keep; retire the column later |
| E12 | ESCO is meaning and provenance only; no path weights or ranks people by ESCO | `lib/esco/*`, `lib/market/match-v1.ts:112-114`, `lib/admin/matching-workbench.ts:29` | — | keep |
| E13 | AI output never lands as evidence today (suggestion action persists nothing); but if it did, `ai_extracted` is already spent on deterministic parsing → indistinguishable | `journal-ai-suggestions-actions.ts` | P2 | fold into E6 |

**Verdict.** SEP-3 (evidence ≠ verification) holds at the schema for organisation imports and documents, and at read time for journal confirmations. It does **not** hold for skill provenance on three write paths (E1–E3). These are the highest-leverage fixes in the product because they protect the one asset that is actually in use.

---

## 9. UX / mobile / accessibility / i18n findings

| Area | Finding | Sev |
|---|---|---|
| Discoverability | 19 of 112 pages have no inbound link (learning, talent, hours, gallery, reports, buyer, match-preview, create-cv…); company/agency workspaces still catalogued as `preparing` while live; admin sub-routes absent from registries; team management off the hub | P1 |
| First value | 7 screens / ~9 actions to first journal entry; first skill on the same save; landing sentence survives login | good |
| Return user | chat-first dashboard with role-aware starters; activity centre; weekly digest persisted but not delivered | P1 (delivery) |
| Empty / error / loading | explicit empty states on journal, opportunities, documents, bookings; failed reads distinguished from empty (SEP-7) on profile/journal; `error.tsx`/`global-error.tsx` present | good |
| Trust / explanation | match reasons, gaps and missing facts on every card; evidence tier labels; "self-stated" badges; capped lists say they are capped | good |
| User control | Accept/Reject/Correct; discoverability consent; disclosure requests; **no reason on reject, no per-entry visibility, no delete for documents** | P1 |
| Calendar reality | overlap detected for leave×booking and assignment labels; booking accept hard-blocks; no override receipt; UTC only | P1/P2 |
| Mobile web | no fixed-width hazards in journal/chat/composer; three `w-[360px]`/`min-w-[720px]` sites (two wrapped); admin market table without overflow wrapper; header search is the only nav at every width | P2 |
| Mobile app | 7 screens, journal write proven via MCP; no inbox, push, camera, EAS, store | P3 / FUTURE |
| Accessibility | single `<main>`, labelled inputs, heading-order guards; skip link on marketing only, dashboard `<main>` has no `id`; no axe/contrast automation | P1 (skip link) / P2 |
| Localisation | routed 5 locales at perfect parity; detection by Accept-Language, locked only by explicit cookie/account choice (correct); 6 declared locales 60 % missing; ESCO labels cover all 11; `fi` lexicon pack exists without a route; no RTL | P2 |

---

## 10. Reliability / performance / infrastructure findings

| # | Finding | Evidence | Sev |
|---|---|---|---|
| R1 | No PITR (Free plan per docs), no restore runbook, no drill | `docs/operations/observability-v1.md:48`; `docs/runbooks/` apply-only | P1 (P0 before 100 users) |
| R2 | Four schedulers, no queue/worker tier; e-mail is fire-and-forget without retry; booking-expiry and disclosure-expiry RPCs have no caller | `lib/notifications/email-dispatch.ts:118-135`; `vercel.json`; pg_cron | P1 |
| R3 | Health flap fixed; probe constant-cost; count singleton refreshed every 10 min | `app/api/health/route.ts:21-36`; `20260903100000` | fixed |
| R4 | No client-side timeout on Supabase fetches; DB-side `statement_timeout` 3 s (anon) / 8 s (board) | `lib/supabase/*.ts` | P2 |
| R5 | Per-instance rate limiter on serverless | `lib/security/rate-limit.ts:24-31` | P1 |
| R6 | No error aggregation vendor; JSON lines to stdout; Telegram owner alerts | `instrumentation.ts` | P2 (cost-gated alternative: keep, add a Vercel log drain later) |
| R7 | Landing bundle: `framer-motion` static in 10 components, `leaflet` static in 3 of 4 users, zero `next/dynamic` | grep | P1 (LCP) |
| R8 | Unbounded per-worker reads (journal list/export, verified CV, privacy export, planning); caps instead of pagination (`.limit(5000)` ×6) | listed files | P2 |
| R9 | Performance advisor: 159 `auth_rls_initplan`, 218 duplicate permissive policies, 192 unindexed FKs, 97 unused indexes | advisor | P2 (mechanical, additive migrations) |
| R10 | `pilot_events` unbounded (4,080, +1,524/week), no retention | prod | P2 |
| R11 | Ledger governance: parity snapshot stale (273 vs 280); `APPLIED_LEDGER.md` opens with a 26-row correction; live gate inert | §2 | P1 |
| R12 | 191/280 migrations are RED-class by annotation; authorization lives in 424 SECDEFs; behavioural proofs exist (`scripts/db-proof`, 33 runners) but are not automated | repo | P1 |
| R13 | 68 % of unit tests are text-pinning guards (807/860 read files; 112 pin migration bytes) → refactoring applied SQL is blocked by tests that prove nothing about behaviour | `lib/guards` | P2 |
| R14 | E2E: 540 tests / 95 specs exist; CI runs 5 specs, unauthenticated only (needs `SUPABASE_TEST_URL`) | `e2e-smoke.yml:97-101` | P1 |
| R15 | Single region, single DB, no read replica; vacancy ingestion depends on GitHub Actions holding a service-role key | `vercel.json:4`; workflow | P2 / FUTURE |
| R16 | Vendor coupling: Supabase (auth, RLS, SECDEF, storage, pg_cron), Vercel, Stripe (off), Google OAuth (only provider), Gemini (one task), Postmark/Resend (unset), Telegram, self-hosted whisper.cpp (not deployed) | — | acceptable; model registry abstracts AI |

**Architecture debt (duplications).** `companies` ⇄ `organizations` mirror; six roster truths (`company_workers`, `agency_workers`, `company_memberships`, `engagement_contexts`, `organization_people`, `project_worker_assignments`); three invitation systems; four role vocabularies; seven UI demand intakes + `company_need_public_intakes` + dead `job_demands`; two "start" objects (booking→engagement vs agreements); two client models (`agency_client_connections` live, `agency_clients` unapplied); two matching engines (`match-v1` vs frozen `/match-preview`); four availability vocabularies; nine evidence vocabularies; 19 direct `profiles` readers; dead `lib/employers`, `lib/feedback`, `lib/migrations`, `lib/test`; 1,667-line company hub page with 16 parallel reads. None of this is unsafe; all of it raises the cost of every future change. Recommendation is `RETIRE` readers first, tables only after zero-row assertions, never a rewrite.

---

## 11. Test coverage by risk

| Risk | Present? | Where | Missing |
|---|---|---|---|
| Unit / logic | yes (448 behavioural files, 22,310 tests green) | `lib/**` | — |
| RLS / permission behaviour | exists, not in CI | `scripts/db-proof/*` (33 runners), `supabase/tests/*.sql` (2) | CI harness against a disposable DB; per-RPC negative-case corpus for 385 SECDEFs |
| Contract | yes (11) | AI adapters, MCP | — |
| Migration | static safety + self-test; parity live gate inert | `.github/scripts/migration-safety.mjs` | `SUPABASE_DB_URL`; drop-with-rollback proof |
| E2E | 95 specs / 540 tests; **5 in CI** | `apps/web/tests/e2e` | authenticated fixtures in CI (owner decision GOV-3) |
| Production smoke | yes | `health-probe.yml` every 15 min | authenticated smoke (one real worker journey) |
| Visual | none | — | screenshot baselines for landing + dashboard shell |
| Accessibility | weak (string guards, 2 axe mentions) | — | axe on the 6 primary routes |
| Localisation | strong (parity + ratchet) | `check:i18n-debt` | rendered-key check |
| Load / performance | none | — | one k6/autocannon run against the anon board + one authenticated journal save |
| Failure / recovery | unit-shape only | `lib/vacancy-store` timeout shape | restore drill; e-mail retry; pg_cron failure |
| Security regression | 16 files + CodeQL weekly | `lib/guards/*secdef*|*rls*|*authz*` | authorization corpus (above) |
| Provenance | partial | `journal-entry-skill-provenance.test.ts`, `compact-edit-model.test.ts` | E1–E5 have no test (chat/MCP acceptance, `selected` on `ai_extracted`, `quantity_source` on re-save, NULL provenance from RPC) |

Test count is not readiness: the suite is green while E1–E3 ship, because the suite pins text.

---

## 12. Production readiness scorecard (0–5)

Scale: 0 nothing · 1 architecture only · 2 built, unproven or unreachable · 3 works with known gaps · 4 proven with real use, minor gaps · 5 proven at scale.

| Area | Now | Target A | Evidence | Blocker | Next action |
|---|---|---|---|---|---|
| Core architecture | 4 | 4 | invariants I-1…I-10 hold; registers + product-truth enforced; duplications documented | duplications raise change cost | retire duplicate readers (`RETIRE`) |
| Worker E2E | 3 | 4 | register→journal→skills→CV→board→interest→conversation HUMAN_UI_PROVEN | orgless confirmation, e-mail delivery, provenance E1–E3 | §17 slice 1 + external confirmation |
| Employer E2E | 3 | 4 | need→match→shortlist→contact→booking→engagement proven; 1 booking | manager persona blocked; no interview; supply dead-end | role gap `FIX`; hub nav `CONNECT` |
| Staffing / recruitment E2E | 2 | 3 | bridge + offers exist (2 rows); supply declared | industry lock (ORG-2), no consent record, no placement/rotation | ORG-2 decision; consent + follow-up act |
| University / education E2E | 2 | 3 | programme+cohort exist; 0 members; outcomes k-anon live | no supervisor, placement, credential, RPL; register stale | §15 Milestone C |
| Org / team / project operations | 2 | 3 | 9 draft projects, 5 assignments, 1 approved timesheet | no requirement object, no overlap rule, decision UI split | `EXTEND` overlap warn; co-locate approvals |
| Work Journal | 4 | 4 | 62 entries, one core, one builder | E4/E5 edit-lane drift | `FIX` |
| Living CV | 4 | 4 | projection holds; EU export | no headline/bio editor; work card in chat only | `COMPLETE`/`CONNECT` |
| Evidence / provenance | 2 | 4 | schema guarantees on imports; 9 NULL links live; 3 self-confirms | E1–E3, S3 | **§17 slice 1** |
| ESCO / skills | 4 | 4 | meaning only; 28 locales; curated linkage | two ambiguous mappings unresolved | keep |
| Matching | 4 | 4 | deterministic, explainable, consent-gated | frozen second fork | retire `/match-preview` |
| Calendar / availability | 2 | 3 | projection + capacity read; 0 absences | no override receipt, alternatives, planned-vs-actual, timezone | CAL-7 first |
| Messaging / notifications | 2 | 3 | 18 messages; 8 events in-app | **no delivery channel**; no attachment upload | e-mail provider + outbox |
| Documents | 3 | 3 | full model, 1 row, signed URLs | no delete; no scan policy | `NEW` delete |
| Permissions / tenant isolation | 4 | 4 | RLS on all; K1 leak matrix passed earlier; admin guard triggers live | S1 (K2-1) open | apply #1430 |
| Security | 3 | 4 | strong plumbing; inert live gates; per-instance limiter | S8, S9, S7 | `SUPABASE_DB_URL`; DB rate limit |
| Privacy / consent | 2 | 4 | consent + disclosure ledgers, export route | **no erasure** (#856); S18 | erasure executor |
| Mobile UX | 3 (web) / 2 (app) | 3 / 2 | responsive shell; 7 app screens | admin table overflow; no store | leave app at 2 for A |
| Accessibility | 2 | 3 | basic guards | no skip link on dashboard; no axe | `FIX` skip link |
| Localisation | 3 | 3 | 5 routed at parity | 6 declared locales unfinished | keep for A |
| Reliability / recovery | 2 | 3 | probe green; pg_cron live | no PITR/drill; no retry | plan-tier decision (owner); drill |
| Observability | 2 | 3 | probe, JSON errors, Telegram | no aggregation; `pilot_events` unbounded | retention; log drain later |
| Performance / scalability | 3 | 3 | vacancy path fixed; indexes added | static heavy deps on landing; RLS initplan | `next/dynamic`; advisor migration |
| Admin / support | 3 | 3 | 22 routes; support threads | uneven audit; no erasure tool | `record_admin_action_v1` |
| Billing / entitlements | 2 (by design) | 2 | test chain live; flags off | two owner acts | none for A |
| Data lifecycle | 1 | 3 | `ai_runs` retention only | no erasure, no pilot_events retention, drift files | §17 |
| Production verification | 3 | 4 | 17 HUMAN_UI_PROVEN; probe green | 5 E2E in CI; no authenticated smoke | fixture strategy (GOV-3) |

---

## 13. Backlog — P0 / P1 / P2 / P3 / FUTURE with work class

### P0 — unsafe / integrity / cannot safely operate

| Id | Item | Class | Files | Gate |
|---|---|---|---|---|
| P0-1 | Chat/MCP journal writes: recognised skills become candidates, not `self_declared` rows, until accepted per skill (or the executor shows and confirms the list before write) | FIX | `lib/conversation/worker-executors.ts:227`, `lib/capabilities/registry.ts:635`, `lib/journal/skill-pipeline.ts:463` | none (GREEN) |
| P0-2 | Compact re-save: `selected` only for rows the person touched; untouched `ai_extracted` fragments keep their provenance | FIX | `lib/journal/compact-edit-model.ts:279-288` | none |
| P0-3 | Supersede RPC writes link provenance through the ONE writer (or stamps `recognized`/`confirmed` itself); backfill the 9 live NULL rows to a distinct value, never to `confirmed` | FIX | new migration replacing `journal_entry_supersede_v2` link insert; `lib/journal/entry-skill-link-write.ts` | RED (SECDEF replace) |
| P0-4 | Block self-confirmation in `review_journal_entry`, `confirm_entry_and_verify_skills` and the direct-insert policy; verify only entry-linked skills | FIX | `…photo_continuity_v1.sql:494-620` via new migration | **owner EVID-2** + RED |
| P0-5 | Apply K2-1: company contact columns readable by owner/members/admin only | COMPLETE | PR #1430 | **owner apply** |
| P0-6 | Erasure executor: sanctioned SECDEF RPC that detaches consent rows to a tombstone subject, deletes PII rows and the auth user in one transaction; wired behind the existing reviewed request | NEW | `lib/privacy/deletion-plan.ts` → executor; new migration per `docs/legal/deletion-process-design-v1.md` E1–E8 | RED + LEG |

### P1 — blocks a real persona's core journey

| Id | Item | Class | Files |
|---|---|---|---|
| P1-1 | E-mail delivery: set app-level provider (owner key), add an outbox drain with retry/idempotency for `notification_events`, schedule it (pg_cron or Vercel cron) | CONNECT + EXTEND | `lib/email/transactional.ts`, `lib/notifications/email-dispatch.ts`, new cron |
| P1-2 | Employer manager persona: membership acceptance (or `requireRoleOrRedirect`) recognises an active `company_memberships` row as proof; `getOwnedCompanyById` admits `manager` | FIX | `lib/auth/require-role.ts`, `lib/company/company-setup.ts:262-275`, `membership_accept_v1` |
| P1-3 | Workers without an organisation can get evidence confirmed: enable `external_confirmation` (invite an outside confirmer) instead of `preparing` | COMPLETE | `lib/config/feature-availability.ts:198`, `lib/invitations/*`, profile `#capabilities` |
| P1-4 | Reject/Correct carry an optional reason; write a `learning_signals` row; consume in the review queue | NEW + CONNECT | `lib/journal/skill-pipeline-actions.ts:547-630`, `lib/learning/*` |
| P1-5 | `quantity_source` carried on re-save; full composer reads `editingEntry.activities` | FIX / COMPLETE | `compact-edit-model.ts:306`, `journal-entry-composer.tsx` |
| P1-6 | Provenance vocabulary: additive CHECK value for deterministic machine output (e.g. `system_derived`), pipeline stamps it; `ai_extracted` reserved for AI | EXTEND | `0013` CHECK via new migration; `skill-pipeline.ts:531-656`, `intake-work-time.ts` |
| P1-7 | Arm the live CI gates: read-only `SUPABASE_DB_URL` secret (owner); refresh parity snapshot; resolve #1222 (apply the four with live UI, archive the rest, delete the never-apply duplicate) | CONNECT / COMPLETE | `quality.yml:167-202`, `supabase/migrations` |
| P1-8 | RLS/SECDEF behavioural proofs in CI against a disposable database; authenticated E2E fixtures (GOV-3 owner decision) | CONNECT | `.github/workflows`, `scripts/db-proof/*` |
| P1-9 | Backup posture: plan-tier decision (owner, cost), restore runbook, one drill | POL + NEW | `docs/runbooks` |
| P1-10 | Shared-state rate limit (Postgres table) for anon writes, CV extract, auth failures | NEW | `lib/security/rate-limit.ts` |
| P1-11 | Journal visibility: per-entry disclosure choice (default: employer context readable, personal private) and field-level projection for managers | EXTEND | `journal_entries_select` (new policy), `lib/journal/review-queue.ts` |
| P1-12 | Team management mounted on the company hub; stale `preparing` catalogue entries corrected; hub in primary nav | CONNECT / FIX | `app/[locale]/dashboard/company/page.tsx`, `lib/config/feature-availability.ts:206-221`, `lib/config/navigation.ts` |
| P1-13 | Timesheet decision co-located with the timesheet | COMPLETE | `planning/timesheets-section.tsx` ← `lib/approvals/*` |
| P1-14 | Supply discovery follow-up act (consented contact request employer→supplying org) | COMPLETE | `components/app/available-supply-section.tsx`, `lib/supply/*` |
| P1-15 | Recruitment organisations: gate candidate offers on `organization_roles` (`workforce_provider`/`recruitment_partner`) instead of the industry enum | CONNECT | `submit_agency_candidate_offer_v1` (RED), `lib/agency/bridge-actions.ts` — **owner ORG-2** |
| P1-16 | Explicit worker representation consent + disclosure ledger entry on each candidate offer | EXTEND | `lib/privacy/partner-supply-actions.ts`, offer RPC |
| P1-17 | Assignment-time overlap warning (never block) with an explicit override object and receipt (CAL-7) | EXTEND + NEW | `lib/projects/actions.ts`, `lib/workforce/capacity-model.ts`, new `schedule_overrides` |
| P1-18 | Institution: reachable review enablement for learner contexts; cohort/programme archive writers; supervisor confirmer role; training register admits `student` contexts | CONNECT / COMPLETE / EXTEND | `institution-learners-section.tsx`, new RPCs (RED), `20260602130000` CHECK |
| P1-19 | Institution ↔ employer placement object that does not grant employer view | NEW | new migration + `lib/education/` |
| P1-20 | Register truth fixes: EDU-2/EDU-6/J-INSTITUTION-OUTCOME (update RPC exists), EDU-4/SKL-10 surfaces, J-AGENCY-SUPPLY "supply meets need" (person-matching evidence), DEM-4 scheduler (exists) | FIX | `capability-register.ts`, `journey-register.ts` |
| P1-21 | Dashboard skip link / `<main id>` | FIX | `components/app/dashboard-chrome.tsx:128,145` |
| P1-22 | Landing bundle: `next/dynamic` for `framer-motion`/`leaflet` users | FIX | `components/marketing/*`, `components/app/market-map/*` |
| P1-23 | Subject right of refusal on imported records (EVID-7) and experience reply policy (EVID-6) | COMPLETE | PRs #1646, #1641 — **owner apply** |

### P2 — materially reduces usefulness / adoption / automation

Interview/scheduling object (P2 for pilot, P1 for Milestone B); post-`accepted` lifecycle (start/end/outcome → experience record); agreements surface; message attachment upload; participant revocation action; disclosure/booking expiry scheduler; document delete; `pilot_events` retention; privacy requests out of `customer_requests`; unify availability vocabularies + per-person daily cap; admin audit completeness (`record_admin_action_v1`); invitation e-mail binding (S6); consolidate seven demand intakes; retire dead agency stack / `job_demands` / `companies` readers; shortlist scoped to organisation; project role requirement object; saved searches/alerts (DEM-8); org-evidence dispute writer; `manager_corrected` lane; credentials→skills link and `confirmed_by_manager` writer; `worker_education` ↔ `education_programs` link; outcomes per programme + CSV; advisor-driven index/initplan migrations; client-side fetch timeouts; entitlement gating breadth; admin sub-route registry entries; admin market table overflow; assistant transcript persistence (PR #883, owner).

### P3 — optimisation / polish

Reject leaves `worker_skills` row; unify nine evidence vocabularies behind one module; convert 112 migration-byte guards to hash pins; dead `lib/` dirs; 19 orphan pages (connect or retire); N+1 loops in server actions; two mutable-search_path trigger functions; constant-time `CRON_SECRET`; min password 12 + leaked-password protection (owner setting); `ai_runs` delink (#1266); retire `workers.trust_score`; employer month view; `fi` route or drop pack; docs weight (296 MB).

### FUTURE — strategically valuable, not required for first complete production

RPL v1 (assessment record, assessor org, equivalence feeding `hasRecognizedEquivalence`); team/brigade as a match and assignment unit (WRK-6, DEM-6); shifts/rotas/utilisation/planned-vs-actual → learned durations (CAL-8..10); mentoring relationship and later-life participation surfaces; lifecycle vocabulary (intern, apprentice, graduate, mentor); invoices from the journal; LMC spend reversal; live payments (owner G-7/G-8); housing/accommodation; automation engine; queue/worker tier, read replica, second region; 6 declared locales to parity + RTL; mobile inbox/push/camera/store; realtime messaging; SMS; impersonation; minor/guardian model (owner + legal only).

---

## 14. Dependency graph

```
OWNER GATES (async, request once)          CODE (no gate)                         CODE (RED, needs gate after review)
  G-A apply #1430 (K2-1) ─────────────┐     P0-1 chat/MCP acceptance ┐
  G-B EVID-2 decision ────────────────┼──►  P0-2 compact selected     ├─► P1-5 quantity_source ─► P1-6 vocabulary ─► P1-4 reason+learning
  G-C SUPABASE_DB_URL secret ─────────┤     P1-20 register truth      ┘                              │
  G-D e-mail provider key ────────────┤                                                              ▼
  G-E plan tier (PITR) ───────────────┤     P1-2 manager role ─► P1-12 hub nav/team ─► P1-13 approvals ─► P1-17 overlap+override
  G-F ORG-2 (industry lock) ──────────┤                                                              │
  G-G GOV-3 E2E fixtures ─────────────┤     P1-10 DB rate limit      P1-22 bundle     P1-21 skip link   ▼
  G-H apply #1646/#1641 (EVID-6/7) ───┤                                                     P2 interview object ─► B
                                      │     P0-3 supersede provenance (RED) ◄── needs G-C for parity proof
                                      ├──►  P0-4 self-confirm block (RED) ◄── G-B
                                      ├──►  P0-6 erasure executor (RED) ◄── legal review of tombstone design
                                      ├──►  P1-1 e-mail outbox ◄── G-D           P1-3 external confirmation ◄── P1-1 (invite mail)
                                      ├──►  P1-7 parity + #1222 ◄── G-C          P1-8 RLS proofs in CI ◄── G-C, G-G
                                      ├──►  P1-9 restore drill ◄── G-E
                                      └──►  P1-15/16 recruitment + consent ◄── G-F ─► P1-14 supply follow-up
                                            P1-18 institution writers (RED) ─► P1-19 placement object ─► C
```

Parallel lanes with no shared table or module: **(1) evidence provenance** (`lib/journal`, `lib/conversation/worker-executors`, `lib/capabilities`), **(2) organisation/employer** (`lib/auth/require-role`, `lib/company`, hub page), **(3) communications** (`lib/email`, `lib/notifications`, cron), **(4) privacy/erasure** (`lib/privacy`, one migration), **(5) governance/CI** (`.github`, `scripts`), **(6) education** (`lib/education`, institution components). Lanes 1 and 6 share only `journal_entries_select` if P1-11 is pulled forward; keep P1-11 in lane 1.

---

## 15. Milestone plan A → D

### Milestone A — SAFE PILOT (real workers + employers under controlled operations)

**Deliverables:** P0-1…P0-6; P1-1, P1-2, P1-3, P1-5, P1-7, P1-9, P1-10, P1-12, P1-20, P1-21; pilot-operations runbook (who invites, who confirms, how a deletion request is executed, how an incident is handled); one authenticated production smoke (a real worker journey) in the health workflow.
**Dependencies:** owner gates G-A…G-E; legal review of the erasure tombstone design.
**Acceptance tests:** (a) a chat-logged entry produces skill *candidates*, and `worker_skills` gains a row only after acceptance; (b) a compact re-save that changes only the site name changes no provenance (extend the #1719 walk); (c) `journal_entry_skills` has zero NULL provenance after backfill and none can be created; (d) a self-confirmation is refused at the RPC; (e) a non-owner member opens `/dashboard/company`; (f) an employer's interest produces an e-mail in a real inbox; (g) an erasure request removes `auth.users`, `profiles`, `workers` and PII children while the consent ledger survives de-identified; (h) `pnpm quality` runs the live parity and allowlist gates and they pass; (i) a restore from backup into a scratch project is drilled once.
**Production proof required:** each acceptance test walked once on production by a human with a second identity where needed (G-1 style), recorded under `docs/evidence/`.
**Human acceptance required:** owner decisions EVID-2, K2-1 apply, e-mail provider, plan tier, `SUPABASE_DB_URL`; legal sign-off on the erasure design; owner walk of (a), (e), (f).
**Risks:** RED migrations wait on the owner; the erasure design touches the consent ledger (irreversible if wrong → drill on a branch first); e-mail from a new domain may bounce.
**Effort:** 24–34 engineer-days (see §16).

### Milestone B — COMPLETE WORKFORCE PRODUCT (worker + employer + staffing org end-to-end)

**Deliverables:** interview/scheduling object with calendar write path; post-`accepted` lifecycle (start/end/outcome → experience record) and agreements surface; assignment overlap warning + override object + receipt (P1-17, CAL-7); supply discovery follow-up act (P1-14); recruitment via `organization_roles` (P1-15, after ORG-2) and explicit representation consent (P1-16); agency compliance/readiness surface, rotation/replacement, placement reporting; timesheet decision co-location (P1-13); demand intake consolidation; retire dead agency stack, `job_demands`, `companies` readers; message attachment upload, participant revocation, expiry schedulers; document delete; journal visibility choice (P1-11); reject-reason + learning consumer (P1-4, P1-6); RLS proofs + authenticated E2E in CI (P1-8); advisor-driven index/initplan migrations; `pilot_events` retention; landing bundle (P1-22).
**Dependencies:** A complete; G-F, G-G, G-H.
**Acceptance tests:** a staffing org onboards a worker with recorded consent, offers them to a client, the client books, an overlap is warned and overridden with a receipt, the work is journaled, confirmed by a non-self manager, and appears as an experience record the worker can answer; an employer manager (non-owner) completes need→shortlist→interview→booking without the owner; all RLS proofs green in CI on every PR.
**Production proof:** the staffing chain walked once with three real identities; booking→engagement→confirmation with ≥1 non-test organisation.
**Human acceptance:** ORG-2 decision; two owner walks.
**Risks:** interview/calendar object is the largest `NEW` item and tempts scope; duplication retirement can break byte-pinned guards (convert to hash pins first).
**Effort:** 70–100 engineer-days.

### Milestone C — EDUCATION / UNIVERSITY COMPLETE

**Deliverables:** P1-18 (review enablement for learner contexts, cohort/programme archive, supervisor confirmer role, training register admits learners); P1-19 placement object; outcomes per programme/cohort + CSV; credential record with issuer (institution-issued vs self-declared) and credential→skill/ESCO link; `worker_education` ↔ `education_programs` link; learning paths beyond copy (gap → programme suggestion using the existing demand-per-profession read); RPL v1 (assessment record, assessor organisation, equivalence feeding the requirement ledger) with `verification_provider` owner-granted; `/dashboard/learning` connected or retired; age/guardian **policy** decision recorded (no data collection until then).
**Dependencies:** A; B's confirmation and consent pieces; legal review for minors.
**Acceptance tests:** institution creates programme+cohort, invites a learner, learner accepts, learner journals practice, supervisor confirms with `confirmer_role=supervisor`, institution places the learner with an employer without the employer gaining profile view, employer confirms the placement outcome, the learner's CV shows institution-attested practice and an issued credential, an RPL assessment converts demonstrated capability into recognised equivalence on the requirement ledger, outcomes export downloads with k≥5.
**Production proof:** one real institution walk with three identities.
**Human acceptance:** owner walk; legal decision on age/guardian boundary; RPL assessor governance.
**Risks:** supervisor role changes a CHECK constraint on live confirmations (RED); RPL is genuinely new domain logic.
**Effort:** 45–65 engineer-days (+ legal).

### Milestone D — LIFELONG LABOUR-MARKET OS

**Deliverables:** CAL-8..10 (shifts/rotas, utilisation, planned-vs-actual → learned durations labelled as forecast); team/brigade unit for offer, match and assignment (WRK-6, DEM-6); mentoring relationship and later-life surfaces; lifecycle vocabulary; saved searches/alerts; assistant transcript persistence; nine evidence vocabularies unified; invoices from the journal; LMC reversal and live payments (owner); queue/worker tier off GitHub Actions; read replica; 6 declared locales to parity; mobile inbox/push/camera/store.
**Dependencies:** A–C.
**Acceptance:** one person holds student, employee, freelancer and mentor contexts simultaneously with one journal and one CV; a brigade is offered, matched and assigned as a unit; a forecast improves from captured actuals and is labelled forecast; a job survives a Vercel and a GitHub Actions outage.
**Effort:** 140–220 engineer-days.

---

## 16. Time estimates under three execution models

Basis: measured repository velocity (50 merged slices in 9 days by one continuous agent with owner review; slices of 0.5–2 engineer-days), the fact that 68 % of migrations are RED and wait on the owner, and that every milestone ends with a human production walk. Estimates are engineer-days of work (D) and elapsed weeks (W). No calendar dates: elapsed time depends on owner-gate latency, which the evidence cannot predict.

| Milestone | Work (D) best / expected / risk-adjusted | Model 1: single agent + owner acceptance (W) | Model 2: 3–4 parallel agent lanes, strict ownership (W) | Model 3: small team (2 eng + 1 product/QA + security ¼) (W) |
|---|---|---|---|---|
| A — Safe pilot | 24 / 30 / 38 | 3 / 4 / 6 | 1.5 / 2 / 3 | 2 / 3 / 4 |
| B — Workforce complete | 70 / 85 / 110 | 8 / 11 / 15 | 3.5 / 5 / 7 | 5 / 7 / 9 |
| C — Education complete | 45 / 55 / 72 | 5 / 7 / 10 | 2.5 / 3.5 / 5 | 3.5 / 5 / 7 |
| D — Lifelong OS | 140 / 180 / 230 | 16 / 22 / 30 | 7 / 10 / 14 | 10 / 14 / 19 |
| **Cumulative A→D** | **279 / 350 / 450** | **32 / 44 / 61** | **14.5 / 20.5 / 29** | **20.5 / 29 / 39** |

Assumptions: Model 1 throughput ≈ 1.4 D per elapsed day minus gate waits (observed); Model 2 ≈ 3.2 D/day across lanes with 25 % integration and register-conflict overhead (observed: register conflicts already caused a `DIRTY` auto-merge in September); Model 3 ≈ 2.2 D/day with higher review quality and lower rework, plus onboarding cost of 1–2 weeks absorbed in A. Risk-adjusted adds 25–30 % for RED migrations, owner latency and production-walk rework (the #1716→#1719 walk failure is the reference case: a green suite, a failed walk, one more slice).

Owner time is the binding constraint in every model: roughly 12 decisions/applies and 6 production walks across A–C.

---

## 17. Scale readiness — 10 / 100 / 1,000 / 10,000+ active users

| Users | Software | Legal / policy | Support / operations | Sales / data / third-party |
|---|---|---|---|---|
| **10** | Holds now. Blockers are the four P0s (integrity, erasure, K2-1, self-confirm), not capacity. | Erasure path and privacy notice for real users; minors boundary stays closed. | Owner is support; runbook for deletion requests and confirmations. | None. |
| **100** | Holds after A. Per-instance rate limiter, no e-mail retry, unbounded per-worker exports become visible. | DPA/terms check on the Gemini grant (LEG); retention policy for `pilot_events`. | Support inbox exists; needs assignment/status; admin audit completeness. | E-mail sender reputation; Google-only social auth limits acquisition. |
| **1,000** | Needs B's outbox, shared rate limit, RLS proofs in CI, advisor index/initplan migrations, PITR and drill; GitHub-Actions ingestion with a service-role key becomes a custody risk. | Employer access to worker data needs the per-entry visibility choice (S18); institution data access needs supervisor role semantics. | A second admin; impersonation-free support tooling; SLA on confirmations. | Vacancy sources beyond Sweden; ESCO/label prune (235 MB) for cost. |
| **10,000+** | Not as built: no queue/worker tier, single region/DB, caps instead of pagination, static heavy deps on landing, no load test. Requires D's infrastructure items. | Cross-border processing map per jurisdiction; sector-specific compliance for staffing. | Dedicated support and trust/safety function. | Paid infrastructure tier, provider contracts — **OWNER APPROVAL REQUIRED**. |

---

## 18. Cost / owner-gate table

Every item below is achievable on current plan-included resources unless marked. No new paid service, API route, subscription or Claude usage class is required for Milestone A.

| Gate | What | Cost | Zero/low-cost alternative |
|---|---|---|---|
| G-A | Approve and apply PR #1430 (K2-1) | none | — |
| G-B | Decide EVID-2 (block self-confirmation; sole traders get "self-confirmed" tier, never "verified") | none | — |
| G-C | Add read-only `SUPABASE_DB_URL` GitHub secret (SELECT-only role) | none | — |
| G-D | App-level e-mail provider key (`INVITE_EMAIL_PROVIDER/API_KEY/FROM`) | Resend is already the Auth SMTP provider; free tier covers pilot volume — **confirm tier** | `log` provider + in-app only (current); blocks P1-1 |
| G-E | Supabase plan tier for PITR | **OWNER APPROVAL REQUIRED** (paid) | Free plan daily backups + a scripted restore drill into a scratch project (free) |
| G-F | ORG-2: capability roles replace the `staffing_agency` industry lock | none | keep lock; recruitment persona stays NO |
| G-G | GOV-3: authenticated E2E fixture project (`SUPABASE_TEST_URL`) | free-tier Supabase project or branch | keep E2E local-only |
| G-H | Approve/apply #1646, #1641 (EVID-6/7), and the four live-UI drift migrations from #1222 | none | — |
| G-I | Gemini grant: confirm the key's tier and terms (DPA) for `propose_conversation_intent`; lifetime ≈ $0.045 | already owner-approved 2026-09-05; **LEG review of terms** | disable the grant; deterministic router only |
| G-J | Supabase Auth: enable leaked-password protection, OTP expiry ≤ 1 h | none | — |
| G-K | Legal: erasure tombstone design; minors/guardian boundary; employer journal visibility default | external review time | ship erasure with the documented design; keep minors closed |
| G-L | Live payments (G-7/G-8) | Stripe live — **OWNER APPROVAL REQUIRED**, FUTURE | stay in test mode |
| — | Error aggregation vendor | **OWNER APPROVAL REQUIRED** | keep JSON lines + Telegram; add Vercel log drain when a free destination exists |

Claude execution stays plan-included: this audit and the recommended slice are ordinary sessions; no API/pay-as-you-go path is proposed.

---

## 19. Top 20 highest-leverage actions

1. **FIX** chat/MCP skill auto-add → candidates until accepted (P0-1). Protects the one asset in real use.
2. **FIX** compact re-save `selected` on untouched `ai_extracted` rows (P0-2).
3. **FIX** supersede RPC link provenance + backfill 9 NULL rows (P0-3, RED).
4. **FIX** self-confirmation block + entry-scoped verification (P0-4, owner EVID-2).
5. **COMPLETE** apply K2-1 (P0-5, owner).
6. **NEW** erasure executor per the existing design (P0-6, RED + legal).
7. **CONNECT** e-mail provider + outbox drain with retry (P1-1). Turns every cross-actor handoff on.
8. **FIX** employer-manager role gap (P1-2). Unblocks persona #5 with two small edits.
9. **COMPLETE** external confirmation for orgless workers (P1-3). Unblocks the majority of real workers.
10. **CONNECT** `SUPABASE_DB_URL` → live parity + allowlist gates; resolve #1222 (P1-7).
11. **CONNECT** team management on the hub, correct `preparing` catalogue, hub in nav (P1-12).
12. **FIX** `quantity_source` on re-save; composer reads persisted activities (P1-5).
13. **EXTEND** provenance vocabulary with a deterministic value (P1-6).
14. **NEW/CONNECT** reject reason + `learning_signals` writer + queue consumer (P1-4).
15. **CONNECT** RLS proofs and authenticated E2E in CI (P1-8, owner GOV-3).
16. **NEW** restore drill + runbook (P1-9).
17. **NEW** shared-state rate limit (P1-10).
18. **EXTEND** assignment overlap warning + override receipt (P1-17, CAL-7). First real "time freedom" link.
19. **COMPLETE** supply-discovery follow-up act + recruitment via roles + representation consent (P1-14/15/16).
20. **FIX** register truth (P1-20) and dashboard skip link (P1-21) — half a day, keeps the honesty machinery honest.

---

## 20. Exact recommended NEXT EXECUTION SLICE

**Slice name:** `fix(evidence): provenance integrity — machine inference never becomes a declaration`
**Class:** GREEN (code only; the RED half is split out), CONNECT/FIX, lane 1 only.
**Scope (exact):**
1. `lib/conversation/worker-executors.ts` and `lib/capabilities/registry.ts` (`journal.confirm`): recognised skills are written as candidates (`skill_candidate_clarifications` / pending markers) and surfaced for Accept/Reject; `worker_skills` gains a row only through an explicit accept. The chat reply names the candidates.
2. `lib/journal/compact-edit-model.ts`: `selected` is true only for rows the person touched or created; untouched persisted fragments keep their `source` and are not sent as `p_selected_slugs`.
3. `lib/journal/compact-edit-model.ts` and `components/app/journal-entry-composer.tsx`: carry `quantity_source` on re-save; composer preloads `editingEntry.activities` instead of re-parsing.
4. Tests: three behavioural tests (chat write produces zero `self_declared` rows; compact re-save changes zero provenance rows; re-save preserves `quantity_source`), each with a negative control that fails on the pre-change tree — the repository's established pattern.
5. Register: P1-20 truth corrections (EDU-2/EDU-6/J-INSTITUTION-OUTCOME, EDU-4, SKL-10, J-AGENCY-SUPPLY wording, DEM-4 scheduler note).
**Explicitly out of scope:** the supersede RPC migration (P0-3), the self-confirmation migration (P0-4), erasure (P0-6) — each is a separate RED draft to be opened after this slice, so the owner gate batch (G-A…G-E, G-H) can be requested **now, in parallel**, and none of them blocks this slice.
**Acceptance:** the three tests green; the #1719 production walk repeated by a human (compact re-save of a site name moves 0 hours between provenance labels); `product-truth.mjs` prints the corrected journey states.
**Estimated effort:** 4–6 engineer-days; one PR; auto-merge eligible under the GREEN envelope.
**Why this first:** it is the highest-integrity defect on the only part of the product in sustained real use, it needs no owner action, no spend and no new infrastructure, and every later milestone (confirmation, matching, education outcomes, RPL) is built on the provenance this slice repairs.

---

## 21. Reconciliation with the owner's HUMAN_ACCEPTANCE walk of #1689 (2026-09-13) — defects A–K

The owner walked the deployed Work Intelligence journey (#1689) on production and returned eleven HUMAN_ACCEPTANCE defects. They are reconciled here, in the same audit, as **production defects of the one journey in real use** — not as a new roadmap. Ranking is by end-to-end user value on the loop RECORD REAL WORK → SEE IT SAVED → SEE HOURS → SEE HOURS/SHARE BY SKILL → SEE WHAT DOMINATES → SEE EVIDENCE → SEE THE LIVING CV UPDATE → SEE GROWTH → SEE RELEVANT OPPORTUNITIES AND WHY. Branch: `claude/labourmarket-product-audit-iwjyy0` (PR #1724). "FIXED" means fixed in that branch with tests and a negative control; nothing below is HUMAN_UI_PROVEN until a human walks production (`HUMAN_UI_PROVEN = NO`).

### 21.1 Defects, root causes, fixes

| # | Owner saw | Root cause (repository evidence) | Fix in branch | Status |
|---|---|---|---|---|
| **A** | The Work Journal does not visibly behave as a serious hour-based professional record | Hours were a side figure of a list; the reader silently capped at PostgREST `max_rows` 1000; the diary's day key and the model's day key were computed differently; the chat's "recent" path re-parsed durations instead of reading the model; no per-skill first/last day; no MCP capability exposed the reading | Lane B `9a6c454`: paged reads with `coverage {entriesRead, truncated}` on the model, the CV names the window when truncated; diary day = `resolveWorkDayDetail(...).day`; chat reads the model's own range row; `SkillWorkTime.firstWorkedDay` / `contextIds`; counted-once in planning and timesheets; `journal.work_intelligence.get` capability | FIXED (reader + model); the *visible* recording flow is lane F (§21.3) |
| **B** | 25.6 recorded hours exist but hours/share per skill are absent | The CV and profile never read `WorkIntelligence.skills`; the journal block showed totals, not the per-skill share | Lane A `4413ca7`: `presentSkills` renders hours · share · entries per skill from `skillPracticeFromIntelligence` on `/cv` and `/dashboard/profile`; lane B exposes share/first/last/contexts | FIXED on CV/profile; Work in Numbers station = lane F |
| **C** | Skills are an unweighted tag cloud | Chips carried no magnitude; tier order was by list, not evidence strength | Lane A: magnitude bands major / supported / trace / none / **unknown** (journal unreadable ≠ zero); order confirmed → work-supported → declared → self-stated, then hours, then entries; chip weight follows magnitude | FIXED |
| **D** | Duplicate / case variants ("Programavimas" / "programavimas") | The CV printed `normalized_label` beside the catalogue name; nothing folded a claim into the slug it already is | Lane A `skill-presentation.ts`: claims fold into held slugs by folded name (`foldText`) or lexicon mapping; case/diacritic variants fold into one item that names its variants; **no row is deleted** (non-destructive) | FIXED |
| **E** | Professional description is keyword-like | Only the person's own `profile_text` rendered; no deterministic facts | Lane A `4ef4cac` `professional-summary.ts`: facts under (never in place of) the person's words — all-time hours, approved part, entries, span, places, top skills by share, outputs in recorded units; unreadable journal → nothing | FIXED |
| **F** | Work history is semantically thin | `engagement_contexts` read only `title/relationship/dates` | Lane A: reads `description`, `operations_role`, `project_id` (+ project name, tolerant) and joins the journal's per-context hours / approved hours / entries (`unknown` kept apart from `none`) | FIXED |
| **G** | A saved photo cannot be retrieved conversationally | No intent for "show the photo I uploaded"; the file-subject rule read the sentence as a new deposit | Lane C `66a64e6`: `evidence-photos` intent (18 phrases measured), `readRecentPhotosForChat` over `getPersonalGallery()` (same rows, signed URLs), `chat-photo-strip`, readback-form blanking in `file-subject.ts` | FIXED |
| **H** | Weak / unrelated retrieved vacancies are labelled "Man tinkantys darbai" | `external-vacancies.ts` fetched the 20 newest ads unfiltered; the action dropped `MatchStatus`; the panel title was static | Lane D `86caeec`: `deriveFitBand` (strong / possible / missing_requirement / conflict / **not_assessed**), rows carry band + why codes, result grouped by band with WHY, discovery-only heading; profile pool read first. Panel chrome title + the destination page = lanes E/G (§21.3) | FIXED (result); destination in progress |
| **I** | A suspicious salary (150–500 EUR/month) flows into the printable CV without warning | `workers.salary_*_eur` is monthly everywhere (CV prints "EUR/mėn.", matching compares monthly) but the editor labelled the inputs "Tarifas nuo (€)" — a rate of nothing | Lane A `4ef4cac`: editor labels say €/mėn.; `work-card-plausibility.ts` (below monthly floor / reads annual / start date past / far / unavailable-with-date) — warn, never corrupt: no figure changes, no save blocks, "keep as is" or "correct"; sentence beside the editor and on the CV screen, never on the printout | FIXED |
| **J** | Work-context selector is confusing / duplicated ("Darbuotojas — Darbuotojas") | `worklog-engagements.ts` used the relationship as the base when no org/title existed, and the journal page composed its own label | Lane C `engagement-label.ts`: one composer for both surfaces; base = relationship ⇒ no "X — X"; two rows at one org stay distinct | FIXED |
| **K** | Dashboard / chat / CV / jobs do not behave as one premium product | Composition, not data: the worker's home is a chat column with results stacked as cards, persistent content lives in a catch-all sheet, the journal page is one 1,662-line scroll, opportunities are an overlay, there is no Work in Numbers destination | `docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md` (target IA; KEEP / REDESIGN / MERGE / REPLACE / REMOVE per surface). Lane E `a94f2b1`: worker `/dashboard` = ŠIANDIEN (header · one next action from the work-card engine · today / last 7 days from the reader · open items · one growth sentence · band counts · PAKLAUSK door · stations), 3-tab worker bar on `BottomNav`, intro card replaced, quick-nav off the worker root, panel title follows discovery state, dead `jobsCard` copy removed. Lane F `c4a0dea`: `/dashboard/journal/numbers` station (dominant-skill sentence first, period links with the scope in words, coverage, share bars with hours · % · entries · first/last · contexts · outputs · approved share · trend, remainder + provenance, organization ledger beside, checks, growth kinds), compact recorder first on the journal page, shared `work-in-numbers/*` components. Lane G `18815a0`: `/dashboard/opportunities` = PASAULIS (assessed-against line, retrieved vs shown, bands STRONG → POSSIBLE → MISSING REQUIREMENT → CONFLICT → NOT ASSESSED with WHY per row), chat result = one band-count sentence + ≤3 rows + link. Lane H `6ce09a9`/`209e4d0`: company roster block = N × `loadWorkIntelligence` as the manager (bounded 12), import-provenance guard (28 pins), mobile today/profile via `journal.work_intelligence.get` | MERGED (head `67b9d1b`); HUMAN_UI_PROVEN = NO |

Data safety across all of the above: no migration, no RLS change, no auth change, no new AI call, no destructive write; every new figure comes from `loadWorkIntelligence` / `buildVerifiedCv` / `worker-opportunities-actions` / `getPersonalGallery` — no second ledger.

### 21.2 What this changes in the ranking

The 2026-09-12 ranking (§13, §19) put provenance integrity (P0-2) first because it is the highest-integrity defect. The owner's walk shows that the *visible* journey is what a real user judges, and that the same journal train is where every defect A–K sits. The two are not in conflict: A–J are fixed additively in this branch without touching the provenance write paths, and P0-2 stays the next integrity slice. The re-ranked remaining gaps by end-to-end value:

1. **K — one premium worker experience** (merged, lanes E/F/G/H; not yet human-walked): without the human walk, A–J remain correct data shown through a composition nobody has accepted.
2. **P0-2 provenance integrity** (§20): unchanged, next integrity slice; it needs no owner action.
3. **P0-4 / EVID-2 self-confirmation** and **P0-3 supersede RPC** — owner-gated migrations (§18 G-A…G-E) that the confirmation share shown in Work in Numbers depends on for its honesty.
4. **P1 manager persona** (`membership_accept_v1` does not write `profile_roles`) — blocks the organization side from seeing the same reader (lane H builds the block; the persona gate stays).
5. **K2-1 company contact exposure** (PR #1430, RED) — unchanged.

### 21.3 Consolidated next slice and owner-gate batch

**Next slice:** the human walk of the loop on production with the owner's own sentences ("8h total: 5h formwork, 2h rebar, 1h cleanup" → "Kiek šiandien?" / "Kiek šią savaitę?" / "Kam skyriau daugiausia laiko?" / "Kokius įgūdžius naudoju daugiausiai?" / "Kur mano veikla auga?"; upload a photo → "Parodyk ką tik įkeltą darbo nuotrauką."; "Ieškau naujo darbo."; open the Living CV). Acceptance = the coherent journey works and the same figures appear on ŠIANDIEN, Work in Numbers, the CV and the chat.

**Owner-gate batch (unchanged, request in parallel):** G-A supersede RPC migration (P0-3), G-B self-confirmation policy (EVID-2 / P0-4), G-C erasure path (#856 / P0-6), G-D K2-1 contact columns (PR #1430), G-E Supabase auth settings (leaked-password protection), plus the Gemini cost-basis confirmation. None blocks the next slice.

---

### Appendix A — Register and prior-audit corrections recorded by this audit

| Claim | Where | Reality |
|---|---|---|
| "no update function for programmes" | `capability-register.ts` EDU-2/EDU-6, `journey-register.ts` J-INSTITUTION-OUTCOME | `update_education_program_v1` applied (ledger `20260909105602`) |
| EDU-4 surface `/dashboard`; SKL-10 surface `/dashboard/company` | register | `/dashboard/profile` and `/dashboard/documents` |
| "Supply meets a real need — LIVE (DEM-5)" | J-AGENCY-SUPPLY | evidence is person-matching; organisational supply has no match or follow-up act |
| DEM-4 "missing scheduler" | register | GitHub Actions cadence 3×/day exists (gated by a repo variable) |
| P0-1 health flap (09-02/09-03) | prior audits | fixed 09-03; 30/30 probes green |
| "#1436 org binding unapplied" | PR list | `accept_invitation_binds_org_membership_v1` applied (`20260908143925`); PR superseded |
| Admin privilege escalation risk (conditional) | security pass | guard triggers present and enabled in production |

### Appendix B — Session safety

Read-only SQL only (`select` over `pg_*`, `information_schema`, counts and small samples). No migration applied, no PR touched, no CI or deployment cancelled, no data changed, no paid service activated. Production HTTP was not reachable from the session and was not attempted after the first refusal.
