# LabourMarket.ai — Master Audit

**Date:** 2026-09-01
**Audited baseline:** `main = c46fc642 = production`
**Mode:** read-only reconstruction — no deletions, closures, schema changes or implementation were made to produce this document.

> Reconstructed from the repository, the production database, the migration
> ledger, CI and runtime evidence — **not** from the previous session's todo
> list. Where a previous report and current evidence disagreed, current
> evidence won and the disagreement is recorded.

Published companion (same content, navigable):
<https://claude.ai/code/artifact/d1ad1011-b7bf-4212-9433-118f1821c2c6>

**Status vocabulary used throughout:** `PROVEN` · `PARTIAL` · `DORMANT` ·
`MISSING` · `OWNER_GATED` · `EXTERNAL_GATED` · `FUTURE_ARCHITECTURE`.

---

## A. Executive product state

The honest one-line answer: **the evidence half of the flywheel is alive in
production; the work-execution half has never run.**

| Metric | Value |
|---|---|
| Real auth users | 36 |
| Tables (all RLS-on) | 190 |
| Tables with data | 82 |
| Tables empty | 108 |
| Workflow instances | 0 |
| Hour allocations | 0 |

LabourMarket.ai today is a **working evidence-and-identity engine with a very
large, correctly-built, entirely unused operations layer behind it.** The parts
carrying real production data are: identity and auth (36 users, 33 confirmed,
last sign-in 2026-08-31), the work journal (37 entries, 116 productivity
metrics, 8 photos), the evidence→skill chain (46 entry-skill links, 48 worker
skills), employer demand (17 customer requests across draft/submitted/closed),
worker interest (5 signals), the ESCO corpus (1,034,730 labels) and a 70,331-row
public vacancy corpus.

Downstream of interest, production is empty. There are **no bookings, no
engagements from bookings, no work objects, no tasks, no absences, no hour
allocations, and not one workflow instance** — despite 16 workflow definitions
being seeded across eight workflow types. The single timesheet in production is
a `draft`. All six projects are `draft`. All three agency tables are empty. No
document file has ever been stored in the three document buckets.

### The distinction that matters for planning

This is not "broken". Almost all of it is built, wired and reachable — **79 of
the 108 empty tables are referenced by application code**. What is missing is
not implementation so much as **a closed operational loop that carries a real
person from interest through to approved, paid work**. That is the gap between
the product that exists and the product intended.

### Re-derived release state

```
CUSTOMER_SAFE_RELEASE    = YES
PUBLIC_ACQUISITION_READY = PARTIAL
FULL_PRODUCT_COMPLETE    = NO
```

- **Customer-safe = YES** — every table has RLS, four narrowing security
  migrations were applied and verified on 2026-09-01, negative controls pass,
  no unauthenticated data exposure was found, and every surface checked
  degrades honestly rather than faking data.
- **Acquisition-ready = PARTIAL** — 5 of 26 languages routed, Google-only
  social auth, no email delivery configured, and a market map that is real but
  shallow (country-level signals only).
- **Complete = NO** — agency, marketplace, project execution, hours and
  timesheet approval have no closed loop in production, and several have no E2E
  coverage at all.

---

## B. Repository & production state

```
CURRENT_MAIN_SHA  = c46fc642   (HEAD == origin/main, tree clean)
CURRENT_PROD_SHA  = c46fc642   (Vercel auto-deploy from main)
DEPLOYMENT        = LIVE — landing, /lt/jobs, /en/labour-market,
                    /sitemap.xml, /lt/auth/login all 200
BRANCH            = main · 0 uncommitted · 0 untracked · 0 unpushed
BRANCHES          = 740 local / 212 remote
WORKTREES         = 59 (58 + primary)
MIGRATIONS        = 253 files / 184 rollbacks / 251 ledger rows
CI                = Quality GREEN · Mobile GREEN · CodeQL GREEN ·
                    sweden-supply-cadence GREEN
                    iOS GREEN at 42d4c79a (paths-filtered; no mobile change since)
REQUIRED CHECKS   = quality, migration-safety
OPEN PRs          = 12 (11 draft, 1 ready) — all owner-gated or owner-decision
```

Two reconciliation observations, neither resolved in this read-only pass:
**253 migration files against 251 ledger rows** (repo filenames deliberately do
not match ledger versions, so a name-based diff is unreliable —
`docs/APPLIED_LEDGER.md` is the reconciliation record), and **69 migrations have
no paired rollback**, mostly the early sequential `000N` set that predates the
reversibility rule.

---

