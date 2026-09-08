# FULL PRODUCT VISION AUDIT — LabourMarket.ai

> **Continued 2026-09-03:** [`FULL_PRODUCT_VISION_AUDIT_2026-09-03.md`](FULL_PRODUCT_VISION_AUDIT_2026-09-03.md)
> re-verifies ground truth at `b9db4431`, adds the domains not indexed here
> (services marketplace, housing, documents engine, invoicing, automation,
> SEO/AEO, admin/observability, Telegram, Agentai OS boundary), re-normalises
> the coverage table to the brief's 20 domains and adds the fourth score
> (`FULL_CANONICAL_VISION_PROD_VERIFIED` 24%). This file stays the evidence base.
>
> **Date:** 2026-09-02 · **Class:** additive audit layer, ABOVE the launch-readiness
> register. This file does **not** restate or revise
> [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md);
> that register keeps its own meaning and authority for *launch* readiness.
>
> **Yardstick (binding):** [`docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`](../product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md)
> §1–§19 + [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) + the owner's full-vision
> audit brief. The question answered here is **"what must LabourMarket.ai finally
> become"**, not "what did the current code choose to implement".
>
> **Method:** repo + production + Supabase project `gorgitwvdzxbnaxhrsrw` + live
> browser probes. No capability is credited from documentation or a roadmap.
> Anything not provable is marked `UNKNOWN` / `PLANNED` / `MISSING`.

---

## 0. Ground truth (verified at audit time)

| Fact | Value | How verified |
|---|---|---|
| Canonical repository | `bandymuks1-stack/labourmarketai` | `git remote get-url origin` |
| Canonical root | `C:\Users\Mano\Documents\labourmarketai` | `git rev-parse --show-toplevel` (matches the path guard) |
| `main` SHA | `c252fae8` — *docs(launch): RESUME_CHECKPOINT 2026-09-02 (#1444)* | `git log origin/main -1` |
| Production SHA | `c252fae8` | Vercel build log (`Commit: c252fae`) **and** `/api/health` `build:"c252fae8"` |
| main == production | **YES** — no drift | both above |
| Production region | `dub1` | `/api/health` |
| Production health | **FLAPPING RED** — see finding **P0-1** | 4 live probes: 503, 503, 200, 200 |
| Open PRs | 20 (19 draft, 1 ready) — 12 carry `needs-human-gate` | `gh pr list` |
| Working tree | clean except untracked `docs/audits/evidence/ru-landing-localization/` | `git status --porcelain` |
| DB tables (public) | 190 | `list_tables` |
| Migrations in repo | 253 | `ls supabase/migrations` |
| Unit/integration test files | 1,101 | `find *.test.ts` |
| Playwright spec files | 94 | `apps/web/tests/e2e` |
| App routes (`page.tsx`) | 113 | `find apps/web/app` |
| API routes | 12 | `find apps/web/app/api` |
| Public RPCs | ~430 across 60 verb-families | `pg_proc` sweep |

### 0.1 What the unmerged branches would add

None of the 20 open PRs adds a *new product domain*. They are, without exception,
either gated migrations for capabilities that already exist in code, or parked
visual work:

| PR | Adds | Class |
|---|---|---|
| #1441 | Owner-armed Stripe **live** path (inert until keys + owner word) | RED / billing |
| #1440 | Worker-board demand attribution by organisation (supersedes #1046) | RED migration |
| #1439 | Health-probe cron, SMTP procedure, 2 I2 fixes | GREEN, ready |
| #1436 | `accept_company_worker_invitation` also binds org membership (F4-1) | RED migration |
| #1433 | Anonymous-safe JSON-LD on public job pages + `/jobs` landmark fix | RED / waiver |
| #1430 | `companies` contact-column minimisation (K2-1) | RED migration |
| #1426 | `work_plan_entries` — the **plan** primitive (who works where, when) | RED migration |
| #1421 | Retention fn, unused-index drop, ESCO locale prune | RED migration |
| #1355 | 67-row ESCO canonical linkage | RED migration |
| #1266 | `ai_runs` de-linking from subject | RED migration |
| #1225 / #1211 / #1166 | Landing / visual direction | parked, owner decision |
| #1046 / #1045 / #883 / #740 | superseded / admin repair / **chat transcript persistence** / voice journal | RED, inherited |
| #895 / #896 / #897 | Commercial catalogue, sustainability gate, business-health engine | RED / billing |

**Consequence for scoring:** merging every open PR moves `FULL_VISION_COMPLETE`
by roughly **+3 points**, not by a domain. The vision gap is *unbuilt product*,
not *unmerged code*.

---

## 1. P0 PRODUCTION FINDING (new, discovered by this audit)

### P0-1 — the anonymous read path sits ON the `anon` statement timeout; `/api/health` flaps RED

**Status:** `PROD_VERIFIED` (defect). **Not previously recorded anywhere in the repo.**

Evidence chain:

| Probe | Result |
|---|---|
| `GET https://labourmarket.ai/api/health` 19:59:02 UTC | `{"ok":false,… "db":{"ok":false,"ms":3519,"reason":"http_500"}}` → **503** |
| same, 20:01:13 UTC | `{"ok":false,… "db":{"ok":false,"ms":3462,"reason":"http_500"}}` → **503** |
| same, 20:08:45 UTC (buffers warmed by this audit) | `{"ok":true,… "db":{"ok":true,"ms":3408}}` → 200 |
| same, 20:08:46 UTC (warm) | `{"ok":true,… "db":{"ok":true,"ms":247}}` → 200 |
| `EXPLAIN (ANALYZE, BUFFERS) select public.count_public_vacancies_v1()` | **Execution Time: 3,758 ms**, `shared read=609`, `temp read=243 written=244` (spills to disk) |
| `select rolconfig from pg_roles where rolname='anon'` | **`statement_timeout=3s`** |
| `EXPLAIN ANALYZE select * from search_public_vacancy_previews_v1() limit 1` | **2,747 ms** — the public job board itself |

**Root cause:** `count_public_vacancies_v1()` costs ~2.7–3.8 s on a cold buffer
pool over `public_vacancies` (72,656 rows) and the `anon` role's
`statement_timeout` is **3 s**. Cold → `57014` → PostgREST `500` → health `503`.
Warm → 247 ms → `200`.

**Blast radius (all anonymous / acquisition surfaces):**
- `/api/health` (`apps/web/app/api/health/route.ts:43`) — the entire Train-L1
  observability answer is unreliable;
- the health-probe cron shipped in #1439 (every 15 min, e-mails the repo owner on
  failure) will **page the owner on cold-buffer runs** — alert fatigue on day one;
- `search_public_vacancy_previews_v1` at 2.75 s is the **public job board**
  (`/[locale]/(marketing)/jobs`, `force-dynamic`) — the SEO/acquisition surface is
  one buffer eviction away from erroring for anonymous visitors;
- `market-proof-band` / `live-market-review` read the same count.

**Why it matters more than it looks:** the register grades observability as
"L1 PRODUCTION_PROVEN". It was proven on a warm probe. The honest state is
**PARTIAL — the probe is real but the thing it probes fails intermittently**.

**Fix class:** GREEN. Options, in preference order — (a) an index-only or
materialised count (`is_active` + `expires_at` covering index, or a small
`public_vacancy_counts` refreshed by the importer), (b) `SET statement_timeout`
inside the SECDEF function body, (c) make the health db-probe use a cheap
constant-cost read instead of the product's most expensive anon RPC. No owner
gate. **This is the single highest-value autonomous action available.**

---

## 2. CANONICAL HUMAN LIFECYCLE (audit brief §2)

Chain: MOKINYS → STUDENTAS → PRAKTIKANTAS → ABSOLVENTAS → DARBO IEŠKANTIS →
DARBUOTOJAS → SPECIALISTAS → SAVARANKIŠKAS → VADOVAS/MENTORIUS.

**The architectural answer is right; the vocabulary is missing three stages.**

Identity is modelled as **additive engagement contexts**, not a mutable status —
`engagement_contexts` (72 rows in prod) carries one row per relationship, and
`relationship_types` is a **data** vocabulary, so a new life stage is an INSERT,
not a migration. This is proven: an institution invited a learner in production
and the `student` context appeared **beside** the untouched personal `employee`
context (register Train G). Nothing is overwritten, so history, journal entries,
skills and provenance survive a stage change **by construction**.

| Stage | Vocabulary exists? | Status |
|---|---|---|
| MOKINYS / STUDENTAS | `student` | `PROD_VERIFIED` |
| PRAKTIKANTAS (intern) | — | **MISSING** (no `intern`/`trainee` slug) |
| Apprentice / work-study | — | **MISSING** |
| ABSOLVENTAS (graduate) | — | **MISSING** (no graduation event, no transition act) |
| DARBO IEŠKANTIS | `unemployed` | `SCHEMA_ONLY` — slug exists, 0 uses in prod |
| DARBUOTOJAS | `employee` | `PROD_VERIFIED` |
| SPECIALISTAS / CONTRACTOR | `freelancer`, `consultant`, `collaborator` | `SCHEMA_ONLY` — 0 uses in prod |
| VADOVAS | `manager`, `owner` | `PROD_VERIFIED` (`owner`) |
| MENTORIUS / EKSPERTAS | — | **MISSING** |

Production reality: `engagement_contexts` uses exactly **three** slugs —
`employee`, `owner`, `student`. Seven of the ten declared relationship types have
never been used.

**Verdict:** lifecycle **continuity** = `PROD_VERIFIED`; lifecycle **coverage**
= `PARTIAL` (~55%). The missing pieces are vocabulary rows + the transition acts
(graduate, become-self-employed, become-mentor), not architecture.

