# PRODUCT MASTER SPECIFICATION — LabourMarket.ai

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Date** | 2026-10-16 |
| **Status** | **SUPPORTING — a reconstruction and status document UNDER the canonical architecture.** It adds no owner authority. Where it and [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md) differ, the canonical file wins and this file is the defect. |
| **Sources** | The canonical architecture (28-node graph, six journeys, eleven reductions, eight separations), `PLATFORM_DOCTRINE`, `PRODUCT_CONSTITUTION` (A-01..A-14), the owner locks under §6 of the canonical file, decisions 0006–0024, `CAPABILITY_INVENTORY` §6 / `capability-register.ts`, and the 2026-10-16 master audit ([`docs/audits/MASTER_AUDIT_2026-10-16.md`](../audits/MASTER_AUDIT_2026-10-16.md)) |
| **How to read status** | Every statement is tagged. **APPROVED** = an owner decision recorded in the repository. **IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED / BLOCKED** = measured against the code and register on 2026-10-16 (`node .github/scripts/product-truth.mjs`: 111 capabilities, 34 usable, 69 partial). **PROPOSED** = this audit's recommendation, not a requirement. **OPEN** = an owner decision nobody may settle. |

> The capability register is the machine half of this specification. If a
> row here and a row there disagree, the register (and its guards) are right
> and this file must be corrected in the same PR.

---

## 1. Mission and differentiation

**APPROVED.** LabourMarket.ai is a **living global labour/work graph**: people, real work, skills, experience, evidence, qualifications, organizations, companies, agencies, institutions, teams/brigades, projects, sites, tasks, services, availability, time, capacity, supply, current and future demand, matching, education, recognition/RPL, jurisdictions, mobility, market signals and commercial opportunities — **one graph, 28 nodes**, with chat/AI as the universal control layer over it (canonical §1.1–1.3).

**Value chain (APPROVED):** REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH → EXECUTION → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION.

**The differentiator (APPROVED, decision 0014 / `OPPORTUNITY_REALIZATION_LOCK_V1`):** the Work Journal and the Living CV built from it. Work history here is **recorded** by the person, **supported** by journal evidence, and **confirmed** by the counterparty who was there — never self-declared only, never a star rating, never a platform-held score. Evidence states (recorded / declared / potential / confirmed / certified) never collapse (decision 0023, SEP-3, SEP-6).

**Public promise (APPROVED, A-13):** *Show what you can do and have done; LabourMarket.ai helps you find more opportunities to realize it.* Always "earning opportunities", never guaranteed income or hiring. Public identity is stated positively and universally — never "not just a job board" (constitution §7.1; the one indexed violation was corrected in this audit).

**What it is never narrowed into (APPROVED, canonical §2):** a job board, a recruitment site, a staffing marketplace, a CV builder, a Work Journal, a timesheet app, a workforce planner, an evidence database, a qualification platform, a booking calendar, an AI chatbot. Each is ONE EDGE of the graph; recruitment is a core function, not the boundary (decision 0008).

**Why a participant chooses it over the alternatives (evidence in the audit §11):** no competitor found in LT, the Nordics, DACH or Benelux offers a worker-owned, counterparty-confirmed work record that travels across employers, agencies and borders. LinkedIn verifies identity and employer affiliation, not work; Upwork/Fiverr/MyHammer hold platform-locked ratings; Deputy/Connecteam hold employer-owned timesheets the worker loses on leaving; Glassdoor is one-directional anonymous opinion. The market itself retreated from test-based badges toward demonstrated capability (LinkedIn removed Skill Assessments in 2024).

---

## 2. Participant types and permissions

**APPROVED (canonical §1.4, decision 0012, `ORGANIZATION_ROLE_ORCHESTRATION_V1`):** the fundamental entity is an **ACTOR**, never a role. One person is simultaneously an employee of one company, an owner of another, a student, a brigade member, available for an opportunity, a provider and a client. One account; an explicit **active context** (personal / a chosen organization); `organizationType` says what the organization is, `relationship` says how the person stands in it, and neither is the person's participation mode (SEP-5).

