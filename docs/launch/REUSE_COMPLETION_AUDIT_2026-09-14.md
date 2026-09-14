# REUSE / COMPLETION AUDIT — every PARTIAL and MISSING item

> ▶️ **The completion path in §4 and the estimate in §5 are carried forward,
> owner-decision-resolved, into
> [`MINIMUM_COMPLETION_PLAN_2026-09-14.md`](MINIMUM_COMPLETION_PLAN_2026-09-14.md)
> (2026-09-14).** ARCH-4 is APPROVED consent-scoped, ARCH-2's principle is
> binding with its structure deferred, and UNAUTHORIZED-is-not-ZERO is
> classified as its own FIX — so **no sequencing ambiguities remain**. This
> document stays the EVIDENCE base (the 61-item classification and the
> duplicate register); the plan document is what to work from.

| Field | Value |
|---|---|
| **Date** | 2026-09-14 |
| **Scope** | All **55 PARTIAL + 6 MISSING** capabilities, post-ARCH-1 |
| **Question asked** | For each: what exists, what exact piece is missing, can it be CONNECT/FIX/EXTEND rather than NEW, dependencies, owner-visible E2E outcome, unit, and whether another capability already solves it |
| **Supersedes** | The completion path and estimate in `AUDIT_2026-09-14_CORRECTED_vs_OWNER_TARGET.md` §6–§7. Its node matrix and defect list stand |
| **Status** | Audit only. No implementation. #1739 remains draft |

---

## 0. TWO CORRECTIONS TO MY OWN ESTIMATE, BEFORE ANYTHING ELSE

The owner's challenge was that the 45–75 figure looked like an artifact of
reclassification rather than engineering. **Two specific errors confirm it.**

### 0.1 "A database in CI" — I priced a decision that was already made, against it

I made this Phase 2, called it *"the unlock for everything downstream"*, and
priced it at **4–7 windows realistic, 10–14 conservative** — the single largest
line in the estimate.

**GOV-3 was decided on 2026-09-08**, as an engineering call the owner had
explicitly delegated, and the decision was **not to do it**:

> *"The suite is ACCEPTED AS A LOCAL-ONLY TOOL and CI keeps the unauthenticated
> smoke subset. The alternative — an authenticated fixture strategy — means
> minting real sessions in CI, which needs either long-lived seeded credentials
> in a secret or a login flow against production; both put a real identity into
> CI for a signal that local runs already give. The cost is not the fixtures,
> it is what they would have to hold. Revisit only if CI gains a way to hold a
> session without holding a credential."*

That reasoning is sound and I would have reached the same conclusion. I
re-opened it because I read the *symptom* (5 of 95 specs run) without reading
the *decision*, and then charged the owner for reversing it.

**Effect: −4 to −7 windows, and the largest single item leaves the plan.** What
survives is the honest statement of cost, which GOV-3 already makes: CI green
says nothing about whether a signed-in actor can complete a chain.

### 0.2 I merged "production-complete web" with "architecture-complete"

The 29–44 figure included Phase 3 — CAL-7, CAL-9, CAL-10, DEM-8, WRK-6, RPL.
Those are the genuinely missing capabilities and they are real engineering, but
they are the **FUTURE DEMAND and CAPACITY nodes**, not a precondition for the
web product being usable. Folding them into "production-complete web" inflated
that number by roughly the whole of Phase 3.

**The corrected reading:** production-complete web and architecture-complete
are two different destinations and always were. §5 separates them.

---

## 1. THE HEADLINE FINDING: THIS IS A CONSOLIDATION BACKLOG, NOT A BUILD BACKLOG

Of 61 items, **4 need genuinely new engineering.** The rest divide into work
that connects, fixes, extends or consolidates things that already exist, plus
items that are partial *by decision* or *for want of users*.