---

## 3. STUDENTS + EDUCATION INSTITUTIONS

This is the **largest single gap in the product**, and it is not close.

### 3.1 What is real

| Capability | Status | Evidence |
|---|---|---|
| Organisation holds `training_provider` capability | `PROD_VERIFIED` | `organization_role_types` (10 slugs incl. `training_provider`); set through real UI 2026-08-28 |
| Institution invites a person **as a learner** | `PROD_VERIFIED` | migration `20260827200000`; browser chain 2026-09-02 |
| Learner accepts → `student` context beside employment | `PROD_VERIFIED` | same; `engagement_contexts` shows `student` live |
| Learner privacy ≠ employer visibility | `PROD_VERIFIED` | `20260827210000`, controlled comparison |
| Student journal → skills → CV | `PROD_VERIFIED` | shares the worker pipeline |
| Worker education records | `IMPLEMENTED_TESTED` | `worker_education` (4 rows), `education_types` (9 slugs), `worker_achievements` (2) |
| Transversal capability recognition (12 languages) | `IMPLEMENTED_TESTED` | 8 slugs, offline packs |

### 3.2 What does not exist at all

Every one of these is a **first-class element of the audit brief §3** and returns
**`MISSING` — NO EVIDENCE FOUND** (no table, no route, no RPC, no module):

`programs` · `courses` · `cohorts / classes / groups` · `learning outcomes` ·
`assignments / student projects` · `evidence validation by a teacher` ·
`qualification issuance or recording by the institution` ·
`internship management` · `apprenticeship` · `work-study` ·
`graduation transition act` · `graduate tracking` ·
`labour-market outcome analytics for the institution` ·
`curriculum feedback from real demand` · `Learning Compass for a student` ·
`competency gap → recommended learning` · `employability progression`.

Named counter-checks so this is not a search artefact:
- the only `cohort` in the schema is `pilots` (pilot programmes, **0 rows**);
- `training_programs` / `training_assignments` **exist but are the internal
  employee-training module** — its own table comment states it is *"NOT a
  competence claim and NOT part of the canonical skill ladder"*, and it holds
  **0 rows**;
- `education_types` is a **worker-declared education level** vocabulary, not an
  institution's programme catalogue;
- `/dashboard/learning` exists as a route, but the learning tables
  (`learning_signals`, `learning_review_queue`, `learning_policy_settings`) hold
  **0 rows** and are the human-in-the-loop *model-tuning* machinery, not student
  learning.

### 3.3 The demand→education chain

`LABOUR MARKET DEMAND → SKILLS GAP → EDUCATION/TRAINING → STUDENT EVIDENCE →
QUALIFICATION → INTERNSHIP → EMPLOYMENT → WORK JOURNAL → CAREER`

| Link | Status |
|---|---|
| demand → skills gap | `IMPLEMENTED_TESTED` (`lib/intelligence/skills-demand-model.ts`, `computeContextFit` gap output) |
| skills gap → education/training offer | **MISSING** — nothing maps a gap to a programme |
| education → student evidence | `PROD_VERIFIED` (journal) |
| student evidence → qualification | **MISSING** — no issuance path |
| qualification → internship | **MISSING** |
| internship → employment | **MISSING** |
| employment → journal → career | `PROD_VERIFIED` |

**Two of seven links exist.** The chain is broken in the middle.

**STUDENT + EDUCATION VERDICT: `PARTIAL` ≈ 18% of the final state.**
What exists is the *identity and evidence substrate* (and it is genuinely good).
What is missing is the *entire institutional product* — an education institution
today can invite a learner and then do nothing else with them.

---

## 4. WORKERS

The strongest domain in the product.

| Capability | Status | Evidence |
|---|---|---|
| Registration / login / Google OAuth | `PROD_VERIFIED` | 51 profiles; `external.google=true` |
| E-mail confirmation (cross-device, token_hash) | `PROD_VERIFIED` | #1418, A1 evidence pack |
| Onboarding | `PROD_VERIFIED` | register Train M |
| Work Journal (append-only, hash-chained) | `PROD_VERIFIED` | `journal_entries` 39, `lib/journal/*` |
| Journal → skills → CV → matching (one pipeline) | `PROD_VERIFIED` | `journal_entry_skills` 48 → `worker_skills` 50 |
| CV import DOCX **and** PDF | `PROD_VERIFIED` | `/api/cv/extract`, per-item confirm, negative control |
| Living CV / Player Card | `PROD_VERIFIED` | `/[locale]/cv`, `buildPlayerCardMinimum` |
| EU CV export | `IMPLEMENTED_TESTED` | `lib/cv-export/` |
| Skills / professions taxonomy | `PROD_VERIFIED` | 161 skills, 49 professions, 232 links, ESCO corpus |
| Languages | `IMPLEMENTED_TESTED` | `worker_languages` 11 rows |
| Availability / location / mobility preference | `IMPLEMENTED_TESTED` | `preferred_locations`, availability prefs RPCs |
| Opportunities board + express interest | `PROD_VERIFIED` | `demand_interest_signals` 5 |
| Timesheets + approval + CSV export | `PROD_VERIFIED` | F4 chain, `work_hour_allocations` 5 |
| XLSX historical hours import | `PROD_VERIFIED` (synthetic file) | E3 evidence pack |
| **Credential validity model** (ACTIVE/EXPIRED/REVOKED/PENDING/REJECTED/UNVERIFIED/UNKNOWN) | `IMPLEMENTED_TESTED` | `lib/documents/credential-validity.ts` — derived, never rewrites history |
| Historical evidence + current validity separation | `IMPLEMENTED_TESTED` | derived from append-only `worker_document_events` |
| Documents actually stored | **`SCHEMA_ONLY`** | `worker_documents` = **0 rows** in production |
| References / experience records | `PARTIAL` | `experience_records` 2, `experience_responses` 1 |
| Reputation without star ratings | `PROD_VERIFIED` (by design) | `performance_reviews` comment: *no rating, score, grade or rank exists in this schema, by doctrine* |
| Salary / rate expectations | `PARTIAL` | `market_rate_averages` **0 rows** |
| Learning Compass | **MISSING** | no module |
| Portable professional identity (export/take-away) | `PARTIAL` | GDPR export exists (`lib/privacy/export-data.ts`); no portable credential format |

**Evidence-model check (brief §4):** the required split
`HISTORICAL EVIDENCE + CURRENT VALIDITY STATE` is **correctly implemented** —
validity is a *pure function* over the stored row and the append-only event
history, so a licence expiring never rewrites the past. This is one of the
cleanest parts of the codebase.

**WORKER VERDICT ≈ 70%.** Gaps are peripheral (Learning Compass, rates,
documents never used), not structural.

---

## 5. EMPLOYERS

| Capability | Status | Evidence |
|---|---|---|
| Company onboarding / setup | `PROD_VERIFIED` | `save_company_setup_v3`; `companies` 12 |
| Admin verification of a company | `PROD_VERIFIED` | `admin_set_company_verification`; gates board visibility |
| Organisation users / roles / governance | `PROD_VERIFIED` | `company_memberships` 16, 9 `membership_*` RPCs |
| One org, many capabilities | `PROD_VERIFIED` | `organization_roles` 15 |
| Natural-language need → structured demand draft | `PROD_VERIFIED` | #1322, 4 languages, negative control |
| Demand → matching → ranked shortlist with reasons | `PROD_VERIFIED` | 2026-08-27 browser |
| Anonymous public demand intake | `IMPLEMENTED_TESTED` | `company_need_public_intakes` 2 |
| Candidate discovery / scouting | `IMPLEMENTED_TESTED` | `/dashboard/company/scouting` |
| Invitations → roster | `PROD_VERIFIED` | `company_worker_invitations` 6, `company_workers` 5 |
| Work objects / hours / timesheet approval | `PROD_VERIFIED` | F4 chain |
| Contact / offer / hire lifecycle | `IMPLEMENTED_NOT_TESTED` | `contact_demand_owner_v1` never exercised |
| Booking → engagement | `IMPLEMENTED_NOT_TESTED` | `booking_requests` **0 rows** |
| Planning / scheduling / calendar write path | `BLOCKED_OWNER` | plan primitive = RED draft #1426 |
| Workforce forecasting / capacity | `PARTIAL` | capacity model ignores approved leave (M13) |
| Billing | `BLOCKED_OWNER` | all flags false |

**Production reality check:** `customer_requests` = 17 rows, **newest 2026-07-13**.
No employer has stated a need in ~7 weeks. `job_demands` = 0 and is still read by
the market map (known legacy). `demand_interest_signals` = 5.

**Is it a Workforce OS or a job board?** Structurally it is far past a job board —
work objects, allocations, timesheets, approvals on a real workflow engine,
absences, assets, onboarding/offboarding, agreements, procurement, business trips,
management decisions, performance reviews. **Operationally it is neither yet:**
every one of those tables except timesheets/allocations holds **0 rows**.

**EMPLOYER VERDICT ≈ 55%** (web core proven; operational depth unexercised).

---

## 6. AGENCIES / STAFFING

The audit brief is right to insist agencies are a first-class actor. The
**backend already treats them as one**; the product does not.

### 6.1 What exists (backend, real, non-trivial)

`agencies` (3 rows) · `agency_workers` (0) · `agency_worker_invitations` (0) ·
`agency_client_connections` (0) · `agency_client_request_shares` (0) ·
`agency_candidate_offers` (0)

