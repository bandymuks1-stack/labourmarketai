# INTENDED PRODUCT SPECIFICATION — labourmarket.ai (reconstructed 2026-08-18)

**Purpose.** Reconstruct the *approved* product intent from project evidence so that
completeness can be measured against **what was decided**, not against what happens to
exist in the repository. The chain established here is:

```
APPROVED HISTORICAL PRODUCT INTENT → CURRENT IMPLEMENTATION → PRODUCTION REALITY → GAP
```

| Field | Value |
|---|---|
| Method | Read-only reconstruction from repo doctrine, ADRs, migration headers, guard tests, git history. No production queries run by this pass. |
| Repo | `C:/Users/Mano/Documents/labourmarketai-wt/truth-audit-0818` |
| Repo HEAD at audit | `cb078ff3` (one docs-only commit above `origin/main` `49734c63`, PR #1182) |
| Production reality column | **Supplied, measured 2026-08-18** — not re-derived here (see §0.3) |
| Deliverable type | Requirement traceability matrix (§5), plus intent reconstruction (§2), relationship graph (§3), principle tests (§4) |
| Requirement count | **194** across 13 product families |

> **What this document is NOT.** It is not a roadmap, not an approval, and not a
> new product decision. Where the evidence does not record a decision, the row is
> marked `UNKNOWN_OWNER_DECISION_REQUIRED` and left empty rather than guessed. Where
> git history mentions an idea that a later binding artefact replaced, the row is
> marked `HISTORICAL_SUPERSEDED_IDEA` and is **not** resurrected as a requirement.

---

## 0. Reading rules

### 0.1 Intent classification (exactly one per requirement)

| Class | Meaning |
|---|---|
| `APPROVED_CURRENT_INTENT` | A binding owner artefact states it and no later binding artefact retired it. This is a real requirement. |
| `IMPLEMENTED_CURRENT_BEHAVIOR` | Exists in code/schema; the *intent* behind it is descriptive rather than owner-stated. Truthful to report, but not evidence of approval. |
| `HISTORICAL_SUPERSEDED_IDEA` | Was decided, then explicitly replaced. Recorded so it is never re-adopted by accident. **Not a requirement.** |
| `EXPERIMENT_OR_REFERENCE` | R&D, comparison material (e.g. the Vecticum matrix), or another project's concept. **Not a requirement.** |
| `UNKNOWN_OWNER_DECISION_REQUIRED` | Intent is genuinely ambiguous or absent. Escalated in §6. |

### 0.2 Status vocabulary

`VERIFIED_PRODUCTION` · `VERIFIED_TEST_ENVIRONMENT` · `IMPLEMENTED_NOT_PROVEN` ·
`PARTIAL` · `BROKEN` · `MISSING` · `NOT_REQUIRED`

**Production proof is `UNKNOWN` unless a production artefact proves it.** Code presence
never promotes a row to `VERIFIED_PRODUCTION`.

### 0.3 Production reality baseline (given, 2026-08-18)

36 profiles · 13 organizations · 44,113 vacancies (Sweden only; 38,142 live) **with no
user-facing surface** · 0 matches · 0 `ai_runs` · 0 `notification_events` · 0 payments
ever · 0 live workflow instances · avatars work (7 storage objects) · auth = email +
Google only · active locales `lt/en/ru/nl/de`.

### 0.3a CORRECTIONS to the inherited audit (verified by this pass)

Two claims carried by `docs/audits/full-project-truth-2026-08-18.md` were re-checked
against source and **do not hold**. They are corrected throughout this document.

| # | Inherited claim | Verified reality | Evidence |
|---|---|---|---|
| **C-01** | *"`vacancy-read.ts` … has zero importers outside its own directory"* and *"no user-facing page renders them"* (§A.2, §I "The blocking defect") | **FALSE.** The chain is complete and live: `app/[locale]/dashboard/opportunities/page.tsx:9` imports `ExternalVacanciesSection`, rendered at `:1127` from `result.externalVacancies`, which comes from `lib/marketplace/worker-opportunities.ts:173` ← `lib/opportunities/load-worker-opportunities.ts:258` calling `loadExternalVacancyCards` ← `lib/opportunities/external-vacancies.ts:33` importing `searchPublicVacancies` from `lib/vacancy-store/vacancy-read.ts`. | Direct grep of importers; file line numbers above |
| **C-02** | *"Matching has never produced a row. `matches` = 0 … The marketplace's core promise has no production instance"* (§A.13) | **MISLEADING.** Matching results are **deliberately never persisted** — doctrine §19(d) forbids a cached "general" subject %, and `lib/market/match-v1.ts` states results are *"returned WITH their basis, never persisted"*. `matches` is the legacy `0001_initial_schema.sql` table. A zero row count is therefore **expected correct behaviour**, not evidence that matching never ran. What matching actually writes is `demand_interest_signals`, `demand_shortlist`, `worker_opportunity_seen`. | `apps/web/lib/market/match-v1.ts` header; doctrine §19(d) |

**What this changes.** The real gap is narrower and more specific than "38,142 jobs reach
no user": external vacancies **do** reach an authenticated worker on
`/dashboard/opportunities`. What is genuinely missing is (a) any **anonymous / SEO**
route to that supply (REQ-MKT-003), and (b) production evidence that any worker has
actually used the board. The remaining defect is an **acquisition and proof** gap, not a
wiring gap.

**What this does not change.** Production usage is still effectively zero, supply is
still one country in a locale the product does not serve, and payments and AI have still
never run.

### 0.4 Authority order used to resolve conflicts

```
PLATFORM_DOCTRINE            ← supreme for technical/legal safety only
PRODUCT_UNIVERSE_LOCK_V2     ← world architecture (docs/product/PRODUCT_UNIVERSE_LOCK_V2.md)
  ├─ PRODUCT_VISION_LOCK_V1  ← the twelve elements
  ├─ OPPORTUNITY_REALIZATION_LOCK_V1 ← boundary + flywheel (axiom A-13)
  └─ PRODUCT_CONSTITUTION    ← §12 axioms A-01…A-13, §13 Product Gate
      └─ LABOURMARKET_AI_CANONICAL_PRODUCT_VISION, PROJECT_VISION, ROADMAP, everything else
```
Source: `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` "Authority order"; mirrored in
`docs/product/PRODUCT_VISION_LOCK_V1.md` and `docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md`.

---

## 1. What the product was approved to be (one page)

Three owner-authored locks, all recorded 1:1, define the product:

1. **`PRODUCT_UNIVERSE_LOCK_V2` (owner text 2026-07-28)** — one living world, not a
   set of modules. **Four pillars: AI Conversation · Avatar · World Map · Work
   Journal.** Everything else is an extension of those four. A Universal Object Model
   (`Object ID · Type · Location · Geometry · Status · History · Relationships ·
   Permissions · Events · Documents · Media · Timeline · Metadata · Actions ·
   Visibility · Tags · Custom Extensions`) with **registered, not hardcoded, object
   types**. Explicit prohibition: *no new dashboards, no second AI, no products inside
   the product, no architecture that depends on specific object types.*

2. **`PRODUCT_VISION_LOCK_V1` (owner text 2026-07-28)** — the twelve world elements:
   AI Conversation · User Avatar · Market World Map · Objects · Organizations ·
   Projects · Teams · Work Journal · Skills · Reputation · Documents · Communication.
   Binding statements: *"Įgūdžiai negeneruojami iš CV. Pagrindinis šaltinis yra darbo
   žurnalas"* (skills come from the Journal, CV is only supplementary);
   *"Inbox nėra produktas. Bookings nėra produktas. Requests nėra produktas.
   Candidates nėra produktas"*; *"Dashboard nėra darbo vieta"*.

3. **`OPPORTUNITY_REALIZATION_LOCK_V1` (owner directive 2026-08-14, axiom A-13)** —
   the product boundary and the value flywheel:
   `capabilities/activity/results/services/capacity/evidence → Work Journal →
   structured understanding of what can be offered → matching against real demand →
   work/orders/customers/buyers/projects/workers/contractors → new activity → back in`.
   Two mandatory tests: **TEST A (Sweden ~7,000 jobs — a worker must not have to browse
   thousands of listings to get value)** and **TEST B (grandmother's cucumbers — a
   non-technical person can express a simple offer and be routed to a lawful
   realization channel or told honestly that none exists)**.

Under those, `docs/PRODUCT_CONSTITUTION.md` supplies the axiom register (A-01…A-13) and
the Product Gate; `docs/PLATFORM_DOCTRINE.md` supplies technical law (§2 translation
architecture, §3 append-only/hash-chain/audit, §4 default-closed, §5 the four-layer
person→world model, §7/§7.1 AI-never-lies, §10 Lego/slug taxonomy, §15 skill trust
signals, §17 canonical demand intake, §18 no demo layer, §19 fit-not-rating, §20
privacy base); and `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` §19
supplies the owner's own explicit list of **what still must be built**.

**The single most load-bearing intent statement for measuring completeness** is
`LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` §20: *"atskirti «sutarta produkto
architektūra» nuo «jau įgyvendinta»"* — separate *agreed architecture* from *already
implemented*. That is precisely what this document does.

---

## 2. Reconstructed intent, per product family

Each family states: **what it is intended to DO · who uses it · what truth it OWNS ·
how it connects.**

### 2.1 Public marketplace
- **Does:** present the labour market as a *world*, not a listings page. The Market
  World Map is the primary representation of reality; job/opportunity supply is one
  layer among people, organizations, projects, objects, demand signals, teams,
  training, events, leagues, partners, AI objects
  (`PRODUCT_UNIVERSE_LOCK_V2` §1 "WORLD MAP", `PROJECT_VISION.md` §11 layered map).
- **Users:** anonymous visitors, workers, employers, agencies, buyers.
- **Owns:** external supply truth (`public_vacancies`), the public identity of the
  platform, and the safe public claim vocabulary
  (`apps/web/lib/analytics/market-coverage-claims.ts`).
- **Connects:** supply → matching → worker board; map layers ↔ every world object.
- **Binding constraint:** identity is stated positively and universally, never through
  a sector and never by negation (`PRODUCT_CONSTITUTION` §7.1). Nine equal-priority
  launch markets LT/LV/EE/NL/DE/DK/NO/SE/PL, with adding a country requiring **no core
  schema migration** (`PROJECT_VISION` §4, ADR 0010).

### 2.2 Worker (profile / avatar / skills / CV / evidence / availability / privacy)
- **Does:** give one person one living work identity — *"ne CV, o gyvas darbo pasas"*
  (`PROJECT_VISION` §5 object 1). The **Avatar** is not an illustration; it is the
  digital identity that carries profile, skills, work history, journal, reputation,
  documents, certificates, availability, organizations, teams — and **all actions are
  performed in the avatar's name** (`PRODUCT_VISION_LOCK_V1` §1 "AVATARAS").
- **Users:** every person, employed or not, in any profession, education level,
  experience and life stage, across Europe (`PRODUCT_CONSTITUTION` §7.1).
- **Owns:** personhood (one human ↔ exactly one `profiles` row, doctrine §5.1),
  self-declared and evidenced capability, consent and visibility state, document
  metadata truth.
- **Connects:** Journal → skills → evidence tier → CV → matching → opportunities;
  availability → scheduling; consent → discoverability.
- **Binding constraints:** five skill verification levels, never "verified" unless it
  is (`PROJECT_VISION` §6, ADR 0009); no universal human value / OVR / profile
  strength (`PRODUCT_CONSTITUTION` §10, doctrine §19a); skills come from the Journal,
  not from the CV (`PRODUCT_VISION_LOCK_V1`); worker keeps the profile and it is
  portable across employers.

### 2.3 Employer / organization
- **Does:** let a company, team, agency, or project become a first-class **activity
  space** with its own presence, members, permissions, documents, workers, clients,
  projects, services, orders, journals, invoices, payments, reports and automations
  (`PRODUCT_CONSTITUTION` §4; `LABOURMARKET_AI_CANONICAL_PRODUCT_VISION` §4).
- **Users:** owners, managers, HR, foremen, agencies, buyers.
- **Owns:** organizational authority, membership, engagement/employment records,
  demand.
- **Connects:** org ↔ projects ↔ objects ↔ tasks ↔ people ↔ documents ↔ finance.
- **Binding constraints:** one user manages many organizations without separate
  accounts, with an explicit *active context*; positions ≠ RBAC (doctrine §5.4/§5.2);
  engagement contexts are plural and first-class (doctrine §5.5).

### 2.4 Daily workforce & business OS
- **Does:** deliver **recurring operational value, not episodic hiring** — work
  reports, team/project/object progress, planning, calendar, workload/capacity,
  staffing forecasts, hours, work evidence, worker/contractor search, customer/order
  discovery (`OPPORTUNITY_REALIZATION_LOCK_V1` §7).
- **Owns:** operational truth of what is happening, who is where, what is due, what
  needs a decision.
- **Connects:** every operational object hangs off org + project + object + person and
  feeds the Journal and the Map.
- **Binding constraints:** **decision queue is a first-class, urgency-ranked surface,
  not a list** (`PROJECT_VISION` §8 module 10); approvals are human; no fake
  automation; performance is *record count, never a competence score*.

### 2.5 Skills / value marketplace
- **Does:** turn accumulated activity into a structured understanding of what a person
  or organization can offer, then match it against real demand
  (`OPPORTUNITY_REALIZATION_LOCK_V1` §2–§3).
- **Owns:** the capability taxonomy (ESCO-anchored), evidence tiers, and fit
  computation.
- **Binding constraints:** doctrine §19 — people are never ranked; a percentage exists
  only inside a concrete need context, always shown with its basis ("19 of 20 skills,
  14 confirmed"), confirmed-vs-declared always separated, and the same subject
  legitimately scores differently in different contexts. Matching must compute through
  ESCO canonical ids (`docs/product/s6-matching-fit-spec-note.md`).

### 2.6 Services marketplace
- **Does:** support real services alongside jobs — offer a service, find a provider,
  order a service, submit a price quote, book a time, confirm completion, review the
  result, pay or invoice (`LABOURMARKET_AI_CANONICAL_PRODUCT_VISION` §7). Categories
  explicitly unbounded (construction, transport, translation, accounting, legal,
  insurance, training, recruitment, document handling, equipment/materials,
  accommodation, and others). Every order carries ID · buyer · provider · chosen
  company-or-personal context · price · deadline · status · messages · documents ·
  payment status · cancellation and dispute logic.
- **Binding constraint:** services **reuse** identity/org/matching/evidence/payment
  primitives — a services silo is an architecture defect
  (`OPPORTUNITY_REALIZATION_LOCK_V1` §3, §5).

### 2.7 Products / commerce / capacity
- **Does:** realize *products, capacity and other legitimate economic output*, not only
  labour (`OPPORTUNITY_REALIZATION_LOCK_V1` §2). TEST B (cucumbers) is the acceptance
  test: understand a plain-language offer, ask only what is needed, identify **lawful**
  realization channels, or state honestly that none exists
  (`CHANNEL_GATED` / `LEGAL_CHECK_REQUIRED` in `apps/web/lib/value-channels/`).
- **Binding constraint:** unsupported commerce functionality is **never faked** to make
  the test visually pass.

### 2.8 AI
- **Does:** be **the primary interface** — one AI, one conversation: lead the dialogue,
  understand the goal, perform actions, open the needed context, close it, return to
  the conversation (`PRODUCT_VISION_LOCK_V1` §1 "AI"; constitution axiom A-01). Six
  agent types documented for M4+ (worker search, candidate fit, document prep, manager
  decision queue, market monitoring, communication drafting) — `PROJECT_VISION` §9.
- **Binding constraints:** doctrine §7/§7.1 — AI drafts, humans approve; AI never
  sends, approves, verifies, alters documents, or persists suggestions to verified
  records autonomously; every extraction run is logged append-only with provider,
  model, raw response and the accepted subset. **No second AI, no equivalent parallel
  control method** (`PRODUCT_VISION_LOCK_V1`).

### 2.9 Payments / LMC
- **Does:** make the platform financially sustainable; LMC is an internal platform
  credit pegged 1 LMC = 1 EUR, stored as bigint LMC-cents, one account per identity
  (person or company), **never a withdrawable balance, never crypto, never
  multi-level** (`docs/product/lmc-canonical-commercial-catalogue-v1.md` §1, BINDING).
- **Binding constraints:** axiom A-10 (one commercial catalogue: price, LMC rule,
  Stripe object, entitlement) and A-11 (no feature launches without a known economic
  model), both recorded as *"review — machine half ships with #895/#896"*, i.e. the
  enforcement half is **not** shipped.

### 2.10 Growth / acquisition
- **Does:** the product is **not invite-only**; self-entry at `/auth/signup` is the
  default channel and invitations are an *additional* channel that never replaces it
  (`PRODUCT_CONSTITUTION` §11). Public, indexable acquisition surfaces are permitted
  where the Product Gate declares them (`/create-cv`, declared under axiom A-04 in
  `PRODUCT_ARCHITECTURE_DIFF.md`).
- **Binding constraints:** `leads` is the anonymous pre-auth funnel and must never be
  merged into the canonical demand intake (doctrine §17.2); no adoption claims may be
  derived from imported ad populations (`market-coverage-claims.ts`, enforced by
  `lib/guards/market-coverage-claims.test.ts`).

### 2.11 Data & market intelligence
- **Does:** make labour information clearer, more trustworthy and more useful
  (`PROJECT_VISION` §15 "Rinkai"); market intelligence, analytics of skill shortages,
  employment and risk (`PROJECT_VISION` §8 modules 11–12); the layered map (§11).
- **Binding constraints:** doctrine §20 — research works **only** with anonymous data;
  pseudonymization + aggregation + k-threshold happen *before* the research layer;
  identified research does not exist as a category; research insight may never change
  an individual's matching, visibility, prices or offers. Axiom A-12: an unmeasured
  metric is reported as unmeasured, never as zero (machine half **not shipped**).

### 2.12 Admin / security / governance
- **Does:** platform operations, verification queues, telemetry, support, and the
  governance machinery that keeps the product honest (Product Gate, surface registry,
  placeholder governance, applied ledger).
- **Binding constraints:** deny-by-default RLS as the only tenant isolation
  (`docs/DATA_MODEL.md` "RLS — the authoritative policy reference"); append-only audit
  (doctrine §3.4); default-closed visibility with grants as revocable rows, not flags
  (§4.1–§4.3); every new surface declares five answers in
  `apps/web/lib/product-gate/surface-registry.ts` (constitution §13.2).

---

## 3. The intended relationship graph

Legend: **I** = edge is intended by an approved artefact · **C** = edge exists in code ·
**D** = edge exists in schema · **P** = edge has ever produced a production row.

| # | Edge | I | C | D | P | Evidence | Verdict |
|---|---|:-:|:-:|:-:|:-:|---|---|
| E01 | PERSON ↔ PROFILE (1:1, always) | ✔ | ✔ | ✔ | ✔ | doctrine §5.1; `supabase/migrations/0001_initial_schema.sql` (`profiles.id = auth.users.id`) | **IMPLEMENTED** |
| E02 | PROFILE ↔ ROLES (multi-role, non-locking) | ✔ | ✔ | ✔ | ✔ | constitution §1; ADR 0012; `0003_multi_role.sql` (`profile_roles`, `active_role`) | **IMPLEMENTED** |
| E03 | PROFILE ↔ AVATAR (identity, not picture) | ✔ | ✔ | ✔ | ✔ | `PRODUCT_VISION_LOCK_V1` "AVATARAS"; `profile-avatars` bucket, 7 objects | **IMPLEMENTED** |
| E04 | PROFILE ↔ SKILLS | ✔ | ✔ | ✔ | ✔ | `0010_skills_and_worker_skills.sql`; 46 journal-entry skills in prod | **IMPLEMENTED** |
| E05 | SKILLS ↔ VERIFICATION LEVEL (5 levels) | ✔ | ◐ | ◐ | ◐ | `PROJECT_VISION` §6; ADR 0009; `DATA_MODEL.md` sketch `skill_verifications` **never created** — the shipped ladder is `lib/evidence/evidence-tier.ts` | **PARTIAL — different shape than approved** |
| E06 | SKILLS ↔ ESCO canonical id | ✔ | ◐ | ◐ | ✖ | `s6-matching-fit-spec-note.md` ("compute fit through ESCO canonical IDs"); `esco_occupations`/`esco_skills`/`esco_labels` exist; picks persist **label-only**, `skills.esco_uri` never populated | **BROKEN EDGE** |
| E07 | WORK JOURNAL ↔ PROFILE/ENGAGEMENT | ✔ | ✔ | ✔ | ✔ | doctrine §5.5 ("journal entries pin to an engagement context, never directly to an organization"); `0013_work_journal_m1.sql`; 36 prod entries | **IMPLEMENTED** |
| E08 | WORK JOURNAL → SKILLS (journal is the primary skill source) | ✔ | ✔ | ✔ | ✔ | `PRODUCT_VISION_LOCK_V1` "SKILLS"; `lib/journal/skill-pipeline.ts`; `journal_entry_skills`; `20260727180000_journal_entry_skill_provenance_v1.sql` | **IMPLEMENTED** |
| E09 | JOURNAL ↔ EVIDENCE (photos, confirmations, hash chain) | ✔ | ✔ | ✔ | ✔ | doctrine §3.1–§3.3; `journal_entry_photos`, `journal_entry_confirmations`, `20260530130000_journal_integrity_guards.sql`; 8 photos + 12 confirmations in prod | **IMPLEMENTED** |
| E10 | EVIDENCE → CV (living, computed) | ✔ | ✔ | ✔ | ◐ | `ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` "CV is the central living trust object"; `docs/product/living-cv-contract-v1.md`; `apps/web/app/[locale]/cv/page.tsx` | **IMPLEMENTED, low usage** |
| E11 | CV → SKILLS (supplementary only, never primary) | ✔ | ✔ | ✔ | ◐ | `PRODUCT_VISION_LOCK_V1` "Įgūdžiai negeneruojami iš CV"; `/api/cv/extract` → review → persist | **IMPLEMENTED** |
| E12 | PROFILE ↔ AVAILABILITY | ✔ | ◐ | ◐ | ✖ | `PROJECT_VISION` §5; `worker_absences`, `save_worker_availability_prefs_v2`, `20260808120000_worker_absence_scheduling_view_v1.sql`; **no per-day availability entity** | **PARTIAL** |
| E13 | AVAILABILITY → MATCHING | ✔ | ✔ | ✔ | ✖ | `PROJECT_ROADMAP.md` Phase 5 ("skills · availability · evidence · country · price"); `lib/market/match-v1.ts` | **IMPLEMENTED_NOT_PROVEN (0 matches)** |
| E14 | JOBS/OPPORTUNITIES ↔ PUBLIC SUPPLY | ✔ | ✔ | ✔ | ✔ | `20260809160000_public_vacancy_persistence_v1.sql`; 44,113 rows | **IMPLEMENTED** |
| E15 | PUBLIC SUPPLY → AUTHENTICATED WORKER SURFACE | ✔ | ✔ | ✔ | ✖ | **Corrected (C-01).** `dashboard/opportunities/page.tsx:9,:1127` ← `worker-opportunities.ts:173` ← `load-worker-opportunities.ts:258` ← `external-vacancies.ts:33` ← `vacancy-read.ts`. Matched by the ONE engine via `buildNeedFromVacancy`; RLS-scoped to the worker's own client | **IMPLEMENTED_NOT_PROVEN** |
| E16 | PUBLIC SUPPLY → ANONYMOUS / SEO | ? | ✖ | ✖ | ✖ | `public_vacancies` RLS grants SELECT to `authenticated` only; no `anon` policy; `/work-opportunities` is static SEO copy | **MISSING + `UNKNOWN_OWNER_DECISION_REQUIRED` — the real supply gap** |
| E17 | MATCHING ↔ EMPLOYER DEMAND | ✔ | ✔ | ✔ | ◐ | doctrine §17 (`customer_requests` canonical, 17 rows); `lib/market/need-from-request.ts`; results are **deliberately not persisted** (C-02), derived writes land in `demand_interest_signals` / `demand_shortlist` | **IMPLEMENTED_NOT_PROVEN** |
| E18 | MATCHING → EXPLANATION ("kodėl 82%") | ✔ | ✔ | ✔ | ✖ | `PROJECT_VISION` §3, §8 module 8; doctrine §19(b); `lib/market/fit.ts`, `thermometer.ts`, `lib/guards/fit-not-rating.test.ts` | **IMPLEMENTED_NOT_PROVEN** |
| E19 | EMPLOYERS ↔ ORGANIZATIONS ↔ MEMBERSHIPS | ✔ | ✔ | ✔ | ✔ | `20260530120100_projects_company_to_organization.sql`; `20260806090000_company_memberships_v1.sql`; 13 orgs, 14 memberships | **IMPLEMENTED (duplicated — see G-DUP-01)** |
| E20 | ORGANIZATIONS ↔ PROJECTS | ✔ | ✔ | ✔ | ✔ | `20260804120000_project_lifecycle_v1.sql` | **IMPLEMENTED** |
| E21 | PROJECTS ↔ OBJECTS/SITES | ✔ | ✔ | ✔ | ✖ | `PRODUCT_VISION_LOCK_V1` "OBJECTS"; `20260817150000_work_objects_v1.sql` (supersedes never-applied `company_locations_v1`) | **IMPLEMENTED_NOT_PROVEN** |
| E22 | PROJECTS/OBJECTS ↔ TASKS ↔ STAGES | ✔ | ✔ | ✔ | ◐ | `work_tasks`, `task_dependencies`, `project_stages`; `20260817151000_work_tasks_v2_collaboration.sql` | **IMPLEMENTED** |
| E23 | TASKS ↔ WORK JOURNAL | ✔ | ✖ | ✖ | ✖ | flywheel §3 requires activity context; audit: *"project auto-link only … task link absent"* | **MISSING EDGE** |
| E24 | CALENDAR/SCHEDULING ↔ everything | ✔ | ◐ | ✖ | ✖ | `PROJECT_VISION` §8; axiom A-03 (chat → journal → calendar → messages); calendar is a **read-only projection over 8 sources, no calendar entity** | **PARTIAL — no owned truth** |
| E25 | JOURNAL → HOURS/TIMESHEETS (derived, no second store) | ✔ | ✔ | ✔ | ✖ | `20260817170000_timesheets_v1.sql` (`lines_snapshot` derived from `journal_entry_work_items`) | **IMPLEMENTED_NOT_PROVEN (0 rows)** |
| E26 | TIMESHEETS → INVOICES | ✔ | ◐ | ◐ | ✖ | `LABOURMARKET_AI_CANONICAL_PRODUCT_VISION` §10 ("iš darbo žurnalų … formuoti sąskaitas"); `finance_records` + `20260817220000_finance_invoice_upgrades_v1.sql`; **no journal→invoice generator** | **PARTIAL** |
| E27 | DOCUMENTS ↔ PERSON / ORG / PROJECT / OBJECT / ORDER | ✔ | ◐ | ✔ | ✖ | vision §9 lists all six anchors; `worker_documents`, `org_documents` + `object_id` (`20260817240000_org_document_register_delta_v1.sql`); **no order anchor** | **PARTIAL** |
| E28 | DOCUMENTS ↔ VERSIONS ↔ ACKNOWLEDGEMENT | ✔ | ✔ | ✔ | ✖ | `20260817140000_document_file_layer_v1.sql` (version-bound, fill-once acknowledgements) | **IMPLEMENTED_NOT_PROVEN (0 rows)** |
| E29 | WORKFLOWS/APPROVALS ↔ every approvable entity | ✔ | ✔ | ✔ | ◐ | `20260817130000_workflow_engine_v1.sql` (7 tables, closed approver vocabulary); 16 templates installed, **0 live instances**, one rolled-back prod E2E | **VERIFIED_TEST_ENVIRONMENT** |
| E30 | DECISION QUEUE (ranked, first-class) | ✔ | ◐ | ✖ | ✖ | `PROJECT_VISION` §8 module 10 + `DATA_MODEL.md` "`decision_queue` — M2 (computed view)"; shipped as `dashboard/network/approvals-section.tsx`, **not urgency-ranked, not first-class** | **PARTIAL vs approved shape** |
| E31 | SERVICES ↔ identity/org/matching/evidence | ✔ | ◐ | ◐ | ✖ | vision §7; `service_offerings`, `service_offering_requests`, `marketplace_listings`; **no booking, no quote, no completion confirmation, no payment** | **PARTIAL** |
| E32 | SERVICES ↔ PAYMENTS | ✔ | ✖ | ✖ | ✖ | vision §7 ("apmokėti arba išrašyti sąskaitą"); `lib/guards/service-offerings-no-payment.test.ts` **pins the absence** | **MISSING (deliberately gated)** |
| E33 | PRODUCTS/CAPACITY ↔ realization channels | ✔ | ◐ | ✖ | ✖ | TEST B; `lib/value-channels/{channel-registry,eligibility,discovery}.ts`; no commerce schema at all | **PARTIAL (verdicts only)** |
| E34 | PAYMENTS ↔ ORG / PERSON (LMC account per identity) | ✔ | ✖ | ✔ | ✖ | LMC catalogue §1 BINDING; `lmc_accounts`/`lmc_transactions`/`lmc_lots` exist in schema but appear **only in `lib/supabase/types.ts`** — zero app readers or writers | **DEAD APP LAYER** |
| E35 | AI ↔ every workflow (one AI, one conversation) | ✔ | ◐ | ✔ | ✖ | axiom A-01; `lib/ai/runtime/provider-chain.ts`, `ai_runs`; `AI_PROVIDER_MODE=disabled`, **0 runs ever** | **IMPLEMENTED_NOT_PROVEN** |
| E36 | AI ↔ WORLD MAP / AVATAR STATE | ✔ | ◐ | ✖ | ✖ | `PRODUCT_UNIVERSE_LOCK_V2` (AI agents are world objects); `PRODUCT_ARCHITECTURE_DIFF.md` records `world_state_cannot_control_it` findings against `/create-cv` | **PARTIAL** |
| E37 | NOTIFICATIONS ↔ lifecycle events | ✔ | ✔ | ✔ | ✖ | `20260810070000_notification_events_v1.sql` (+v2/v3/v4 type widenings); **0 rows, 0 lifetime inserts** | **IMPLEMENTED_NOT_PROVEN** |
| E38 | REPUTATION ← real evidence only | ✔ | ✔ | ✔ | ◐ | `PRODUCT_UNIVERSE_LOCK_V2` "REPUTATION"; `experience_records`/`experience_responses` (live rows in prod) | **IMPLEMENTED** |
| E39 | WORLD MAP ← registered object types (no re-architecture per type) | ✔ | ◐ | ✖ | ✖ | `PRODUCT_UNIVERSE_LOCK_V2` "WORLD MAP YRA PLATFORMA"; `lib/product-gate/universal-object-model.ts` + `entity-model.ts` declare the model; **no `object_types` registry table exists** | **PARTIAL — model declared in TS, not registered in data** |
| E40 | CONSENT/PRIVACY ↔ DISCOVERABILITY | ✔ | ✔ | ✔ | ◐ | doctrine §4/§20; `privacy_consent_events`, `personal_data_disclosures`, `can_view_worker` RLS, `20260809120000_can_view_worker_booking_engagement_v1.sql` | **IMPLEMENTED** |
| E41 | HOUSING/ACCOMMODATION ↔ project/worker | ✔ | ✖ | ✖ | ✖ | `LABOURMARKET_AI_CANONICAL_PRODUCT_VISION` §8 (full spec); **no table, no module** | **MISSING** |
| E42 | AUTOMATIONS ↔ any recurring operation | ✔ | ✖ | ✖ | ✖ | vision §12 (spec incl. ID, owner, context, schedule, state, run history); **no automation entity** | **MISSING** |
| E43 | TEAMS as first-class object | ✔ | ◐ | ◐ | ✖ | `PROJECT_VISION` §5 object 6 + `DATA_MODEL.md` `team_entities` sketch; shipped as `organizations` rows of type `team` + `team_details`, **no member roster** | **PARTIAL vs approved shape** |
| E44 | AGENCIES ↔ candidate preparation + multi-client | ✔ | ✔ | ✔ | ✖ | `PROJECT_VISION` §5 object 8; `agency_clients`, `agency_client_connections`, `20260723180000_agency_real_client_bridge_v1.sql` | **IMPLEMENTED_NOT_PROVEN** |

**Summary of the graph:** 44 intended edges. **23 implemented and exercised**, **13
implemented but never exercised in production**, **6 partial/shape-divergent**, **4
missing outright** (E16 supply→anonymous/SEO, E23 task↔journal, E41 housing, E42
automations; E32 services↔payments is missing but deliberately gated).

The flywheel is **structurally closed** — corrected from the inherited audit (C-01):
`journal → understanding → matching → real demand → action` runs end to end for a signed-in
worker on `/dashboard/opportunities`. What the loop lacks is **traffic and proof**: no
anonymous route into it (E16), and no production evidence that a worker has completed a
turn of it. That is an acquisition problem, not an architecture problem.

---

## 4. Stated product principles vs repository evidence

| # | Principle | Verdict | Evidence |
|---|---|---|---|
| P01 | Work Journal is living evidence-based history, not a static form | **SUPPORTED** | Chat-first intake + atomic `create_journal_entry_full` + hash chain (`20260530130000_journal_integrity_guards.sql`); `lib/journal/skill-pipeline.ts` runs on every save; append-only confirmations; guards `journal-evidence-loop.test.ts`, `journal-proof-engine.test.ts`, `journal-entry-skill-provenance.test.ts`. 36 real entries, 46 skills, 12 confirmations, 8 photos in production. |
| P02 | Profile/CV strengthened by real work history | **SUPPORTED** (mechanically) / **PARTIALLY_SUPPORTED** (at scale) | Derived verified CV + `journal-cv-recall.test.ts`, `journal-namespace-cvbridge.test.ts`, `docs/product/living-cv-contract-v1.md`. But `profile_completeness` = 0 and `headline` = null for all 36 workers **by design** (`worker-work-card-migration.test.ts`), so the strengthening is real but has no user-visible signal. |
| P03 | Worker discoverability gated by privacy/consent | **SUPPORTED** | Doctrine §4/§20; `can_view_worker` fail-closed RLS; append-only `privacy_consent_events` + `personal_data_disclosures`; `20260817122000_contact_disclosure_org_authority_v1.sql` made disclosure authority org-bound; guards `consent-fail-closed.test.ts`, `privacy-base.test.ts`, `can-view-worker-booking-engagement.test.ts`. Note: `contact_disclosure_requests` = 0 rows, so enforcement is proven by tests, not by use. |
| P04 | Employed people still gain value | **PARTIALLY_SUPPORTED** | Intent is explicit and code exists: `lib/market/employed-worker-acceptance.test.ts`, commit `cf747767` ("employed-worker loop copy/telemetry"), `20260806180000_membership_authority_widening_v1.sql`. But the value returned to an employed worker is opportunity discovery, and that surface (E15) does not exist. |
| P05 | Recruitment PLUS recurring workforce value | **PARTIALLY_SUPPORTED** | `OPPORTUNITY_REALIZATION_LOCK_V1` §7 is explicit; the recurring layer was actually built (timesheets, employee requests, agreements, procurement, trips, training, reviews, decisions, onboarding/offboarding — PRs #1170–#1180). **Every one of those tables holds 0 production rows**, so recurring value is implemented and unexercised. |
| P06 | Projects/objects/tasks as connected operational truth | **PARTIALLY_SUPPORTED** | `work_objects` + `project_responsible` + `task_dependencies` + `work_task_events` are real and wired (`20260817150000`, `20260817151000`, `20260817152000`). Two connections are missing: **task ↔ journal** (E23) and a **calendar entity** (E24) — the calendar is a projection with no owned truth. |
| P07 | AI inside real workflows, not a decorative chatbot | **SUPPORTED architecturally / CONTRADICTED operationally** | It is emphatically *not* a chatbot: `lib/ai-workspace/workflows.ts` states **"NO LLM. This is the deterministic floor the doctrine requires (§7): the whole workspace works with the model switched off"**, and `/dashboard/assist` says generation is deliberately not wired. Boundaries pinned by `ai-provider-boundary`, `ai-runtime-boundary`, `zero-ai-marketplace` (**the marketplace must work with every AI provider off**), `no-direct-llm-client-call`, `ai-output-schema-required`, `ai-cost-accounting`. **But** `AI_PROVIDER_MODE=disabled`, `AI_ASSIST_ENABLED = false`, `ai_runs` = 0, and only **3 of 11 registered agents** have any `runAiAgent` call site (match-preview, company-need, worker-intake) — the other 8 are registered and unreachable. So AI is inside workflows by design and inside none of them in fact. |
| P08 | ONE coherent work context, no duplicate dashboards | **PARTIALLY_SUPPORTED** | Enforced hard at the gate: axioms A-01/A-03/A-08, Product Gate rules `second_dashboard`, `duplicate_action`, `new_persistent_menu`, plus `dashboard-duplicate-removal.test.ts`, `canonical-paths-integrity.test.ts`, `no-duplicate-top-level-entries.test.ts`, `consolidation-no-new-truth.test.ts`. **Contradicted at the data layer**, which the repo itself records: 3 invitation systems, 2 membership truths, 3 employment-record models, 6 candidate-stage stores (`docs/audits/full-reality-audit-2026-08-17.md` §Cross-cutting 3; `docs/audits/duplication-freeze-register-2026-08-17.md`). |
| P09 | Natural-language intent → structured actions | **PARTIALLY_SUPPORTED** | The V9 value-intent foundation (`7655c8a9`, #1152) and `lib/value-channels/` deliver understanding → structured routing with honest verdicts. Intent detection is **deterministic**, not model-driven, and the canonical vision §2 requires the chain to end in *"sukuria tikrą DB įrašą ir unikalų ID"* — which holds for journal/demand but not for services, housing, invoices or automations, which have no action to create. |
| P10 | Skills/capacity supply meeting demand | **PARTIALLY_SUPPORTED** (revised — C-01/C-02) | Both halves exist and **are connected**: 44,113 vacancies reach `/dashboard/opportunities` through `buildNeedFromVacancy` → `matchWorkerToNeed`, the same engine used for employer scouting and the admin workbench. `matches` = 0 is doctrine-correct (results are never persisted), so it is not evidence of failure. What is missing is demand-side reach — no anonymous route, no second market, and no production signal (`demand_interest_signals`, `demand_shortlist`) proving a real person completed the loop. TEST A is **structurally satisfied and empirically unproven**. |
| P11 | Services/products REUSE identity/org/matching/evidence/payment primitives | **PARTIALLY_SUPPORTED** | Reuse is real where it exists: `service_offerings` + `marketplace_listings` hang off `organizations` and render through `business/[slug]` and `dashboard/listings`; `service_offering_requests` reuses the conversation spine (`lib/marketplace/service-request-conversation.ts`) and the notification spine. But the payment primitive is deliberately absent (`service-offerings-no-payment.test.ts`) and there is **no booking/quote/completion** entity, so the §7 order lifecycle does not exist. Products/commerce reuse nothing — only eligibility verdicts. |
| P12 | Multilingual applies to DYNAMIC content, not just UI | **CONTRADICTED (by design tension)** | Doctrine §2.1 is unambiguous: user-authored content stores `original_text` + `original_language` and is **translated on read, cached with TTL** — translation columns are forbidden (§2.2/§2.3). The storage half is implemented everywhere. **The read-time translation layer is not delivered**: `lib/guards/translation-service-honesty.test.ts` pins honest degradation rather than translation, and the 44,113 Swedish vacancies are served untranslated into a `lt/en/ru/nl/de` UI. Additionally 37 `landing.hero.*` prose keys are raw English for RU/NL/DE (`docs/audits/localization-truth-2026-08-18.md` §0). |
| P13 | FREE worker experience genuinely useful | **SUPPORTED in capability / unproven in outcome** | Free and proven in production: signup, avatar, profile, CV create/import/export, Work Journal, skill evidence, consent controls. The opportunity board with 38,142 real ads is also free and wired (C-01). What is unproven is whether any of it reached a worker: no notification has ever fired, and no interest signal or shortlist is evidenced. |
| P14 | Paid employer value not depending only on hiring | **NO_EVIDENCE (in production)** | The intent is explicit (`OPPORTUNITY_REALIZATION_LOCK_V1` §7) and the non-hiring modules were built. But **0 payments have ever been taken**, `PAYMENTS_ENABLED=false`, the only provider is `stripe-test`, the LMC app layer is dead, and axioms A-10/A-11 (one catalogue, no launch without an economic model) still carry *"machine half ships with #895/#896"* — i.e. unenforced. There is no evidence either way about what employers will pay for. |
| P15 | Reputation grounded in real activity, never fabricated star ratings | **SUPPORTED** | Constitution §10 and doctrine §19 forbid any universal score; `lib/guards/fit-not-rating.test.ts` pins the forbidden field names (`overall_score`, `person_score`, `worker_rating`, `trust_score`, `profile_strength`, OVR). `performance_reviews` was shipped with **zero** `rating`/`score`/`grade`/`rank` columns — the doctrine is now enforced by the production schema itself. Reputation reads from `experience_records` (real rows in prod). One open conflict is recorded by the constitution itself (§10 "Standing conflict to resolve": legacy OVR marketing copy) and `companies.trust_score` still exists as a column from `0001_initial_schema.sql`. |

**Score:** 4 SUPPORTED · 8 PARTIALLY_SUPPORTED · 2 CONTRADICTED (P08 duplication, P12 dynamic
translation) · 1 SPLIT (P07 — supported architecturally, contradicted operationally) ·
1 NO_EVIDENCE (P14).

**The pattern across all fifteen.** Every principle is enforced *upward* — by guard tests,
schema CHECKs, RLS and the Product Gate — and unproven *downward*, by use. The product's
honesty machinery is genuinely exceptional (678 guard suites; `performance_reviews` shipped
with zero score columns; `service-offerings-no-payment` pins an absence; `zero-ai-marketplace`
forces the marketplace to work with every AI provider off). The two genuine contradictions are
both **structural debt the repo already documents**: duplicated truth stores (P08) and an
unwired read-time translation layer (P12).

---

## 5. REQUIREMENT TRACEABILITY MATRIX

Column key — **Intent**: intent class · **Code / DB / UI**: implementation columns ·
**Prod**: production proof (UNKNOWN unless a production artefact proves it) ·
**Test**: test proof · **Status** · **Gap** · **Auto?**: autonomously fixable ·
**Owner?**: owner decision required.

### 5.1 Platform / world model / honesty / i18n (REQ-PLAT)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-PLAT-001 | The product is ONE living world of four pillars (AI Conversation, Avatar, World Map, Work Journal); everything else extends them | APPROVED_CURRENT_INTENT — `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` §1 | `lib/product-gate/universal-object-model.ts` | — | — | UNKNOWN | `lib/guards/product-gate.test.ts` | PARTIAL | Pillars 1 (AI) and 3 (Map) are not the primary interface in production | no | no |
| REQ-PLAT-002 | Twelve world elements are the only permitted top-level concepts | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1.md` §2 | `lib/product-gate/world-elements.ts` | — | — | UNKNOWN | guard asserts doc↔code parity | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-PLAT-003 | Object types are **registered**, not hardcoded; a new type must not require Map re-architecture | APPROVED_CURRENT_INTENT — `PRODUCT_UNIVERSE_LOCK_V2.md` "WORLD MAP YRA PLATFORMA" | `lib/product-gate/entity-model.ts` | **no `object_types` table** | map layers coded per type | UNKNOWN | partial | PARTIAL | The registry is a TS constant, not data; adding a type still needs a deploy | yes (add registry table) | yes (schema) |
| REQ-PLAT-004 | Every object carries the Universal Object Model minimum (id, type, location, geometry, status, history, relationships, permissions, events, documents, media, timeline, metadata, actions, visibility, tags, extensions) | APPROVED_CURRENT_INTENT — same §1 | declared in TS | no common base table | — | UNKNOWN | guard | PARTIAL | No shared base; each entity re-implements a subset | no | yes |
| REQ-PLAT-005 | Every new surface declares 5 answers in the surface registry; undeclared surfaces block merge | APPROVED_CURRENT_INTENT — constitution §13.2–§13.3 | `.github/scripts/product-gate.mjs`, `lib/product-gate/surface-registry.ts` | — | CI | UNKNOWN | `product-gate.test.ts` | IMPLEMENTED_NOT_PROVEN | Baseline of 2026-07-28 is grandfathered = **un-audited, not approved** (constitution §13.5) | no | no |
| REQ-PLAT-006 | User-authored text stores `original_text` + `original_language` only; translation columns forbidden | APPROVED_CURRENT_INTENT — doctrine §2.2/§2.3 | widespread | yes (journal, chat, requests) | — | VERIFIED_PRODUCTION (36 entries) | multiple | VERIFIED_PRODUCTION | — | no | no |
| REQ-PLAT-007 | Dynamic user content is **translated on read** and cached with TTL | APPROVED_CURRENT_INTENT — doctrine §2.1 "Translated on read, cached in Redis/edge, TTL ~30 days" | `lib/translation/translation-service.ts` is an honest **interface**, no provider connected | `public_vacancies` carries `translation_target_language/status/title_text/description_text/provider`; work instructions carry `original_language` + `translated_text` | honest degradation | **UNKNOWN — status resolves to `unavailable`, publisher's own words shown** | `translation-service-honesty.test.ts`, `conversations-language.test.ts` | **PARTIAL** | Schema and degradation path exist; **no provider is wired**, so 44,113 Swedish ads render in Swedish to an lt/en/ru/nl/de audience. Wiring a provider is an owner-gated RED action | no | **yes** (cost/provider) |
| REQ-PLAT-008 | Platform taxonomy is slug + per-locale JSON; no hardcoded enums for extensible taxonomy | APPROVED_CURRENT_INTENT — doctrine §10 | `messages/{locale}/*.json` | slug registries | — | VERIFIED_PRODUCTION | `skill-installation-chain.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-PLAT-009 | 11 full-UI locales exist at all times; FI as taxonomy-only; no PR may remove a locale | APPROVED_CURRENT_INTENT — doctrine §2.4 | `lib/i18n/config.ts` | — | 5 routed | PARTIAL (5 of 11 routed) | `i18n-lt-en-parity.test.ts`, `i18n-debt.test.ts` | PARTIAL | 6 catalogue locales at ~40% key coverage, correctly not routed | no | yes (activation) |
| REQ-PLAT-010 | ACTIVE locales (lt/en/ru) receive real translations in the same PR | APPROVED_CURRENT_INTENT — doctrine §2.4 | catalogues | — | — | VERIFIED_PRODUCTION (99.33% RU) | parity guards | **BROKEN** | 37 `landing.hero.*` keys are raw English for RU/NL/DE — the first screen a Russian visitor sees; invisible to every existing guard | **yes** | no |
| REQ-PLAT-011 | Adding a launch market must not require core schema migration or UI rework | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §4; ADR 0010 | `countries`, provider registry | yes | — | UNKNOWN | — | IMPLEMENTED_NOT_PROVEN | Never exercised — one country of supply | no | no |
| REQ-PLAT-012 | No demo/pilot/intermediate layer; honest empty states framed as a founder moment; only an honest "RUOŠIAMA" roadmap allowed | APPROVED_CURRENT_INTENT — doctrine §18 | copy + empty states | — | yes | VERIFIED_PRODUCTION | `product-copy-forbidden-terms.test.ts`, `dashboard-empty-state-clarity.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-PLAT-013 | No fake AI, matching, verification, ratings, candidates, companies, jobs or metrics | APPROVED_CURRENT_INTENT — constitution §5, axiom A-06 | placeholder governance | — | `<Placeholder>` | VERIFIED_PRODUCTION (159 entries) | `placeholders:check`, `marketing-copy-no-evidence.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-PLAT-014 | An unmeasured metric is reported as unmeasured, never as zero | APPROVED_CURRENT_INTENT — axiom **A-12** | — | — | — | UNKNOWN | — | **MISSING (enforcement)** | Constitution itself records "machine half ships with #897" — #897 not merged | yes | no |
| REQ-PLAT-015 | One function has ONE home; no duplicate objects; no re-entering data another path captured | APPROVED_CURRENT_INTENT — axioms A-02, A-08 | canonical resolvers | — | — | UNKNOWN | `canonical-paths-integrity.test.ts`, `consolidation-no-new-truth.test.ts` | **PARTIAL** | Data layer holds 3 invitation systems, 2 membership truths, 3 employment models, 6 candidate-stage stores | no | yes (consolidation migrations) |
| REQ-PLAT-016 | Migration naming forward-only `YYYYMMDDHHMMSS_*`; applied migrations never renamed; every DB migration reversible | APPROVED_CURRENT_INTENT — doctrine §16 | — | 225 files | — | VERIFIED_PRODUCTION (213 applied) | migration-safety CI | VERIFIED_PRODUCTION | — | no | no |
| REQ-PLAT-017 | `APPLIED_LEDGER.md` reflects production truth | IMPLEMENTED_CURRENT_BEHAVIOR — `docs/APPLIED_LEDGER.md` | doc | — | — | **CONTRADICTED** | — | **BROKEN** | 43 entries falsely read `PENDING APPLY`/`Deferred`, incl. ≥6 applied migrations | **yes** | no |
| REQ-PLAT-018 | Chat-first is the primary interface; `/dashboard` IS the conversation | APPROVED_CURRENT_INTENT — axiom **A-01** | `components/app/conversation/*` (~2,100-line chat) | conversations tables | yes | UNKNOWN | `conversation-canonical-delegation.test.ts`, `chat_importance_reduced` gate rule | PARTIAL | Real chat UI over real data, **zero model calls in any turn**; deterministic router only | no | yes (AI activation) |

### 5.2 Public marketplace (REQ-MKT)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-MKT-001 | Real external labour supply is ingested from official sources and kept fresh | APPROVED_CURRENT_INTENT — `docs/product/public-vacancy-source-pipeline-v1.md`; `PROJECT_VISION` §8 module 11 | `lib/vacancy-runner/`, `lib/vacancy-sources/` | `public_vacancies`, `vacancy_import_cursors` (`20260809160000`) | admin source health | **VERIFIED_PRODUCTION** — 44,113 rows, refreshed 2026-08-18 05:44 UTC | `vacancy-ingestion.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-MKT-002 | A worker can browse / search external opportunities on the ONE board, matched by the ONE engine, with provenance and apply-out-only capability | APPROVED_CURRENT_INTENT — TEST A, `OPPORTUNITY_REALIZATION_LOCK_V1` §4 | **WIRED** — `external-vacancies.ts:33` → `load-worker-opportunities.ts:258` → `worker-opportunities.ts:173` | 38,142 live rows, RLS-scoped to the worker's own client | `dashboard/opportunities/page.tsx:9,:1127` | **UNKNOWN — no usage evidence** | `external-vacancies.test.ts`, `external-vacancies-profile-pool.test.ts`, `board-match-uses-real-need.test.ts`; **no e2e** | **IMPLEMENTED_NOT_PROVEN** (corrected — see C-01) | Not a wiring gap. The section deliberately hides while empty, so the surface is invisible until supply matches the worker; no production proof any worker reached it | no | no |
| REQ-MKT-003 | Job supply is discoverable by anonymous visitors / search engines | UNKNOWN_OWNER_DECISION_REQUIRED — no artefact decides this; §7.1 favours public identity, doctrine §4 favours default-closed | — | RLS grants SELECT to `authenticated` only, no `anon` policy | — | **MISSING** | — | **MISSING** | **The real supply gap.** 44k jobs generate zero SEO/acquisition value; the only public page (`/work-opportunities`) is static copy | no | **yes** |
| REQ-MKT-004 | Supply spans the nine equal-priority launch markets | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §4; ADR 0010 | provider registry supports N | 100% `country = SE`, 100% `arbetsformedlingen` | — | **MISSING** | — | **MISSING** | One country, one provider; supply market (SE) and UI locales (lt/en/ru/nl/de) do not overlap at all | no | yes (which market next) |
| REQ-MKT-005 | The Market World Map is the primary representation of the world, with layers for people, orgs, projects, objects, demand, teams, training, events, leagues, partners, AI objects | APPROVED_CURRENT_INTENT — `PRODUCT_UNIVERSE_LOCK_V2`; `PROJECT_VISION` §11 | `lib/market-map/*` | `market_*` tables | `/dashboard/market-map` | UNKNOWN | `market-map-canonical.test.ts` | PARTIAL | Map exists but is a dashboard route, not the primary world view; several layers absent | no | no |
| REQ-MKT-006 | Public identity is stated positively and universally; no sector priority, not even by negation | APPROVED_CURRENT_INTENT — constitution §7.1 | marketing copy | — | yes | VERIFIED_PRODUCTION | `universal-canonical-definition.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-MKT-007 | Public market claims separate the four populations (marketplace / registered / active / paying) and never derive adoption from imported ads | APPROVED_CURRENT_INTENT — Work-OS report §20 (owner-locked claim) | `lib/analytics/market-coverage-claims.ts` | — | `MarketProofBand` | VERIFIED_PRODUCTION | `market-coverage-claims.test.ts` | VERIFIED_PRODUCTION | Band renders a **pinned constant**, not a live count — honest but stale-prone | yes | no |
| REQ-MKT-008 | Public marketplace rules / legal surfaces exist | IMPLEMENTED_CURRENT_BEHAVIOR | `(marketing)/legal/*` | — | 7 legal pages | UNKNOWN | `auth-legal-notice.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-MKT-009 | Companies have a public business profile page | IMPLEMENTED_CURRENT_BEHAVIOR — `docs/product/company-architecture-v1.md` | `lib/company/public-profile-model.ts` | `organizations`, `marketplace_listings`, `service_offerings` | `/business/[slug]` | UNKNOWN | `company-architecture-v1.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-MKT-010 | Answer-engine / question pages provide indexable, evidence-backed public content | IMPLEMENTED_CURRENT_BEHAVIOR — owner said STOP at 45 questions | `lib/answer-engine/*` | — | `/questions`, `/questions/[slug]` | UNKNOWN | `answer-engine-evidence.test.ts`, `answer-engine-publishing.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |

### 5.3 Worker (REQ-WRK)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-WRK-001 | One human ↔ exactly one profile row, always | APPROVED_CURRENT_INTENT — doctrine §5.1 | trigger `handle_new_user` | `profiles` (`0001`) | — | **VERIFIED_PRODUCTION** — 36 profiles | RLS + auth guards | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-002 | The first role choice is a starting direction, never a permanent category; roles can be added later | APPROVED_CURRENT_INTENT — constitution §1; ADR 0012 | `OnboardingWizard`, `add_role` RPC | `profile_roles`, `active_role` (`0003`) | RoleSwitcher | VERIFIED_PRODUCTION (29 onboarded) | `owner-role-select-dashboard.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-003 | The Avatar is the digital identity carrying profile, skills, history, journal, reputation, documents, certificates, availability, orgs, teams; all actions run in its name | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1` "AVATARAS" | avatar upload path | `profiles.avatar_url` + private bucket | profile card | **VERIFIED_PRODUCTION** — 7 storage objects, all 6 refs are storage paths | `avatar-upload-real.test.ts`, `avatar-migration-safety.test.ts` | VERIFIED_PRODUCTION | Render/replace/delete/mobile/employer-view unproven | no | no |
| REQ-WRK-004 | Profile is a living work identity, never a form and never a log of completed actions | APPROVED_CURRENT_INTENT — constitution §3, axiom A-07 | 8 wired edit sections | `workers`, `worker_*` | `/dashboard/profile` | VERIFIED_PRODUCTION | `profile_shows_completed_action` gate rule | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-005 | No universal human value: no OVR, profile strength, worker rating or trust score anywhere | APPROVED_CURRENT_INTENT — constitution §10; doctrine §19(a) | field-name ban | `profile_completeness`/`headline` deliberately never written (all 0/null) | — | VERIFIED_PRODUCTION | `fit-not-rating.test.ts` | **NOT_REQUIRED** (correctly absent) | Constitution §10 records a standing conflict: legacy OVR marketing copy; `companies.trust_score` column still exists from `0001` | yes (copy) | no |
| REQ-WRK-006 | Every skill carries exactly one of five verification levels (self / journal / manager / client / document) | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §6; **ADR 0009** | `lib/evidence/evidence-tier.ts` | `worker_skills` + `journal_entry_skills`; **`skill_verifications` never created** | tier lexicon | PARTIAL | `evidence-tier-lexicon.test.ts` | **PARTIAL** | Shipped ladder is evidence-tier, not the approved 5-level table; client-confirmed and document-backed levels have no first-class representation | no | **yes** (accept evidence-tier as the ladder, or build ADR 0009) |
| REQ-WRK-007 | `worker_skills.confidence_score` + `confidence_bin` derived from append-only journal + manager confirmations, never user-editable; numeric hidden from external viewers | APPROVED_CURRENT_INTENT — doctrine §15 | `lib/journal/confidence.ts` | `worker_skills`, `platform_skill_aggregates`, `skill_seed_benchmarks` | private self-view | UNKNOWN | `confidence.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-008 | Skills are generated from the Work Journal; CV is only a supplementary source | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1` "SKILLS" | `lib/journal/skill-pipeline.ts` runs on every save | `journal_entry_skills` with `verified:false` provenance | review UI | **VERIFIED_PRODUCTION** — 46 skills from 36 entries | `journal-entry-skill-provenance.test.ts`, `journal-pipeline-canonical.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-009 | CV can be created, imported, reviewed and exported free | APPROVED_CURRENT_INTENT — `/create-cv` Product Gate declaration (A-04) | `/api/cv/extract` (auth, 5 MB), `lib/cv/*` | derived | `/create-cv`, `/cv` | UNKNOWN | `extract.test.ts`, `extract-hardening.test.ts`, `create-cv-acquisition-intent.test.ts` | IMPLEMENTED_NOT_PROVEN | No server-side PDF export | yes | no |
| REQ-WRK-010 | The CV is the central living trust object — computed, signal-rich, real-time | APPROVED_CURRENT_INTENT — `ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` §Non-negotiables 3 | derived verified CV | — | `/cv` | UNKNOWN | `journal-cv-recall.test.ts`, `profile-cv-evidence-hub.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-011 | Work Journal entries are append-only, hash-chained, server-timestamped | APPROVED_CURRENT_INTENT — doctrine §3.1–§3.3 | `create_journal_entry_full` | `journal_entries` + `prev_hash`/`content_hash` (`0013`, `20260530130000`) | journal | **VERIFIED_PRODUCTION** — 36 entries | `journal-integrity-guards-migration.test.ts`, `journal-atomic-supersede.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-012 | Journal entries pin to an engagement context, never directly to an organization | APPROVED_CURRENT_INTENT — doctrine §5.5 | journal actions | `engagement_contexts` (53 rows) | — | VERIFIED_PRODUCTION | `caller-manages-worker-engagements.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-013 | Profession-specific journal templates are data (rows), not code | APPROVED_CURRENT_INTENT — **ADR 0006**; `docs/PROFESSION_TEMPLATES.md` | `lib/journal/journal-templates-model.ts` | `journal_profession_templates`, `profession_templates` | template picker | UNKNOWN | `journal-templates-model.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-014 | A manager who was there confirms the entry; the confirmation becomes verified work proof | APPROVED_CURRENT_INTENT — `PROJECT_ROADMAP.md` "THE WHOLE GOAL", Phase 1 | `lib/journal/confirm-actions.ts` | `journal_entry_confirmations` | review chain | **VERIFIED_PRODUCTION** — 12 confirmations | `journal-evidence-loop.test.ts`, `confirmation-honesty.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-015 | Photo/document evidence attaches to entries and is never auto-represented as legally verified proof | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §6 | photo pipeline + bucket RLS | `journal_entry_photos` | gallery | VERIFIED_PRODUCTION (8 photos) | `journal-photo-continuity.test.ts`, `evidence-status-honesty.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-016 | A meaningful Journal contribution returns visible, truthful value (what history it extended, which opportunities it affected) — never fake percentages | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §6 "Return-on-contribution rule (UX law)" | `journal-enrichment-match.test.ts`, freshness CTA (#1157) | — | board freshness | UNKNOWN | yes | **PARTIAL** | The "opportunities affected" half depends on REQ-MKT-002, which is missing | no | no |
| REQ-WRK-017 | Journal → rematch is event-driven | APPROVED_CURRENT_INTENT — flywheel §3 | recompute-on-visit only | no rematch event | — | UNKNOWN | — | **PARTIAL** | No rematch event, no notification type for matches | yes | no |
| REQ-WRK-018 | Availability: status, window, preferences, absences | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §5, §11 (availability layer) | `save_worker_availability_prefs_v2` | `worker_absences`, `preferred_locations` | absences page | UNKNOWN | `w12-employer-availability.test.ts` | **PARTIAL** | No per-day availability/calendar entity | yes | no |
| REQ-WRK-019 | Worker discoverability is default-closed and consent-gated | APPROVED_CURRENT_INTENT — doctrine §4, §20 | `can_view_worker` | RLS + `privacy_consent_events` | scouting | VERIFIED_PRODUCTION (RLS enforced) | `consent-fail-closed.test.ts`, `can-view-worker-booking-engagement.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-020 | Private choices/activity are never visible to employers/agencies/customers in any form or aggregate; privacy is symmetric | APPROVED_CURRENT_INTENT — doctrine §20.1–§20.2 | — | — | — | UNKNOWN | `privacy-base.test.ts` (§20 text pins) | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-021 | Worker can self-serve data access, export and deletion | APPROVED_CURRENT_INTENT — doctrine §20.6; GDPR | `lib/privacy/*` | `privacy_consent_events`, deletion plan | `/dashboard/privacy`, `/legal/data-access` | UNKNOWN | `privacy-self-service.test.ts` | IMPLEMENTED_NOT_PROVEN | Deletion executor shipped as review + read-only preview only (#1151) | no | yes (execute deletion) |
| REQ-WRK-022 | Worker owns the profile and it is portable across employers | APPROVED_CURRENT_INTENT — Vecticum matrix "LM advantage angle" row 1 (owner-approved framing) | worker-owned rows | `workers` keyed to `profiles` | — | VERIFIED_PRODUCTION | RLS | VERIFIED_PRODUCTION | — | no | no |
| REQ-WRK-023 | Worker sees opportunities matched to their context, without browsing thousands of listings | APPROVED_CURRENT_INTENT — **TEST A** | `lib/opportunities/*`, `load-worker-opportunities.ts` | matcher over `public_vacancies` | `/dashboard/opportunities` | **UNKNOWN — 0 matches** | `external-vacancies.test.ts`, `opportunity-fit.test.ts` | **IMPLEMENTED_NOT_PROVEN** | Never produced a row; TEST A currently fails | no | no |
| REQ-WRK-024 | Worker can act on an opportunity (interest, save, contact, seen, respond) and external ads honestly link out | APPROVED_CURRENT_INTENT — flywheel §5 | `interest-actions.ts`, `saved-actions.ts`, `contact-employer.ts` | `demand_interest_signals`, `worker_saved_opportunities`, `worker_opportunity_seen` | opportunities | UNKNOWN | `worker-contact-employer.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-025 | Worker receives notifications about relevant lifecycle events | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 9 | emitters wired | `notification_events` (v1–v4) | feed + mark-read | **UNKNOWN — 0 rows, 0 lifetime inserts** | `notification` guards | **IMPLEMENTED_NOT_PROVEN** | Never fired once; no match/expiry/reminder notification types exist | no | no |
| REQ-WRK-026 | Employed workers keep gaining value (not only jobseekers) | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §7 + commit `cf747767` | `employed-worker-acceptance.test.ts` | — | copy + telemetry | UNKNOWN | yes | PARTIAL | Value channel is opportunity discovery (REQ-MKT-002, missing) | no | no |
| REQ-WRK-027 | Multi-language worker text recognition runs offline from bundled dictionaries (no online APIs at runtime) | APPROVED_CURRENT_INTENT — doctrine §2.4 changelog (owner offline mandate 2026-07-04) | `lib/structuring/language-packs/` | — | — | UNKNOWN | `offline-language-pack.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-028 | Worker document metadata registry with types, expiry derivation and admin verification | APPROVED_CURRENT_INTENT — vision §9; `PROJECT_VISION` §8 module 4 | `upsert_worker_document` | `worker_documents`, `worker_document_events`, `document_types` (12 slugs) | `/dashboard/documents` | UNKNOWN | `worker-doc-verification-request.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-029 | The system tells a worker which documents are missing for a specific job / country / company / project / order | APPROVED_CURRENT_INTENT — vision §9 (six explicit anchors) | `country_document_requirements` | partial | LT guidance component | UNKNOWN | `country-evidence.test.ts` | **PARTIAL** | Requirements engine covers country only; job/company/project/order anchors absent | no | no |
| REQ-WRK-030 | Worker can order a document-handling service | APPROVED_CURRENT_INTENT — vision §9 point (5) | — | — | — | **MISSING** | — | **MISSING** | Depends on the services order lifecycle (REQ-SVC-003) | no | no |
| REQ-WRK-031 | Worker profile carries languages, education, achievements, professions | IMPLEMENTED_CURRENT_BEHAVIOR | profile sections | `worker_languages`, `worker_education`, `worker_achievements`, `worker_professions` | profile | UNKNOWN | — | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-032 | External profile import is consent-gated | APPROVED_CURRENT_INTENT — `docs/product/external-profile-consent-contract-v1.md` | `lib/worker/external-profiles` | `worker_external_profiles` | — | UNKNOWN | `external-profiles-consent.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-WRK-033 | Voice journal intake | EXPERIMENT_OR_REFERENCE — `docs/product/…voice…`; route exists | `/dashboard/journal/voice` | — | yes | UNKNOWN | `voice-work-journal.test.ts` | IMPLEMENTED_NOT_PROVEN | Programme carries open owner gates | no | yes |

### 5.4 Employer / organization (REQ-ORG)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-ORG-001 | A company/team/agency/project is a first-class activity space with its own presence | APPROVED_CURRENT_INTENT — constitution §4 | `save_company_setup_v3` | `organizations`, `companies` | `/dashboard/company` | **VERIFIED_PRODUCTION** — 13 orgs | `company-architecture-v1.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-002 | One user manages many organizations without separate accounts, with an explicit active context | APPROVED_CURRENT_INTENT — canonical vision §3–§4 | `employer-company-context.ts` | `20260805170000_multi_org_company_ownership_cap_removal_v1.sql`, `20260817160000_durable_workspace_pointer_v2.sql` | org switcher | VERIFIED_PRODUCTION (14 memberships) | `employer-organization-context.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-003 | Org roles owner/admin/manager/external_manager/member with last-owner protection | IMPLEMENTED_CURRENT_BEHAVIOR — `20260806090000`, `20260806120000` | membership commands | `company_memberships` | members UI | VERIFIED_PRODUCTION | `membership` guards | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-004 | Positions inside an organization are an extensible registry, distinct from RBAC | APPROVED_CURRENT_INTENT — doctrine §5.4 | — | **no positions registry** | — | **MISSING** | — | **MISSING** | Doctrine §5.4 has no implementation; org-side employment card has no position/pay/FTE | no | yes |
| REQ-ORG-005 | Engagement contexts are plural, open, first-class, classified by an extensible relationship-type slug | APPROVED_CURRENT_INTENT — doctrine §5.5 | provisioning RPC | `engagement_contexts`, `relationship_types` | — | VERIFIED_PRODUCTION (53 rows) | ADR `engagement-context-provisioning-rpc-v1` | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-006 | Exactly ONE structured demand model (`customer_requests`) via owner-scoped SECURITY DEFINER RPCs | APPROVED_CURRENT_INTENT — doctrine §17/§17.1 | `save_demand_draft`, `submit_demand_request_v2` | `customer_requests` + attachments | demand forms | **VERIFIED_PRODUCTION** — 17 requests | `canonical-demand-truth.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-007 | `leads` remains a distinct anonymous pre-auth funnel, never merged into demand intake | APPROVED_CURRENT_INTENT — doctrine §17.2 | `/api/leads` retained, dormant | `leads`, `waitlist` | — | UNKNOWN | doctrine pin | IMPLEMENTED_NOT_PROVEN | Currently has no in-product caller by design | no | no |
| REQ-ORG-008 | Employer finds, verifies and manages workers (scouting, shortlist, people search) | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §15 "Įmonei" | `lib/company/scouting` | `demand_shortlist`, `booking_requests` | `/dashboard/company/scouting`, `/dashboard/talent` | UNKNOWN | `company-scouting-visibility.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-ORG-009 | Contact disclosure is scoped to one demand + one org, carries field names never values, and is logged append-only | APPROVED_CURRENT_INTENT — doctrine §20; `20260817122000` | disclosure RPCs | `contact_disclosure_requests`, `personal_data_disclosures` | request button | **UNKNOWN — 0 rows** | `contact-permission-quota-bridge-v1` | IMPLEMENTED_NOT_PROVEN | Never used | no | no |
| REQ-ORG-010 | Teams are a first-class object with their own identity and roster | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §5 object 6; `DATA_MODEL.md` `team_entities` sketch | `team-brigade-actions.ts` | `organizations` type `team` + `team_details`; **no roster** | team UI | UNKNOWN | `match-team-v1.test.ts` | **PARTIAL** | Approved shape (`team_entities` with members) never built; no departments/org tree | no | yes (accept current shape or build) |
| REQ-ORG-011 | Agencies prepare candidates, manage several client companies, track offer/candidate status, receive commission, collaborate with other agencies | APPROVED_CURRENT_INTENT — canonical vision §6; `PROJECT_VISION` §5 object 8 | `lib/agency/*` | `agency_clients`, `agency_client_connections`, `agency_client_request_shares` | `/for-agencies`, agency UI | UNKNOWN | `agency-real-client-bridge.test.ts` | **PARTIAL** | Commission model absent; `agency_candidate_offers` applied with **zero app callers** (DEAD) | no | yes (commission) |
| REQ-ORG-012 | Invitations join people to companies/agencies/teams/buyer orgs as an additional (never sole) channel | APPROVED_CURRENT_INTENT — constitution §11 | token invite flow | `invitations` (+2 legacy systems) | `/invite/[token]` | UNKNOWN | `accept-worker-invitation-rpc.test.ts` | **PARTIAL** | THREE parallel invitation systems live simultaneously | no | yes (consolidation) |
| REQ-ORG-013 | Cross-tenant isolation is enforced by RLS as the only isolation layer | APPROVED_CURRENT_INTENT — `DATA_MODEL.md` "RLS — the authoritative policy reference" | RPC-only writes | 0 tables without RLS | — | **VERIFIED_PRODUCTION** (advisors) | `security-train-a-v1.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-ORG-014 | Org sees consent-gated aggregates of worker documents, never the documents | APPROVED_CURRENT_INTENT — doctrine §20 | aggregate queries | RLS | org document counts | UNKNOWN | `w12-employer-absence-privacy` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-ORG-015 | Employer gets a daily operating picture (opening brief, who is absent now, org today) | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §7 | #1146, #1147 | derived | company dashboards | UNKNOWN | `employer-opening-brief.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-ORG-016 | Company verification by admin | IMPLEMENTED_CURRENT_BEHAVIOR | admin review | flags | `/dashboard/admin/company-verification` | UNKNOWN | `company-verification-admin.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |

### 5.5 Daily workforce & business OS (REQ-OPS)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-OPS-001 | Projects have lifecycle, status, responsible person and derived progress | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 5 | `set_project_status_v1` | `projects`, `20260804120000`, `20260817152000` | `/dashboard/projects` | UNKNOWN | `w11-project-operating-system-audit` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-002 | Objects/sites are first-class with their own history (site, factory, warehouse, office, training centre, event, any activity location) | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1` "OBJECTS" | `lib/work-objects/*` | `work_objects` (`20260817150000`, supersedes `company_locations_v1`) | company workspace + map layer | **UNKNOWN — 0 rows** | guards | **IMPLEMENTED_NOT_PROVEN** | Never used | no | no |
| REQ-OPS-003 | Tasks: create, assign to others, dependencies, history, reopen | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8; Vecticum parity P0 | `lib/tasks/*` | `work_tasks`, `task_dependencies`, `work_task_events` (`20260817151000`) | `/dashboard/tasks` | UNKNOWN | task guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-004 | Tasks link to Work Journal entries | APPROVED_CURRENT_INTENT — flywheel §3 (activity context) | **absent** | no link column | — | **MISSING** | — | **MISSING** | Journal auto-links to project only; task link absent, no picker | yes | no |
| REQ-OPS-005 | Project stages with Gantt and calendar feed | IMPLEMENTED_CURRENT_BEHAVIOR | 3 RPCs | `project_stages` | Gantt | UNKNOWN | — | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-006 | A calendar is a real entity, not only a projection | APPROVED_CURRENT_INTENT — axiom **A-03** (chat → journal → **calendar** → messages) | projection over 8 sources + conflict detection | **no calendar entity** | calendar views | UNKNOWN | `calendar-full-detail.test.ts` | **PARTIAL** | Read-only by construction; cannot own scheduling truth; no shift/roster entity | no | yes |
| REQ-OPS-007 | Timesheets are a period document **derived** from the Work Journal, with no second hours store | APPROVED_CURRENT_INTENT — Vecticum parity P1 ("no new hours store"); `20260817170000` header; **OWNER RULING 2026-08-18** (`journal_entry_metrics` is canonical) | canonical rule in `lib/journal/work-time.ts` ⇄ `timesheet_compute_lines_v1` (`20260818150000`); export at `planning/timesheets/[id]/export/route.ts` | `timesheets`, `timesheet_events`; source is now `journal_entry_metrics` — `journal_entry_work_items` is DEPRECATED (0 rows, 0 writers, 0 readers, `comment on table`) | `/dashboard/planning/timesheets` | **derivation PROVEN on real production evidence** — 9 real lines where the old code produced 0 (read-only, no synthetic row); the org DOCUMENT is still 0 rows | 30 unit tests + SQL⇄TS guard | **PARTIAL** | BROKEN CHAIN is CLOSED: hours now come from the canonical metrics, double counting is structurally impossible, conflicts are reported not dropped. What remains is NOT a code defect — every hour ever recorded sits on a PERSONAL (org-less) engagement, and `timesheets.organization_id` is NOT NULL, so no org sheet can be non-empty yet. See `docs/audit/journal-canonical-work-time-v1.md` §5 | partly (needs real org-scoped journal usage) | **yes** (allow a personal timesheet? — §6.1) |
| REQ-OPS-008 | Typed employee requests whose approval lifecycle IS a workflow instance (no per-type approval tables) | APPROVED_CURRENT_INTENT — `20260817180000` header; Vecticum parity P0 | `lib/requests/*` | `employee_requests` (7-type closed vocab) | `/dashboard/network` requests-section | **UNKNOWN — 0 rows** | `employee-requests.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-009 | Leave/absence request → approve/reject/cancel with notifications and manager visibility | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 | `lib/leave/absences-actions.ts` | `worker_absences` | `/dashboard/absences` | UNKNOWN | absence guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-010 | Leave balances are configurable per org × absence type, derived at read time, **advisory only** — a warning, never a block, no statutory defaults | APPROVED_CURRENT_INTENT — `20260817181000` header | derived | `leave_balance_policies` (0 seeded rows by design) | chip | UNKNOWN | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-011 | Employment lifecycle on `engagement_contexts` as the canonical employment record | APPROVED_CURRENT_INTENT — `20260817190000` header ("the only one with live production data") | COALESCE rule mirrored in TS | 4 additive columns + `engagement_lifecycle_events` | lifecycle UI | PARTIAL (53 engagement rows; 0 lifecycle events) | `employee-lifecycle.test.ts` | **PARTIAL** | Declared canonical, but 3 employment models still live | no | yes (retire the other two) |
| REQ-OPS-012 | Onboarding templates → snapshot runs whose item completion is verified against **real** rows | APPROVED_CURRENT_INTENT — same header | verification against `work_tasks`/`document_acknowledgements`/`asset_assignments` | `onboarding_templates`, `onboarding_runs`, `onboarding_run_items` | `/dashboard/start` | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-013 | Offboarding runs with an asset-return checklist generated from asset reality | APPROVED_CURRENT_INTENT — same header | generated checklist | `offboarding_runs`, `offboarding_run_items` | — | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-014 | Agreements register + append-only amendments + honest signature **evidence** (never an execution claim) | APPROVED_CURRENT_INTENT — `20260817200000` header; legal-control doctrine | 8 SECDEF commands | `agreements`, `agreement_amendments`, `agreement_events` | `agreements-register.tsx` | **UNKNOWN — 0 rows** | `agreements.test.ts` (parses the SQL CHECK; status vocab may never contain `signed`/`executed`/`legal`/`valid`/`binding`/`notarized`) | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-015 | Qualified e-signature (eIDAS) | EXPERIMENT_OR_REFERENCE — appears only as a Vecticum comparison row; **no LM artefact approves it** | — | — | honest disclaimer | **NOT_REQUIRED** | `commercial.noSignatureNote` | **NOT_REQUIRED** | Deliberately absent and honestly disclaimed | no | yes (if ever wanted) |
| REQ-OPS-016 | Procurement inquiries → offers → events on the existing workflow engine | APPROVED_CURRENT_INTENT — `20260817221000` header | sync commands copy only terminal outcomes | `procurement_inquiries`, `procurement_offers`, `procurement_events` | `/dashboard/finance` procurement-section | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-017 | Business trips with events and finance linkage | APPROVED_CURRENT_INTENT — `20260817222000` header | — | `business_trips`, `business_trip_events`, `finance_records.trip_id` | trips-section | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-018 | Expenses and invoices register with due/overdue derivation and CSV export | IMPLEMENTED_CURRENT_BEHAVIOR + canonical vision §10 | `lib/finance/*` | `finance_records` + `20260817220000` (invoice no., VAT, receipt pointer) | `/dashboard/finance` | UNKNOWN | finance guards | IMPLEMENTED_NOT_PROVEN | No OCR (by design); no routing | no | no |
| REQ-OPS-019 | Invoices generated **from Work Journals** by day/period/week/month/year/project/client/worker/company/work type, producing invoice, prepayment, credit note, acceptance act, timesheet, work summary, expense report, client report, PDF and accounting export | APPROVED_CURRENT_INTENT — canonical vision §10 (explicit, itemised) | **absent** | `finance_records` only | — | **MISSING** | — | **MISSING** | The journal→document generator does not exist; only manual finance records | no | no |
| REQ-OPS-020 | Invoice status machine `draft → approved → sent → viewed → partially_paid → paid \| overdue \| cancelled` | APPROVED_CURRENT_INTENT — canonical vision §10 | partial statuses | `finance_records.status` | — | UNKNOWN | — | **PARTIAL** | `sent`/`viewed`/`partially_paid` states absent | yes | no |
| REQ-OPS-021 | Assets: issue → acknowledge → transfer → return | IMPLEMENTED_CURRENT_BEHAVIOR | 5 RPCs | `assets`, `asset_assignments` | `/dashboard/assets` | UNKNOWN | `assets-logistics.test.ts` | IMPLEMENTED_NOT_PROVEN | No stock counts | no | no |
| REQ-OPS-022 | Training programmes → assignments issuing a real certificate bound to a document-file version, with expiry | APPROVED_CURRENT_INTENT — `20260817230000` header; `PROJECT_VISION` §8 module 13 | `lib/training/*` | `training_programs`, `training_assignments`, `training_skill_links` | `training-register.tsx` | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-023 | Learning/growth module tells a worker what to do to fit a job | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 13 | `lib/learning/*` | `learning_signals`, `learning_review_queue`, `learning_policy_settings` | `/dashboard/learning` | UNKNOWN | `learning-i18n-parity.test.ts` | **PARTIAL** | Signals exist; the "what to do to fit job X" path depends on matching (0 rows) | no | no |
| REQ-OPS-024 | Development reviews record a conversation (worker input, manager input, development plan, follow-up) and **never** a competence score | APPROVED_CURRENT_INTENT — doctrine "record count, never a competence score"; enforced by schema | `lib/reviews/*` | `review_cycles`, `performance_reviews` — **zero** `rating`/`score`/`grade`/`rank` columns | `development-reviews-section.tsx` | **UNKNOWN — 0 rows** | schema-level enforcement | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-025 | Tests/assessments as a skill-truth mechanism | HISTORICAL_SUPERSEDED_IDEA / deliberate exclusion — *"skill truth = evidence + confirmation"* | — | — | — | **NOT_REQUIRED** | — | **NOT_REQUIRED** | Deliberately not built | no | no |
| REQ-OPS-026 | Management decisions with agenda, result, responsible, deadline, workflow instance and links to executing tasks | APPROVED_CURRENT_INTENT — `20260817232000` header | `lib/decisions/*` | `management_decisions`, `decision_task_links`, `decision_document_links` | `management-decisions-section.tsx` | **UNKNOWN — 0 rows** | guards | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-OPS-027 | A first-class **decision queue**, ranked by urgency, scoped by RLS to the actor who must act | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 10 ("pirmos klasės UI … ne tik sąrašas"); `DATA_MODEL.md` M2 sketch | `lib/approvals/approvals-model.ts` | derived | `dashboard/network/approvals-section.tsx` | UNKNOWN | approvals guards | **PARTIAL** | Shipped as a section, not a first-class urgency-ranked surface; the approved shape was never built | no | yes (accept or build) |
| REQ-OPS-028 | Generic Workflow & Approval engine: 1–20 ordered rounds, `single\|all\|any` modes, closed approver-rule vocabulary, deadlines, escalation, frozen published versions, one live instance per context entity | APPROVED_CURRENT_INTENT — `20260817130000` header (named the #1 architectural gap) | 4 helpers, 8 SECDEF commands, 3 trigger guards | 7 tables + `20260818120000_workflow_template_management_v1.sql` | `workflow-templates-panel.tsx`, `workflow-timeline.tsx` | **VERIFIED_TEST_ENVIRONMENT** — prod E2E ran (4 instances, 10 transitions) then rolled back; 16 templates installed, **0 live instances** | guards | **VERIFIED_TEST_ENVIRONMENT** | Never used by a real person | no | no |
| REQ-OPS-029 | Capacity / skill-gap modelling with 8 gap types | IMPLEMENTED_CURRENT_BEHAVIOR — `docs/product/workforce-capacity-skill-gap-contract-v1.md` | deterministic engine | **ZERO persistence** | planning page | UNKNOWN | `workforce-canonical.test.ts` | **PARTIAL** | Computed and rendered, never stored — cannot be trended or audited. Its ACTUALS input was re-pointed to the canonical metrics on 2026-08-18 (it previously read the empty `journal_entry_work_items` and reported 0 h for workers who had recorded hours) | yes | no |
| REQ-OPS-030 | Workforce planning produces a human-readable plan | APPROVED_CURRENT_INTENT — `docs/product/future-work-planning-contract-v1.md` | compute pipeline → planning page | — | `/dashboard/planning` | UNKNOWN | — | **PARTIAL** | The "human plan" payload key has **no writer** | yes | no |
| REQ-OPS-031 | Workload as a modelled concept | UNKNOWN_OWNER_DECISION_REQUIRED — named in the reality audit as MISSING with "zero matches repo-wide"; no approving artefact found | `lib/planning/workload-model.ts` (pure) + `getMyJournalWorkHours` | **no workload entity** — derived over `journal_entry_metrics` | workload strip on `/dashboard/planning` (week + agenda) | **PROVEN 2026-08-18** — real journal hours per day on real production rows | `workload-model` + `work-time` tests | **PARTIAL** | The workload STRIP exists (`lib/planning/workload-model.ts`) and its actual-hours half is now real: planned committed DAYS vs canonical journal HOURS per week, proven end-to-end on production data 2026-08-18. Whether workload is a modelled ENTITY distinct from capacity is still unanswered | no | **yes** |
| REQ-OPS-032 | Shift / roster entity | UNKNOWN_OWNER_DECISION_REQUIRED — implied by `PROJECT_VISION` §5 ("gamyboj = pamaina"), never specified | — | — | — | **MISSING** | — | **MISSING** | Scheduling has no owned entity | no | **yes** |
| REQ-OPS-033 | Housing / accommodation: listings, worker housing, short and long lets, bed/room/flat/house booking, link to project or workplace, company-paid housing, allocation, prices and occupancy, contracts and payments, reviews and incidents | APPROVED_CURRENT_INTENT — canonical vision §8 (full itemised spec) | **absent** | **absent** | **absent** | **MISSING** | — | **MISSING** | Entire family unbuilt despite an explicit approved spec | no | no |
| REQ-OPS-034 | Automations created by conversation, each with ID, owner, active context, schedule/condition, state, run history, error history, pause/resume | APPROVED_CURRENT_INTENT — canonical vision §12 (full itemised spec) | **absent** | **absent** | **absent** | **MISSING** | — | **MISSING** | Entire family unbuilt despite an explicit approved spec | no | no |
| REQ-OPS-035 | Two-stage principle for long operations: confirm acceptance with an ID immediately, notify separately when the result is ready | APPROVED_CURRENT_INTENT — canonical vision §11 | partial (readback components) | — | readbacks | UNKNOWN | `result-feedback-clarity.test.ts` | **PARTIAL** | Stage 1 exists; stage 2 needs notifications, which have never fired | no | no |
| REQ-OPS-036 | Project handover passport / evidence report | IMPLEMENTED_CURRENT_BEHAVIOR | `lib/evidence/report` | `project_handover_entries`, `experience_records` | `/dashboard/reports/evidence` | UNKNOWN | `evidence-report-generator-v1` | IMPLEMENTED_NOT_PROVEN | — | no | no |

### 5.6 Skills / value / matching (REQ-SKILL)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-SKILL-001 | ONE matching engine, reused worker-side, employer-side and admin-side; results returned **with their basis and never persisted** | APPROVED_CURRENT_INTENT — flywheel §3 "the one match engine"; doctrine §19(d) forbids a cached general % | `lib/market/match-v1.ts` (pure, no DB, no AI); 21+ non-test importers | derived writes only: `demand_interest_signals`, `demand_shortlist`, `worker_opportunity_seen` | `/dashboard/opportunities`, `/dashboard/company/scouting`, `/dashboard/admin/matching`, `/match-preview` | **UNKNOWN — no interest signals or shortlists evidenced** | `match-v1.test.ts`, `matching-canonical.test.ts`, `matching-consolidation.test.ts`, `w10-7-match-symmetry.test.ts` | **IMPLEMENTED_NOT_PROVEN** (corrected — see C-02) | `matches` = 0 is **correct by doctrine**, not a defect. The real unknown is whether any worker or employer has ever seen a match result | no | no |
| REQ-SKILL-002 | Fit % exists only inside a concrete need context and is always shown with its basis ("19 of 20 skills, 14 confirmed") | APPROVED_CURRENT_INTENT — doctrine §19(b) | `lib/market/fit.ts`, `thermometer.ts` | — | match cards | UNKNOWN | `fit-not-rating.test.ts`, `matching-trust-explainer.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-003 | Confirmed vs declared share is always separated in a fit result | APPROVED_CURRENT_INTENT — doctrine §19(c) | dimensions v2.1 | — | match card | UNKNOWN | `matching-dimensions-v2-1.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-004 | The same subject legitimately scores differently in different contexts; no cached "general" % | APPROVED_CURRENT_INTENT — doctrine §19(d) | per-context computation | no cached score column | — | UNKNOWN | `fit-not-rating.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-005 | Match status derives from raw capability coverage; evidence confidence travels **beside** it and is never multiplied in | APPROVED_CURRENT_INTENT — owner directive 2026-08-09, cited in `OPPORTUNITY_REALIZATION_LOCK_V1` §3 | `match-v1.ts` | — | status chips | UNKNOWN | `matching-status-clarity.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-006 | Matching computes fit through **ESCO canonical ids** | APPROVED_CURRENT_INTENT — `docs/product/s6-matching-fit-spec-note.md` | typeahead only | `esco_occupations`/`esco_skills`/`esco_labels` (1.03M labels, 28 locales) | typeahead | UNKNOWN | — | **BROKEN** | Picks persist **label-only**; `skills.esco_uri` bridge never populated; matching is label-matching, not concept-matching | yes | no |
| REQ-SKILL-007 | Skills/professions taxonomy is universal across all sectors and education levels | APPROVED_CURRENT_INTENT — constitution §7.1 | profession families | `professions`, `profession_skills`, `skills` | `/professions`, `/skills` | VERIFIED_PRODUCTION | `universal-profession-families` | VERIFIED_PRODUCTION | — | no | no |
| REQ-SKILL-008 | Platform-wide skill aggregates fed **only** by manager-confirmed entries, refreshed on a fixed cadence, gated by a minimum sample size below which a curated benchmark is shown as "industry-typical, not platform-measured" | APPROVED_CURRENT_INTENT — doctrine §15 | **no aggregation job exists** | `platform_skill_aggregates` (`0013`) has **ZERO application writers**; `skill_seed_benchmarks` seed-only | — | **MISSING** | — | **MISSING** | Doctrine §15's aggregate half was never built; only the seeded benchmark fallback can ever render | no | no |
| REQ-SKILL-009 | Productivity units live in a slug registry, creatable at platform/org/worker/client scope, with `parent_unit_slug` + `conversion_factor` normalisation | APPROVED_CURRENT_INTENT — doctrine §15 | — | `productivity_units` (`0017` seed) | — | UNKNOWN | `catalog-least-privilege` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-010 | Team matching (a crew, not only an individual) | IMPLEMENTED_CURRENT_BEHAVIOR — `docs/product/…team-match…` | `lib/market/match-team-v1.ts` | — | — | UNKNOWN | `match-team-v1.test.ts`, `team-match-contract.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SKILL-011 | Symmetry: `I NEED SOMETHING → INQUIRY`, `I CAN OFFER SOMETHING → OFFER`, `OFFER ↔ INQUIRY` | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §5 | `lib/value-channels/discovery.ts`, `marketplace-intent-separation.test.ts` | `customer_requests` kinds, `service_offerings`, `marketplace_listings` | intake surfaces | UNKNOWN | `w10-7-match-symmetry.test.ts` | **PARTIAL** | Offer side is thin; offer↔inquiry matching only runs for the labour kind | no | no |
| REQ-SKILL-012 | `job_demands` is the posting entity | **HISTORICAL_SUPERSEDED_IDEA** — `DATA_MODEL.md` describes it; the reality audit records it as a legacy DEAD store superseded by `customer_requests` (doctrine §17) | dead references | `job_demands` = 0 rows | — | **NOT_REQUIRED** | — | **NOT_REQUIRED** | Do not resurrect; schedule for removal | yes (removal) | yes (drop) |
| REQ-SKILL-013 | `candidate_skills` as a separate candidate skill store | **HISTORICAL_SUPERSEDED_IDEA** — reality audit "DEAD found" | — | table exists, no writer | — | **NOT_REQUIRED** | — | **NOT_REQUIRED** | Dead schema | yes | yes (drop) |
| REQ-SKILL-014 | `worker_skills.self_rated_level` as the skill ladder | **HISTORICAL_SUPERSEDED_IDEA** — superseded by evidence-tier | — | column exists, no writer | — | **NOT_REQUIRED** | — | **NOT_REQUIRED** | Dead column | yes | yes (drop) |

### 5.7 Services marketplace (REQ-SVC)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-SVC-001 | A provider can offer a service | APPROVED_CURRENT_INTENT — canonical vision §7 | `lib/marketplace/listings.ts` | `service_offerings`, `marketplace_listings` | `/dashboard/services`, `/dashboard/listings` | UNKNOWN | `service-offerings-publish-funnel.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SVC-002 | A buyer can find a provider and request a service | APPROVED_CURRENT_INTENT — canonical vision §7 | `lib/marketplace/service-requests.ts` | `service_offering_requests` | `/dashboard/service-requests`, `/dashboard/buyer` | UNKNOWN | `marketplace-service-requests-clarity.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SVC-003 | Full order lifecycle: price quote, time booking, completion confirmation, result review, cancellation and dispute logic | APPROVED_CURRENT_INTENT — canonical vision §7 (itemised) | **absent** | no order entity carrying price/deadline/payment/dispute | — | **MISSING** | — | **MISSING** | Only request + conversation exist; no quote, booking, completion, review, cancellation or dispute | no | no |
| REQ-SVC-004 | Service order carries buyer, provider, chosen company-or-personal context | APPROVED_CURRENT_INTENT — canonical vision §7 | partial (org context resolver reused) | — | — | UNKNOWN | — | **PARTIAL** | Context reuse exists; the order does not | no | no |
| REQ-SVC-005 | Service payment or invoicing | APPROVED_CURRENT_INTENT — canonical vision §7 ("apmokėti arba išrašyti sąskaitą") | deliberately absent | — | — | **MISSING** | `service-offerings-no-payment.test.ts` **pins the absence** | **MISSING** | Blocked behind REQ-PAY-001 | no | **yes** |
| REQ-SVC-006 | Services reuse identity/org/matching/evidence primitives rather than forming a separate marketplace | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §3 (silos are architecture defects) | conversation spine + notification spine reused | org-scoped | shared surfaces | UNKNOWN | `service-request-conversation.ts`, `spine-signals.ts` | **PARTIAL** | Identity/org/conversation reused; **matching and evidence are not** — service offerings never enter the match engine | no | no |
| REQ-SVC-007 | Service offerings degrade honestly when unavailable | IMPLEMENTED_CURRENT_BEHAVIOR | honest degradation | — | yes | UNKNOWN | `service-offerings-honest-degradation.test.ts`, `service-offerings-i18n-parity.test.ts`, `service-offerings-migration-rls.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-SVC-008 | B2C `service_requests` + `service_bookings` marketplace over the same worker data | **HISTORICAL_SUPERSEDED_IDEA** — `DATA_MODEL.md` M3 sketch + ADR 0007; superseded in practice by `service_offerings`/`service_offering_requests` | — | `service_bookings` never created | — | **NOT_REQUIRED** | — | **NOT_REQUIRED** | Do not build the M3 sketch; the shipped shape replaced it. **Note:** ADR 0007's *customer role* itself remains approved | no | no |

### 5.8 Products / commerce / capacity (REQ-COM)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-COM-001 | A non-technical person can state a simple offer in plain language and be routed to a lawful realization channel, or told honestly that none exists | APPROVED_CURRENT_INTENT — **TEST B**, `OPPORTUNITY_REALIZATION_LOCK_V1` §4 | `lib/value-channels/{channel-registry,eligibility,discovery}.ts` with `CHANNEL_GATED` / `LEGAL_CHECK_REQUIRED` verdicts | **no commerce entity** | conversation | UNKNOWN | `eligibility.test.ts` | **PARTIAL** | Verdicts are computed; no channel can actually be executed, so the loop stops at "understood" | no | no |
| REQ-COM-002 | Products / goods / capacity are realizable output alongside labour and services | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §2 (capabilities, work, services, **capacity, products**) | eligibility only | none | none | **MISSING** | — | **MISSING** | No product/goods entity, no capacity entity | no | yes (which channel first) |
| REQ-COM-003 | Unsupported commerce functionality is never faked to make TEST B visually pass | APPROVED_CURRENT_INTENT — same §4 | honest verdicts | — | — | UNKNOWN | `eligibility.test.ts` | **VERIFIED_TEST_ENVIRONMENT** | Correctly honoured | no | no |
| REQ-COM-004 | Value channels are a registry, extensible without redesign | APPROVED_CURRENT_INTENT — V10 channel registry (#1154) | `channel-registry.ts` | — | — | UNKNOWN | yes | IMPLEMENTED_NOT_PROVEN | Registry is TS, not data | no | no |

### 5.9 AI (REQ-AI)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-AI-001 | ONE AI, one conversation, as the primary interface: leads the dialogue, understands the goal, performs actions, opens and closes context, returns to the conversation | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1` "AI"; axiom A-01 | ~2,100-line chat over real data + deterministic intent router | conversations tables | `/dashboard` | **UNKNOWN — 0 model calls in any turn** | `chat_importance_reduced` gate rule | **PARTIAL** | The interface exists; the AI does not run | no | **yes** (activation) |
| REQ-AI-002 | There may be no second AI and no equivalent parallel control method | APPROVED_CURRENT_INTENT — `PRODUCT_VISION_LOCK_V1`; `PRODUCT_UNIVERSE_LOCK_V2` "DRAUDŽIAMA" | one agent registry | — | — | UNKNOWN | `product-gate.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-AI-003 | AI drafts; humans approve. AI never sends, approves, verifies or changes records autonomously | APPROVED_CURRENT_INTENT — doctrine §7 | 5 draft surfaces, all human-confirm | — | draft UIs | UNKNOWN | `ai-provider-boundary.test.ts`, `human-reviewed-ai-assistance-contract-v1` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-AI-004 | AI may suggest structure from free text but must never persist to verified records; every run logged append-only with provider, model, raw response and the accepted subset | APPROVED_CURRENT_INTENT — doctrine §7.1 | `lib/ai/runtime/audit-store.ts` | `ai_runs` (+ retention `20260808130000`/`20260808140000`) | — | **UNKNOWN — `ai_runs` = 0 rows, 0 lifetime inserts** | `audit-store.test.ts` | **IMPLEMENTED_NOT_PROVEN** | The audit ledger has never recorded anything | no | no |
| REQ-AI-005 | Provider chain orders candidates cost-class first (free local → free cloud → metered), supports a keyless local runtime, enforces data-sensitivity eligibility, degrades to three honest outcomes | APPROVED_CURRENT_INTENT — `docs/product/ai-provider-router-v1.md`; `cost-aware-ai-task-routing-contract-v1.md` | `lib/ai/runtime/provider-chain.ts` + adapters (local/gemini/anthropic/openai/xai) | — | — | **UNKNOWN — never served a request** | `ai-task-routing.test.ts`, `ai-readiness.test.ts` | IMPLEMENTED_NOT_PROVEN | `AI_PROVIDER_MODE=disabled` in production | no | **yes** (env + key) |
| REQ-AI-006 | AI budget caps + cost ledger + privacy veto | APPROVED_CURRENT_INTENT — `docs/product/ai-data-minimization-contract-v1.md` | daily budget + cost ceiling | `usage_cost_events` (0 rows) | admin telemetry | UNKNOWN | `ai-cost-accounting.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-AI-007 | AI context awareness is rich but never serialised into prompts beyond the data-minimisation policy | APPROVED_CURRENT_INTENT — data-minimisation contract | `loadAiWorkspaceContext` | — | — | UNKNOWN | `input-caps-and-log-privacy.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-AI-008 | Six agent types (worker search, candidate fit, document prep, manager decision queue, market monitoring, communication drafting) delivered M4+ **on top of** the core | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §9; **ADR 0011** | agent registry with several stubs | — | — | **UNKNOWN** | — | **PARTIAL** | `document_assistant` registered with **zero callers**; forecasts and simulation are label/stub only | no | no |
| REQ-AI-009 | Matching explanation may be AI prose | HISTORICAL_SUPERSEDED_IDEA — the AI prose fork is recorded as FROZEN/deprecated; deterministic explanation is canonical | deterministic path | — | match cards | UNKNOWN | `matching-explanation` agent frozen | **NOT_REQUIRED** | Do not revive | no | no |
| REQ-AI-010 | Workforce calculations are hard-pinned to the deterministic tier and cannot invoke a model | APPROVED_CURRENT_INTENT — capacity contract | pinned | — | — | UNKNOWN | `ai-runtime-boundary.test.ts` | **VERIFIED_TEST_ENVIRONMENT** | Correct by construction | no | no |
| REQ-AI-011 | AI never lies, never fakes verification, never mass-sends, never alters documents, never creates fake data | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §9 hard rule | boundaries | — | — | UNKNOWN | `ai-content-safety.test.ts`, `ai-recommendation-disclaimer` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-AI-012 | Platform translations are curated, never AI-generated in shipped builds | APPROVED_CURRENT_INTENT — doctrine §7.4 | catalogue review | — | — | PARTIAL (RU is AI-seeded, Tier 2, pending human review — declared) | i18n guards | **PARTIAL** | Declared honestly in doctrine §2.4; human review outstanding | no | yes |

### 5.10 Payments / LMC (REQ-PAY)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-PAY-001 | The platform can take real money | APPROVED_CURRENT_INTENT — `ROADMAP.md` P2; `PROJECT_ROADMAP.md` Phase 5 | `lib/billing/providers/stripe-test.ts` only; full checkout/portal/webhook/entitlements plumbing | `billing_customers` 0, `billing_subscriptions` 0, `payment_webhook_events` 0 | **NO UI ENTRY POINT** — `/api/billing/test-checkout` and `/api/billing/portal` have **zero callers** outside `app/api/billing`; `/pricing` routes to a waitlist modal | **BROKEN — 0 payments ever; 1 lifetime insert, rolled back** | `no-live-payments.test.ts`, `payment-readiness-honesty.test.ts`, `billing/*.test.ts` (8); **no e2e** | **BROKEN/MISSING** | Three independent blocks: `PAYMENTS_ENABLED = false as const` (source literal), only a test provider, and **no reachable checkout button** | no | **yes** (live Stripe account + keys) |
| REQ-PAY-002 | LMC = internal platform credit, 1 LMC = 1 EUR, bigint LMC-cents, one account per identity (person or company) | APPROVED_CURRENT_INTENT — LMC catalogue §1 BINDING; `20260720190000_lmc_ledger_foundation_v1.sql` (applied) | **no app readers or writers** | `lmc_accounts`, `lmc_transactions`, `lmc_lots`, `lmc_lot_consumptions`, `lmc_settings` | none | **UNKNOWN** | `lmc-ledger-foundation.test.ts` | **BROKEN (dead app layer)** | Schema applied to production; the only TS reference is the generated `lib/supabase/types.ts`. 6 feature flags are false | no | yes |
| REQ-PAY-003 | LMC is never a withdrawable balance, never crypto, never electronic money, never multi-level | APPROVED_CURRENT_INTENT — LMC catalogue §1 (legal positioning) | — | — | — | UNKNOWN | `stripe-lmc-separation.test.ts` | **VERIFIED_TEST_ENVIRONMENT** | Correctly held | no | no |
| REQ-PAY-004 | ONE commercial catalogue: price, LMC rule, Stripe object, entitlement | APPROVED_CURRENT_INTENT — axiom **A-10** | — | `plans` (4 rows) | `/pricing` | UNKNOWN | — | **MISSING (enforcement)** | Constitution records "machine half ships with #895/#896" — not merged. Prices exist as data; entitlements activate for nobody | no | yes |
| REQ-PAY-005 | No feature launches without a known economic model | APPROVED_CURRENT_INTENT — axiom **A-11** | — | — | — | UNKNOWN | — | **MISSING (enforcement)** | Same: machine half in unmerged #896. Every module in §5.5 shipped without one | no | yes |
| REQ-PAY-006 | Paid employer value does not depend only on hiring | APPROVED_CURRENT_INTENT — `OPPORTUNITY_REALIZATION_LOCK_V1` §7 | operational modules built | 0 rows each | yes | **NO EVIDENCE** | — | **UNKNOWN_OWNER_DECISION_REQUIRED** | Which of the recurring modules is the paid value, and at what price, is not recorded anywhere | no | **yes** |
| REQ-PAY-007 | Only one direct, attributable referral relationship may ever exist | APPROVED_CURRENT_INTENT — LMC catalogue §1 (MLM prohibition) | — | — | — | UNKNOWN | — | IMPLEMENTED_NOT_PROVEN | No referral system exists to violate it | no | no |
| REQ-PAY-008 | Billing subject can be a person or an organization | APPROVED_CURRENT_INTENT — `20260806220000_stripe_multi_subject_v2.sql` | subject model | applied | — | UNKNOWN | `billing-subject-model.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-PAY-009 | Pricing shown publicly is honest about beta status and governed until the founder sets prices | APPROVED_CURRENT_INTENT — `DATA_MODEL.md` `plans` note; constitution §5 | governed placeholders | `plans` | `/pricing` | UNKNOWN | `pricing-page-beta-honesty.test.ts` | VERIFIED_TEST_ENVIRONMENT | — | no | no |

### 5.11 Growth / acquisition (REQ-GROW)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-GROW-001 | Self-entry signup is the default channel; the product is not invite-only | APPROVED_CURRENT_INTENT — constitution §11 | signup flow | `profiles` | `/auth/signup` | **VERIFIED_PRODUCTION** — 32 email identities, 29 confirmed | `auth-*` guards | VERIFIED_PRODUCTION | — | no | no |
| REQ-GROW-002 | Social/OAuth login options | IMPLEMENTED_CURRENT_BEHAVIOR (Google only); Facebook/LinkedIn/Apple **never approved anywhere** | `google-button.tsx` | — | login | **VERIFIED_PRODUCTION** — 8 Google identities | `auth-stability-pkce-logout.test.ts` | VERIFIED_PRODUCTION (Google) / **UNKNOWN_OWNER_DECISION_REQUIRED** (others) | Facebook/LinkedIn absent from code entirely — no artefact requires them | no | **yes** |
| REQ-GROW-003 | Public, indexable acquisition front door for the free CV chain | APPROVED_CURRENT_INTENT — `PRODUCT_ARCHITECTURE_DIFF.md` `/create-cv` declaration (axiom A-04, declared `yes`) | `/create-cv` | — | yes | UNKNOWN | `create-cv-acquisition-intent.test.ts` | IMPLEMENTED_NOT_PROVEN | The gate recorded 6 `certain` A-01 findings against it — **declared under a scoped transitional waiver, not resolved** | no | yes |
| REQ-GROW-004 | Programmatic SEO surfaces by profession/problem | IMPLEMENTED_CURRENT_BEHAVIOR — `docs/seo/profession-problem-search-strategy-v1.md` | `lib/seo/profession-problem-content.ts` | — | `/work-opportunities`, `/professions`, `/skills`, `/labour-market/[country]` | UNKNOWN | `public-seo-indexing.test.ts` | IMPLEMENTED_NOT_PROVEN | Content is hardcoded copy, not driven by the 44k real vacancies | yes | no |
| REQ-GROW-005 | Acquisition attribution end-to-end (source → signup → completion → action) | UNKNOWN_OWNER_DECISION_REQUIRED — named as a gap; no approving artefact | generic telemetry only | `pilot_events` (1,332 rows) | — | **MISSING** | `activation-funnel-telemetry.test.ts` | **PARTIAL** | No UTM/campaign attribution; worker funnel conversion cannot be measured | yes | no |
| REQ-GROW-006 | Anonymous pre-auth interest capture (`leads` / waitlist) | APPROVED_CURRENT_INTENT — doctrine §17.2 | `/api/leads` dormant | `leads`, `waitlist` | — | UNKNOWN | — | IMPLEMENTED_NOT_PROVEN | Deliberately has no in-product caller | no | no |
| REQ-GROW-007 | Social channel automation (Facebook Page/Groups, LinkedIn, scheduler) | UNKNOWN_OWNER_DECISION_REQUIRED — appears only in `docs/marketing/*` drafts | **absent** | — | — | **MISSING** | — | **MISSING** | No integration exists; Groups API is largely unavailable for this pattern | no | **yes** |
| REQ-GROW-008 | Marketing copy never makes evidence-free claims and never derives adoption from imported ads | APPROVED_CURRENT_INTENT — constitution §5; Work-OS §20 | copy scan | — | landing | VERIFIED_PRODUCTION | `marketing-copy-no-evidence.test.ts`, `market-coverage-claims.test.ts`, `landing-freeze.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-GROW-009 | `privacy_consent_purposes` seeds **no marketing purpose** — the product sends no marketing messages | APPROVED_CURRENT_INTENT — deliberate seed decision | — | `privacy_consent_purposes` | — | VERIFIED_PRODUCTION | — | **NOT_REQUIRED** (correctly absent) | Any outreach programme must first confront this decision with the owner | no | **yes** |

### 5.12 Data & market intelligence (REQ-INTEL)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-INTEL-001 | A number cannot exist in the intelligence layer without a registered source; external sources are owner-gated | APPROVED_CURRENT_INTENT — governance model, CHECK-constrained | `lib/intelligence/*` | `market_intelligence_sources` (7 registered, external ship `activation=off`) | admin | VERIFIED_PRODUCTION | `labour-market-evidence-provenance.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-INTEL-002 | Market intelligence captures external demand signals and sales opportunities | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 11; `DATA_MODEL.md` M4 `market_intelligence_signals` | observations pipeline | `market_intelligence_observations`, `market_intelligence_insight_queries` | `/dashboard/intelligence` | UNKNOWN | — | **PARTIAL** | The approved `market_intelligence_signals` shape was replaced by observations; external activation is off | no | no |
| REQ-INTEL-003 | Analytics of skill shortages, employment and risk | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §8 module 12 | shortage analysis | `market_rate_averages`, `platform_skill_aggregates` | admin market | UNKNOWN | `w14-analytics-kpi-audit` | **PARTIAL** | Populations too small to be meaningful | no | no |
| REQ-INTEL-004 | Research works ONLY with anonymous data: pseudonymized ids + aggregation + k-threshold **before** the research layer; no identified-research category exists | APPROVED_CURRENT_INTENT — doctrine §20.4 | — | n<5 pattern | — | UNKNOWN | `privacy-base.test.ts` | IMPLEMENTED_NOT_PROVEN | No research layer is actually running | no | no |
| REQ-INTEL-005 | Research insight never alters an individual's matching, visibility, prices or offers | APPROVED_CURRENT_INTENT — doctrine §20.5 | — | — | — | UNKNOWN | `privacy-base.test.ts` | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-INTEL-006 | The labour-market map is layered (people, skills, projects, documents, availability, trust, price/economics, risk) | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §11 | `lib/market-map/*` | market-map tables | `/dashboard/market-map`, `/labour-market` | UNKNOWN | `market-map-canonical.test.ts` | **PARTIAL** | Several of the eight layers have no data source | no | no |
| REQ-INTEL-007 | Business KPIs measurable: worker funnel conversion, employer funnel to paid, MRR/ARPU/churn, AI cost per user, job-view and application rates | APPROVED_CURRENT_INTENT — implied by axiom A-11/A-12 | telemetry | `pilot_events` (1,332) | admin telemetry | **MISSING** | — | **MISSING** | None of the five are measurable today | no | no |
| REQ-INTEL-008 | Employer canonicalisation: turn vacancy `employer_name` into a company entity with provenance | UNKNOWN_OWNER_DECISION_REQUIRED — named as the funnel bottleneck; no approving artefact | **absent** | 8,124 distinct employer names, 13 platform orgs | — | **MISSING** | — | **MISSING** | No canonicalisation, no domain enrichment, no qualification step | no | **yes** |
| REQ-INTEL-009 | Telemetry exists and is honest | IMPLEMENTED_CURRENT_BEHAVIOR | `pilot_events` emitters | 1,332 rows | admin | **VERIFIED_PRODUCTION** | `pilot-events-service-role-read.test.ts` | VERIFIED_PRODUCTION | — | no | no |

### 5.13 Admin / security / governance (REQ-GOV)

| ID | Intended behaviour | Intent + evidence | Code | DB | UI | Prod | Test | Status | Gap | Auto? | Owner? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-GOV-001 | Deny-by-default RLS on every table is the only tenant isolation | APPROVED_CURRENT_INTENT — `DATA_MODEL.md` §RLS | RPC-only writes | 0 tables without RLS | — | **VERIFIED_PRODUCTION** (advisors) | RLS guards | VERIFIED_PRODUCTION | — | no | no |
| REQ-GOV-002 | Author content is append-only: no UPDATE/DELETE via API, soft-hide only, enforced at policy level including for platform admin | APPROVED_CURRENT_INTENT — doctrine §3.1 | RPC-only | trigger-enforced **against `service_role` itself** | — | VERIFIED_PRODUCTION (rolled-back E2E confirmed guards hold) | integrity guards | VERIFIED_PRODUCTION | — | no | no |
| REQ-GOV-003 | Sensitive actions write to an append-only audit log (permission grants, position changes, manager confirmations, proof acceptances, document approvals, role changes, membership changes) | APPROVED_CURRENT_INTENT — doctrine §3.4 (7 named mandatory action types) | **no TS write helper for `audit_logs` exists** — the only references are placeholder copy and a comment noting the table is admin-only | `audit_logs` (`0001`) has **ZERO application writers**; real trails are per-domain `*_events` tables | admin | **MISSING** | — | **BROKEN** | The doctrine's single general audit log was never wired. Per-domain append-only event tables (trigger-enforced even against `service_role`) cover much of the same ground, but no artefact records that substitution as the accepted design | no | **yes** (accept per-domain trails, or wire `audit_logs`) |
| REQ-GOV-004 | Permission grants are revocable **rows** with `granted_by/at`, scope, `revoked_by/at`, reason — never flags | APPROVED_CURRENT_INTENT — doctrine §4.3 | membership + consent ledgers | `privacy_consent_events`, `personal_data_disclosures`, `20260802160000_org_membership_revocation_v1.sql` | — | VERIFIED_PRODUCTION | `consent-fail-closed.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-GOV-005 | Per-participant scope `full` / `reports_only` / `custom` (M4+) | APPROVED_CURRENT_INTENT — doctrine §4.2 | partial | — | — | UNKNOWN | — | **PARTIAL** | The three-value scope vocabulary is not implemented as such | no | yes |
| REQ-GOV-006 | Admin control room: verification, telemetry, support, matching workbench, readiness, pilots | IMPLEMENTED_CURRENT_BEHAVIOR | admin modules | — | 20 `/dashboard/admin/*` routes | UNKNOWN | `admin-control-room.test.ts`, `superadmin.test.ts` | IMPLEMENTED_NOT_PROVEN | UI never browsed in an audit | no | no |
| REQ-GOV-007 | Leaked-password protection enabled; short OTP expiry | APPROVED_CURRENT_INTENT — security baseline | Supabase dashboard setting | — | — | **BROKEN — protection disabled, OTP expiry long** | advisors | **BROKEN** | One-click owner fixes | no | **yes** |
| REQ-GOV-008 | No SECURITY DEFINER views (they bypass the querying user's RLS) | APPROVED_CURRENT_INTENT — advisor ERROR + explicit team decision | `worker_absence_scheduling` **kept** as definer deliberately | view | — | **1 ERROR advisor** | 24-test guard pinning the decision | **PARTIAL (accepted debt)** | Conversion would re-admit managers to private absence notes — a tested decision, not silent debt | no | yes (re-affirm) |
| REQ-GOV-009 | Anonymous SECURITY DEFINER surfaces are limited to the intended public ones | APPROVED_CURRENT_INTENT — security posture | 4 anon-executable RPCs | — | public intake + business profile | VERIFIED_PRODUCTION | `marketplace-security-definer-boundary.test.ts` | VERIFIED_PRODUCTION | — | no | no |
| REQ-GOV-010 | Placeholder governance: every demo-like signal classified concept/sample/preview/real, promotion owner-authorised | APPROVED_CURRENT_INTENT — constitution §9; `docs/PLACEHOLDERS.md` | `content/placeholders.ts` + `<Placeholder>` | — | — | VERIFIED_PRODUCTION (159 entries) | `placeholders:check` | VERIFIED_PRODUCTION | — | no | no |
| REQ-GOV-011 | Every PR touching user-facing surfaces, schema, RLS, auth, roles, onboarding or signal-classified visuals pastes the constitution compliance checklist | APPROVED_CURRENT_INTENT — constitution §11 | `pnpm -F web check:constitution` (6 probes) | — | — | UNKNOWN | yes | IMPLEMENTED_NOT_PROVEN | — | no | no |
| REQ-GOV-012 | Seven-line Definition of Done (BEFORE/AFTER/URL/ACTION/RESULT/RELOAD/BLOCKER) with a declared progression state | APPROVED_CURRENT_INTENT — constitution §11; `docs/policies/feature-definition-of-done-v1.md` | policy doc | — | — | UNKNOWN | `check:constitution` | **PARTIAL** | The modules in §5.5 shipped without a DoD that could pass (no URL/ACTION/RESULT with real data) | no | no |
| REQ-GOV-013 | No foreign product name embedded in shipped schema | IMPLEMENTED_CURRENT_BEHAVIOR — brand purity | — | `supabase/migrations/20260817130000_workflow_engine_v1.sql` contains `vecticum` | — | **CONTRADICTED** | — | **BROKEN (cosmetic)** | Applied migration must not be rewritten; remedy is a comment-only follow-up | yes (doc note) | no |
| REQ-GOV-014 | The repository is the audit trail: docs reflect production truth | IMPLEMENTED_CURRENT_BEHAVIOR | — | — | 774 markdown files | **CONTRADICTED** | — | **BROKEN** | `APPLIED_LEDGER.md` 43 false entries; 28 stale worktrees registered; **and 105 of 225 migration files still carry `PENDING APPLY` / `NOT YET APPLIED` headers, including the entire 2026-08-17 train that the live ledger proves applied** — a reader trusting file headers will believe shipped modules are switched off | yes | no |
| REQ-GOV-016 | Every production migration has a corresponding repo file | APPROVED_CURRENT_INTENT — doctrine §16 (ledger integrity, never `db push`) | — | Production ledger holds `20260705240000_agency_legacy_retype` with **no file in this repo** (recorded in the header of `20260705250000_journal_photos_project_gallery.sql`, which was renumbered to avoid the collision). Repo 225 files vs production 213 applied | — | **CONTRADICTED** | migration-safety CI | **BROKEN** | At least one applied production migration is unreproducible from the repo — a rebuild-from-scratch would not reach the current schema | no | **yes** |
| REQ-GOV-015 | Roles are a fixed RBAC set (worker/company/agency/customer/admin); `team_leader` and `hr_personnel` are future/vision only, modelled as org positions, never new RBAC entries | APPROVED_CURRENT_INTENT — `PROJECT_VISION` §7 owner decision 2026-06-10; doctrine §5.2/§10 boundary note | `Role` union | `active_role` CHECK | RoleSwitcher | VERIFIED_PRODUCTION | `role-dashboards.test.ts` | VERIFIED_PRODUCTION | Depends on REQ-ORG-004 (positions registry) which is MISSING | no | no |

---

## 6. `UNKNOWN_OWNER_DECISION_REQUIRED` register

| # | Requirement | The question |
|---|---|---|
| U-01 | REQ-MKT-003 | Should job listings be browsable by anonymous visitors and indexable by search engines, or must a visitor sign in first? |
| U-02 | REQ-MKT-004 | Which market gets the second job-supply source — and does supply follow the served locales, or do the locales follow Swedish supply? |
| U-03 | REQ-WRK-006 | Is the shipped evidence-tier ladder the accepted replacement for ADR 0009's five-level `skill_verifications` model, or must ADR 0009 still be built? |
| U-04 | REQ-ORG-004 / REQ-GOV-015 | Should doctrine §5.4 organizational positions be built as a registry now, given that `team_leader`/`hr_personnel` were deferred onto it? |
| U-05 | REQ-ORG-010 | Are teams-as-`organizations`-rows the accepted shape, or must the approved `team_entities` object with a member roster be built? |
| U-06 | REQ-ORG-011 | What is the agency commission model — and should `agency_candidate_offers` be wired or dropped? |
| U-07 | REQ-ORG-012 / REQ-PLAT-015 | Which of the three invitation systems, two membership truths and three employment-record models is canonical, and may the others be dropped? |
| U-08 | REQ-OPS-006 / REQ-OPS-032 | Should scheduling own a real calendar/shift entity, or remain a read-only projection forever? |
| U-09 | REQ-OPS-027 | Is the approvals section the accepted decision queue, or must the urgency-ranked first-class surface from `PROJECT_VISION` §8 module 10 be built? |
| U-10 | REQ-OPS-031 | Is "workload" a distinct approved concept, or is it fully covered by capacity? |
| U-11 | REQ-SVC-005 | Do services get a payment/invoicing path, and does that precede or follow general payments activation? |
| U-12 | REQ-COM-002 | Which realization channel for products/goods/capacity should be built first, given TEST B currently ends at "understood"? |
| U-13 | REQ-AI-001 / REQ-AI-005 | Switch `AI_PROVIDER_MODE` to live with which provider and key, for which single first task? |
| U-14 | REQ-AI-012 | Who performs the outstanding Tier-2 human review of the AI-seeded RU catalogue? |
| U-15 | REQ-PAY-001 | Create a live Stripe account and supply live keys — yes or not yet? |
| U-16 | REQ-PAY-006 | Which recurring (non-hiring) module is the paid employer value, and at what price? |
| U-17 | REQ-PAY-004 / REQ-PAY-005 | Should the unmerged machine halves of axioms A-10, A-11 (and A-12) be built, or should the axioms be downgraded to review-only permanently? |
| U-18 | REQ-GROW-002 | Are Facebook / LinkedIn / Apple login actually wanted, or is email + Google the intended final set? |
| U-19 | REQ-GROW-007 | Is any social-channel automation approved, given it requires the owner's Page permissions and a human approval step? |
| U-20 | REQ-GROW-009 | `privacy_consent_purposes` deliberately seeds no marketing purpose. Does any outreach programme change that decision? |
| U-21 | REQ-INTEL-008 | Should the 8,124 vacancy employer names be canonicalised into company entities with provenance, to give the contact funnel a population? |
| U-22 | REQ-GOV-005 | Should the doctrine §4.2 scope vocabulary (`full` / `reports_only` / `custom`) be implemented, or is per-domain authority sufficient? |
| U-23 | REQ-GOV-007 | Enable leaked-password protection and shorten OTP expiry (one-click, Supabase dashboard). |
| U-24 | REQ-GOV-008 | Re-affirm or reverse the decision to keep `worker_absence_scheduling` as a SECURITY DEFINER view. |
| U-25 | REQ-WRK-021 | Should the privacy deletion executor move from read-only preview to actually executing? |
| U-26 | REQ-WRK-033 | Is the voice work journal programme still in scope? |
| U-27 | REQ-PLAT-003 / REQ-PLAT-004 | Should the Universal Object Model become a real data-level registry + base table, or stay a TypeScript declaration? |
| U-28 | REQ-OPS-015 | Is qualified eIDAS e-signature ever wanted, or is "signature evidence, never an execution claim" permanent? |
| U-29 | REQ-GOV-003 | Are the per-domain append-only `*_events` tables the accepted replacement for doctrine §3.4's single `audit_logs`, or must `audit_logs` be wired? |
| U-30 | REQ-GOV-016 | One applied production migration (`20260705240000_agency_legacy_retype`) has no repo file. Should it be reconstructed so the schema is reproducible from source? |

---

## 7. Status roll-up

Counted mechanically from the §5 tables (194 rows).

| Status | Count | Share |
|---|---:|---:|
| IMPLEMENTED_NOT_PROVEN | 72 | 37% |
| PARTIAL | 38 | 20% |
| VERIFIED_PRODUCTION | 37 | 19% |
| MISSING | 20 | 10% |
| BROKEN (incl. 1 BROKEN CHAIN, 1 BROKEN/MISSING) | 11 | 6% |
| NOT_REQUIRED (correctly absent by doctrine) | 9 | 5% |
| VERIFIED_TEST_ENVIRONMENT | 5 | 3% |
| UNKNOWN_OWNER_DECISION_REQUIRED (status itself undecidable) | 2 | 1% |
| **Total** | **194** | |

**The shape of that distribution is the finding.** 57% of approved requirements are
`IMPLEMENTED_NOT_PROVEN` or `PARTIAL` — built, guarded, migrated, and never touched by a
real user. Only 19% carry production proof. Just 10% are genuinely absent. This is not an
unfinished product; it is a **finished-and-unexercised** one.

Intent classification: **APPROVED_CURRENT_INTENT ~145** · `IMPLEMENTED_CURRENT_BEHAVIOR`
~25 · `HISTORICAL_SUPERSEDED_IDEA` 6 · `EXPERIMENT_OR_REFERENCE` 2 ·
`UNKNOWN_OWNER_DECISION_REQUIRED` 10 (plus 20 further owner questions raised against
otherwise-classified requirements — 30 total in §6).

### The ten MISSING or BROKEN requirements that carry real business value

| Rank | ID | What is actually lost |
|---:|---|---|
| 1 | REQ-MKT-003 | 38,142 apply-ready jobs are invisible to anonymous visitors and search engines — the only free acquisition asset the product owns generates nothing |
| 2 | REQ-PAY-001 | No money can be taken: test provider only, and no reachable checkout button |
| 3 | REQ-MKT-004 | Supply is one country in a locale the product does not serve — Swedish ads, `lt/en/ru/nl/de` UI |
| 4 | REQ-PLAT-007 | No read-time translation provider, so that same supply is unreadable to its audience |
| 5 | REQ-OPS-007 | ~~Timesheets can never produce a line: their source table `journal_entry_work_items` has zero writers~~ — **CLOSED 2026-08-18** by the canonical work-time ruling. What remains is a usage gap, not a defect: no hours have yet been logged against an ORG engagement |
| 6 | REQ-INTEL-008 | 8,124 known employer names never become company entities — the employer funnel has no population |
| 7 | REQ-OPS-019 | Invoices cannot be generated from Work Journals, removing the most concrete recurring value an employer would pay for |
| 8 | REQ-SKILL-006 | ESCO concept ids never persist, so matching is label-matching across a 1.03M-label taxonomy |
| 9 | REQ-SKILL-008 | Platform skill aggregates have no writer — doctrine §15's market-truth half was never built |
| 10 | REQ-GOV-003 / REQ-GOV-016 | No general audit log writer, and at least one applied production migration has no repo file — the schema is not fully reproducible |

Runners-up with real value but lower certainty of demand: REQ-OPS-033 (housing),
REQ-OPS-034 (automations), REQ-SVC-003 (service order lifecycle), REQ-PLAT-010 (the
landing hero is raw English for RU/NL/DE — the first screen a Russian visitor sees).

**The honest one-line conclusion.** Measured against approved intent rather than against
the repository, labourmarket.ai has built both halves of its flywheel and connected them:
of 194 reconstructed requirements, 37 are proven in production and 110 are built but never
exercised by a real person. The inherited "38,142 jobs reach no user" verdict is
**wrong** (C-01) — the worker board renders them through the one match engine. What the
product lacks is not architecture but **traffic, money and proof**: no anonymous door into
the loop, no payment path, and no production evidence that a single worker has completed
a turn of it.

---

## 8. Provenance of this reconstruction

Primary intent sources read in full or in substantial part:
`docs/PRODUCT_CONSTITUTION.md` · `docs/PLATFORM_DOCTRINE.md` · `docs/PROJECT_VISION.md` ·
`docs/DATA_MODEL.md` · `docs/ROADMAP.md` · `docs/PROJECT_ROADMAP.md` ·
`docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` · `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` ·
`docs/product/PRODUCT_VISION_LOCK_V1.md` · `docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md` ·
`docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` ·
`docs/product/lmc-canonical-commercial-catalogue-v1.md` · `docs/DECISIONS/` (13 ADRs) ·
`PRODUCT_ARCHITECTURE_DIFF.md`.

Implementation/reality sources: `docs/audits/full-reality-audit-2026-08-17.md` ·
`docs/audits/vecticum-capability-matrix-2026-08-17.md` ·
`docs/audits/full-project-truth-2026-08-18.md` ·
`docs/audits/localization-truth-2026-08-18.md` ·
`LABOURMARKET_AI_WORK_OS_VECTICUM_COMPLETION_REPORT.md` ·
`LABOURMARKET_AI_FUNCTIONAL_COMPLETION_MASTER_REPORT_2026-08-17.md` ·
225 migration headers in `supabase/migrations/` · 685 guard files in
`apps/web/lib/guards/` · the full route inventory of `apps/web/app/` ·
`git log --oneline`.

Production reality column: supplied to this pass as measured facts of 2026-08-18; not
re-derived. No production query was run by this reconstruction, and no repository file
other than this one was modified.

**Independent verification performed by this pass** (source-level, not doc-trusting):
the full import chain from `public_vacancies` to the rendered worker board (correction
C-01); the non-persistence contract of `match-v1.ts` (correction C-02); zero-writer
analysis across all ~189 created tables; the absence of UI callers for
`/api/billing/test-checkout` and `/api/billing/portal`; the three live `runAiAgent` call
sites against eleven registered agents; and the LMC ledger's total absence from
application code outside generated types.

**Known limits of this reconstruction.** Writer detection was regex plus function-name
reachability, not a call graph — a table written through a runtime-constructed name would
be missed. No browser journey, mobile width or UX coherence was verified. Migration
*apply* state was taken from the master report's live-ledger read of 2026-08-18 04:13 UTC,
**not** from migration file headers, which are demonstrably stale (REQ-GOV-014).

---

## CHECKPOINT DELTA — 2026-08-18, after PR #1184 and #1185 merged

Baseline at reconstruction: 37 VERIFIED_PRODUCTION · 72 IMPLEMENTED_NOT_PROVEN ·
38 PARTIAL · 11 BROKEN · 20 MISSING · 5 VERIFIED_TEST_ENVIRONMENT ·
9 NOT_REQUIRED · 2 UNKNOWN (194 total).

### Moved to VERIFIED_PRODUCTION

**Public job discovery / anonymous job preview / SEO-addressable vacancy URL**
(MISSING → VERIFIED_PRODUCTION). Merged as #1184 (`ec1a5941`), live at
`https://labourmarket.ai/{lt,en,ru}/jobs` (all HTTP 200).

Evidence, gathered on the REAL production site in an anonymous session:
- the 95 KB payload of a live job page contains NONE of the restricted values
  (employer name, city, region, application URL, external id, description head),
  each checked against the values read from that row first;
- title and licence attribution ARE present; the locked section renders;
- no JobPosting schema is emitted (it would require restricted fields);
- as the `anon` role, a direct read of `public_vacancies` still fails 42501 —
  the projection is what changed, not the RLS.

### Confirmed BROKEN with production evidence (unchanged status, now diagnosed)

**Timesheets, and workload/capacity.** `journal_entry_work_items` has **0 lifetime
inserts** — it has never received a row — and no writer exists in any migration or
any TypeScript path. `timesheet_compute_lines_v1` derives lines only from it, so
every timesheet can only ever be empty; `lib/planning/workload-model.ts` reads the
same empty table.

The hours DO exist, in `journal_entry_metrics`: `fragment_time`/hours 10 rows
totalling 27, `quantity`/hours 6 rows totalling 42, `fragment_time`/minutes 2 rows
totalling 35, plus `work_date` on 32 entries. The seam is half-wired — the same
function already reads `work_date` from metrics while reading HOURS from the empty
table. This is the duplicated-truth-store problem the principle test flagged, not a
simple bug, so which store is canonical is an owner-level call. Blast radius today
is zero (`timesheets` also has 0 lifetime inserts).

### Correction to a previously reported finding

`main` was reported as carrying a red `financial-ops` guard. **That was wrong** —
`main`'s Quality Gates runs are green and this never failed on CI. It reproduced
only on a Windows checkout: no `.gitattributes`, so `*.sql` materialises with CRLF
(957 CR characters in the procurement migration) against a `\n`-exact assertion.
Fixed in #1185 (`d699e273`) by normalising at the read — the applied migration was
not touched. Local suite went from 1 failed/12,214 passed to 678 files and
12,213 tests green.

### Process finding worth recording

Applying the preview migration to production BEFORE merging made the live
`check-anon-secdef-allowlist` gate fail on every unrelated branch, because the
allowlist entries only existed on the feature branch. PR #1185 was blocked by a
condition it did not cause until #1184 merged. Apply-before-merge has this cost;
merge order is not optional once a live catalog gate exists.

---

## OWNER RULING — TIMESHEET / WORK HOURS CANONICAL TRUTH (2026-08-18)

Binding, recorded here because §5's REQ-OPS-007 could not be resolved without it.

> Use the existing Work Journal-derived data as the canonical source.
> `journal_entry_metrics` is the canonical persisted source for derived /
> structured work-time metrics where the current Work Journal extraction
> pipeline already writes real production data. Do NOT create a second
> equivalent hours truth merely to populate `journal_entry_work_items`.

Canonical chain (now implemented, not merely stated):

```
WORK JOURNAL ENTRY → ORIGINAL USER EVIDENCE / FACT → STRUCTURED DERIVED METRICS
  → CANONICAL WORK-TIME VALUE → TIMESHEET → WORKLOAD / CAPACITY → REPORTING
```

**`journal_entry_work_items` is classified DEPRECATED — duplicate truth.** It has
0 lifetime inserts, no writer, and after this change no reader. Everything it
was designed to hold for work time is already expressed by
`journal_entry_metrics` (`fragment_time` / `fragment_activity` /
`parsed_fragment` / `quantity`), and expressed as the worker's own evidence
rather than a derived copy. The one semantic it carried that metrics do not — a
**per-item reviewer decision** — was never built and is escalated as an owner
question rather than silently inherited. The table is not dropped (destructive
DDL stays owner-gated) and is not populated; the deprecation is recorded in the
database via `comment on table`.

Full classification, the deterministic rule, and the production evidence:
`docs/audit/journal-canonical-work-time-v1.md`.

### Matrix delta from this ruling

| ID | Was | Now | Why |
|---|---|---|---|
| REQ-OPS-007 (timesheets) | **BROKEN CHAIN** | **PARTIAL** | The chain is closed and the derivation is proven on real production evidence (9 real lines where the old code produced 0). It is not `VERIFIED_PRODUCTION` because no non-empty org timesheet exists yet — every recorded hour sits on a personal, org-less engagement. |
| REQ-OPS-031 (workload) | **MISSING** | **PARTIAL** | The workload strip's actual-hours half is real and proven end-to-end on production data. Whether workload is a modelled ENTITY distinct from capacity remains U-10. |
| REQ-OPS-029 (capacity) | PARTIAL | PARTIAL | Unchanged status; its actuals input was re-pointed from the empty table to the canonical metrics. |

### Roll-up after this ruling (194 rows, unchanged total)

| Status | Count |
|---|---:|
| IMPLEMENTED_NOT_PROVEN | 72 |
| PARTIAL | 40 |
| VERIFIED_PRODUCTION | 38 |
| MISSING | 18 |
| BROKEN | 10 |
| NOT_REQUIRED | 9 |
| VERIFIED_TEST_ENVIRONMENT | 5 |
| UNKNOWN_OWNER_DECISION_REQUIRED | 2 |
| **Total** | **194** |

(Baseline was 37 / 72 / 38 / 11 / 20 / 5 / 9 / 2. Public job discovery moved
MISSING → VERIFIED_PRODUCTION with #1184; REQ-OPS-007 BROKEN → PARTIAL and
REQ-OPS-031 MISSING → PARTIAL with this ruling.)

### New owner questions raised

| ID | Requirement | Question |
|---|---|---|
| U-11 | REQ-OPS-007 | Should a worker be able to produce a timesheet for work logged on their **personal** engagement? `timesheets.organization_id` is `NOT NULL`, which is the single reason the org sheet is empty despite real recorded hours. |
| U-12 | REQ-OPS-007 | Do we want **per-activity** reviewer decisions (the one semantic `journal_entry_work_items` carried), or is per-entry confirmation sufficient? |
| U-13 | REQ-SKILL / journal | `extract-journal-suggestions` loses composite durations: *"valandą dvidešimt minučių"* (1 h 20 min) stored as `20 minutes`, *"valandą su puse"* (1.5 h) stored as `1 hours`, on real production rows. Correcting the stored values would be a silent migration of the worker's evidence and was deliberately NOT done. |