| Class | Count | What it means |
|---|---|---|
| **CONNECT** — built, not reachable | 9 | Code exists and works; no surface, route or caller leads to it |
| **FIX** — built, behaves wrongly | 7 | Reachable and used; the behaviour is wrong |
| **EXTEND** — built, covers part of its scope | 12 | Real and working for a subset of actors, inputs or contexts |
| **CONSOLIDATE** — duplicated truth | 11 | Two or more parallel implementations of one concept (§2) |
| **PARTIAL BY DESIGN** | 8 | Deliberately narrow. Not work |
| **PARTIAL ON USAGE ONLY** | 6 | Complete and reachable; zero rows in production. Not engineering |
| **PROOF-ONLY** | 4 | Nothing to build; needs a human walk or a production read |
| **NEW** — genuinely missing | **4** | CAL-7, CAL-9, CAL-10, DEM-8 |
| **OWNER / EXTERNAL** | 6 | Credential, legal, disclosure or plan-level blockers |

**4 of 61 items require building something that does not exist.** The
product's real debt is that months of parallel work produced **eleven
duplicated truths**, and the register recorded most of them honestly as
"(debt)" without anyone converging them.

---

## 2. DUPLICATE / PARALLEL IMPLEMENTATIONS — the aggressive sweep

Eleven acknowledged in the register, two more found in code during #1739.
**None should be deleted; each needs a canonical choice and a convergence.**