RPCs — a complete two-sided loop:
`create_agency_client_connection_v1` / `accept_` / `decline_` / `revoke_` ·
`list_shared_requests_for_agency_v1` · `mark_agency_can_offer` ·
`submit_agency_candidate_offer_v1` / `withdraw_` ·
`list_agency_offered_candidates_for_request_v1` · `list_agency_offer_progress_v1` ·
`list_open_demand_for_agencies` · `invite_agency_worker` /
`accept_agency_worker_invitation` · `assign_agency_worker_role` ·
`provision_agency_worker_engagement_context` · `agency_pool_docs_readiness` ·
`set_agency_worker_journal_review`

App layer: `apps/web/lib/agency/` (12 modules — pool, clients, bridge, actions).

### 6.2 What is missing

| Required by brief §6 | Status |
|---|---|
| Agency organisation type | `PROD_VERIFIED` (`organizations.organization_type='agency'`, 3 rows) |
| Agency onboarding / verification | `PARTIAL` — no agency-specific verification path |
| Recruiter roles | `SCHEMA_ONLY` (`assign_agency_worker_role`, 0 uses) |
| Worker/candidate pool | `BACKEND_ONLY` — `agency_workers` 0 rows |
| Candidate ownership / provenance | `BACKEND_ONLY` |
| Client companies + client demand share | `BACKEND_ONLY` — 0 rows |
| Submissions / offers | `BACKEND_ONLY` — 0 rows |
| **Dedicated agency workspace** | **MISSING** — there is **no `/dashboard/agency` route**; agencies are handled through company surfaces |
| **Placement / assignment state machine** | **MISSING** — no `placements` table; nothing between "offer accepted" and an employment engagement |
| **Temporary staffing / rotation model** | **MISSING** |
| **Commission / margin / agency billing** | **MISSING** — no commission field anywhere |
| Multiple-client support | `BACKEND_ONLY` |
| Agency ↔ agency cooperation (vision §6) | **MISSING** |
| Worker identity portability / no lock-in | `PROD_VERIFIED` **by architecture** — the worker owns `profiles`/`workers`; an agency relationship is one `engagement_contexts` row and its removal does not touch the person |

### 6.3 The canonical agency chain

`AGENCY → POOL → AVAILABILITY → QUALIFICATIONS → CLIENT DEMAND → MATCHING →
ASSIGNMENT/PLACEMENT → WORK/TIMESHEET/EVIDENCE → OUTCOME → HISTORY`

Links 1–6 exist as **backend only, zero production rows**. Link 7
(**assignment/placement**) **does not exist** — this is the structural break.
Links 8–10 exist but are reachable only by routing an agency worker through the
*company* roster path, which is exactly the "agency reduced to a plain employer
account" failure mode the brief warns against.

**AGENCY VERDICT ≈ 25%.** Not a plain-employer collapse *architecturally*
(the seam is preserved), but a plain-employer collapse *in the product surface*,
because no agency workspace and no placement object exist.

> ⚠️ Recorded separately, still true: **`agencies` and `staffing_agency`-typed
> companies are two disjoint key spaces sharing zero ids.** Any agency train must
> resolve which one is canonical before adding a placement object.

---

## 7. DIRECT EMPLOYERS / CONTRACTORS / INTERMEDIARIES / UPSTREAM DISCOVERY

**Classification vocabulary: `IMPLEMENTED_NOT_TESTED`.** `organization_role_types`
already carries 10 capability slugs — `client`, `employer`, `project_operator`,
`recruitment_partner`, `talent_provider`, `workforce_provider`,
`training_provider`, `verification_provider`, `payroll_provider`,
`logistics_provider` — and an organisation may hold many at once. The model can
therefore express END CLIENT / CONTRACTOR / AGENCY / INTERMEDIARY **today**,
without a migration.

**But:** production uses exactly **three** of the ten (`employer`,
`training_provider`, `workforce_provider`), and the vocabulary has **no
`general_contractor` and no `subcontractor` slug** — the two the brief names
explicitly. Adding them is an INSERT.

**UPSTREAM DISCOVERY: `MISSING` — NO EVIDENCE FOUND.**
`INTERMEDIARY SIGNAL → underlying project → location → end client/Bauherr →
general contractor → work package → timeline → procurement contact → direct
opportunity` has **no table, no module, no route, no RPC**. Grep for
`general_contractor|subcontractor|end_client|bauherr|upstream` in `apps/web`
returns only i18n strings and unrelated matches (`lib/planning/planning-model.ts`
uses "subcontractor" as a *planning label*, not an entity).

This is the capability that decides whether the product "sees only agencies and
intermediaries". Today **it does exactly that**: 72,656 imported public vacancies
carry no end-client resolution, and there is no procurement/project-signal
ingestion.

---

## 8. TEAMS / PROJECTS / WORKFORCE OPERATIONS

| Element | Status | Rows in prod |
|---|---|---|
| Projects | `PROD_VERIFIED` | 6 |
| Project clients | `IMPLEMENTED_TESTED` | 4 |
| Project worker assignments | `PROD_VERIFIED` | 2 |
| Work objects / sites | `PROD_VERIFIED` | 1 |
| Project stages | `SCHEMA_ONLY` | 0 |
| Work tasks + dependencies + events | `IMPLEMENTED_NOT_TESTED` | 0 |
| Journal ↔ task evidence link | `IMPLEMENTED_NOT_TESTED` | 0 |
| Teams / brigades | `PARTIAL` | `team_details` 0, `team_enquiries` 0 |
| **Work-hour allocations (row-level truth)** | `PROD_VERIFIED` | 5 |
| Timesheets + approval + events | `PROD_VERIFIED` | 2 / 6 |
| Workflow & approval engine | `PROD_VERIFIED` | 24 definitions, 1 instance, 4 transitions |
| Absences / leave | `SCHEMA_ONLY` | 0 |
| Leave balance policies | `SCHEMA_ONLY` (no statutory defaults — by doctrine) | 0 |
| Assets + assignments | `SCHEMA_ONLY` | 0 |
| Onboarding / offboarding runs | `SCHEMA_ONLY` | 0 |
| Agreements / contracts / amendments | `SCHEMA_ONLY` | 0 |
| Procurement inquiries / offers | `SCHEMA_ONLY` | 0 |
| Business trips | `SCHEMA_ONLY` | 0 |
| Management decisions | `SCHEMA_ONLY` | 0 |
| Performance reviews (no ratings, by doctrine) | `SCHEMA_ONLY` | 0 |
| Defects / corrections | `SCHEMA_ONLY` | 0 |
| Project budgets / finance records | `SCHEMA_ONLY` | 0 |
| **Planning / scheduling write path** | `BLOCKED_OWNER` | RED draft #1426 |
| Calendar | `PARTIAL` — viewer only, 8 read sources, no write | — |
| Capacity | `PARTIAL` — ignores approved leave (M13) | — |

**HUMAN + AI CONTRIBUTION → TIME/COST → OUTPUT → QUALITY → EVIDENCE → VALUE:**
the human half is real (allocations → timesheets → approval → export). The **AI
half is `DOCUMENTED_ONLY`** — `ARCHITECTURE §5.1` records AI agents as subjects
and `entity-model.ts` declares `ai_agent`, but no AI contribution has ever been
recorded (`ai_runs` = 7 lifetime, all explanation tasks, none attributed to work
output).

**WORKFORCE OS VERDICT ≈ 45%.** The *skeleton is genuinely enterprise-grade* —
append-only ledgers, one canonical approval engine, immutability enforced by
triggers even against `service_role`. The *flesh is absent*: 19 of 24 operational
tables have never held a row, and the one primitive that makes the loop
schedulable (the plan) is sitting in an owner-gated draft.

---

## 9. CREDENTIALS / VERIFICATION / TRUST

| Element | Status |
|---|---|
| Document type vocabulary (19: A1, work permit, residence permit, posting notification, professional certificate, H&S card, tax/social-security registration, …) | `IMPLEMENTED_TESTED` |
| Worker documents stored | **`SCHEMA_ONLY` — 0 rows in production** |
| Issuer / issue date / expiry / verification source / last verified | `IMPLEMENTED_TESTED` (`upsert_worker_document`) |
| ACTIVE / EXPIRED / REVOKED / PENDING / REJECTED / UNVERIFIED / UNKNOWN | `IMPLEMENTED_TESTED` — pure derivation, never rewrites history |
| Verification request → admin decision | `IMPLEMENTED_TESTED` (`request_worker_document_verification`, `admin_set_worker_document_verification`) |
| Verification audit trail | `IMPLEMENTED_TESTED` — append-only `worker_document_events` |
| Provenance | `PROD_VERIFIED` for **skills** (`journal_entry_skills.provenance`) |
| Employer visibility of credentials | `IMPLEMENTED_TESTED` — consent-first, `personal_data_disclosures` ledger |
| Org documents + acknowledgements + retention | `SCHEMA_ONLY` (0 rows) |
| **External verification providers / issuer registry** | **MISSING** — `verification_provider` is a capability slug with no integration |
| **Education credential issuance** | **MISSING** (see §3) |

Privacy / lawful purpose / minimisation: **strong**. `privacy_consent_purposes`
pins the current consent text version+hash; `privacy_consent_events` is an
append-only ledger with *no* update-in-place even for `service_role`;
`personal_data_disclosures` records category names only, never copies.
The table comment states plainly: *no marketing purpose is seeded — the product
sends no marketing messages*.

**CREDENTIALS VERDICT ≈ 40%** — model excellent, adoption zero, external
verification absent.

---

## 10. JOBS / OPPORTUNITIES / MARKETPLACE