## C. Capability inventory

Every capability below was checked against production data, not code presence
alone. *Canonical source* is the table or RPC that actually holds the truth.

| Capability | Canonical source | Prod rows | Web | Chat | MCP | Mobile | E2E | Status |
|---|---|---:|---|---|---|---|---|---|
| Auth & identity | `auth.users`, `profiles` | 36 | ✓ | — | ✓ | ✓ | 13 pass | PROVEN |
| Work journal | `journal_entries` | 37 | ✓ | ✓ | ✓ | ✓ | pass | PROVEN |
| Evidence → skill | `journal_entry_skills` → `worker_skills` | 46 → 48 | ✓ | ✓ | ✓ | — | pass | PROVEN |
| Living CV / EU export | `workers`, `worker_*` | 36 | ✓ | ✓ | ✓ | partial | 3 pass | PROVEN |
| Employer demand | `customer_requests` | 17 | ✓ | ✓ | ✓ | — | mixed | PARTIAL |
| Matching & opportunities | RPC over `worker_skills` | n/a | ✓ | ✓ | — | — | indirect | PARTIAL |
| Interest signal | `demand_interest_signals` | 5 | ✓ | ✓ | ✓ | — | pass | PROVEN |
| Booking | `booking_requests` | 0 | ✓ | ✓ | — | — | none | DORMANT |
| Projects | `projects` | 6 (all draft) | ✓ | ✓ | — | — | gated | PARTIAL |
| Work objects / tasks | `work_objects`, `work_tasks` | 0 | ✓ | — | — | — | none | DORMANT |
| Hours & allocations | `work_hour_allocations` | 0 | ✓ | ✓ | — | — | none | DORMANT |
| Timesheets | `timesheets` | 1 draft | ✓ | ✓ | — | — | none | PARTIAL |
| Approval workflow | `workflow_instances` | 0 | ✓ | — | — | — | none | DORMANT |
| Agency bridge | `agency_client_connections` | 0 | ✓ | ✓ | — | — | **none** | DORMANT |
| Education loop | `organization_roles`, `engagement_contexts` | 14 / 53 | ✓ | — | — | — | 6/6 pass | PROVEN |
| Marketplace / services | `service_offerings` | 2 | ✓ | ✓ | — | — | **none** | PARTIAL |
| Document ingestion | `worker_documents`, `document_files` | 0 / 0 | ✓ | ✓ | — | — | 1 pass 1 fail | PARTIAL |
| Notifications (in-app) | `notification_events` | 2 | ✓ | ✓ | — | — | none | PARTIAL |
| Notifications (email) | email-dispatch adapter | 0 | — | — | — | — | none | EXTERNAL_GATED |
| Market intelligence | `market_intelligence_observations` | 76 | ✓ | ✓ | — | — | 2 specs | PARTIAL |
| LMC ledger | `lmc_accounts` / `lmc_lots` | 0 | ✓ | ✓ | — | — | 1 spec | DORMANT |
| Billing / payments | `billing_subscriptions` | 0 | ✓ | — | — | — | unit | OWNER_GATED |
| ChatGPT / MCP | `/api/mcp` + OAuth 2.1 | n/a | ✓ | — | ✓ | — | none | PARTIAL |

---

## D. Actor-by-actor product map

Where each actor's journey stops. The pattern is consistent: every actor reaches
the point of expressing intent, and none reaches executed, approved work.