| Participant | Realized by (IMPLEMENTED unless noted) | Permissions model |
|---|---|---|
| **Person / worker** | `profiles` + `workers`, personal engagement context (35/36 profiles hold an org-less context), journal, Living CV, opportunities board, express interest, visibility consent | Owns own rows under RLS; discoverable to employers only through `can_view_worker` (self / admin / consented discoverability / active relationship). **No paid gate anywhere on browse → open → apply** (verified in code). |
| **Company / employer** | `organizations` + `organization_roles` (employer, client, contractor, subcontractor, project_operator), engagement contexts, projects, tasks, needs (`customer_requests`), scouting, team offers, approvals | Authority is one pure projection (`organization-authority.ts`); multi-company switching is membership-validated and fails closed; every write re-derives the org from the active workspace. Free organization = 1 concurrent open need; the €99/month plan removes that limit (the only live paid lever). |
| **Agency** | `organization_roles` capability (`workforce_provider`, `talent_provider`, `recruitment_partner`) — Model B: own roster, agency↔client bridge, candidate offers, supply declarations | Supply is something an actor OFFERS (SEP-4); agency supply never appears as employer demand. **Commissions do not exist** (NOT_IMPLEMENTED). |
| **Team / brigade** | organization type `team`, `create_team_v1`, consent-only membership via invitation, team offers against a demand (aggregate capability only, ARCH-4), disband | Capability summaries disclosed only through explicit supply consent; never to arbitrary employers. UNKNOWN ≠ ZERO on team skills is fixed in code. |
| **Institution** | `training_provider` capability, programmes, cohorts, learner links, outcomes | Learner visibility is not employer visibility (migration 20260827210000, proven). |
| **Customer / buyer (B2C)** | `customer` role (decision 0007), service requests, marketplace enquiries | Enquiry opens the canonical conversation; never self-enquiry. |
| **Seller / service provider** | `service_offerings`, `marketplace_listings` (five domains), public business page | Provider-pinned writes; publish policy refuses restricted categories; food needs a legal acknowledgement. |
| **AI agent as participant** | **NOT_IMPLEMENTED** — target only (canonical §1.13; AGENT-1..4 OPEN) | Delegate mode (MCP door, acts for a person) IMPLEMENTED; provider mode (agent as work subject) not. |
| **Admin / superadmin** | `is_admin()` in RLS, `requireSuperadmin` on the admin console | Platform operator; every admin read of personal data should be audited (PROPOSED, audit G-8). |

---

## 3. Main user journeys

**APPROVED — six permanent journey contracts** (`journey-register.ts`, ids fixed forever). Status is the register's own on 2026-10-16 (35 live links, 5 marked broken).