| Element | Status | Note |
|---|---|---|
| Public imported vacancies | `PROD_VERIFIED` | 72,656 rows; 45,132 unexpired; anon sees a **restricted projection enforced in SQL** |
| Public job board + detail + sitemap | `PROD_VERIFIED` | `/[locale]/jobs`; leak matrix K1 PASS (zero protected fields) |
| Employer demand (`customer_requests`) | `PROD_VERIFIED` | 17 rows, none since 2026-07-13 |
| Worker opportunity board | `PROD_VERIFIED` | inverted matching engine |
| Express interest → employer ack | `PROD_VERIFIED` | both directions |
| Shortlist | `IMPLEMENTED_TESTED` | `demand_shortlist` 1 row |
| Booking request lifecycle | `IMPLEMENTED_NOT_TESTED` | 0 rows |
| Service offerings + requests | `PARTIAL` | 2 offerings, 1 request; loop works, **not in global nav by IA ruling** |
| Marketplace listings | `SCHEMA_ONLY` | 0 rows |
| Internships / apprenticeships / work-study as opportunity types | **MISSING** | no type |
| Permanent vs temporary vs contractor distinction | `PARTIAL` | employment-type fields exist on imported ads only |
| Agency placements as a marketplace object | **MISSING** | §6 |
| Quote → booking → completion → payment (vision §7) | **MISSING** | nothing after `accepted` |
| **Housing / accommodation marketplace (vision §8)** | **MISSING — NO EVIDENCE FOUND** | no table, no route, no module; "accommodation" appears only as a *job perk* field |

**MARKETPLACE VERDICT ≈ 20%.**

---

## 11. MATCHING + AI

### 11.1 Deterministic matching — genuinely good

`lib/market/match-v1.ts` + `lib/staffing/fit.ts`:
- **no global person or company score** (doctrine §19) — every number is
  need-context-only and returned **with its basis**, never persisted;
- evidence tiers `manager_confirmed > work_journal > self_declared` change the
  outcome, so a journal-backed match outranks a declared one at equal coverage;
- pure, deterministic, no randomness, no fabricated percentage;
- missing facts are **disclosed on both sides** rather than imputed;
- `match-team-v1` extends it to teams.

Matched entity pairs actually implemented: PERSON↔NEED, PERSON↔OPPORTUNITY,
TEAM↔NEED, PERSON↔PROFESSION (taxonomy relatedness).
**Not implemented:** PERSON↔PROJECT, PERSON↔EDUCATION/TRAINING,
PERSON↔SKILLS-GAP-REMEDY, AGENCY-POOL↔CLIENT-DEMAND (the RPC lists demand but no
ranking runs on a pool).

### 11.2 AI — live but effectively unused

| Fact | Value |
|---|---|
| `ai_runs` lifetime | **7** |
| Date range | 2026-08-28 → 2026-08-29 only |
| Task types ever run | `explain_market_demand` (gemini), `explain_match` (vendorless) |
| `usage_cost_events` | 7, same window |
| Wired agents | 5 (`lib/ai/registry/agents/`) |
| Gate | `AI_PROVIDER_MODE` env — set; not a code gate |

Explainability, confidence, schema validation, fallback/escalation, blocked
reasons, data-category recording and per-run cost are all first-class columns on
`ai_runs` — the **governance is better than the usage**.

`learning_signals` / `learning_review_queue` = **0 rows** → **no feedback loop has
ever run**. Human override exists as a concept (`human_review_state`) with no
recorded use. Bias/fairness safeguards: **`MISSING` as an explicit control**
(mitigated indirectly by "no global score" and "no rating" doctrine).

### 11.3 The chat-first interface — the vision's own §2 and §14

**`conversation_messages` = 16 rows, newest 2026-07-12.** The assistant transcript
is **not persisted**: `lib/assistant/transcript.ts` degrades to
`available: false` because the `assistant_conversations` / `assistant_messages`
schema is still the **owner-gated RED draft #883**. The chat — the product's
declared primary control surface — is **session-only in production**.

Executable chat capabilities: **12** (`lib/capabilities/registry.ts`) —
`profile.get`, `living_cv.skills.get`, `journal.list`, `journal.create_draft`,
`journal.confirm`, `interest.express_draft`, `interest.express_confirm`,
`context.switch`, `work_card.save_draft`, `work_card.save_confirm`,
`demand.create_draft`, `demand.create_confirm`.
Routed intents: **47** — so 35 intents resolve to a *link/route*, not an action.

**INTELLIGENCE + AUTONOMY VERDICT ≈ 45% matching / ≈ 25% AI-as-product.**

---

## 12. LABOUR MARKET INTELLIGENCE

| Element | Status | Evidence |
|---|---|---|
| Source governance registry | `PROD_VERIFIED` | `market_intelligence_sources` 7 rows; external sources ship `activation=off` and a CHECK forbids `on` without owner approval + confirmed legal status |
| Active sources | 3 of 7 | `eurostat`, `internal_platform_aggregates`, `admin_market_rate_averages`. **OFF:** `eures`, `uzt_lt`, `stat_gov_lt`, `cvbankas_salary` |
| Observations | `PROD_VERIFIED` | 76 rows, 4 metrics (`unemployment_rate`, `employment_rate`, `job_vacancy_rate`, `cost_index_yoy`), all `public_aggregate` |
| Explainability audit of every insight query | `IMPLEMENTED_NOT_TESTED` | `market_intelligence_insight_queries` 0 rows |
| Job ingestion | `PROD_VERIFIED` | 72,656 vacancies, 2 import cursors |
| Skills demand | `IMPLEMENTED_TESTED` | `lib/intelligence/skills-demand-model.ts` |
| Market map / country pages | `PROD_VERIFIED` | `/labour-market`, `/dashboard/market-map` |
| Small-sample suppression (n<3 drop, 3≤n<5 band) | `IMPLEMENTED_TESTED` | enforced before a row exists |
| **Employer ingestion / demand signals from real employers** | `MISSING` | 17 `customer_requests`, none since July |
| Salary / rate signals | `SCHEMA_ONLY` | `market_rate_averages` 0 rows |
| Certification demand · rotation · accommodation/travel signals | `MISSING` | |
| Large-workforce demand (10+/20+/30+) | `MISSING` | |
| Direct contractor discovery · intermediary classification · upstream | `MISSING` | §7 |
| Education-demand feedback | `MISSING` | §3.3 |
| Legal / migration signals | `MISSING` | |

**Inside the product vs. Agentai OS:** everything above is **inside
labourmarket.ai**. The `/dashboard/admin/agent-os` page is a **read-only list of
10 documented agent roles with no runtime** — its own header states *"There is no
live agent runtime in v1"*. So **no** discovery/outreach/qualification pipeline
exists inside this product; if it exists at all it is an Agentai OS / manual owner
process, and **canonical authority should stay there** (do not duplicate).

**INTELLIGENCE VERDICT ≈ 30%** — the *governance layer is exemplary and rare*;
the *signal coverage is thin and one-sided (supply-side imports only)*.

---

## 13. INTERNATIONAL MOBILITY / MIGRATION / COMPLIANCE

| Element | Status |
|---|---|
| Global location model (ISO countries, GE + US with subdivisions) | `IMPLEMENTED_TESTED` — `lib/location/country-model.ts` |
| **`countries` table in production** | **10 rows only** (DE DK EE FI LT LV NL NO PL SE) |
| Country work-readiness matrix | `IMPLEMENTED_TESTED` — **10 EU countries**, 4 scopes, sourced + confidence-rated, `lib/country-readiness/` |
| Georgia / US readiness content | **MISSING by design, honestly** — `getCountryReadinessOrNull` returns `null` and callers must render "no researched guidance yet"; never falls back to another country |
| Document requirements per country | `IMPLEMENTED_TESTED` in code; DB override table `country_document_requirements` = **0 rows** |
| Posting / A1 / work permit / residence permit doc types | `IMPLEMENTED_TESTED` (vocabulary) |
| Expiry awareness + alerts | `PARTIAL` — validity derivation exists; `document_expiring` notification emitters are read-time and deliberately detached |
| Worker eligibility engine | **MISSING** |
| Employer / agency eligibility | **MISSING** |
| Country-specific restrictions as executable rules | **MISSING** — the matrix is guidance content, not a rules engine |
| Compliance audit trail | `IMPLEMENTED_TESTED` (append-only ledgers) |

Correctly, **nothing here claims legal compliance** — `leave_balance_policies`
even states *"NO statutory defaults, NO country logic — the UI must never claim
legal compliance"*. That is the right posture, and it also means the compliance
product is **not built**.

**MOBILITY/COMPLIANCE VERDICT ≈ 30%.**

---

## 14. SOCIAL / COMMUNICATION / RECRUITMENT CHANNELS

| Channel | Status |
|---|---|
| Auth e-mail (confirm, reset) via Resend SMTP | `PROD_VERIFIED` transport; **delivery to a real inbox = `BLOCKED_EXTERNAL` (G-1)** |
| In-product messaging | `PARTIAL` — `conversations` 3, `conversation_messages` 16, newest 2026-07-12 |
| Durable notifications + bell | `IMPLEMENTED_TESTED` — `notification_events` **2 rows, both backfill artefacts** |
| Notification preferences (per type × channel) | `IMPLEMENTED_TESTED` — 0 rows |
| Notification e-mail dispatch | `BLOCKED_EXTERNAL` — templates + dispatcher exist; needs `INVITE_EMAIL_*` |
| Weekly digest cron | `IMPLEMENTED_NOT_TESTED` — `CRON_SECRET`-gated |
| Invitation delivery marking | `IMPLEMENTED_TESTED` |
| Google auth | `PROD_VERIFIED` |
| LinkedIn / Facebook auth | `BLOCKED_EXTERNAL` (G-2) — zero provider config; buttons fail closed and honestly |
| **Instagram / TikTok** | **MISSING — no code of any kind** |
| **Recruitment campaigns / social sourcing / outreach** | **MISSING** |
| **Reply monitoring / follow-up** | **MISSING** |
| Consent / unsubscribe / audit trail | `IMPLEMENTED_TESTED` — consent-first opt-in, append-only ledger |
| First-party UTM + funnel telemetry (~55 events) | `IMPLEMENTED_TESTED` |
| OG share images | **MISSING** |