| Actor | Journey reaches | Breaks at | Status |
|---|---|---|---|
| **Worker / person** | auth → profile → Living CV → journal → evidence → skills → opportunities → interest | booking & engagement (0 rows); hours; timesheet | PARTIAL |
| **Employer** | company → verification → workspace → demand → matching → shortlist → contact | booking, assignment, hours visibility, approval — all dormant | PARTIAL |
| **Agency** | schema, RPCs, RLS, revocation all built and hardened | never exercised: 0 rows, **0 E2E specs** | DORMANT |
| **Student / learner** | invited → linked → learning → practice → evidence → capabilities | onward matching to internship/job unproven | PROVEN |
| **Institution** | declares capability → invites learner → learner keeps employment | no programme/course entity; no feedback loop from market | PARTIAL |
| **Project manager** | project create (draft) | all 6 projects draft; no stages, members, budgets; proof suite needs a dedicated stack | PARTIAL |
| **Team / brigade** | team tables + enquiry model exist | `team_details`, `team_enquiries` both empty | DORMANT |
| **Service provider** | 2 offerings, 1 request | no delivery, no reputation, no E2E | PARTIAL |
| **Service customer** | request loop + dashboard next-action | no commercial state, no completion | PARTIAL |
| **AI actor** | actor type declared; 5 wired agents; 7 `ai_runs` | no AI participation in team/project/journal/time/cost | FUTURE_ARCHITECTURE |
| **Platform admin** | admin panels, verification, evidence, drafts, LMC grant | founder admin-grant path still broken (#1045) | PARTIAL |

---

## E. Data & domain architecture

190 tables, 438 functions (400 SECURITY DEFINER), 337 policies, 86 triggers,
3 views, 5 storage buckets. **Every table has RLS enabled — zero exceptions.**

### The 108 empty tables, classified

- **79 are referenced by application code** — built, wired, reachable, simply
  never used in production. These are dormant capability, not dead code, and
  they are the single largest asset in the system: agreements, contracts,
  onboarding/offboarding runs, performance reviews, training programmes,
  procurement, assets, business trips, defects, finance records, org documents,
  project stages and budgets, workflow instances, absences, work objects and
  tasks.
- **29 have no `.from()` reference** and are written by RPC or trigger instead —
  the `*_events` audit tables, the LMC ledger (`lmc_accounts`, `lmc_lots`,
  `lmc_transactions`), the agency offer tables, and the ESCO-adjacent
  aggregates.

### Two duplication signals worth an owner decision

`subscriptions` and `billing_subscriptions` both exist and are both empty — only
the latter is code-referenced. Separately, `matches` / `match_actions` /
`candidate_skills` exist with no code reference and no rows, while live matching
runs through RPCs over `worker_skills`. Neither is proof of duplication; both
are **UNKNOWN → preserve** until someone traces their origin migration.

---

## F. Chat-first coverage

The chat layer is genuinely substantial and genuinely declarative — **41 routed
intents across 15 domains, 34 write actions, 12 MCP capabilities**, all
enumerable and type-checked in both directions.

Write actions break down as worker 17, company 11, agency 5, engagement 1.
Intent domains skew to matching (7), time (6) and profile (5).

### Chat gaps against the vision

- **Education has no chat vocabulary at all** — no institution, programme,
  learner or cohort intent, even though the education loop is the best-proven
  journey in the product.
- **Agency has write actions but no routed intents** — the five agency actions
  exist in the action registry and cannot be reached by a sentence.
- **No approval intent** — timesheets and hours are reachable; submitting,
  reviewing and approving them are not.
- **Marketplace is one intent** (`need-service`) with no offering, delivery or
  provider vocabulary.

---

## G. Client parity

Mobile is a worker-journal slice, not a second full client — and it is honest
about it.

| Surface | Web | Chat | MCP | Android | iOS |
|---|---|---|---|---|---|
| Auth / register | ✓ | — | ✓ | ✓ | ✓ |
| Journal read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Journal write | ✓ | ✓ | ✓ | ✓ | ✓ |
| Profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| Living CV | ✓ | ✓ | ✓ | — | — |
| Opportunities / matching | ✓ | ✓ | — | — | — |
| Demand / employer | ✓ | ✓ | ✓ | — | — |
| Projects / hours / timesheets | ✓ | ✓ | — | — | — |
| Notifications | ✓ | ✓ | — | — | — |
| Documents | ✓ | ✓ | — | — | — |
| Chat workspace | ✓ | ✓ | — | — | — |

Mobile has 11 screens and calls exactly four MCP capabilities —
`journal.create_draft`, `journal.confirm`, `journal.list`, `profile.get`.
Crucially it reaches them through the *same canonical capability layer* the MCP
client uses, so there is **no duplicated business logic**. Parity is a coverage
gap, not an architecture gap. Both Android and iOS CI are green, but a green
build is not runtime parity.

---

## H. Security & privacy

The strongest area of the product, and materially stronger than it was at the
start of 2026-09-01.

```
190 / 190 tables with RLS enabled   — zero exceptions
400 SECURITY DEFINER functions      — 8 anon-executable, all intentional public surfaces
5 / 5 storage buckets private       — none public
schema public CREATE                — revoked from PUBLIC; USAGE preserved
```

Four narrowing migrations were applied and verified in production on
2026-09-01: agency disclosure revocation, volunteer/viewer/unemployed
visibility, the schema-CREATE revoke, and the Eurostat allowlist widening.
Negative controls (authenticated and anon CREATE both denied) and positive
controls (anon RPC, public pages) both pass, with zero probe residue.

### Three advisor findings that must NOT be "fixed"

1. The `worker_absence_scheduling` SECURITY DEFINER view is **load-bearing**.
   Base-table RLS gives managers only `status='requested'`; the view
   deliberately serves `approved` rows for scheduling. Switching it to
   `security_invoker` returns zero rows to managers and silently breaks absence
   scheduling. Its own migration evaluates and rejects that change by name.
2. The 8 anon-executable SECDEF functions are the intended public surfaces
   (vacancy preview/search/sitemap/count, business profile/listings/services,
   public need intake), governed by an existing allowlist and guard.
3. The 3 `rls_enabled_no_policy` tables are deliberately sealed.
   `company_need_public_intakes` holds 2 real employer leads and is reachable by
   the operator through the admin surface and CRM pipeline — deny-all RLS is the
   design.

---

## I. Document ingestion

The most over-claimed area in the system. Parsing exists; the pipeline does not
close.

Required pattern is
`FILE → CLASSIFY → PARSE → RESOLVE → PREVIEW → CORRECT → CONFIRM → CANONICAL WRITE → PROVENANCE → EXPORT`.
Measured against production:

- `worker_documents` — **0 rows**. `document_files` — **0 rows**.
  `journal_entry_extractions` — **0 rows**.
- The `document-files`, `customer-request-attachments` and
  `conversation-attachments` buckets hold **zero objects**. Only journal photos
  (8) and avatars (7) exist.
- XLSX timesheet ingestion (#1394) and document→journal review (#1396) are
  merged, but there is **no E2E spec for either**, and no production artefact.
- The owner's split-allocation requirement (8 h Object 01 + 2 h Object 05 →
  10 h, two allocation lines) **cannot be satisfied today** because
  `work_hour_allocations` has 0 rows and `work_objects` has 0 rows.
- Original-format export is not evidenced anywhere.

**Verdict: IMPLEMENTED_UNPROVEN.** Parsing alone is not completion.

---

## J. Market intelligence

Real data, honestly sourced, shallow depth.

The `/labour-market` surface is genuinely source-backed: EURES/ELA, Cedefop and
Eurostat cards each carry a source link, a figure date and a last-checked date
(2026-06-13). Six countries are live (LT, LV, EE, PL, DE, NL) with working
drill-down; ten are labelled **COMING SOON** rather than faked. 76 observations
exist; 7 sources are registered.

Against the intended target —
`COUNTRY → REGION → MARKET → DEMAND → SUPPLY → OPPORTUNITY → RESULTS` — the
product delivers only the first level. There is no region tier, no
demand/supply figures drawn from the platform's own data, and no drill-down into
actual opportunities. The Eurostat allowlist was widened to 9 keys on
2026-09-01 but **zero observations have been imported against them**: the
permission exists, the importer has not run.

**PARTIAL** — an honest preview label is not a completed market map.

---

## K. Commercial

Prepared to exactly the boundary the owner set, and no further.

Payments are OFF (`PAYMENTS_ENABLED=false`, guard-asserted). No Stripe object is
ever created; refund and dispute events are record-only and cause no
subscription transition. The LMC compensation caller shipped 2026-09-01,
closing the irreversible-spend gap — but `lmc_accounts`, `lmc_lots`,
`lmc_transactions` and `billing_subscriptions` are all **empty**: no credit has
ever been issued, no subscription ever created.

The owner's §19 ruling — one canonical commercial domain model plus scoped
presentation views — is **not yet implemented**. Main still carries the
three-registry model (`plans.ts`, `prices.ts`, `lmc-flags.ts`);
`lib/commercial/catalogue.ts` does not exist. The sustainability gate from #896
(*priced feature without an economic model = CI RED*) **is not running** — it
never landed.

---

## L. Education

The best-proven loop in the product — and the one with the least chat and mobile
reach.

Six of six education specs pass on a quiet machine, including a real negative
control: *an organization that never declared education cannot name a learner*.
The institution declares education *and* employment; the learner is linked as a
student and **keeps their employment**; and three student variants (trade,
transversal, student project) each travel entry → evidence → capabilities.
`organization_roles` carries the `training_provider` capability in production.

What is missing is the rest of the loop: there is **no programme or course
entity**, `training_programs` and `training_assignments` are empty, credentials
have no issuer/expiry/validity records in production, and there is no feedback
path from labour-market demand back to education. Education is a real product
loop at its start and infrastructure-only at its end.

---

## M. Agency

Correctly designed, freshly hardened, and completely unexercised.

The doctrine — **confidentiality without captivity** — is honoured in the
schema: there is no `worker_owned_by_agency` or equivalent captivity anywhere.
#1395 closed the real defect: a client whose connection is severed no longer
retains the agency's candidate identities. Revocation now cascades offers to
`withdrawn`, both list RPCs require an active connection and share, and the RLS
client arm requires a live connection. All verified in production.

**But the entire agency model has never run.**
`agency_client_connections`, `agency_candidate_offers`,
`agency_client_request_shares`, `agency_workers`, `agency_worker_invitations` —
**all zero rows**. And there are **zero agency E2E specs**. Consent, scoped
representation, anonymised opportunity and controlled disclosure exist as
design, not as verified behaviour. This is an implementation and verification
gap, **not an owner gate**.

---

## N. AI actors

Correctly modelled, minimally used.

The entity model already declares `ai_agent` as an actor type distinct from
humans — so the right foundation exists and no fake human role is needed. Five
agents are wired and 7 `ai_runs` rows exist, with a retention sweep that redacts
`output_excerpt` after the retention window. Cost accounting exists
(`usage_cost_events`, 7 rows).

Everything beyond telemetry is future architecture: AI participation in a
company, team, project or task; AI entries in the work journal; AI time and cost
attributed alongside human contribution; AI output as evidence; hybrid
human/AI/machine work records. None of that exists today.
**FUTURE_ARCHITECTURE.**

---

## O. Language matrix

Honest by construction — the architecture actively prevents a false language
claim.

| Tier | Count | Languages | What it actually means |
|---|---:|---|---|
| UI active (routed) | 5 | `lt, en, ru, nl, de` | Routed, prerendered, selectable, parity-enforced |
| UI catalogue | 11 | `+ da, et, lv, no, pl, sv` | The 6 extra are `"[EN] "` shells — deliberately **not** routed |
| Taxonomy + recognition | 12 | `+ fi` | FI is recognition-only by design; no Finnish UI is ever claimed |
| Target | 26 | 24 EU + ru + ka | 21 locales unrouted; Georgian absent entirely |

The six extra catalogues are English shells, and a guard cross-checks every
claim in this table against routing, the files on disk, the locale switcher and
the recognition registry. **This is the model other areas of the product should
copy.**

---

## P. Test, E2E & production-proof matrix

767 guard files, 93 E2E specs, 325 other unit tests. The gap is not volume — it
is *which* journeys have any spec at all.

| Journey | Unit / guard | E2E spec | Runtime result | Production-proven |
|---|---|---|---|---|
| Education | ✓ | 3 specs | **6/6 pass** | partial |
| Worker journal / CV / calendar | ✓ | ~12 specs | pass | ✓ 37 entries |
| Auth | ✓ | 4 specs | 13 pass | ✓ 36 users |
| Employer / demand | ✓ | ~8 specs | 9 pass / **8 fail** | partial |
| Project lifecycle | ✓ | 1 spec (17 tests) | **not runnable** — needs dedicated stack | ✗ |
| Agency | ✓ | **0 specs** | — | ✗ |
| Marketplace / services | partial | **0 specs** | — | ✗ |
| Timesheet & approval | ✓ | **0 specs** | — | ✗ |
| Hours / allocations | ✓ | **0 specs** | — | ✗ |
| Historical XLSX import | ✓ | **0 specs** | — | ✗ |
| Document → journal | ✓ | 1 spec | 1 pass / 1 fail | ✗ 0 files |
| Notifications | ✓ | **0 specs** | — | partial (2 events) |
| ChatGPT / MCP | ✓ | **0 specs** | — | transport proven |
| Mobile app runtime | ✓ | **0 specs** | CI build only | ✗ |

### Two harness facts that distort every reading of this table

- **Browser drift.** Playwright was upgraded without reinstalling browsers;
  every spec failed in under 10 ms until fixed. CI runs zero Playwright specs,
  so this was invisible. *Zero passes across hundreds of specs is never a
  product signal.*
- **One shared identity.** 47 specs read a single `.storage-state.json`.
  Whichever identity is minted decides which specs *can* pass — a real
  multi-actor matrix needs one targeted run per actor, not one big run.
  Separately, machine load alone produced a false "education is broken" verdict
  that a quiet re-run cleared 6/6.

---

## Q. Preservation inventory

Nothing here was deleted, and nothing here should be deleted without the
equivalence proof. **Allowed decisions: KEEP, KEEP_UNTIL_PROVEN, OWNER_REVIEW.
DELETE is not an allowed value.**

| Artifact | Unique value | Replacement on main | Risk if deleted | Decision |
|---|---|---|---|---|
| `feat/cc/ios-native-ci-proof-v1` (16 unpushed commits) | The record of how iOS/Android CI was proven | Content landed: `ios.yml` carries macos-26 + "NOT schemes[0]"; its one unique file `not-connected.tsx` is superseded by `capability-gate.tsx`, which documents itself as the successor | Low — but it is the only narrative of 8 CI iterations | KEEP |
| 58 worktrees | 18 agent worktrees, 32 `-wt`, 5 legacy, 3 other | Most sit on merged branches | Holds `.env.local` (3), `runtime/` audit evidence (10), one branch with 16 unpushed commits | KEEP_UNTIL_PROVEN |
| 740 local / 212 remote branches | Full development history | n/a | Unknown; not audited commit-by-commit | KEEP |
| 108 empty tables | 79 code-reachable dormant capabilities | None — they *are* the capability | **High.** Deleting these deletes the operations layer the product still needs | KEEP |
| `matches` / `match_actions` / `candidate_skills` | Possibly an earlier matching model | Live matching uses RPCs over `worker_skills` | Unknown origin — equivalence unproven | OWNER_REVIEW |
| `subscriptions` vs `billing_subscriptions` | Two subscription models | Only `billing_subscriptions` is code-referenced | Unknown; both empty | OWNER_REVIEW |
| `worker_display_name_backfill_20260805` | 22 rows of backfill history | None | Historical evidence, not recoverable | KEEP_UNTIL_PROVEN |
| #883 assistant transcript | Hash-chained transcript + GDPR export/erase | **None.** `conversations` holds only human scouting threads | Assistant chat stays session-only forever | KEEP |
| #740 `voice_journal_jobs` | Async retention, idempotency, pinned disclosure | Synchronous transcribe action — user capability only, not the guarantees | Loses the retention/idempotency design | KEEP |
| #1166 / #1211 / #1225 | Design R&D, art direction, landing | n/a | Loses visual research | OWNER_REVIEW |
| `runtime/` audit evidence | Proof artefacts from prior sessions | None | Gitignored — **not recoverable from git** | KEEP |

---

## R. Database & migration inventory

| Class | Count | Examples |
|---|---:|---|
| **Active** — carries production data | 82 | `journal_entries`, `worker_skills`, `customer_requests`, `esco_labels`, `public_vacancies` |
| **Dormant extension seam** — built, code-reachable, unused | 79 | `agreements`, `onboarding_runs`, `work_objects`, `workflow_instances`, `performance_reviews` |
| **RPC/trigger-written** — no `.from()`, not dead | 29 | `*_events` tables, `lmc_lots`, `agency_candidate_offers` |
| **Unknown** — origin untraced | ~4 | `matches`, `match_actions`, `subscriptions`, `skill_seed_benchmarks` |

Four migrations were applied to production on 2026-09-01, all narrowing or
permission-only, each ledger-verified:

| Ledger version | Migration |
|---|---|
| `20260901090215` | agency disclosure revocation |
| `20260901091429` | relationship visibility least privilege |
| `20260901133218` | revoke public schema CREATE |
| `20260901135820` | labour-economics metric widening |

Reconciliation debt: 253 files vs 251 ledger rows, and 69 migrations without a
paired rollback. Neither was resolved in this read-only pass.

---

## S. Gap register

The canonical closure backlog. **Type** distinguishes work from waiting:
`IMPL` = implementation, `VERIF` = verification, `OWNER` = owner decision,
`EXT` = external credential.

| ID | Domain | Gap | Current evidence | Type | Priority |
|---|---|---|---|---|---|
| G-01 | Work execution | No closed loop from interest → booking → engagement → assignment → hours → timesheet → approval | `booking_requests` 0, `work_hour_allocations` 0, `workflow_instances` 0, `timesheets` 1 draft | IMPL | P1 |
| G-02 | Agency | Zero E2E specs; entire model unexercised | 5 agency tables at 0 rows; 0 specs | IMPL+VERIF | P1 |
| G-03 | Documents | Ingestion never completes to canonical state; no file ever stored | `worker_documents` 0, `document_files` 0, 3 buckets empty | IMPL+VERIF | P1 |
| G-04 | Timesheet | No E2E spec for submit/review/approve; no workflow instance ever created | 0 specs, `workflow_instances` 0 | VERIF | P1 |
| G-05 | Marketplace | No delivery, reputation or commercial state; 0 E2E | `service_offerings` 2, requests 1, 0 specs | IMPL | P2 |
| G-06 | Privacy | `ai_runs.profile_id` never cleared — permanent index of who | redact fn nulls only `output_excerpt` (#1266 open) | OWNER | P1 |
| G-07 | Chat | Assistant chat is session-only; no transcript, no GDPR export/erase | #883 open; consumer merged and degrading | OWNER | P2 |
| G-08 | Admin | Founder admin-grant path still broken | `service_role` lacks UPDATE on `profiles`, nothing on `profile_roles` (#1045) | OWNER | P2 |
| G-09 | Matching | Worker board fan-out latent — will misattribute demands | RPC joins `profile_id`; 1 profile owns >1 verified company (#1046) | OWNER | P2 |
| G-10 | Market map | No region tier, no demand/supply, no opportunity drill-down | country-level only; 0 observations on new metric keys | IMPL | P2 |
| G-11 | Commercial | §19 canonical model unimplemented; sustainability gate not running | `lib/commercial/catalogue.ts` absent; #896 never landed | IMPL | P2 |
| G-12 | Education | No programme/course entity; no credential validity; no market feedback | `training_programs` 0, `training_assignments` 0 | IMPL | P2 |
| G-13 | Chat | No education, agency, approval or marketplace vocabulary | 41 intents; none for those domains | IMPL | P2 |
| G-14 | Mobile | Worker-journal slice only; 4 of 12 capabilities; 0 runtime specs | 11 screens | IMPL+VERIF | P2 |
| G-15 | Notifications | Email adapter built, never configured or delivered | `INVITE_EMAIL_*` unset | EXT | P2 |
| G-16 | Auth | Leaked-password protection off; OTP expiry over 1 h | Supabase advisors; no MCP write tool | EXT | P1 |
| G-17 | Languages | 21 of 26 locales unrouted; Georgian absent | 5 routed | IMPL | P3 |
| G-18 | Employer | 8 reproducible E2E failures, cause unattributed | reproduce on a quiet machine; page renders when probed | VERIF | P2 |
| G-19 | Projects | 17-test proof suite not runnable without a dedicated stack | needs `lm-w11-proof` on :55421 | VERIF | P2 |
| G-20 | AI actors | No AI participation in team/project/journal/time/cost | actor type declared only | IMPL | P3 |
| G-21 | CI | CI runs zero Playwright specs — E2E rot is invisible | browser drift went unnoticed until 2026-09-01 | IMPL | P2 |
| G-22 | Migrations | 69 migrations without rollback; 253/251 ledger drift | file count vs ledger | VERIF | P3 |

---

## T. Prioritisation

There is **no P0**. No active data-loss or security exposure was found; the four
security migrations applied on 2026-09-01 closed the ones that existed.

| Priority | Gaps | Character |
|---|---|---|
| P0 | none | No active exposure or broken core journey |
| P1 | G-01 G-02 G-03 G-04 G-06 G-16 | Required product loops incomplete, plus one privacy gap and one external security setting |
| P2 | G-05 G-07 G-08 G-09 G-10 G-11 G-12 G-13 G-14 G-15 G-18 G-19 G-21 | Important capability, parity and verification gaps |
| P3 | G-17 G-20 G-22 | Expansion and hygiene |

**Of the 22 gaps, 14 are implementation or verification work** that needs no
owner input at all. Only 4 are owner decisions and 2 are external credentials.
The backlog is dominated by building and proving, not by waiting.

---

## U. Owner & external gates

| Gate | Kind | Blocks | State |
|---|---|---|---|
| Supabase leaked-password + OTP < 1 h | External dashboard | Auth hardening | Approved, needs dashboard action |
| Email provider credentials | External | Email notifications | Unset |
| OAuth consent click | External | Full MCP tool-call proof | Pending |
| #1266 `ai_runs` de-linking | Owner | Privacy G-06 | Open |
| #883 / #1045 / #1046 / #740 | Owner | G-07 G-08 G-09 | Open |
| #895 / #896 / #897 | Owner (RED billing) | G-11 | Open |
| #1166 / #1211 / #1225 | Owner (visual) | Landing / art direction | Open |
| #1355 ESCO linkage | Owner | Taxonomy depth | HOLD |
| Package 0011 · Stripe live | Owner | Branding · payments | DEFERRED |

---

## V. What must not be deleted or regressed

- **The 108 empty tables.** 79 are code-reachable dormant capability. They are
  the operations layer the product still needs; "no production rows" is the
  weakest possible deletion argument here.
- **The `worker_absence_scheduling` definer view.** Converting it to
  `security_invoker` silently breaks manager absence scheduling while every test
  still passes.
- **The `55421` guard in the W11 spec.** Not a typo — a dedicated seeded proof
  stack (`lm-w11-proof`, seeded by `scripts/db-proof/w11-browser-proof-seed.sh`,
  dev server on :3111). "Fixing" it would run destructive lifecycle tests
  against the shared fixture database.
- **The 8 anon SECDEF functions and 3 sealed tables.** Intentional public
  surfaces and deny-all-by-design tables.
- **The `[EN]` locale shells.** Deliberately unrouted so the product never
  claims a language it does not have.
- **Gitignored `runtime/` evidence and `.env.local` in worktrees.** Not
  recoverable from git.
- **#883 and #740.** Neither has an equivalent on main; both carry guarantees
  the current implementations do not.
- **Honest-degradation behaviour.** The transcript seam, the capability gate,
  the COMING SOON labels and the preview tags are the product's credibility.
  Replacing any of them with a spinner, an empty list or sample data is a
  regression.

---

## W. Recommended execution plan

Ordered so that each stage makes the next provable.
**Nothing here is started — the audit's stop point applies.**

1. **Close one operational loop end to end.** Take a single worker from interest
   → booking → engagement → assignment → object → split hours → timesheet →
   submit → approve, in production, with a synthetic identity. This is G-01 and
   it unblocks G-04 and much of G-03. It is the difference between a product
   that records evidence and a product that runs work. Everything else in the
   operations layer is already built and waiting for this path to be walked
   once.
2. **Give the unexercised actors specs.** Agency (G-02) and marketplace (G-05)
   have zero E2E coverage. Write the specs first — they will reveal whether the
   dormant models actually work before anyone builds on top of them.
3. **Make E2E rot visible.** G-21: CI runs no Playwright at all, which is why
   browser drift and selector rot are only ever found by hand. Even a small CI
   subset would have caught the 2026-09-01 failure in minutes.
4. **Complete document ingestion to canonical state.** G-03: prove one real XLSX
   becomes hours, allocations and provenance — the owner's 8 h + 2 h case — and
   one document becomes a journal entry with a stored file.
5. **Then the owner-gated privacy and commercial items.** G-06 (#1266), G-11
   (§19 canonical commercial model and the sustainability gate), and the
   remaining decisions.

---

## New session canonical handoff

Enough for a fresh agent window to continue without the originating
conversation.

```
## STATE
main = c46fc642 = production · tree clean · CI all green
190 tables (all RLS) · 82 with data · 108 empty (79 code-reachable)
36 users · 37 journal entries · 48 worker skills · 17 demands · 5 interests
0 bookings · 0 hour allocations · 0 workflow instances · 1 draft timesheet

## PROVEN
auth · work journal · evidence→skill (never auto-verified) · Living CV + EU export
education loop (6/6 incl. negative control) · agency confidentiality (DB level)
security: 4 narrowing migrations applied + verified 2026-09-01

## PARTIAL
employer (8 reproducible E2E failures) · market map (country only) · documents (0 files)
notifications (in-app only) · MCP (transport proven, tool call unproven) · mobile (worker slice)

## MISSING
agency E2E · marketplace E2E · timesheet E2E · hours E2E · XLSX E2E · MCP E2E · mobile runtime E2E
work execution loop · programme/course entity · AI actor participation

## P1  G-01 work loop · G-02 agency · G-03 documents · G-04 timesheet · G-06 ai_runs · G-16 auth
## GATES owner: #1266 #883 #1045 #1046 #895 #896 #897 #740 #1166 #1211 #1225 · HOLD #1355
        external: Supabase auth dashboard · email provider · OAuth consent
        deferred: Package 0011 · Stripe live

## DOCTRINE
Preserve by default — "unused / old / similar / no rows / tests pass" are NOT deletion grounds.
Agency: confidentiality without captivity. Commercial: one canonical model + scoped views.
Profession is never a mandatory gate. Chat-first != chat-only. No unlabelled fake data.

## TRAPS
Zero E2E passes = browser drift, not product. One shared storage-state decides which specs can pass.
Machine load looks exactly like a product defect — re-run quiet before believing a failure.
55421 in the W11 spec is deliberate. The absence-scheduling definer view is load-bearing.
A regex that spans the fix looks exactly like the bug.
```

---

*Read-only audit — no deletions, closures or schema changes were made to produce
this document. LabourMarket.ai · 2026-09-01 · baseline `main = c46fc642 =
production`.*
