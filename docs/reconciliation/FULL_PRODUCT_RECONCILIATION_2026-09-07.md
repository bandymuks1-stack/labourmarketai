# LabourMarket.ai — FULL PRODUCT RECONCILIATION, 2026-09-07

> **Status:** evidence record. Not a plan, not a vision, not a roadmap.
> **Method:** eight parallel source-level domain sweeps over `main` @ `813f1b6`
> (unshallowed to the full 1,625-commit history), plus a live read of the
> production project — schema, RLS catalogue, migration ledger, row counts,
> security advisors — through Supabase MCP. The project ref is deliberately
> omitted here and everywhere else in this PR (standing owner rule).
> **Canonical register:** [`docs/CAPABILITY_INVENTORY.md` §6](../CAPABILITY_INVENTORY.md).
> This file is the reasoning; the register is the list future work must update.
>
> **The rule this document was written under:** a file existing is not proof, a
> green unit suite is not proof, and a migration in the repository is not proof
> that it is in the database. Everything below is either a live production read
> or a cited line of code.

---

## 0. THE FINDING THAT EXPLAINS THE OTHERS

The reconciliation was commissioned because capabilities keep being
"rediscovered". The cause is now measured, and it is not that the product is
disorganised. It is this:

> **The repository systematically UNDER-REPORTS what is live in production, and
> it does so in the one place every agent and every human looks first — the
> comment at the top of the file.**

Sixteen migrations that in-code comments and `docs/APPLIED_LEDGER.md` describe
as *"DRAFT — not applied"*, *"owner-gated, pending"*, or
*"APPROVAL … has NOT been given"* were read directly out of production's own
`supabase_migrations.schema_migrations` on 2026-09-07 and are **applied**:

| Capability the comment says is unavailable | Ledger version | Reality |
|---|---|---|
| `experience_records` (reviews, disputes, right of reply) | `20260804151214` | applied · 2 rows |
| Practice / volunteering work history (`student`, `volunteer`) | `20260827062354` | applied — `save_self_declared_work_history_v1` accepts both slugs, verified in the live catalogue |
| Transversal capability skills (8 slugs) | `20260827052801` | applied — `skills` = 161 |
| Training & certification register | `20260818040903` | applied · 0 rows |
| Education programmes / cohorts / learner outcomes | `20260903105839`, `20260903105902` | applied · 1 programme, 1 cohort |
| `worker_education` + `worker_achievements` | `20260716195418` | applied · 4 education rows |
| `worker_languages` | `20260711203623` | applied · 11 rows |
| `work_hour_allocations` + timesheet compute | `20260831161725`, `20260831170936` | applied · 5 rows |
| Human-in-loop learning queue | `20260627135708` | applied |
| Profile avatar, document verification, project/client context, `journal_entry_work_items`, internship/apprenticeship opportunity type | various | all applied |

Three named examples of the comment being wrong, in code that ships today:

- `lib/worker/worker-education.ts:9-11` — *"DRAFT migration 20260714160000
  (human-gated, NOT applied yet)"*. Applied 2026-07-16.
- `app/[locale]/dashboard/profile/page.tsx:282-283` — *"worker_languages from
  DRAFT migration"*. Applied 2026-07-11.
- `lib/admin/ai-cost.ts:21` — *"production has 0 rows today
  (AI_PROVIDER_MODE=disabled)"*. Production holds **47 `ai_runs` and 47
  `usage_cost_events`**, 2026-08-28 → 2026-09-06, real spend $0.0396.

**Consequence:** a large amount of "missing" work in every recent audit —
including two of the eight sweeps commissioned for this document — is not
missing. It is built, applied and running, and the repository told the reader
otherwise. This is the single highest-leverage thing to fix, and it costs no
migration and no schema change.

**Where the ledger is NOT at fault.** `docs/APPLIED_LEDGER.md` already carries
a 2026-08-19 correction banner that names all 26 falsely-pending entries, names
the eight genuinely-unapplied files, and states that the error runs in one
direction only. That banner is accurate and was verified again today — the same
eight are still absent from production. The ledger did its job.

The stale statements that actually mislead are **in the code**, at the top of
the module a reader opens: `lib/worker/worker-education.ts`,
`app/[locale]/dashboard/profile/page.tsx`, `lib/admin/ai-cost.ts`,
`lib/agency/clients.ts` and the migration headers themselves. A correction
banner in a document 1,500 lines away does not reach someone reading a `.ts`
file, which is why the same conclusions keep being re-derived — twice inside
this reconciliation, by two independent sweeps.

Two further facts the banner establishes and this reconciliation confirms: the
eight unapplied files have been known since **2026-08-19** and are still
unapplied 19 days later; and no ledger row has ever over-reported an apply,
which is the direction that would break code.

---

## 1. PRODUCTION SNAPSHOT — read 2026-09-07T03:46Z

The production project (ref deliberately not written down). 266 applied
migrations (max version
`20260906202628`). 190 tables in `public`, **RLS enabled on all 190**.

### What real people have actually done