**Owner/developer gates here: G-1** (one real-inbox acceptance test) and **G-2**
(LinkedIn + Meta developer apps + Supabase provider config). Both are genuinely
owner-only.

---

## 15. LANGUAGE / INTERNATIONALISATION

Canonical: [`docs/LANGUAGE_MATRIX.md`](../LANGUAGE_MATRIX.md).

| Tier | Languages | State |
|---|---|---|
| **UI ACTIVE** (routed, prerendered, selectable, parity-enforced) | `lt en ru nl de` — **5** | `PROD_VERIFIED` |
| Human-verified Tier 1 | `en lt` | `COMPLETE` |
| AI-seeded, preview-tagged | `ru nl de` | `PARTIAL` |
| **UI CATALOG** (files exist, NOT routed, NOT selectable) | `+ lv et da no sv pl` — 11 total | `PARTIAL` — truncated at 4,150 leaves vs 10,263; 31–61% `[EN]` placeholders |
| **TAXONOMY + RECOGNITION** | `+ fi` — **12** | `IMPLEMENTED_TESTED` — FI deliberately has **no UI** |
| **Georgian (ka)** | — | **MISSING** — vision §13 names Georgia a first market; the concept-resolution seam makes it *representable* and it honestly reports 0 coverage |
| EU 24-language target | 5 of 24 routed | **~21%** |

| Content class | State |
|---|---|
| Product UI | `COMPLETE` in 5, `PARTIAL` in 6 |
| Locale detection + manual switch + persistence | `PROD_VERIFIED` |
| Skill/profession/journal taxonomy names | 12 languages |
| Offline text recognition (worker writes in own language) | 12 languages |
| **Imported job ads** | **not translated** — shown in the publisher's language (honestly labelled) |
| **User-generated content / profiles / messages** | **not translated** |
| AI output language | follows locale where AI runs (2 task types only) |
| Education content | n/a — no education content exists |

**LANGUAGE VERDICT ≈ 30% of the final target.**

---

## 16. PAYMENTS / ECONOMICS

| Element | Status | Evidence |
|---|---|---|
| LMC ledger engine (top-up, spend, idempotency, overspend refusal, refund claw-back, append-only) | `PROD_VERIFIED` **inside a rolled-back transaction** | 2026-08-28 |
| LMC user surface | `IMPLEMENTED_TESTED` | reads under caller RLS; honest `no_account` / `unavailable` (never renders "0 LMC" on a failed read) |
| **All 7 economic flags in production** | **`false`** | `live_payments_enabled`, `lmc_purchases_enabled`, `lmc_spending_enabled`, `lmc_promotional_grants_enabled`, `lmc_referrals_enabled`, `lmc_compensation_enabled`, `stripe_lmc_topups_enabled` |
| Flag setter | `BLOCKED_OWNER` by design | shared setter refuses **every** caller; no agent path can flip them |
| Stripe test chain (checkout → webhook → subscription → entitlement → admin) | `IMPLEMENTED_TESTED` | 266 billing tests |
| Stripe **live** | `BLOCKED_OWNER` + `BLOCKED_EXTERNAL` | production billing state reads `stripe_live_blocked`; #1441 arms it, inert |
| `billing_customers` / `billing_subscriptions` / `payment_webhook_events` / `subscriptions` | **0 rows each** | nothing has ever run |
| Usage & cost event ledger | `PROD_VERIFIED` (7 rows) | append-only; UPDATE/DELETE/TRUNCATE revoked *and* trigger-blocked |
| **LMC spend reversal** | **`MISSING`** | `lmc_reverse_v1` reverses CREDITs only — **there is no in-product remedy for a debited user whose paid action failed** |
| Canonical price set | `BLOCKED_OWNER` (G-7) | closed #754 + #894 vs draft #895 |
| **Invoice generation from the Work Journal (vision §10)** | **`MISSING`** | `lib/finance/` is explicitly *"manual operational records only"*; `finance_records` 0 rows; no PDF, no act, no state machine `draft→approved→sent→…→paid` |
| Commissions (agency) | **`MISSING`** | |
| Worker / employer / agency / education pricing tiers | `DOCUMENTED_ONLY` | catalogue in docs + draft PRs |
| Entitlement enforcement | `IMPLEMENTED_NOT_TESTED` live | |

**G-7** (one price table) and **G-8** (live keys + RED approval) are real owner
gates. **#1441** is built and inert. The *missing product*, independent of any
gate, is **invoicing from work evidence** — vision §10 — and **spend reversal**.

**PAYMENTS VERDICT ≈ 25%.**

---

## 17. AUTONOMOUS AGENTS / OPERATIONS

| Capability | Inside LabourMarket.ai | Note |
|---|---|---|
| Autonomous employer discovery | **MISSING** | |
| Direct contractor discovery | **MISSING** | §7 |
| Contact discovery / qualification | **MISSING** | |
| Outreach | **MISSING** (and doctrinally restricted) | |
| Worker sourcing | **MISSING** | |
| Education institution / partnership discovery | **MISSING** | |
| Reply monitoring / follow-up | **MISSING** | `follow_up_tasks` table exists, **0 rows**, admin CRM queue only |
| Opportunity radar | **MISSING** | |
| Compliance gates + human approval + audit trail | `IMPLEMENTED_TESTED` — the **workflow engine** provides exactly this, and is the right host for future agent actions | 24 definitions, append-only `workflow_transitions` |
| `/dashboard/admin/agent-os` | **`UI_ONLY`** | its own header: *"There is no live agent runtime in v1"* — 10 static doc cards |
| Automations the **user** creates (vision §12) | **`MISSING`** | no automation entity, no schedule, no run history; only 2 fixed crons (weekly digest, health probe) |

**Boundary ruling (recommended, per the brief):** discovery / outreach /
qualification are **Agentai OS shared capability**, not labourmarket.ai product
capability. Do **not** duplicate them here. What labourmarket.ai should own is
the **user-facing automation engine** (vision §12), which is a different thing
and is currently `MISSING`.

**AUTONOMY VERDICT ≈ 12%.**

---

## 18. PARTNERS / ECOSYSTEM

| Partner type | Representable today? | Reachable product path? |
|---|---|---|
| Employers | yes — `employer` | yes |
| Workers | yes | yes |
| Agencies | yes — `workforce_provider` / `agencies` | no workspace (§6) |
| Schools / vocational / colleges / universities | only as `training_provider` — **no education org type**, `organizations.organization_type` is `company\|agency` only | no (§3) |
| Training providers | yes — `training_provider` | invite-only |
| Certification bodies | `verification_provider` slug, no integration | no |
| Verification providers | slug only | no |
| Government / public employment services | as **data sources** (`eures`, `uzt_lt`, `stat_gov_lt` — all `activation=off`) | no, as partners |
| Migration / compliance partners | no | no |
| Subcontractors / general contractors | no slug | no |
| Investors / strategic partners | `DEFERRED` by architecture (§5.3) | — |
| API / integration partners | **`PROD_VERIFIED`** — OAuth 2.1 server + `/api/mcp`, externally proven with ChatGPT | yes |

The **capability-slug model means most of these are one INSERT away from being
representable** — that is the architecture working as designed. But *representable*
is not *supported*: none of them has a workspace, a role home, or a loop.

---

## 19. SECURITY / PRIVACY / GDPR / GOVERNANCE

**The strongest non-worker domain in the product.**

| Element | Status |
|---|---|
| Authentication (password, Google, PKCE, cross-device confirm) | `PROD_VERIFIED` |
| RLS enabled on **all 190 public tables** | `PROD_VERIFIED` |
| Organisation isolation | `PROD_VERIFIED` — K2 probe across 3 bounded identities: profiles / workers / roster / objects / allocations / engagements isolated; outsider writes refused |
| **Open P1** | **K2-1** — the `companies` row policy admits every signed-in user, so contact columns are readable beyond the consent model. Fix = RED draft **#1430**, unapplied (**G-12**) |
| Learner data ≠ employer scope | `PROD_VERIFIED` |
| Consent ledger (versioned + hashed texts, append-only, immutable to `service_role`) | `PROD_VERIFIED` |
| Disclosure ledger (categories only, never values) | `IMPLEMENTED_TESTED` |
| GDPR export | `IMPLEMENTED_TESTED` (`lib/privacy/export-data.ts`) |
| Deletion plan + privacy requests | `IMPLEMENTED_TESTED` (`deletion-plan.ts`, `submit_privacy_request_v1`) |
| Retention | `PARTIAL` — `ai_runs` sweeps run (25 rows); `usage_cost_events` has **no** retention function (D1 unfinished) |
| Audit trail | `PROD_VERIFIED` — `audit_logs` 55 + ~10 append-only domain ledgers, immutability trigger-enforced **even for `service_role`** |
| Anonymous public-jobs leak matrix | `PROD_VERIFIED` **PASS** — zero protected fields across HTML / JSON / JSON-LD / API / sitemap / robots |
| Secret scanning + push protection | `PROD_VERIFIED` (repo settings) |
| Rate limits on anon-writable / expensive routes | `IMPLEMENTED_TESTED` |
| Supabase advisors | 1 ERROR (intentional SECDEF view — **do not "fix"**), 375 WARN (363 by design) |
| AI data boundaries | `IMPLEMENTED_TESTED` — `data_categories_sent` recorded per run, privacy gate in the router |
| **Error monitoring** | `PARTIAL` — one PII-free JSON line per uncaught server error; **no Sentry, no aggregation, no alerting beyond the (flapping) health cron** |
| **Minors** | **MISSING** — no age gate, no parental-consent path, despite students being a core actor |
| Impersonation | **MISSING** (no admin impersonation path — arguably correct) |
| Backup / rollback drill | **not drilled** (**L3**, owner — Vercel CLI is blocked for the agent) |