| # | Concept | Parallel implementations | Canonical | Risk if left |
|---|---|---|---|---|
| 1 | **Roster** (ORG-6) | `engagement_contexts` **plus four legacy link tables** | `engagement_contexts` (81 rows, real use) | Four answers to "who works here" |
| 2 | **Availability** (CAL-3) | **Four incompatible vocabularies**, none derived from another | undecided | Capacity and matching read different truths |
| 3 | **Hours** (EVID-5) | Three stores + one dead, reconciled only inside ONE SQL function; **no TypeScript reader unions them** | the SQL function | Every TS reader sees a partial answer |
| 4 | **Search** (GOV-6) | **Four incompatible stacks** | undecided | — |
| 5 | **Calendar sources** (CAL-1) | 8 sources reach the projection; **10 further dated stores never do** | `planning-model` | Ten kinds of dated thing invisible on the calendar |
| 6 | **Skill claims** (SKL-4) | Two live stores + `candidate_skills` frozen at 0 rows | undecided | Duplicated skill truth |
| 7 | **Agency clients** (ORG-8) | `agency_client_connections` (live) vs `agency_clients` (second, unapplied) | `agency_client_connections` | — |
| 8 | **Org identity** (ORG-1) | Split across `companies` (write) and `organizations` (read, mirrored) | — | Mirror drift |
| 9 | **Contracts** (MKT-4) | Three stores, 0 rows; `contracts` is legacy of `agreements` | `agreements` | — |
| 10 | **Matching** (DEM-5) | A **frozen fork still reachable at `/match-preview`** — a second matching truth | `match-v1` | Two public answers to "do I fit" |
| 11 | **Attention** (COM-5) | Fragmented across four surfaces | — | — |
| 12 | **`languageLevelSatisfies`** *(found #1739)* | `capacity-model` copy returns `boolean`; canonical returns `boolean \| null` | `match-criteria-v2` | **UNKNOWN reported as NOT-MET (SEP-7)** |
| 13 | **Journal live-entry filter** *(found #1739)* | Re-derived across 34 readers; **23 omit it** | `journal-list-core:198` | **Deleted/superseded work counted as evidence** |

**#12 and #13 are live defects, not debt** — they produce wrong numbers on a
real user's screen today. The other eleven are correctness *hazards* that have
not yet fired.

### Disconnected work found beyond the register

| Module | Evidence | Class |
|---|---|---|
| `lib/country-readiness/` (6 files) | **Zero product importers.** Referenced only by `scripts/build-answer-registry.ts` and as prose inside two AI prompt strings | SKL-8/GEO-3 are recorded PARTIAL; the module is **BUILT_NOT_CONNECTED** |
| `lib/market/match-team-v1.ts` | One consumer: `dashboard/admin/matching/page.tsx` | Admin-only; engine complete |
| `/dashboard/learning` (EDU-5) | Every reference is a `revalidatePath` | Orphan route |
| `/dashboard/talent` | No inbound link anywhere | Superadmin preview |
| `/dashboard/admin/import-sandbox`, `…/intelligence-observations` | Zero references of any kind | Flag-gated owner tools |
| 68 of 141 `lib` subsystems | No register anchor | Unregistered, not necessarily unused |
| `lib/agency/pool.ts` (S5 agency worker pool) | `getAgencyPool()` and `markCanOfferAction` have **no caller anywhere**; the only "pool" on a page is the labelled marketing preview from `content/placeholders.ts`. Both RPCs (`list_open_demand_for_agencies`, `mark_agency_can_offer`) verified **present in production** 2026-09-14 | **BUILT_NOT_CONNECTED — owner decision, not wiring.** A complete read service (worker cards, country readiness, open demand) with live RPCs and no surface. Not mounted here because the product already carries a SECOND agency model, the agency↔client bridge, and which one an agency screen belongs on is #7 above, still open |

### Six one-way records that had no way back (swept 2026-09-14)

Every server action in the codebase was checked for a production caller. Seven
had none; five of those were `create`'s missing counterpart.

| Action | Verdict | Outcome |
|---|---|---|
| `unshareRequestAction` | Real gap — the agency could see what was shared with it, the client could not see or withdraw it | **Connected** (`a8b9bf0`) |
| `recordCorrectionAction` | Real gap — hours somebody is paid from were write-once | **Connected** (`995fb99`) |
| `updateTrainingProgramAction` | Real gap — a course could not be renamed or retired, and an inactive one still offered to assign | **Connected** |
| `updateManagementDecisionAction` | Real gap — a draft could be submitted but not corrected | **Connected** (draft rows only, the database's own rule) |
| `linkTrainingSkillAction` | **Bounded, not a gap.** Migration 20260817230000 documents the skill seam as deliberately not crossed, and nothing reads `training_skill_links`; connecting the write alone makes a write-only store | Left alone, recorded |
| `previewPeopleIngestAction` | **Bounded, not a gap.** The preview journey is live through `previewPeopleFileAction`; this is a second, unused entry point | Left alone, recorded |
| `markCanOfferAction` | Part of the unmounted S5 pool above | Owner decision |

### The same sweep from the database side (2026-09-14)

The action sweep can only see what the code names. So the mirror was run too:
every SECURITY DEFINER function in production that `authenticated` may execute
— **329 of them** — checked against every string literal in `lib`, `app`,
`components` and `scripts`. **Eight** are named nowhere in the codebase.

| RPC | Verdict |
|---|---|
| `remove_self_declared_work_history_v1` | Real gap — a person could state a work-history entry about themselves and never take it back. **Connected** (`733a867`) |
| `withdraw_contact_disclosure_request_v1` | **Real gap, and a GATE.** An employer cannot retract a pending ask for a worker's contact details; it sits in the worker's list until they answer or it expires in 14 days. Wiring it needs an employer-side read of their own outgoing asks, and none exists — `list_my_contact_disclosure_requests_v1` filters `w.profile_id = auth.uid()`, i.e. the worker. That is a NEW privacy surface plus a NEW read, not a wire-up |
| `expire_contact_disclosure_requests_v1`, `expire_stale_booking_requests_v1` | Sweepers, expected to run on a schedule rather than from app code. Not defects; the missing scheduler is recorded elsewhere |
| `journal_entry_supersede` | Superseded by `journal_entry_supersede_v2`, which IS called |
| `moderate_experience_response`, `review_experience_dispute` | Experience-record moderation. Belongs with EVID-6, an open owner decision |
| `record_personal_data_disclosure` | Disclosure ledger write with no caller — worth a look under the privacy train, not swept in here |

Eight unreferenced out of 329 is a healthy figure; the point of recording it is
that the two that mattered were both a `create` whose counterpart never
shipped a control, the same shape as the six above.

### And from the data side — a clean negative (2026-09-14)

Third angle, to catch data captured and never shown (SEP-8): every `public`
table in production that holds rows — **105 of them** — checked for any
mention in `lib`, `app` or `components`. **Four** are named by no application
code, and all four are correct as they are:

| Table | Rows | Why no TypeScript reads it |
|---|---|---|
| `timesheet_events` | 6 | *"APPEND-ONLY timesheet history. Rows are immutable (trigger-enforced for every role incl. service_role)."* — its own table comment |
| `booking_request_events` | 2 | The booking lifecycle's audit trail, written by the RPCs |
| `public_vacancy_supply_counts` | 1 | *"Written only by `refresh_public_vacancy_supply_counts_v1()` (pg_cron / service role); read only by `count_public_vacancies_v1()`. RLS on with no policies = deny-all."* — its own table comment |
| `ai_runs_retention_sweeps` | 37 | Retention-job bookkeeping, read by `ai_runs_retention_health` |

Recording the negative so the angle is not re-run: **101 of 105 populated
tables have a named application reader, and the four that do not are audit,
ops and cron-singleton tables read from SQL.** No data is being captured and
hidden.

---

## 3. THE 61 ITEMS

Columns: **Exists** · **Exact missing piece** · **Class** · **Deps** ·
**E2E outcome unlocked** · **Unit** · **Already solved elsewhere?**

Unit: **S** ≤ ½ window · **M** ~1 window · **L** 2–4 windows · **XL** 5+.

### 3.1 CONNECT — built, works, nothing leads to it (9)

| Id | Exists | Missing | Deps | E2E outcome | Unit | Dup? |
|---|---|---|---|---|---|---|
| **SKL-8** Country requirements | Full matrix in `lib/country-readiness/` (6 files) | Any product importer + a surface | — | A worker sees what a country requires of them | M | Overlaps GEO-3 — **same module, one surface serves both** |
| **GEO-3** Mobility | Same module + a checklist | A route; permit/posting workflow is separate | SKL-8 | Cross-border readiness visible | M | **Yes — merge with SKL-8** |
| **DEM-6** Team matching | `matchTeamToNeed` complete: coverage, set blockers, per-member results, honest `insufficient_data` | Employer-side surface | **ARCH-4** (disclosure) + teams existing | Employer sees a brigade matched as a unit | M | No |
| **PER-13** Requirement ledger | Three contexts (`employer_demand`, `profession`, `role`); several consumers | The remaining mounts | — | A person sees what is missing for a role in every context | S | No |
| **ORG-9** Public org profile | `/business/[slug]` renders | Index/directory route | — | An organization is findable | S | Check against "no people search by design" |
| **WRK-2** Objects / sites | Model + a company-workspace section, 1 row | A route of its own | — | Sites addressable directly | S | No |
| **EDU-5** Learning review | Complete; `/dashboard/learning` renders | One inbound link | — | Reviewer reaches the queue | S | No |
| **MKT-2** Physical listings | `/dashboard/listings` + surfaceRoute + public read + chat refs | **Nothing — reachable.** 0 rows | — | — | — | Usage, not code |
| **AI-3** AI runtime | 47 real runs, real spend | **Six registered agents have zero call sites** | — | Six agents become usable | M | No |

### 3.2 FIX — reachable, behaves wrongly (7)

| Id | Exists | Missing | Deps | E2E outcome | Unit | Dup? |
|---|---|---|---|---|---|---|
| **#13** Journal live filter *(not a register row)* | Canonical filter at `journal-list-core:198` | 23 of 34 readers bypass it | — | **CV and profile stop counting deleted/superseded work.** 65 counted vs 46 live | M | Dup #13 |
| **#12 / CAL-4** Capacity language gap | Canonical `boolean \| null` comparison | `capacity-model` keeps a `boolean` copy | — | Employer stops seeing a shortfall that may not exist | S | Dup #12 |
| **ORG-5** Cross-org isolation | Seven authority helpers | `owns_company` excludes managers → **an org MANAGER cannot read `company_workers`** | — | Managers can run their own roster | S–M | No |
| **PER-9** Achievements | Table + surface | `confirmed_by_manager` has **no write path — permanently false** | — | A manager can confirm an achievement | S | No |
| **MKT-3** Assets | `issue_asset_v1` | **No availability guard, no lock** — double-issue possible | — | Equipment cannot be double-issued | S | No |
| **AI-2** Action backbone | 54 actions | Most tokens carry `stateFingerprint='n/a'` → stale confirmations undetectable | — | A stale confirmation is refused | M | No |
| **COM-2** Contact disclosure | Full flow + expiry RPC | **The expiry RPC has no caller** — requests never expire | scheduler | Disclosure actually expires | S | Same missing scheduler as CAL-6 |

### 3.3 EXTEND — real, covers part of its scope (12)

| Id | Exists | Missing | Unit | Note |
|---|---|---|---|---|
| **PER-2** Profile narrative | `workers.headline`/`bio` columns | A person-facing editor | S | |
| **PER-12** GDPR export | Export of 6 relations | ~14 further personal relations | M | Legal exposure if a subject requests |
| **PER-7** Practice history | Fixed and on main; canonical list | Volume only | — | Effectively done |
| **SKL-6** ESCO | Typeahead live on **both** sides | Bridge inert | M | |
| **CAL-6** Booking | request → accept → engagement | **Nothing past `accepted`**; expiry RPC has no scheduler | M | Scheduler shared with COM-2 |
| **CAL-2** Employer calendar | Reads the canonical projection | Breadth | S | Note already corrected |
| **COM-1** Conversations | Full thread layer | **No organization participant type** → `team` threads always RESTRICTED | M | |
| **COM-3** Notifications | 20 types; grant fixed 2026-09-08 | Coverage verification | S | |
| **COM-4** Weekly digest | **Cron ran and persisted 4 rows** | Volume | — | Effectively done |
| **GEO-4** Market intelligence | 76 observations | **Exactly one path leads to an operational action** | M | |
| **GOV-7** Reporting | Six real downloads, CSV/JSON | No PDF/XLSX generator | M | Ask whether needed |
| **GOV-5** Localization | 11 locales, 5 active | Inactive five carry `[EN]` blocks, not ratchet-tracked | M | Only a walk sees a missing key |

### 3.4 CONSOLIDATE — duplicated truth (11)

All eleven from §2. Units: ORG-6 **L**, CAL-3 **L**, EVID-5 **M**, CAL-1 **L**,
GOV-6 **L**, SKL-4 **M**, ORG-8 **S**, ORG-1 **M**, MKT-4 **S**, DEM-5 **S**
(retire the `/match-preview` fork), COM-5 **M**.

**None unlocks a new E2E outcome.** Each removes a way for two surfaces to
disagree. Sequence them behind user-visible work, except **DEM-5** (a second
public matching answer is user-visible) and **EVID-5** (hours feed evidence).

### 3.5 PARTIAL BY DESIGN — not work (8)

| Id | Why it is deliberately narrow |
|---|---|
| **CAL-5** Absences | "the privacy-narrowed manager view is correct and deliberate" |
| **GEO-1** Market map | "cross-user aggregate is deliberately absent" |
| **GOV-6** Search | "no people search anywhere, **by design**" |
| **SKL-10** Training register | "writes nothing into the skill ladder, **by decision**" (SEP-6) |
| **SKL-9** RPL | The model must not let demonstrated capability satisfy a formal requirement (SEP-6) |
| **GOV-3** E2E in CI | **Decided 2026-09-08** — see §0.1 |
| **EVID-6** Right of reply | Reader shipped 2026-09-07; remainder is EVID-6 owner gate |
| **EVID-3** Verification state | Measured end-to-end 2026-09-08, holds; no invented verifier |

Changing any of these is an **owner decision**, not a completion task.

### 3.6 PARTIAL ON USAGE ONLY — complete, reachable, unused (6)

**EDU-2** (1 programme, 1 cohort, 0 members — all five write paths reachable) ·
**EDU-4** (reachable; no learner has reached it) · **MKT-2** (0 rows) ·
**MKT-4** (0 rows) · **COM-2** (0 rows) · **SKL-10** (0 rows).

**Zero engineering. This is distribution, not development** — and per ARCH-3,
whether these count as "broken" is still an open owner question.

### 3.7 PROOF-ONLY (4)

**GOV-8** Security/RLS (one Auth setting done, one impossible on this plan) ·
**DEM-4** external ingestion (89,021 rows live; **no scheduler** — that part is
FIX/**S**) · **AI-1** MCP door (proven read+write; blocked on owner OAuth) ·
**PER-7 / COM-4** (effectively done, need volume).

### 3.8 GENUINELY NEW — 4 items

| Id | What must be built | Deps | E2E outcome | Unit |
|---|---|---|---|---|
| **CAL-10** Planned vs actual → learned duration | Capture actual against plan; derive duration as **FORECAST, never fact** (SEP-1) | — | The flywheel learns: forecasts improve from real outcomes | **L–XL** |
| **CAL-7** Capacity reservation | Reserve capacity; **must warn, never prohibit** (SEP-2) | — | An employer can hold capacity without blocking a person | **L** |
| **CAL-9** Utilisation / FTE | Derived measure | **CAL-10** | Utilisation visible | **M** |
| **DEM-8** Saved searches / alerts | Recurring query + notification | notification spine (exists) | A person is told when matching work appears | **M** |

Plus two owner-gated schema items that are *not* free-standing new modules:
**WRK-6** team→project FK (**S** once ARCH-4 settles) and the **RPL write path**
(**M** once ARCH-2 settles).

**CAL-8 Shifts/rotas is NOT on this list** — "roster" in this product means the
active `company_workers` list, never a schedule (§6.0 rule 3). Building a rota
would be scope expansion.

---

## 4. MINIMUM COMPLETION PATH — CURRENT → OWNER TARGET

Ordered by owner/user E2E value × dependency criticality.

### Bucket A — ALREADY BUILT, DISCONNECTED (highest value per unit)

| Step | Items | Unit | Unlocks |
|---|---|---|---|
| A1 | **SKL-8 + GEO-3 on one surface** (same module — one route, not two) | M | Cross-border readiness becomes visible at all |
| A2 | **AI-3** six agents with zero call sites | M | Six built agents become usable |
| A3 | **PER-13** remaining mounts · **ORG-9** index · **WRK-2** route · **EDU-5** link | M total | Four capabilities become reachable |
| A4 | **DEM-6** employer surface | M | *Blocked on ARCH-4* |

### Bucket B — INCOMPLETE, USER-VISIBLE FIRST

| Step | Items | Unit | Unlocks |
|---|---|---|---|
| B1 | **Journal live filter** (#13) | M | **CV/profile stop overstating evidence — the only defect misinforming a user today** |
| B2 | **Capacity language gap** (#12 / CAL-4) | S | Employer shortfall stops counting UNKNOWN as NOT-MET |
| B3 | **ORG-5** manager roster · **PER-9** confirm · **MKT-3** asset lock | M total | Three broken behaviours fixed |
| B4 | **One scheduler** → CAL-6 expiry + COM-2 expiry + DEM-4 ingestion | M | Three capabilities stop needing a human to run them |
| B5 | **CAL-6** past `accepted` · **COM-1** org participant · **PER-12** export breadth | L | Booking completes; team threads work; GDPR export is honest |

### Bucket C — GENUINELY MISSING (the architecture-completion tail)

C1 **CAL-7** → C2 **CAL-10** → C3 **CAL-9**; **DEM-8** independent.
This is the FUTURE DEMAND + CAPACITY tail and the flywheel's learning loop.
**Not required for a usable web product.**

### Bucket D — PROOF ONLY

D1 A human walk of each actor chain (17/106 HUMAN_UI_PROVEN).
D2 Production reads for the zero-usage six.
**No engineering. This is the largest single gap between "green" and "true".**

### Bucket E — EXTERNAL / LEGAL / CONFIGURATION

`SUPABASE_DB_URL` (GOV-1) · Supabase OAuth 2.1 AS (AI-1, blocks both MCP
surfaces) · privacy-policy wording · Apple + Play accounts, signing key, icon
approval, declarations, screenshots · leaked-password toggle · MKT-7 billing.
**Zero agent windows. Owner wall-clock only.**

### Bucket F — CONSOLIDATION (schedule behind A–B)

The eleven duplicated truths. **DEM-5** and **EVID-5** first (user-visible /
evidence-feeding); the rest are hazard reduction.

---

## 5. RECALCULATED ESTIMATE

| Bucket | Optimistic | Realistic | Conservative |
|---|---|---|---|
| A — connect the disconnected | 2 | **3–4** | 6 |
| B — incomplete, user-visible | 3 | **5–7** | 10 |
| C — genuinely missing (CAL-7/9/10, DEM-8) | 6 | **10–16** | 25 |
| D — proof | 0 agent | 0 agent | 0 agent |
| E — external | 0 agent | 0 agent | 0 agent |
| F — consolidation (11 duplicates) | 4 | **7–10** | 16 |

**Production-complete WEB** = A + B + the user-visible half of F
= **optimistic 6 · realistic 10–14 · conservative 20**.
That is *at or below* the original 12–18, and the original was closer to right
than my corrected number.

**Architecture-complete (all 28 nodes)** = A + B + C + F
= **optimistic 15 · realistic 25–37 · conservative 57**.

**Mobile** 2–4 · **Store-submission** 2–4 then owner-gated.

### Why 12–18 became 29–44 / 45–75 — the honest decomposition

| Cause | Windows added | Real engineering? |
|---|---|---|
| **Re-opened a settled decision** (database in CI, GOV-3) | +4 to +7 | **No.** Decided 2026-09-08 against, on security grounds |
| **Merged two destinations** — folded architecture-completion (Bucket C) into "production-complete web" | +14 to +22 | **Partly.** C is real engineering, but it is not web-completion |
| **Newly classified architecture** — the four ARCH-1 nodes | +0 | **No.** Zero new capabilities; realized by reuse |
| **Newly classified distribution** — six surfaces entering governance | +2 to +4 | **Partly.** Mostly owner credentials |
| **Priced 55 PARTIAL as 55 units of work** | +4 to +6 | **No.** 14 are by-design or usage-only; 11 are consolidation, not features |
| **Genuinely discovered engineering** — the 13 duplicates and #12/#13 defects | +5 to +8 | **Yes.** Found by this audit, real, and largely small units |

**Net:** of the ~30-window increase from 12–18 to 45–75, roughly **5–8 windows
are real newly-discovered engineering**. The rest was a settled decision I
re-opened, two destinations I merged, and a PARTIAL count I treated as a work
count.

**The owner's challenge was correct.** 38 BUILT_AND_USABLE, 55 PARTIAL and 6
MISSING describes a product that is largely built and unevenly connected — not
one that needs 45–75 windows of construction.

---

## 6. WHAT THIS DOES NOT CHANGE

- The **28-node target** stands. Missing code never weakens it (canonical §6).
- **1 of 28 nodes is BUILT_AND_CONNECTED**; that measurement is unaffected —
  it says the product is *unevenly finished*, not that it is unbuilt.
- The **seven #1739 defects** stand, and #12/#13 remain the only two currently
  misinforming a real user.
- **17 of 106 HUMAN_UI_PROVEN** stands, and no amount of agent time changes it.
  Bucket D is still the largest gap between "green" and "true".