| Journey | Chain | Status 2026-10-16 |
|---|---|---|
| `J-WORKER-EVIDENCE` | Real work → journal → evidence → verification → living profile → capability | LIVE end to end; counterparty review (decision 0018) and self-confirmation blocking exist in code (migration 20261003150500). Production application of that migration is **unverified from this session** → EVID-2 stays listed OPEN until the ledger is read. |
| `J-COMPANY-EXECUTION` | People → project/site → assignment → capacity → need → supply → execution → report → verified history | LIVE except "capacity → need": the capacity model feeds only dated project assignments while the reservation check reads five sources (audit C-4, PROPOSED fix). |
| `J-AGENCY-SUPPLY` | Declare supply → discoverable to authorized demand → demand → match → assignment | LIVE (walked in production 2026-09-28 / 10-12). |
| `J-INSTITUTION-OUTCOME` | Programme → cohort → person → practice → evidence → competency → qualification → employer demand → outcome | Two links BROKEN by the register ("learners join the cohort" — zero cohort members, ARCH-3 OPEN; "competency becomes a qualification / recognised equivalence" — RPL deferred by ARCH-2). |
| `J-IMPORT-HISTORY` | Source → parse → reconciliation → preview → commit → readback → provenance → reversal | LIVE for organization-evidence imports (every link exists in `import-core.ts`); the timesheet-xlsx import has per-row correction but no batch reversal (PARTIAL). |
| `J-TIME-FREEDOM` | Commitment → overlap → warning → alternatives → authorized decision → override → audit → actual result → learning | Detection, warning, alternatives and the **override receipt** (`record_commitment_override_v1`, 20261003150100, web + chat + MCP) exist in code. The register still marks the override step BROKEN with a reason that no longer describes the code; the real remaining question is whether 20261003150100 is applied in production (OPEN for the owner's ledger read). "Learning" from override outcomes is NOT_IMPLEMENTED. |

**First sessions (IMPLEMENTED, measured):** signup = Google or email + password; onboarding = two steps (intents → name, country, professions, student fields, visibility consent). The company setup form asks country and contact e-mail again (PROPOSED fix, audit IA-1). A new worker's first suggested action is "add skills", not a journal entry (PROPOSED: make the first journal entry the activation, audit IA-2).

---

## 4. Functional architecture

**APPROVED (canonical §1.8, decisions 0017 / A-01..A-03):** chat-first — `/dashboard` IS the conversation; structured data is the editable result behind it. ONE canonical chain: natural-language input → intent router (deterministic, 71 intents, LT/EN/RU + partial NL/DE/PL) → context resolver → missing-data resolver → authorization gate → canonical dispatcher → domain executor → DB transaction → audit/provenance → state readback → contextual response. The LLM is consulted only when the router cannot read a sentence, may only return an existing intent id, and never dispatches.

**Six distribution surfaces, one capability layer (APPROVED):** web/PWA (IMPLEMENTED, installable, no service worker by decision), Android and iOS (native Expo app, 6 screens, CI-built, store submission OWNER-GATED: accounts, signing keys, App Links env), ChatGPT app and Claude connector and vendor-neutral MCP (one MCP door, 229 tools, protocol revision 2026-07-28, OAuth/bearer = the user's own RLS; bearer SCOPE limitation is RED PR #2336, OPEN). Every surface is an adapter over `apps/web/lib/capabilities/`; per-platform business logic is the defect.

**Four pillars, twelve elements (APPROVED, `PRODUCT_UNIVERSE_LOCK_V2`):** AI Conversation · Avatar · World Map · Work Journal; the World Map is a platform of registered object types, never a screen redesigned per type (`universal-object-model.ts`, `entity-model.ts`).

**Status of the dashboard (measured):** 84 routes; the worker home renders 8–9 regions above the fold with no collapsing (PROPOSED: progressive disclosure like the company screen's "More"); two vocabularies conflict ("market" = listings on tiles but service-requests on org tabs; two calendar routes) (PROPOSED fix, audit IA-3); the `/dashboard/talent` owner-review preview with sample entities is linked from public marketing pages (PROPOSED: unlink, audit IA-4).

---

## 5. Core data entities

**APPROVED canonical structures (doctrine §2, `UNIFIED_WORLD_MODEL_V1`):**

| Domain | Canonical tables / RPCs (IMPLEMENTED) | Invariants |
|---|---|---|
| Identity & context | `profiles`, `workers`, `organizations`, `organization_roles`, `engagement_contexts` (relationship slugs incl. employee, owner, student, volunteer), signed `lm_active_workspace` cookie | IDENTITY ≠ ROLE; one account, many contexts; workspace resolved server-side (decision 0024) |
| Real work | `journal_entries` (append-only, `create_journal_entry_full`, supersede v2, soft delete), `journal_entry_metrics` (free-slug: work_date, quantity, fragments, site, and since this audit work_start / work_end / break_minutes), `journal_entry_skills`, `journal_entry_confirmations`, photo evidence | A journal entry is a FACT: future work dates are refused on every transport since this audit (SEP-1). Hash chain exists but is a commitment, not recomputable (PROPOSED RED: hash in RPC + unique `(worker_id, hash_prev)`) |
| Capability | `skills` (ESCO-aligned), `worker_skills` with evidence tiers, `skill_verifications`, recognitions, potential skills computed at read time (never written) | EVIDENCE ≠ VERIFICATION; demonstrated capability never satisfies a formal requirement (SEP-6) |
| Organization-supplied history | `organization_evidence_records` / `_events` with independence policy, subject dispute and roster-link refusal doors, consolidation ledger | Imported record = the importer's claim; the subject can see and refuse it (ARCH-5 is closed in code since 20260915180000; the canonical §10 row is stale) |
| Projects & execution | `projects`, stages, `work_tasks`, `project_worker_assignments`, `team_assignments`, `commitment_override_receipts`, operations report, project trace, handover passport | COMMITMENT ≠ PROHIBITION; dependencies advisory |
| Time & capacity | `lm_tz` viewer day, planning/calendar as projections over journal and commitments, bookings, trips, absences, work plans | TIME is a projection, never a second store |
| Demand & supply | `customer_requests` (kinds incl. `agency_offer` supply), `public_vacancies` (NAV NO + Arbetsförmedlingen SE imports, ~89k), demand interest signals, team demand offers | DEMAND ≠ SUPPLY by direction rule |
| Marketplace | `marketplace_listings` (domains: work_resource, goods, service_need, personal, project_work; kinds sale/rental/wanted; price + ISO-4217 currency + quantity + expiry), `service_offerings`, service requests, `market_index_v1` (security invoker), publish policy | Shared discovery, conversation bridge and direction rule; three transaction shapes keep their own state machines; no payments on-platform |
| Communication | conversations, participants, messages with `original_language`, translate-on-read (grant-gated), notifications, invitations with DB caps | Original text never rewritten |
| Commerce | `plans`, `billing_*` (Stripe live subscription, 14-day trial once), LMC ledger (append-only, 1 LMC = €1, bigint cents, idempotent, compensation RPC), `confirmation_spends` | STRIPE and LMC never touch (guarded) |
| Privacy | consent ledger (versioned, hashed, append-only), disclosures, privacy requests (typed `customer_requests`), export v3, `ai_runs` 90-day redaction, erasure executor v2 (RED PR #2426, not applied) | Confirmations single-use; one memory (decision 0024) |
| AI | `ai_runs` (audit, append-only), `usage_cost_events` (money ledger, vendor runs only), egress grants, task sensitivity registry | A refusal is never a run (fixed in this audit) |

---

## 6. Trust and evidence model

**APPROVED.** Five evidence states (decision 0023) and one ladder (`lib/evidence/evidence-tier.ts`): recorded (the person's own journal) → declared (self-stated skill or history) → potential (inferred at read time, never written) → confirmed (an independent counterparty with a work relationship, decision 0018; self-confirmation refused at the DB) → certified (a credential held and validated). Recognised equivalence (RPL) is a sixth, deferred standing asserted only by an authorized assessor (ARCH-2, principle APPROVED, build deferred).

**No star ratings anywhere (APPROVED, verified: none exist).** Reputation is computed only from real evidence; no universal score of a human (constitution §10). Company trust = verification status + confirmed facts (confirmed hours, on-time confirmation rate, settlements) — PROPOSED surfaces, not opinion reviews.

**Honesty rules enforced by guards:** no "demo" in copy; "not verified" is said where it is true; UNKNOWN is never rendered as ZERO (three such renderings were fixed in this audit: project-card people count, stadium entries, marketplace reads); a failed read is `unavailable`, never an empty market.

---

## 7. AI capabilities

**APPROVED:** one AI, one conversation, chat is the control layer (canonical §1.3); no fake AI; AI output is DERIVED, never a fact until confirmed; external providers receive PUBLIC data only unless an owner-recorded, task-scoped grant exists (AI DATA BOUNDARY 2026-08-19).

| Use | Status 2026-10-16 | Assessment |
|---|---|---|
| Intent understanding | Deterministic router first; Gemini proposer behind a grant that is suspended until `AI_GEMINI_PAID_TIER_CONFIRMED` (OWNER-GATED) | Keep; add a sampled router-miss log so the regex corpus grows from real misses (PROPOSED) |
| Message translate-on-read | Grant suspended → declined honestly; secondary MT engines (LibreTranslate/DeepL/Cloudflare) wired but unconfigured | PROPOSED: self-hosted LibreTranslate (no egress, no grant) — an LLM is the wrong tool for thread rendering |
| Vacancy translation | No grant → always refused; call now skipped before any ledger IO | Keep off until a grant or local engine |
| Journal structuring, CV extraction, need structuring | Deterministic recognisers are the product; AI seams dormant | Keep deterministic |
| Match explanation | Deterministic dimensions explain the match; AI paragraph refused; anonymous preview no longer calls the runtime | Decorative AI — keep off |
| Market explanation | The only live Gemini task (PUBLIC aggregates); 83 × HTTP 429 in production unmonitored | PROPOSED: template the sentence or cache one run per profession per day; monitor 429s (#2419) |
| MCP door (delegate mode) | IMPLEMENTED, 229 tools, draft→confirm for consequential writes | Residual risks: unscoped bearer (#2336 RED), per-instance brake |
| Voice journal | Deferred: no transcription host (COM-6 OPEN) | — |
| AI agents as providers | NOT_IMPLEMENTED (AGENT-1..4 OPEN) | — |

Cost controls: per-run USD ceiling, daily run budget (500), per-org run cap (100), per-user in-memory limits; **no money-denominated monthly cap and no per-user/org cost view** (PROPOSED).

---

## 8. Marketplace operating model

**APPROVED (`OPPORTUNITY_REALIZATION_LOCK_V1`, decision 0013, Option C 2026-10-02):** employment, temporary/permanent work, subcontracting, professional and personal services, goods (including home-grown, handmade, household, second-hand as `goods_other`), B2B partnership, team-based offers, individual buying and selling, cross-border. Symmetry: I NEED → inquiry/wanted; I CAN OFFER → offer. TEST A (a Swedish worker never browses 7,000 listings) and TEST B (grandmother's cucumbers) are binding.

**IMPLEMENTED:** five listing domains with a publish policy; services and service requests; team demand offers; federated discovery (listings + vacancies + agency supply + verified demand) with honest `unavailable`; enquiry → canonical conversation; public business pages; public job board (no JobPosting markup by owner policy; apply on the source site).

**Fixed in this audit:** the chat refused lawful goods and told a produce seller "no channel" while the board accepted the listing (TEST B failed in practice); failed reads rendered as empty markets; the listing form defaulted to EUR regardless of country.

**NOT_IMPLEMENTED (owner requirements §3.5 of the brief):** route distance (only straight-line haversine exists, used in matching only); distance shown on any listing; separate logistics/shipping cost; transaction conditions; delivery/pickup; currency on service offerings and on customer requests; second-hand condition attribute; photos on listings; trader-vs-private flag (Omnibus 2019/2161, DSA Art. 30); "I need goods" natural-language reading; cross-border fallback in the services empty state; country filter on the public board (RED PR #2209).

**Cross-border rule (APPROVED by the owner's brief, PROPOSED as implementation):** every listing and offer shows city, country, straight-line distance, and — where logistics matter — route distance clearly labelled as such, logistics cost as a separate line, currency, and conditions; precise addresses stay private until the confirmation step.

---

## 9. Monetization

**APPROVED:** 1 LMC = €1 of internal platform credit, bigint cents, never cash (BINDING); the free tier carries substantial real utility; workers browse, open and express interest without any payment barrier (verified); employer premium = enhanced discovery/contact/shortlisting/communication/visibility (declared boundaries exist, only one is enforced); MKT-7 "two independent owner acts arm real charging".

**IMPLEMENTED and LIVE:** one Stripe subscription — Organization €99/month, 14-day trial once per org, automatic tax, portal — enforced through the open-needs limit (free = 1 active need). **Finding of this audit (owner attention):** live charging has been ARMED since 2026-09-05 (`PRICING_READINESS_STATE = owner_confirmed` + `STRIPE_LIVE_ACTIVATION` env, a public literal), a live checkout session and live customers exist, while the webhook → entitlement path has **never fired** (0 webhook events), the recovery cron is inert, and the `live_payments_enabled` DB flag is read by nothing. `CAPABILITY_INVENTORY` said "test mode; nothing has ever run" (corrected in this PR).

**DEFERRED / OWNER-GATED:** LMC top-ups, spend, promotions, referrals (all flags false; the revoke of `authenticated` EXECUTE on the money RPCs, 20261006100300, is written but unapplied — apply before any flag flip); worker paid tiers; agency plans; catalogue prices (MDD-01..14 OPEN).

**PROPOSED:** make the activation token a secret compared with `timingSafeEqual` and couple `getBillingConfig` to the DB flag so the "second act" is real; a money-denominated monthly AI cap; a per-org cost view; a unique index on the external payment reference before any top-up wiring.

---

## 10. Internationalization

**APPROVED (decision 0010, canonical vision §13):** global architecture (all ISO countries, currencies, time zones), nine equal-priority launch markets (LT, LV, EE, NL, DE, DK, NO, SE, PL), adding a country needs no schema change.

**IMPLEMENTED:** six routed UI locales (lt, en, ru, nl, de, pl) at full parity (14,892 leaves each); five shell catalogs (da, no, sv, lv, et) at 5,726 leaves with 9,185 keys missing; communication-only languages uk, ka; journal entries carry a validated `original_language`; translate-on-read is grant-gated. **Fixed in this audit:** a first visit in an unrouted language (sv, fi, fr…) landed on Lithuanian and `x-default` hreflang pointed at `/lt` on ~39k job URLs — both now English.

**PROPOSED:** promote sv and no shells for the two highest-value demand markets (~9.2k keys each + ~2.5k `[EN]` residue); move the marketing pages' inline per-locale dictionaries (jobs, professions, skills, work-opportunities) into the catalogs so the i18n ratchet can see them; update `LANGUAGE_MATRIX.md` (stale: says 5 routed / 10,263 leaves).

---

## 11. Privacy and security

**APPROVED (doctrine §17, decision 0024):** default deny, RLS, least privilege, audit, provenance, idempotency, no fake success, migrations with rollback, production migrations only through the owner gate (RED) or the GREEN autonomy rules.

**IMPLEMENTED and strong:** consent ledger (versioned, hashed, append-only, withdrawal always accepted); Art. 15/20 export over ~150 relations with signed links; privacy-request intake with admin review (due dates added in this audit); first-party telemetry only, **no third-party trackers**; AI egress default-deny with task scoping; `ai_runs` 90-day redaction (applied); MCP writes behind single-use confirmations; LMC and journal append-only guards; service_role holds almost no table grants (42501 is the normal answer for legacy tables).

**OPEN / RED (owner):** erasure executor v2 (#2426 — do not apply as drafted: cascades into `journal_entries` and `billing_*` are accepted without a decision, `usage_cost_events` SET NULL is blocked by its own trigger, storage path-prefix scan missing, static "ERASE" word instead of a single-use token, no runbook); retention beyond `ai_runs` (documented, unenforced); export of own messages (RED RPC); consent RPC locale hard-coded to `lt`; the read-only `SUPABASE_DB_URL` secret that activates two live CI gates (GOV-1).

**Fixed in this audit (copy honesty):** the privacy notice over-described what Gemini receives; the cookie page omitted first-touch attribution and session storage.

**PROPOSED:** rate-limit and audit the full export; audit admin reads of personal data; enforce `allowedFields` at the AI dispatch boundary; Turnstile on signup and waitlist; pin the middleware runtime region; log PostgREST error codes only.

---

## 12. Growth loops

**APPROVED constraints:** no paid advertising; no spam, purchased engagement, fake reviews or scraping; public profiles only with consent; outcomes may be described publicly, mechanisms may not (AGENTS.md).

**IMPLEMENTED today:** public job board (no JobPosting), profession/skills/work-abroad/calculator/country pages, answer-engine infrastructure (0 published answers), invitations (join team, roster claim, agency↔client), `llms.txt`, sitemaps, per-locale OG images, first-party funnel telemetry with first-touch attribution.

**PROPOSED (detailed in [`docs/launch/GROWTH_AND_ROADMAP_2026-10-16.md`](../launch/GROWTH_AND_ROADMAP_2026-10-16.md)):** the crew-lead "invite your team to confirm the work" loop; consented public Living CV pages; profession × country pages fed only by real counts; an open, attributed feed of verified demand; honest platform statistics pages; corridor checklists (A1, ID06, HMS, Valtti, SOKA-BAU, Bouwpas, RUT) as useful content.

---

## 13. Roadmap (confirmed vs speculative)

**CONFIRMED work** (owner-approved direction, implementation pending): apply or decide the RED queue (erasure v2 after amendments; LMC server-only execute; team demand offer migrations if not applied; scheduler watchdog; expiry sweeps); verify the live Stripe webhook; store submissions; EVID-2 / ARCH-5 / J-TIME-FREEDOM register truth after a ledger read; promote the first Nordic locale.

**SPECULATIVE (this audit's proposals, owner decision needed):** cross-border logistics fields and route distance; public consented profiles; programmatic profession × country pages; open demand feed; LibreTranslate host; AI money cap; company trust facts instead of reviews.

The 30/60/90-day plan lives in the growth document §G.

---

## 14. Owner decisions — accepted and unresolved

**Accepted (recorded):** ARCH-1 (28 nodes, semantic only), ARCH-2 (RPL principle, build deferred), ARCH-4 (team capability consent-scoped), decisions 0006–0024, Option C universal marketplace (2026-10-02), the owner execution principle (0016), landing freeze, no JobPosting markup, 1 LMC = €1, nine launch markets, no star ratings, no "demo".

**Unresolved (no agent may settle):** PER-11, ORG-2, EVID-2 (code closes it; ledger unverified), EVID-6, MKT-7 (live is armed — the owner should state whether that is intended), GOV-1, ARCH-3, ARCH-5 (code closes it; registry stale), ARCH-6, AGENT-1..4, COM-6, COM-8, MDD-01..14 (prices), E6 (team demand offers apply), the `-- @human-gate-approved` RED queue (#2426, #2420, #2418, #2410, #2362, #2235, #2227, #2209, #2203, #2165, #2150, #1816, #1813, #1577, #1475, #1440, #1433, #1426, #1421, #1045, #897, #896, #883, #740), the Vercel account block, and the three new decisions this audit raises: (N-1) is live Stripe charging intended before the webhook proof; (N-2) which cross-border fields become required on listings; (N-3) whether to promote sv/no before or after the first Nordic customer.