**SECURITY VERDICT ≈ 70%.** One open P1 with a written fix; two genuine holes
(minors, error aggregation).

---

## 20. DEPENDENCY MAP

```
                         ┌─────────────────────────────────────┐
                         │  IDENTITY (engagement_contexts)     │  PROD_VERIFIED
                         │  one account · many contexts        │  additive, never overwrites
                         └───────────────┬─────────────────────┘
                                         │  (unblocks everything below)
        ┌────────────────┬───────────────┼────────────────┬──────────────────┐
        ▼                ▼               ▼                ▼                  ▼
  ┌───────────┐   ┌────────────┐  ┌─────────────┐  ┌─────────────┐   ┌──────────────┐
  │ EVIDENCE  │   │ CREDENTIALS│  │ ORGANISATION│  │  DEMAND     │   │  LANGUAGE    │
  │ (Journal) │   │ (documents)│  │ CAPABILITIES│  │ (cust_reqs) │   │  (i18n)      │
  │ PROD ok   │   │ MODEL ok   │  │ PROD ok     │  │  PROD ok    │   │  5 of 24     │
  └─────┬─────┘   │ ROWS 0 !!  │  └──────┬──────┘  └──────┬──────┘   └──────────────┘
        │         └─────┬──────┘         │                │
        ▼               │                │                ▼
  ┌───────────┐         │                │         ┌─────────────┐
  │ SKILLS/CV │◀────────┘                │         │  MATCHING   │ PROD ok (deterministic,
  │  PROD ok  │──────────────────────────┼────────▶│  explainable│  evidence-tiered)
  └─────┬─────┘                          │         └──────┬──────┘
        │                                │                │
        │            ┌───────────────────┴──────┐         │
        │            ▼                          ▼         ▼
        │   ┌────────────────┐        ┌──────────────────────┐
        │   │ EDUCATION ORG  │        │  AGENCY              │
        │   │ invite ok      │        │  pool/clients/offers │ BACKEND_ONLY (0 rows)
        │   │ ## PROGRAMS    │        │  ## PLACEMENT OBJECT │ <-- STRUCTURAL BREAK
        │   │ ## COHORTS     │        │  ## AGENCY WORKSPACE │ <-- STRUCTURAL BREAK
        │   │ ## QUALIFICAT. │        │  ## COMMISSION       │
        │   │ ## INTERNSHIP  │◀───────┤                      │
        │   └───────┬────────┘        └──────────┬───────────┘
        │           │                            │
        │           ▼                            ▼
        │   ┌────────────────────────────────────────────────┐
        └──▶│  WORKFORCE OS                                  │
            │  projects ok · objects ok · allocations ok     │
            │  timesheets+approval ok · workflow engine ok   │
            │  ## PLAN PRIMITIVE (#1426, owner-gated)        │ <-- blocks scheduling
            │  ## calendar WRITE path                        │
            └───────────────────┬────────────────────────────┘
                                │
                                ▼
            ┌────────────────────────────────────────────────┐
            │  INVOICING / ECONOMICS                         │
            │  LMC engine ok (all 7 flags OFF)               │
            │  ## INVOICE FROM JOURNAL (vision §10)          │
            │  ## SPEND REVERSAL                             │
            │  Stripe live ## G-7 + G-8                      │
            └───────────────────┬────────────────────────────┘
                                ▼
                    COMMERCIAL LAUNCH

  MARKET INTELLIGENCE ──▶ SKILLS DEMAND ──▶ ## EDUCATION FEEDBACK ──▶ MATCHING
       (supply-side imports only; ## employer ingestion, ## upstream discovery)

  ## = missing / gated
```

### 20.1 What can be built in parallel (no shared dependency)