| | rows | reading |
|---|---:|---|
| `profiles` / `workers` | 56 / 56 | real people |
| `organizations` / `companies` / `agencies` | 17 / 14 / 3 | `organizations` is the spine; `agencies` is archived legacy |
| `organization_roles` | 15 | the multi-capability model is in use |
| `engagement_contexts` | 79 | the employment spine |
| `company_memberships` | 19 | the governance spine |
| `journal_entries` | 40 | real work, recorded by real people |
| `journal_entry_confirmations` | **13** | the receive loop has run — including 2 `changes_requested` |
| `journal_entry_skills` / `worker_skills` | 48 / 50 | the evidence→skill chain is live |
| `worker_skills` where `verified` | **2** | independent verification is rare and real |
| `customer_requests` | 20 | real employer demand |
| `public_vacancies` | 77,366 (76,747 active) | one source, one country (SE) |
| `pilot_events` | 3,329 | telemetry is live |
| `ai_runs` / `usage_cost_events` | **47 / 47** | **AI has run in production** |
| `market_intelligence_observations` | 76 | Eurostat import is live |
| `audit_logs` | 64 | |
| `projects` / `work_objects` | 9 / 1 | |
| `work_hour_allocations` | 5 | |
| `conversations` / `conversation_messages` | 5 / 18 | messaging has been used |
| `demand_interest_signals` | 5 | |

### Built, applied, and never once used in production (0 rows)

`team_details` · `team_enquiries` · `marketplace_listings` · `matches` ·
`match_actions` · `job_demands` · `agreements` · `contracts` · `proposals` ·
`assets` · `asset_assignments` · `business_trips` · `worker_absences` ·
`training_programs` · `training_assignments` · `performance_reviews` ·
`review_cycles` · `management_decisions` · `procurement_inquiries` ·
`onboarding_runs` · `offboarding_runs` · `org_documents` · `customers` ·
`leads` · `defects` · `follow_up_tasks` · `work_tasks` · `work_task_events` ·
`task_dependencies` · `journal_entry_work_items` · `journal_entry_tasks` ·
`project_members` · `agency_workers` · `contact_disclosure_requests` ·
`worker_saved_opportunities` · `subscriptions` · `billing_subscriptions` ·
all five `lmc_*` tables.

That is **~40 tables of shipped, RLS-guarded, tested capability that no human
has ever written a row into.** It is not waste — most of it is correct and
waiting — but it is the precise measure of the gap between "built" and "used".

### Security advisors — 392 findings, triaged

| level | finding | verdict |
|---|---|---|
| ERROR ×1 | `worker_absence_scheduling` view is `SECURITY DEFINER` | **deliberate** — the privacy-narrowing view from `20260808120000` that hides `note`/`absence_type` (health data) from employers |
| WARN ×374 | `authenticated_security_definer_function_executable` | the normal Supabase RPC pattern; not actionable as a class |
| WARN ×9 | `anon_security_definer_function_executable` | all nine are the **intended** public surface (vacancy preview/search/sitemap/count, public business profile ×3, public plans, anon need intake) and all nine are in `lib/security/anon-secdef-allowlist.ts` |
| WARN ×2 | `function_search_path_mutable` on `usage_cost_events_forbid_mutation` / `_forbid_truncate` | **real, small, fixable** — two guard triggers missing a pinned `search_path` |
| WARN ×2 | OTP expiry > 1 h · leaked-password protection off | **real, owner-only** — Supabase Auth dashboard settings |
| INFO ×4 | `rls_enabled_no_policy` on `company_need_public_intakes`, `public_vacancy_supply_counts`, `vacancy_import_cursors`, `worker_display_name_backfill_20260805` | **deliberate deny-all**; reached only through SECURITY DEFINER RPCs or `service_role` |

No cross-tenant leak, no permissive `using (true)` on tenant data, no
`anon`-writable tenant table was found.

---

## 2. REPO → PRODUCTION: NINE MIGRATIONS THAT EXIST ONLY IN THE REPOSITORY

The live parity gate proves *applied → has a repo file* (0 orphans). **Nobody
checks the other direction.** Reading it manually:

| Migration file (in repo, NOT in ledger) | Objects | Confirmed absent in prod | Code that depends on it |
|---|---|---|---|
| `20260713160000_agency_clients_v1` | `agency_clients` + 3 RPCs | ✔ | `lib/agency/clients.ts`, `clients-actions.ts`, agency room on `/dashboard/company` |
| `20260714180000_journal_profession_templates_v1` | `journal_profession_templates` | ✔ | `lib/journal/journal-templates.ts`, journal composer |
| `20260713210000_multi_source_talent_v1` | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` | ✔ | `lib/worker/external-profiles.ts`, profile page external-links section |
| `20260714170000_worker_opportunity_seen_v1` | `worker_opportunity_seen` + RPC | ✔ | `lib/opportunities/seen.ts`, weekly intelligence |
| `20260717150000_demand_interest_seen_v1` | `demand_interest_seen` + RPC | ✔ | none yet |
| `20260713120000_company_locations_v1` | `company_locations` + 2 RPCs | ✔ | none (superseded by `work_objects`) |
| `20260714211000_dashboard_preferences_v1` | `dashboard_preferences` | ✔ | none |
| `20260717130000_open_markets_countries_draft_v1` | country allowlist widening | ✔ | none |
| `20260817130100` / `20260817140100` notification type widenings | CHECK widening | folded into the applied union migration | — |
| `20260714210000_company_memberships_v1` | superseded draft | ✔ | **NEVER APPLY** — its own header says so; kept only because a guard pins its bytes |

**Four of these are live UI rendering an honest "not enabled yet" state to real
users** — agency client management, journal profession templates, external
profile links, and "new since your last visit" markers on the opportunity
board. The code is correct and degrades honestly (`42P01` → tagged state). The
capability is simply dark, and has been for ~8 weeks.

This is the **inverse parity gap**, and it is not gated by anything. It should
be: the same checker already has both lists.

---

## 3. THE HIGHEST-SEVERITY DEFECT — SELF-CONFIRMATION, MEASURED

`review_journal_entry` (current body:
`supabase/migrations/20260720150000_journal_photo_continuity_v1.sql:509-558`)
authorises on `is_admin() OR manages_organization(v_org)` and then checks that
the reviewer holds a `manager|owner|external_manager` engagement. It selects
the worker at line 522 and uses it **only in the audit payload**. There is no
`auth.uid() <> v_worker` comparison anywhere in the body, in
`confirm_entry_and_verify_skills`, or in `review_journal_entries_batch`.

**Measured on production, 2026-09-07** (not inferred):

| | |
|---|---|
| confirmations total | 13 |
| **self-confirmations** | **3** — one person, `Ramunas Šukys`, on 2026-06-16 and 2026-07-05 ×2 |
| all three | `decision = approved`, `confirmer_role = owner` |
| skills flipped to `verified` by them | **0** |
| `worker_skills.verified` on production | 2 — and both belong to a *different* person (`sukysdonatas`), confirmed by someone else |

So the ladder's top rung is **not yet corrupted**. What *is* wrong today is the
read: `deriveProvenance` (`lib/evidence/provenance.ts`) turns any approving
confirmation row into `EMPLOYER_CONFIRMED`, so those three entries currently
render exactly like work a supervisor confirmed.

**Why it is still open:** closing it in the RPC is a `SECURITY DEFINER`
authorization-body change — RED, owner-gated — and the product decision is
genuinely open, because a sole trader legitimately has nobody above them. The
window-9 checkpoint recorded that on 2026-09-06 and asked for an owner
decision. It has not been answered.

**What does not need an owner decision:** the *read* side. Classifying a
self-confirmation as a visibly weaker grade of evidence is pure derivation over
data that is already there, needs no migration, and is the option the
checkpoint itself called "probably right". It also preserves the history rather
than deleting it, which the owner's own P0 instruction requires. See §11.

---

## 4. WHAT LABOURMARKET.AI ACTUALLY IS TODAY

**Genuinely works, with real production evidence:**

- Register → onboard → profile → **Work Journal** → skill recognition →
  `worker_skills` → Living CV / player card → CV export (incl. EU format).
  40 entries, 48 skill links, 50 skills, real people, all four write transports
  (web form, chat, voice, MCP/mobile) landing on one core.
- **The receive loop**: submit → the responsible person's queue → approve /
  request changes → the worker sees it. 13 real confirmations since 2026-05-30.
- **Employer demand**: need → board → matching (20 criteria) → shortlist →
  interest → contact. 20 real requests, 5 real interest signals.
- **External vacancy ingestion**: 77k Swedish ads, deduped, freshness-tracked,
  provenance-separated from native demand, anon-boundary-enforced.
- **Chat as a real action backbone**: 38 of 52 registered conversation actions
  perform real domain writes behind HMAC one-time confirmation tokens.
- **MCP door**: 12 capabilities, all exposed, caller-RLS-scoped, draft→confirm
  on every write. ChatGPT can already read a profile, read and write the
  journal, express interest, save a work card, create demand, switch workspace.
- **Booking concurrency**: three layers (row lock, advisory lock, GiST
  exclusion). The strongest engineering in the repository.
- **Privacy**: default-closed consent, disclosure ledger, GDPR export, 8-level
  visibility model, no coordinates stored for people by schema construction.

**Appears to work but does not reach anyone:**

- Marketplace (offerings, listings, request→accept→conversation): the loop is
  complete and the reachability is ~zero — not in nav, and the dashboard grid
  that was supposed to surface it has no renderer.
- Teams/brigades: create and invite work; **remove a member does not exist**,
  team roles do not exist, and no FK anywhere lets a team be assigned to a
  project, object or stage.
- Calendar: a real, well-tested 5-view calendar over 8 sources — and 10 further
  dated stores (trips, training, timesheets, hours, agreements, reviews,
  cohorts, onboarding runs, follow-ups) never reach it.
- Everything built in the 2026-08-17/18 wave (agreements, procurement, trips,
  training, reviews, decisions, workflow templates, org documents): applied,
  reachable only as sections inside `/dashboard/finance` and
  `/dashboard/commercial`, **0 rows each**.

**Broken or contradictory:**

- Capacity says a worker on approved leave is free. `lib/workforce/workforce.ts`
  feeds `assessCapacity` from `project_worker_assignments` only — accepted
  bookings and approved absences are not inputs. On `/dashboard/company/planning`
  the capacity bar and the unavailability panel on the same page can
  contradict each other.
- Four availability vocabularies (`workers.availability_status`,
  `team_details.availability_status`, `project_worker_operational_statuses`,
  `worker_absences`), none derived from another.
- Supply still renders as demand in seven places (§7).
- `experience_responses` (right of reply) is write-only — the form ships, no
  surface ever renders the reply.
- `/dashboard/learning` has **zero inbound links** anywhere in the product.

---

## 5. LOST / OMITTED — intended, and genuinely not implemented

Searched by synonym across code, schema, 1,625 commits and 894 documents.
Absent at every layer:

| # | Capability | Evidence of absence |
|---|---|---|
| L1 | **Shifts / rotas / rosters** | no table, no column, no lib. "Roster" everywhere means the list of active `company_workers`. `organization-today.ts:22-24`: *"there is no shift or attendance data"* |
| L2 | **Utilisation / FTE %** | zero hits for `utilis`/`utiliz` in the entire app |
| L3 | **Team roles, team removal, team→project assignment** | 4 team actions exist (create/invite/saveDetails/respondEnquiry); no FK from any project object to a team |
| L4 | **Saved searches / job alerts** | zero hits for `saved_search`/`job_alert`. `worker_saved_opportunities` is a bookmark list, not a query |
| L5 | **Qualification recognition / RPL / equivalence** | zero occurrences platform-wide except prose in one answer-engine content file. No NQF/EQF level, no issuing authority, no foreign-diploma record |
| L6 | **Permit / posting-declaration workflow** | A1 and posting notification exist as *checklist rows pointing at national portals* — no submission, no tracking, no status |
| L7 | **Any calendar / HRIS / ATS / payroll integration** | no route, no lib, no migration |
| L8 | **PDF / XLSX generation** | browser print only; 6 real downloads exist, all CSV/JSON |
| L9 | **Institution reporting** | programmes, cohorts and learner outcomes are applied; there is no reports-hub branch, no page, no export for them |
| L10 | **Booking beyond `accepted`** | no executed/complete/cancel state; an accepted booking is a one-way door |
| L11 | **Capacity reservation of any kind** | nothing decrements anything anywhere; `issue_asset_v1` has no availability check, no lock and a non-unique index |
| L12 | **Organization directory** | `/business/[slug]` exists; there is no index route and no public org list |

---

## 6. HIDDEN — built, applied, and forgotten by recent planning

| # | Capability | Where it is |
|---|---|---|
| H1 | **The whole 2026-08-17/18 Work-OS wave** — agreements + amendments + event ledger, procurement (inquiry→offer→selection→order), business trips with approval, training & certification register, performance reviews with 3 separated information classes, management decisions, workflow engine + template management, org document register with versioned files and version-bound acknowledgements | applied; 0 rows; sections inside `/dashboard/finance`, `/dashboard/commercial`, `/dashboard/documents`, `/dashboard/network` |
| H2 | **Practice / volunteering work history** | RPC widened and live in production; the read model, CV heading and onboarding student step all exist. Only the profile page's *local copy* of the relationship allowlist drops it (§11) |
| H3 | **Education: programmes, cohorts, learner outcomes, internship/apprenticeship opportunity type** | all four migrations applied; institution UI mounted on `/dashboard/company` |
| H4 | **AI is running in production** — 47 runs, Gemini, intent proposal + market explanation, cost ledger populated, one blocked run correctly refused for `cost_unpriced` | `ai_runs`, `usage_cost_events` |
| H5 | **A real, single-projection calendar** with month/week/day/agenda/year, conflict detection, and a guard pinning exactly 7 allowed readers | `/dashboard/planning` |
| H6 | **Requirement ledger** (document/skill/language/availability gaps with real resolutions) — built for 3 contexts, mounted for 1 | `lib/player-card/requirement-ledger.ts` |
| H7 | **Country readiness matrix** — 10 countries × 4 scopes, every row with an official source URL and review date | `lib/country-readiness/*`; no route of its own |
| H8 | **ESCO taxonomy** — 3,039 occupations, 13,939 skills, 1,045,186 labels across 28 locales, live in production | admin typeahead only; 0 of 161 platform skills carry an `esco_uri` |
| H9 | **Experience records** with disputes and right of reply | applied, 2 rows |
| H10 | **Transversal capability skills** (8 slugs) + recogniser + 12 locales | applied |

---

## 7. DUPLICATION MAP

Classified, not merged. §47 forbids destructive refactor during discovery.

| Concept | Representations | Verdict |
|---|---|---|
| Organization | `companies` (write truth) · `agencies` (archived) · `organizations` (read truth, mirrored by trigger, bridged by nullable `legacy_company_id`) | **LEGACY + MIGRATION REQUIRED** — deliberate, bridged, and the bridge is single-valued so a team/agency org resolves to nothing |
| Person↔org membership | `engagement_contexts` (employment) · `company_memberships` (governance) · `company_workers` / `agency_workers` / `company_worker_engagements` (roster) | **LEGITIMATELY DIFFERENT ×2, LEGACY ×3** — the first two are deliberately separate; the roster trio is legacy |
| Org role / capability | `organizations.organization_type` (closed CHECK) · `organization_roles` (open registry) · `companies.company_type` · `profile_roles.role` | **SAME CONCEPT, 4 vocabularies** — and `companies.company_type === 'staffing_agency'` still hard-gates 7 agency features, bypassing the capability model entirely |
| Authority helper | `manages_organization` · `belongs_to_organization` · `is_active_org_member` · `has_org_demand_access` · `owns_company` · `is_org_member_or_engaged_v1` · `membership_actor_role_v1` | **SAME QUESTION, 7 answers** — measurably divergent: an org **manager** cannot read the company roster, because `company_workers` RLS uses `owns_company`, which excludes managers |
| Hours | `journal_entry_metrics` (canonical) · `work_hour_allocations` · `timesheets.lines_snapshot` · `journal_entry_work_items` (dead) | **RECONCILED 2026-08-31**, but only inside one SQL function; no TypeScript reader performs the union |
| Task | `work_tasks` (canonical) · `follow_up_tasks` (parallel, admin-only) · `journal_entry_tasks` (link) · decision→task join | **DUPLICATE ×1** (`follow_up_tasks`) |
| Where I want to work | `workers.preferred_countries` · `preferred_locations` table | **DUPLICATE** — read side-by-side in `worker-subject.ts` |
| Skill in my own words | `profile_skill_claims` · `skill_candidate_clarifications` · `candidate_skills` (frozen, 0 rows) | **2 live + 1 dead** |
| Offer | `proposals` · `procurement_offers` · `agency_candidate_offers` · `booking_requests` | **RELATED, not same** — four different counterparties |
| Commercial agreement | `contracts` (legacy, owner-scoped) · `agreements` (canonical, org-scoped) | **LEGACY** — both render on the same page |
| Agency's client | `agency_clients` (unapplied draft) · `agency_client_connections` (applied, real) | **DUPLICATE** — one is dark |
| Inbox | `/dashboard/inbox` (journal confirmations) · `/dashboard/communication` (messages) | **NAMING COLLISION** — and `company.contact-worker`, a messaging act, routes to `/dashboard/inbox` |
| Physical equipment | `assets` (owned) · `marketplace_listings` (traded) | **RELATED, no bridge** — identical category vocabulary |
| Demand | `customer_requests` (canonical) · `company_need_public_intakes` (anon) · `job_demands` (dead) · `public_vacancies` (external) | **1 canonical + 1 deliberate + 1 dead + 1 different kind** |

---

## 8. DISCONNECTED SYSTEMS — the load-bearing list

1. **Booking ⇸ availability ⇸ capacity ⇸ calendar.** An accepted booking and an
   approved absence both appear on the calendar and neither is an input to
   `assessCapacity`. Nothing anywhere reserves or decrements capacity.
2. **Calendar ⇸ 10 dated stores.** `PLANNING_SOURCE_TYPES` is a hard-coded
   8-item list; each addition is one reader.
3. **Teams ⇸ everything.** `team_details` never reaches the capacity engine or
   the calendar; brigades enter `capacity-model` as bare id lists.
4. **Employer calendar.** The projection, the grid builders and the conflict
   engine all exist; `/dashboard/company/planning` simply never calls
   `getPlanning()`.
5. **Marketplace ⇸ navigation.** The loop works; the dashboard grid that was to
   surface it has no renderer.
6. **Work Journal ⇸ project.** No approval of any kind reaches the project row;
   three unrelated approval engines exist (journal confirmations, workflow
   instances, absence review).
7. **Evidence ⇸ Living CV, for organization-supplied evidence.** Being built
   now — see §12.
8. **Intelligence ⇸ operations.** 76 real observations feed reports; exactly one
   path (the market drilldown) reaches a staffing action.
9. **Chat ⇸ half the product.** Reports, search, calendar, documents-listing,
   finance, projects-listing and messaging have no conversation action at all.
10. **Organization surfaces ⇸ primary navigation.** Zero org routes are in the
    nav; they are reached through chat chips, the command palette, the market
    map or the login redirect. The feature catalogue still classifies
    `company_workspace`, `agency_workspace` and `customer_workspace` as
    `preparing` with no route, while `/dashboard/company` is a live 1,618-line
    surface.

---

## 9. P0 BLOCKERS — what stops a real person or organization today

| # | Blocker | Class | Owner action? |
|---|---|---|---|
| P0-1 | **Self-confirmation is not distinguished from independent confirmation.** 3 rows on production. Verified work is the platform's trust currency | correctness / trust | **read-side fix needs none** (§11); RPC-side block needs an owner decision |
| P0-2 | **Supply renders as demand on the market map.** `lib/market-map/world-read.ts:214-239` applies the kind filter only when the viewer has no employer workspace, then maps every row `actionable: true` | correctness | none — code fix |
| P0-3 | **Nine repo migrations were never applied**, four of them behind live UI showing "not enabled yet" | delivery | owner apply, or an explicit decision to retire them |
| P0-4 | **Stale in-code apply-status comments** send every reader to the wrong conclusion (§0). The ledger's own banner is correct; the comments in `.ts` files are not, and those are what a reader opens | process | none — comment fix |
| P0-5 | **Capacity ignores approved leave and accepted bookings** — the planning page contradicts itself | correctness | none — code fix, but scope decision on which commitments count |
| P0-6 | **Two live CI gates are inert** pending one secret: `SUPABASE_DB_URL` arms both the anon-SECDEF catalogue gate and migration parity | safety | **owner: add one read-only secret** |
| P0-7 | **89 of 94 Playwright specs never run in CI** (5 specs, 27 tests) — selector rot is invisible | quality | none, but needs a decision on auth fixtures |
| P0-8 | Auth: OTP expiry > 1 h; leaked-password protection off | security | **owner: two Supabase dashboard toggles** |

---

## 10. MATRICES

### 10.1 Human production-proof matrix

| Actor | Journey | State |
|---|---|---|
| WORKER | register → journal → evidence → CV | **PRODUCTION_HUMAN_PROVEN** — 40 entries, 56 people |
| WORKER | learns who can confirm their work | CODE + TEST proven; **never walked** |
| WORKER | board shows demand only | PRODUCTION_DATA_PROVEN (7 rows / 0 supply); **never walked** |
| MANAGER/VERIFIER | receive → act → worker sees status | **PRODUCTION_HUMAN_PROVEN** — 13 confirmations incl. 2 returns |
| EMPLOYER | need → match → shortlist → contact | PRODUCTION_DATA_PROVEN; e2e-proven; **not walked this window** |
| AGENCY | client → offer → candidate → booking | PARTIAL — bridge live, 2 connections, 2 offers, no supply inventory |
| INSTITUTION | declare → programme → cohort → learner | PRODUCTION_DATA_PROVEN (1/1); learner ACCEPT needs a 2nd identity |
| BUYER | browse services → request | PARTIAL — absent from onboarding |
| PROJECT MANAGER | project → task → timesheet | IMPLEMENTED_NOT_PROVEN — 0 task rows |
| AI/AGENT | read + journal write + interest + demand | CODE + CONTRACT proven; **no MCP e2e spec exists** |

### 10.2 AI / agent access matrix

Union of 12 MCP capabilities and 52 conversation actions.

| Domain | MCP | Conversation |
|---|---|---|
| Profile / Living CV | READ | WRITE (reversible) |
| Work Journal | READ + PREVIEW→CONFIRM | CONFIRMATION_REQUIRED |
| Interest in demand | PREVIEW→CONFIRM | CONFIRMATION_REQUIRED |
| Work card / preferences | PREVIEW→CONFIRM | WRITE (reversible) |
| Demand creation | PREVIEW→CONFIRM | CONFIRMATION_REQUIRED |
| Workspace switch | WRITE | — |
| Projects / tasks / readiness | **NOT_EXPOSED** | CONFIRMATION_REQUIRED / WRITE |
| Bookings / assignment / engagement end | **NOT_EXPOSED** | CONFIRMATION_REQUIRED (strong) |
| Education programmes / cohorts / learners | **NOT_EXPOSED** | CONFIRMATION_REQUIRED |
| Documents (add) | **NOT_EXPOSED** | WRITE |
| Teams, calendar, absences, hours, timesheets, finance, reports, search, messaging | **NOT_EXPOSED** | **NO ACTION AT ALL** |

Two structural notes: the `exposed:false` honest gate is currently
load-bearing for nothing (all 12 capabilities are exposed); and 48 of 52
conversation actions carry `stateFingerprint = "n/a"`, so their confirmation
tokens are time-bounded but not single-use — the MCP layer binds state
properly for all four of its write pairs, the dispatcher binds it for four
actions only.

---

## 11. SAFE FIXES EXECUTED FROM THIS EVIDENCE

Per §48 — connect / fix / finish before rebuild — and §47's ban on destructive
refactor during discovery. Each is small, additive, and follows directly from a
measured finding.

1. **Production ledger snapshot refreshed** (234 rows @ 2026-08-23 → **266 rows
   @ 2026-09-07**), so `pnpm check:migration-parity` in snapshot mode is
   measuring reality again. *(reconciliation-critical; §47 permits it)*
2. **Self-confirmation is classified, not deleted** — a self-confirmed journal
   entry stops reading as employer-confirmed. Pure derivation, no migration, no
   evidence removed, and it preserves the owner's "classify, don't delete"
   instruction while the RED authorization decision stays open.
3. **The profile page's local relationship allowlist is replaced by the
   canonical one**, so a study placement or volunteering that the production
   RPC already accepts finally appears on the person's own profile. One import;
   the capability was applied on 2026-08-27 and has been invisible since.
4. **The market map stops serving agency supply as actionable demand** — the
   employer-workspace leg gains the same canonical `DEMAND_KIND_OR_FILTER` the
   two board RPCs got in #1588/#1596.

Everything else found here is recorded in the register and **not** acted on in
this window.

---

## 12. THE RUNNING P0 IS PRESERVED

The organization historical evidence import (owner P0, 2026-09-07, with the
ORGANIZATION-root correction applied the same day) is unaffected by this
reconciliation and is recorded in the register as `EVID-1`.

Its schema is written and **RED for merge**: new tables need `GRANT`, and this
project has no default privileges for `authenticated` (verified against three
existing tables). It therefore needs an owner gate before production apply.
Nothing has been applied.

**The migration deliberately carries no `-- @human-gate-approved` marker**, so
`migration-safety` reports exactly one honest blocking finding
(`grant-or-revoke`) and refuses auto-merge. An earlier draft of this file did
carry the marker with a header explaining that approval was still being sought
— which is a contradiction: the marker means *an owner approved this*, and
every other file bearing it names the decision that granted it. A repository
guard (`booking-engagement-end-v1.test.ts`, "this branch's own migration is the
ONLY newly marked one") caught it. The gate is left RED, because RED is the
truth.

What the reconciliation *changed* about it: the correction to
ORGANIZATION-as-root arrived before any migration was applied, so there is no
migration to undo — the company-scoped draft was replaced in place.

---

## 13. OWNER DECISIONS — only what cannot be resolved from evidence

1. **Self-confirmation, authorization side.** Block it in
   `review_journal_entry`, or permit it and rely on the weaker classification
   now shipping? A sole trader legitimately has nobody above them. *(RED,
   `SECURITY DEFINER` body change.)*
2. **The nine unapplied migrations.** Apply the four with live UI behind them
   (agency clients, journal templates, external profiles, opportunity-seen), or
   retire them and delete the honest-gate branches? Eight weeks of a dark
   capability is itself a decision.
3. **`SUPABASE_DB_URL`** — one read-only secret arms two live CI gates that are
   currently inert.
4. **Two Supabase Auth settings** — OTP expiry ≤ 1 h, leaked-password
   protection on.
5. **`companies.company_type === 'staffing_agency'`** still hard-gates the
   agency surfaces, bypassing `organization_roles`. Migrate the gate to the
   capability model, or keep the industry lock deliberately?
6. **E2E in CI** — 89 specs need an authenticated fixture strategy before they
   can run. Build it, or accept that the suite is a local-only tool?
7. **Organization surfaces and the primary nav.** Chat-first is the recorded
   architecture; the feature catalogue nonetheless calls the org workspaces
   `preparing` while they ship. Correct the catalogue, or add the routes to the
   nav?

---

## 14. EXECUTION ORDER

**NOW** — correctness and truth, no owner action required.
Finish the P0 evidence import · correct every stale apply-status comment ·
add the inverse parity check (repo → production) · close the remaining six
supply-as-demand leaks · make capacity read absences and accepted bookings.

**NEXT** — connect what already exists, cheapest first.
Employer calendar (call `getPlanning()`) · add trips/training/timesheets/hours
to `PLANNING_SOURCE_TYPES` · render `experience_responses` · reachability for
marketplace and `/dashboard/learning` · MCP capabilities for the domains a
company actually operates (projects, bookings, documents, reports) · team
member removal and team roles.

**LATER** — new capability, in dependency order.
One availability engine · capacity reservation on booking · booking beyond
`accepted` · shifts/rosters · saved searches and alerts · qualification
recognition / RPL · institution reporting · a second vacancy source country.

---

## 15. REQUIRED FLAGS

```
FULL_REPO_SEARCHED:            YES — 8 parallel source sweeps + manual route/nav/CI/migration analysis
GIT_HISTORY_RECONCILED:        YES — unshallowed to 1,625 commits (2026-05-19 → 2026-09-06), 1,595 PRs
DATABASE_RECONCILED:           YES — live reads: 190 tables, RLS+policy catalogue, 266-row ledger, row counts, 392 advisors
PRODUCTION_RECONCILED:         YES (data + schema) · NO (browser walk — none performed this window)
DOCS_RECONCILED:               PARTIAL — 894 docs; APPLIED_LEDGER + CAPABILITY_INVENTORY reconciled, the rest indexed only
CANONICAL_MASTER_REGISTER:     YES — docs/CAPABILITY_INVENTORY.md §6 (extended, not duplicated)

PERSON:                        PRODUCTION_HUMAN_PROVEN
ORGANIZATION:                  PRODUCTION_DATA_PROVEN — 17 orgs, 19 memberships, multi-capability live
WORKFORCE_OS:                  PARTIAL — roster/engagement live; 4 parallel roster truths
TEAMS_BRIGADES:                PARTIAL — create+invite only; no removal, no roles, no assignment
CALENDAR:                      IMPLEMENTED_NOT_PROVEN — real, single-projection, 8 of 18 sources
SCHEDULING:                    PARTIAL — dates yes, scheduling no
SHIFTS_ROSTERS:                MISSING_REQUIRED
AVAILABILITY:                  DUPLICATED — 4 vocabularies, none derived from another
CAPACITY:                      BROKEN — ignores approved leave and accepted bookings
MARKETPLACE:                   DISCONNECTED — loop complete, reachability ~zero, 0 listings
BOOKING:                       PARTIAL — request→accept→engagement excellent; nothing past accepted; 1 row
PROJECTS_OBJECTS:              IMPLEMENTED_NOT_PROVEN — 9 projects, 1 object, 0 tasks
WORK_JOURNAL:                  PRODUCTION_HUMAN_PROVEN — 40 entries, 13 confirmations, 4 transports
HISTORICAL_EVIDENCE:           IN PROGRESS — schema + pure core written, RED, not applied (EVID-1)
LIVING_CV:                     PRODUCTION_HUMAN_PROVEN — incl. PDF/DOCX import and EU format
LIVING_EVIDENCE_GRAPH:         PARTIAL — journal→skill→CV live; organization-supplied evidence being built
SKILLS_COMPETENCIES:           PRODUCTION_HUMAN_PROVEN — 161 skills, 48 links, 3-tier ladder
QUALIFICATIONS_RPL:            MISSING_REQUIRED — certificates/validity yes; recognition/equivalence nowhere
EDUCATION:                     PRODUCTION_DATA_PROVEN (thin) — 1 programme, 1 cohort, 0 members
JOBS_OPPORTUNITIES:            PRODUCTION_DATA_PROVEN — 77k external + 20 native
DEMAND_SUPPLY:                 PARTIAL — 2 boards fixed; 7 surfaces still leak supply as demand
MATCHING:                      DUPLICATED — canonical (20 criteria) + worker-facing + one frozen fork on /match-preview
CHAT:                          PRODUCTION_DATA_PROVEN — 5 conversations, 18 messages; no org participant type
NOTIFICATIONS:                 PARTIAL — 20 types all emitted; email inert (provider unset); 1 cron
MAP_GEOGRAPHY:                 PARTIAL — owner-scoped only; no cross-user aggregate by design
MOBILITY:                      PARTIAL — 10-country matrix in code; no permit/posting workflow
DOCUMENTS:                     IMPLEMENTED_NOT_PROVEN — versioned files, one download door, 1 row
REPUTATION_TRUST:              PARTIAL — evidence-based, no stars (guard-enforced); right of reply write-only
PAYMENTS_COMMERCIAL:           DEFERRED_BY_DESIGN — test mode, two independent owner acts to arm
ASSETS_RESOURCES:              IMPLEMENTED_NOT_PROVEN — 0 rows; issue has no availability guard
TRANSPORT_ACCOMMODATION:       PARTIAL — 3 mobility models that never meet
SOCIAL_ACQUISITION:            PARTIAL — telemetry mature; no OG images; belongs partly to Agentai OS
EXTERNAL_DATA:                 PARTIAL — 1 provider, 1 country, NO SCHEDULER (manual/admin run only)
LABOUR_MARKET_INTELLIGENCE:    PARTIAL — 76 observations; exactly one path into an operational action
AI_AGENT_LAYER:                PARTIAL — 12 MCP capabilities, 38 chat writes, 47 real runs; most domains unexposed
WORKSPACES_PERMISSIONS:        PARTIAL — dual pointer works; 7 divergent authority helpers
LOCALIZATION:                  PARTIAL — 5 active locales at full parity; 6 inactive carry ~2,500 [EN] each, 5 untracked
SEARCH_DISCOVERY:              DUPLICATED — 4 incompatible "type words, get results" stacks; no people search
REPORTING_ANALYTICS:           PARTIAL — 6 real downloads, all CSV/JSON; no institution reporting
INTEGRATIONS:                  PARTIAL — auth, storage, Stripe(test), email(inert), MCP, DeepL, 1 vacancy source
SECURITY_RLS:                  STRONG — RLS on all 190 tables, no cross-tenant leak found; 2 real advisor items + 2 owner settings
DUPLICATION_MAP:               YES — §7, 14 concepts classified
ORPHAN_IMPLEMENTATION:         YES — 1 orphan route, ~13 dead components, ~40 zero-row tables, 9 unapplied migrations
LOST_REQUIREMENTS:             YES — §5, 12 items
HIDDEN_EXISTING_FEATURES:      YES — §6, 10 items
P0_E2E_CHAINS:                 A ✅ · B ◐ · C ◐ · D ✗(reachability) · E in progress · F ◐ · G ✗
HUMAN_UI_PROVEN:               NO — no browser walk was performed in this window
AI_E2E_PROVEN:                 NO — the MCP contract script exists; no MCP e2e spec, no live run this window
```

---

## 16. THE SUCCESS CONDITION, ANSWERED

1. **What is the complete product?** ARCHITECTURE.md §2-§5 plus the register's
   §6 domain list. Nothing in this reconciliation narrows it.
2. **What exists?** 190 tables, 112 routes, 266 applied migrations.
3. **What works in production?** §4 list one — journal, evidence, skills, CV,
   the receive loop, demand, external vacancies, chat actions, MCP reads and
   writes, booking concurrency, privacy.
4. **What works only at data level?** Projects, documents, education, assets,
   agreements, procurement, trips, training, reviews, decisions, workflows.
5. **What can a real human complete?** The worker evidence loop and the manager
   review loop, end to end. The employer loop up to contact.
6. **What is broken?** Capacity vs absence, supply-as-demand on 7 surfaces,
   self-confirmation classification, `experience_responses`.
7. **What is disconnected?** §8, ten systems.
8. **Planned but lost?** §5, twelve items.
9. **Exists but forgotten?** §6, ten items.
10. **Duplicated?** §7, fourteen concepts.
11. **Fix rather than rebuild?** Everything in §8 — every one is a reader, a
    predicate or a nav entry away, not a rebuild.
12. **What blocks real users today?** §9, eight blockers, three of which need
    only an owner setting.
13. **Shortest route to commercial usability?** §14 NOW + NEXT.
14. **Preserve though not building now?** Shifts, RPL, capacity reservation,
    AI-agent subjects (ARCHITECTURE §5.1), institution reporting, mobility
    workflow, marketplace commerce. All stay in the register; none is deleted.

**The most important sentence in this document:** the product is substantially
larger than any recent summary of it, and the main thing standing between built
and used is not engineering — it is that the code keeps telling its own readers
that finished work is unfinished. The ledger was corrected on 2026-08-19; the
file headers were not, and a correction a reader never opens is not a
correction.