| Lane | Depends on | Can start now? |
|---|---|---|
| **A. Anon read-path performance (P0-1)** | nothing | **yes, now** |
| **B. Education programme/cohort/assignment model** | Identity ok, Evidence ok | **yes, now** — does *not* need agencies, payments or the plan primitive |
| **C. Agency workspace + placement object** | Identity ok, Demand ok | **yes, now** — must first resolve the `agencies` vs `staffing_agency` key-space split |
| **D. Chat transcript persistence** | #883 apply | owner gate only |
| **E. Invoicing from journal** | Allocations ok, Timesheets ok | **yes, now** — does *not* need Stripe |
| **F. Upstream / intermediary discovery** | Intelligence ok | **yes, now** — starts with 2 vocabulary INSERTs |
| **G. Lifecycle vocabulary (intern/apprentice/graduate/mentor)** | Identity ok | **yes, now** — INSERTs, no migration |
| **H. Housing marketplace** | Identity ok, Projects ok | **yes, now** — greenfield |
| **I. Live payments** | G-7 + G-8 | no — owner-gated |
| **J. LinkedIn/Meta auth** | G-2 | no — owner-gated |
| **K. Plan primitive on prod** | G-13 (#1426) | no — owner-gated |

**Eight of eleven lanes are unblocked.** The product is not gate-bound; it is
scope-bound.

---

## 21. COMPLETION SCORING

### 21.1 Methodology

Three independent questions, three independent denominators.

- **CORE_PRODUCT_READY** — denominator = the *current* product core (worker +
  employer web loop, auth, journal, matching, hours). Measures: does what exists
  work for a real user, end to end, in production?
- **COMMERCIAL_LAUNCH_READY** — denominator = *accepting paying users*. Weighted:
  payments 35 · entitlements 10 · pricing decision 10 · reliability/observability
  15 · support/refund path 10 · legal/privacy 10 · delivery channels 10.
- **FULL_VISION_COMPLETE** — denominator = the canonical vision §1–§19 **plus**
  the audit brief's domains. Weights reflect **final product mass**, not current
  code mass — per the brief, students/education and agencies get real weight
  precisely because the code does not have them yet.

Per-capability credit: **1.0** at `PROD_VERIFIED`, **0.7** at
`IMPLEMENTED_TESTED`, **0.5** at `IMPLEMENTED_NOT_TESTED` / `PARTIAL`,
**0.25** at `BACKEND_ONLY` / `SCHEMA_ONLY` / `UI_ONLY`, **0.1** at `PR_ONLY`,
**0** at `DOCUMENTED_ONLY` / `PLANNED` / `MISSING`.

### 21.2 Domain scorecard

| # | Domain | Weight | Completion | Contribution | Headline status |
|---|---|---:|---:|---:|---|
| 1 | Identity & multi-context account | 5 | **65%** | 3.25 | `PROD_VERIFIED` core, vocabulary gaps |
| 2 | Worker · Living CV · Journal · evidence | 8 | **70%** | 5.60 | `PROD_VERIFIED` |
| 3 | Employer · demand · recruitment | 7 | **55%** | 3.85 | `PROD_VERIFIED` core, shallow depth |
| 4 | **Education & students** | 10 | **18%** | 1.80 | `PARTIAL` — substrate only |
| 5 | **Agencies & staffing** | 9 | **25%** | 2.25 | `BACKEND_ONLY` |
| 6 | Workforce OS (projects/teams/ops) | 9 | **45%** | 4.05 | skeleton `PROD_VERIFIED`, body empty |
| 7 | Services marketplace + housing | 6 | **20%** | 1.20 | housing `MISSING` entirely |
| 8 | Credentials · verification · trust | 4 | **40%** | 1.60 | model good, 0 rows |
| 9 | Documents · mobility · compliance | 4 | **30%** | 1.20 | guidance, not a rules engine |
| 10 | Matching + AI | 7 | **45%** | 3.15 | matching strong, AI unused |
| 11 | Market intelligence + upstream | 5 | **30%** | 1.50 | supply-side only |
| 12 | Payments · LMC · invoicing | 6 | **25%** | 1.50 | all flags off; invoicing `MISSING` |
| 13 | Communication · notifications · social | 4 | **35%** | 1.40 | transport live, channels absent |
| 14 | Language / global reach | 4 | **30%** | 1.20 | 5 of 24 routed |
| 15 | Security · privacy · GDPR | 5 | **70%** | 3.50 | strongest non-worker domain |
| 16 | Automations & autonomous agents | 4 | **12%** | 0.48 | `UI_ONLY` |
| 17 | Mobile & multi-surface (incl. MCP) | 3 | **30%** | 0.90 | builds+MCP proven, 5 screens |
| | **TOTAL** | **100** | | **38.4** | |

### 21.3 The three scores

```
CORE_PRODUCT_READY        =  78%
COMMERCIAL_LAUNCH_READY   =  35%
FULL_VISION_COMPLETE      =  38%
```

**CORE_PRODUCT_READY 78%** — a worker and an employer can complete real,
production-verified journeys today. Deductions: the flapping anon read path
(P0-1), no chat persistence, K2-1, the org-binding defect on invitation accept
(F4-1), employer demand attribution (#1440), no error aggregation.

**COMMERCIAL_LAUNCH_READY 35%** — nothing can be charged. All 7 economic flags
are `false`, `stripe_live_blocked` is engaged in production, four billing tables
have never held a row, there is **no invoice generation** and **no spend
reversal** (a debited user has no in-product remedy). Privacy/legal and the test
chain are the parts that are ready.

**FULL_VISION_COMPLETE 38%** — the *foundations* are disproportionately strong
(identity, evidence, provenance, RLS, append-only ledgers, honest degradation,
the capability-slug extension model). The *product breadth* is roughly a third
of the declared vision, and the two domains the brief singles out —
**education (18%)** and **agencies (25%)** — are the two furthest behind.

---

## 22. GAP REGISTER

| Domain | Capability | Required final state | Current evidence | Status | % | Missing | Dependency | Owner gate | Pri |
|---|---|---|---|---|---:|---|---|---|---|
| Ops | Anon read path under the 3 s timeout | every anon RPC < 1 s | `count_public_vacancies_v1` 3.76 s; health 503×2 | `PROD_VERIFIED` defect | 0 | index/materialised count | none | no | **P0** |
| Chat | Conversation persistence | durable, hash-chained transcript | `transcript.ts` degrades; `assistant_*` absent | `PR_ONLY` (#883) | 10 | apply migration | — | **yes** | **P0** |
| Education | Programmes / courses | institution catalogue | none | `MISSING` | 0 | whole model | Identity ok | no | **P0** |
| Education | Cohorts / classes / groups | roster grouping | `pilots` only (0 rows) | `MISSING` | 0 | whole model | programmes | no | **P0** |
| Education | Assignments + teacher validation | evidence validated by staff | none | `MISSING` | 0 | whole model | cohorts | no | **P1** |
| Education | Qualification issuance/recording | institution issues a credential | `worker_education` self-declared only | `MISSING` | 5 | issuance path + issuer | credentials ok | no | **P0** |
| Education | Internship / apprenticeship management | matched, tracked, evidenced | no type, no relationship slug | `MISSING` | 0 | vocabulary + loop | demand ok | no | **P0** |
| Education | Graduation transition | act that changes stage, keeps history | none | `MISSING` | 0 | transition act | lifecycle vocab | no | **P1** |
| Education | Graduate tracking + outcome analytics | institution sees where graduates went | none | `MISSING` | 0 | analytics | graduation | no | **P1** |
| Education | Curriculum feedback from demand | demand → gap → programme advice | gap engine ok, no link | `MISSING` | 10 | the link | intelligence ok | no | **P1** |
| Education | Learning Compass | gap → recommended learning | none | `MISSING` | 0 | whole feature | programmes | no | **P1** |
| Agency | Agency workspace | own home, own nav | no `/dashboard/agency` | `MISSING` | 0 | surface | Identity ok | no | **P0** |
| Agency | Placement / assignment object | offer→placement→work→outcome | none | `MISSING` | 0 | the state machine | key-space fix | no | **P0** |
| Agency | `agencies` vs `staffing_agency` key spaces | one canonical id space | disjoint, 0 shared ids | `PARTIAL` | 30 | canonical ruling | — | no | **P0** |
| Agency | Worker pool in real use | live pool | `agency_workers` 0 rows | `BACKEND_ONLY` | 25 | adoption + UI | workspace | no | **P1** |
| Agency | Commission / margin / agency billing | agency economics | none | `MISSING` | 0 | model | payments | **yes** | **P2** |
| Agency | Temporary staffing / rotation | assignment rotation | none | `MISSING` | 0 | model | placement | no | **P2** |
| Market | Upstream discovery (end client / GC) | intermediary → real project | none | `MISSING` | 0 | pipeline | intelligence ok | no | **P1** |
| Market | `general_contractor` / `subcontractor` slugs | classify the chain | 10 slugs, neither present | `MISSING` | 0 | 2 INSERTs | — | no | **P1** |
| Market | Employer-side demand ingestion | real employer signals | 17 rows, none since Jul 13 | `PARTIAL` | 20 | acquisition | — | no | **P1** |
| Marketplace | Housing / accommodation (vision §8) | listings→booking→assignment | **nothing** | `MISSING` | 0 | whole domain | projects ok | no | **P2** |
| Marketplace | Post-accept lifecycle (quote→booking→completion→pay) | vision §7 | stops at `accepted` | `MISSING` | 10 | lifecycle | payments | no | **P1** |
| Marketplace | Marketplace reachability | in-product path | works, not in nav (IA ruling) | `PARTIAL` | 50 | IA decision | — | no | **P2** |
| Finance | Invoice from Work Journal (vision §10) | hours→invoice→PDF→states | manual records only, 0 rows | `MISSING` | 5 | whole engine | timesheets ok | no | **P0** |
| Finance | LMC spend reversal | remedy for a failed paid action | credits only | `MISSING` | 0 | reverse-spend path | LMC ok | **yes** | **P0** |
| Finance | Live payments | real charge chain | `stripe_live_blocked` | `BLOCKED_OWNER` | 40 | keys + price set | — | **yes (G-7/G-8)** | **P1** |
| Workforce | Plan primitive | who works where, when | RED draft #1426 | `PR_ONLY` | 20 | apply | — | **yes (G-13)** | **P1** |
| Workforce | Calendar write path | book/move work | viewer only | `PARTIAL` | 35 | write path | plan | no | **P1** |
| Workforce | Capacity vs approved leave | leave reduces capacity | ignored (M13) | `PARTIAL` | 40 | join | absences | no | **P2** |
| Workforce | AI contribution as a work subject | human + AI in one ledger | recorded, deferred | `DOCUMENTED_ONLY` | 5 | model | allocations ok | no | **P2** |
| Automation | User-created automations (vision §12) | schedule/condition/history | none | `MISSING` | 0 | whole engine | workflow ok | no | **P1** |
| Identity | intern/apprentice/graduate/mentor slugs | full lifecycle vocabulary | 10 slugs, 4 missing | `MISSING` | 0 | 4 INSERTs | — | no | **P1** |
| Identity | Education organisation type | schools are first-class | `company\|agency` only | `PARTIAL` | 40 | slug/type | — | no | **P1** |
| Credentials | Documents actually used | real worker documents | 0 rows | `SCHEMA_ONLY` | 25 | adoption | — | no | **P1** |
| Credentials | External verification providers | issuer integration | slug only | `MISSING` | 0 | integrations | — | no | **P2** |
| Compliance | Eligibility rules engine | executable, per country | guidance content only | `MISSING` | 15 | rules engine | readiness ok | no | **P2** |
| Language | Georgian + 19 EU languages | 24 routed | 5 routed | `PARTIAL` | 21 | catalogs + routing | seam ok | no | **P2** |
| Language | Dynamic content translation | ads, profiles, messages | none | `MISSING` | 0 | pipeline | AI | no | **P2** |
| Social | LinkedIn / Meta auth | provider apps configured | zero config | `BLOCKED_EXTERNAL` | 20 | owner apps | — | **yes (G-2)** | **P2** |
| Social | Campaigns / sourcing / reply monitoring | outreach loop | none | `MISSING` | 0 | whole domain | Agentai OS boundary | no | **P3** |
| Security | K2-1 companies contact columns | column-level grants | RED draft #1430 | `PR_ONLY` | 0 | apply | — | **yes (G-12)** | **P1** |
| Security | Minors / age gate | students may be under 18 | none | `MISSING` | 0 | age + consent path | education | no | **P1** |
| Ops | Error aggregation + alerting | real monitor | JSON lines only | `PARTIAL` | 30 | monitor | — | optional | **P1** |
| Ops | Backup / rollback drill | drilled | not drilled | `MISSING` | 0 | one drill | — | **yes (L3)** | **P1** |
| Email | Real-inbox delivery | proven | Resend live, bounces on fake boxes | `BLOCKED_EXTERNAL` | 80 | one real test | — | **yes (G-1)** | **P0** |

---

## 23. TOP GAPS

### 23.1 Top 10 functional gaps

1. **Education institution product** — programmes, cohorts, assignments,
   qualification issuance, internships, graduate tracking. All `MISSING`.
2. **Agency placement object + agency workspace** — the loop has no state between
   "offer accepted" and "employment", and agencies have no home.
3. **Invoicing from the Work Journal** (vision §10) — hours exist, invoices do not.
4. **User-created automations** (vision §12) — the whole engine is absent.
5. **Housing / accommodation marketplace** (vision §8) — nothing exists.
6. **Chat transcript persistence** — the primary interface forgets everything.
7. **Upstream / end-client discovery** — the product sees only intermediaries.
8. **Marketplace post-accept lifecycle** — quote → booking → completion → payment.
9. **Lifecycle vocabulary** — intern, apprentice, graduate, mentor.
10. **LMC spend reversal** — no remedy for a debited user.

### 23.2 Top 10 technical gaps

1. **P0-1** anon statement-timeout on the public read path.
2. `agencies` vs `staffing_agency` — two disjoint key spaces.
3. **K2-1** `companies` row policy admits every signed-in user (#1430).
4. **F4-1** invitation accept does not bind organisation membership (#1436).
5. Worker-board demand attributed to the wrong organisation (#1440).
6. No error aggregation / alerting; the only alert channel (health cron) will
   fire on false positives because of P0-1.
7. `usage_cost_events` has **no** retention function (D1 unfinished).
8. Capacity model ignores approved leave (M13).
9. `job_demands` (0 rows, legacy) is still read by the market map.
10. Two task truths — `work_tasks` vs `follow_up_tasks`, no bridge (M14).

### 23.3 Top 10 production-verification gaps

1. Employer demand → worker board → interest → engagement (needs **G-14**).
2. Booking → engagement lifecycle — `booking_requests` **0 rows** ever.
3. Agency loop — every agency table **0 rows** ever.
4. Documents — `worker_documents` **0 rows** ever.
5. Marketplace listings, assets, agreements, procurement, trips, decisions,
   reviews, onboarding/offboarding — **0 rows** each.
6. Stripe test chain never executed against a live-shaped environment.
7. Real-inbox e-mail delivery (**G-1**).
8. Notification e-mail dispatch — never sent.
9. Mobile product journeys — builds and runtime proven, **zero product data**.
10. Backup / rollback drill — never performed (**L3**).

### 23.4 Owner gates — the only things an agent genuinely cannot do

| Gate | Action | Unblocks |
|---|---|---|
| **G-1** | Register once with a real e-mail on a phone; report the two screens | last Train-A item; CORE gate 1 |
| **G-7** | Confirm the **one** canonical price table | live payments |
| **G-8** | Stripe live keys + webhook secret; approve RED #1441 | live payments |
| **G-14** | One admin click: verify `E2E Walker UAB` | the last cross-actor E2E leg |
| **G-12** | Approve + apply RED #1430 | closes the open P1 (K2-1) |
| **G-13** | Approve + apply RED #1426 | plan primitive → scheduling |
| **G-15** | Approve + apply RED #1436 | worker timesheets without manual `add_org_member` |
| **G-16** | One-line waiver on #1433 | JSON-LD + the last a11y finding |
| **#883** | Approve + apply | **chat transcript persistence** |
| **G-2** | LinkedIn + Meta developer apps | social auth |
| **G-3…G-6** | DB lifecycle (indexes, retention, ESCO scope, plan) | ~235 MB + capacity |
| **L3** | Run the rollback drill from the Vercel dashboard | observability gate |
| **G-9 / G-10** | Test-identity cleanup; classify inherited RED drafts | hygiene |

### 23.5 Finished — do NOT rewrite

- Work Journal → skills → CV → matching pipeline (with provenance).
- CV import (DOCX **and** PDF), per-item confirm, negative controls.
- Deterministic, explainable matching with evidence tiers and **no global score**.
- Additive identity model (`engagement_contexts`) and the capability-slug
  organisation model — a new actor is an INSERT, not a migration.
- RLS + consent ledger + disclosure ledger + append-only audit ledgers
  (immutable even to `service_role`).
- Workflow & approval engine — one engine, one append-only transition ledger.
- Timesheet chain: allocations → compute → submit → approve → export.
- Anonymous public-jobs boundary (SQL-enforced projection); K1 leak matrix PASS.
- Auth: PKCE + `token_hash` cross-device confirmation; Google OAuth; OAuth 2.1
  server + `/api/mcp`, externally proven.
- Honest-degradation discipline throughout (`unavailable` is not `0`;
  `not_provisioned` is not `empty`).

### 23.6 Looks finished in the docs, is not a working product

| Claim | Reality |
|---|---|
| "L1 observability PRODUCTION_PROVEN" | the probe is real; **the thing it probes flaps 503** (P0-1) |
| "Workforce OS" | 19 of 24 operational tables have **never held a row** |
| "Agency is a first-class actor" | complete backend, **0 rows, no workspace, no placement object** |
| "Education institutions supported" | invite a learner — then **nothing else exists** |
| "AI-first / chat-first product" | **12** executable capabilities; **no transcript persistence**; `ai_runs`=7 lifetime |
| "LMC economy" | engine proven — **all 7 flags `false`**, 0 accounts, 0 transactions |
| "Documents engine" | 19 types, full validity model, **0 documents** |
| "Agent OS" | 10 static doc cards; its own header says *no live agent runtime* |
| "Global / 249 ISO countries" | location model global; `countries` table = **10 EU**; readiness = **10 EU**; Georgia = none |
| "Marketplace" | loop works, **unreachable from nav by ruling**, nothing after `accepted` |

---

## 24. IMPLEMENTATION WAVES (dependency-optimised)

The brief's proposed order is **changed**, and here is why: WAVE 0 as written
would stall on owner gates while eight independent lanes sit idle. Owner gates
are *asynchronous* — they should be **requested once** and then overlapped with
work that does not depend on them.

### WAVE 0 — reliability & truth (autonomous, days, no gate)
1. **P0-1** — make the anon read path cheap (index/materialised count; cheap
   health probe). *Without this, every later proof runs on a flapping platform
   and the owner is paged by false alarms.*
2. Re-grade L1 honestly in the register.
3. Request **all** owner gates in one batch (G-1, G-7/G-8, G-12/G-13/G-15/G-16,
   G-14, #883, L3) — then stop waiting for them.

### WAVE 1 — close the known defects (autonomous)
`#1440` attribution · `#1436` org binding (needs G-15) · M13 capacity vs leave ·
M14 task-truth bridge · `job_demands` legacy read · `usage_cost_events` retention
· error aggregation.

### WAVE 2 — **education & students** *(runs in parallel with 3 and 4)*
Programmes → cohorts → assignments → teacher validation → **qualification
issuance** → internship as an opportunity type → graduation act → graduate
tracking → curriculum feedback from the existing gap engine → Learning Compass.
*Depends only on Identity + Evidence, both `PROD_VERIFIED`.* **Highest
vision-yield per unit of work: +8 points.**

### WAVE 3 — **agency & staffing** *(parallel)*
Resolve the `agencies`/`staffing_agency` key-space split → agency workspace →
**placement object** → pool adoption → multi-client → rotation. **+5 points.**

### WAVE 4 — **work → money** *(parallel)*
Invoice generation from journal/allocations (vision §10) — `draft → approved →
sent → viewed → partially_paid → paid | overdue | cancelled`, PDF, acts,
accounting export. **Independent of Stripe.** Then LMC spend reversal.
**+4 points.**

### WAVE 5 — chat as the real OS
Apply #883 → transcript persistence → grow executable capabilities from 12 toward
the 47 routed intents → automations engine (vision §12) on the existing workflow
engine. **+5 points.**

### WAVE 6 — intelligence & reach
Upstream/end-client discovery · `general_contractor`/`subcontractor` slugs ·
employer-side ingestion · Georgian + EU language expansion · housing marketplace ·
mobility rules engine · live payments once G-7/G-8 land.

**Parallelism:** Waves 2, 3 and 4 share **no** table and **no** module. They can
run as three concurrent trains from day one. Wave 5 depends only on an owner
apply. Wave 0 must go first because it is the platform everything else is proven
on.

---

## 25. SESSION SAFETY

- Repo left clean; `main` fast-forwarded to `c252fae8` (= production).
- No PR closed, reopened, retargeted or modified. No CI/deployment touched.
- No migration applied. No destructive DB operation. Read-only SQL plus two
  `EXPLAIN ANALYZE` calls and one `SET LOCAL statement_timeout` in a
  non-persistent session.
- No worktree pruned or deleted.
- No implementation performed — audit only, per §0 of the brief.

---

## 26. FULL_VISION_AUDIT_CHECKPOINT

```
main SHA                 c252fae8   (= production, no drift)
production SHA           c252fae8   region dub1
production health        FLAPPING RED  (P0-1: anon 3 s statement timeout)

CORE_PRODUCT_READY       78%
COMMERCIAL_LAUNCH_READY  35%
FULL_VISION_COMPLETE     38%

TOP 10 GAPS
 1  Education institution product (programmes/cohorts/qualifications/internships)
 2  Agency placement object + agency workspace
 3  Invoicing from the Work Journal (vision §10)
 4  P0-1 anon read path at the 3 s statement timeout (health flaps 503)
 5  Chat transcript persistence (#883) — the primary interface forgets
 6  User-created automations engine (vision §12)
 7  Upstream / end-client discovery (product sees only intermediaries)
 8  Housing / accommodation marketplace (vision §8)
 9  Live payments + LMC spend reversal (no remedy for a debited user)
10  Lifecycle vocabulary: intern / apprentice / graduate / mentor

STUDENT / EDUCATION      PARTIAL  18%  — substrate proven, institutional product absent
AGENCY                   BACKEND_ONLY 25% — full RPC loop, 0 rows, no workspace, no placement
WORKFORCE OS             PARTIAL  45%  — enterprise skeleton, 19 of 24 tables never used
INTELLIGENCE + AUTONOMY  PARTIAL  30% / 12% — governance exemplary, no runtime, no outreach

OWNER GATES (agent cannot do these)
  G-1   one real-inbox registration test on a phone
  G-7   confirm the one canonical price table
  G-8   Stripe live keys + webhook secret + approve RED #1441
  G-12  approve + apply #1430  (K2-1, open P1)
  G-13  approve + apply #1426  (plan primitive)
  G-14  one admin click: verify E2E Walker UAB
  G-15  approve + apply #1436  (invitation org binding)
  G-16  one-line waiver on #1433
  #883  approve + apply  -> chat transcript persistence
  G-2   LinkedIn + Meta developer apps
  G-3..G-6  DB lifecycle approvals
  L3    rollback drill from the Vercel dashboard

FIRST AUTONOMOUS ACTION ON RESUME
  Fix P0-1: give count_public_vacancies_v1 / search_public_vacancy_previews_v1 a
  cost that fits inside the anon 3 s statement_timeout (covering index on
  is_active + expires_at, or an importer-refreshed counts row), and repoint the
  /api/health db probe at a constant-cost read. GREEN class, no owner gate,
  removes a false-alarm pager and de-risks the entire anonymous acquisition
  surface. Then re-grade L1 in FINAL_COMPLETION_REGISTER.md.
```
