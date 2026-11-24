# POST-MERGE PRODUCTION READINESS BASELINE — 2026-08-03

**This is the canonical release baseline.** It supersedes every earlier
"current state" claim in `docs/audits/`. A continuation session reads
[`premium-rebuild-live-state.md`](./premium-rebuild-live-state.md) first (short
entry point), then this document for the full record.

---

## 0. Provenance and method

| Field | Value |
|---|---|
| **Audit date** | 2026-08-03 |
| **Audit base commit** (`origin/main` HEAD at audit time) | `2813c78bc44127be3642e78ef2e78ab13d9dfe33` (`2813c78b`) |
| **Production deployment ID** | `5722693900` — Vercel `Production`, state **success**, sha `2813c78b`, 2026-08-03T07:49:54Z |
| **Production Supabase project ref** | `gorgitwvdzxbnaxhrsrw` |
| **Production origin** | `https://labourmarket.ai` (apex; `app.` is `LEGACY_APP_HOST`, 301) |
| **Method** | **READ-ONLY.** `git`/`gh` reads; Supabase MCP `list_migrations` + `execute_sql` **SELECT only**. No `apply_migration`, no `db push`, no `db reset` against production, no INSERT/UPDATE/DELETE, no deploy, no merge, no production data touched. |
| **What was NOT verified** | Anything requiring an authenticated production session. `PROD_QA_*` is unprovisioned (`evidence/premium-rebuild/prod-qa-account.md`, `PROVISIONED: NO`), so **no authenticated production proof exists for any role**. |

### The four states, and why they are never mixed

Every claim in this document belongs to exactly one of these. A claim in one
column says **nothing** about the others.

| State | Means | How it was verified here |
|---|---|---|
| **MERGED** | The code is an ancestor of `origin/main`. | `git log origin/main`, `gh pr view` |
| **DEPLOYED** | A Vercel Production deployment for that sha reached `state: success`. | GitHub deployments API |
| **MIGRATION APPLIED** | A row exists in production's `supabase_migrations.schema_migrations` **and** the object it creates is present in the live catalog. | Supabase MCP SELECT against both the ledger and `pg_catalog`/`information_schema` |
| **OWNER-GATED** | Merged and possibly deployed, but deliberately inert until a human decision. | The gate is named, with its blast radius |

**Merged ≠ deployed ≠ applied ≠ working.** Three migrations in this train are
merged and deployed and have *no effect whatsoever in production*, because they
are unapplied.

---

## 1. MERGED STATE

`origin/main` HEAD = **`2813c78b`** ("W10 Slice 3 — staged retrieval…", #992,
merged 2026-08-03T07:46:19Z).

### All 12 requested slices are merged. Nothing is missing.

| Expected | PR | Merge commit | Merged (UTC) |
|---|---|---|---|
| W6 (slices 1–4) | #972 / #973 / #974 / #977 | `2639938d` / `380c3679` / `c05a4802` / `fe159913` | 2026-08-02 |
| W7 | #979 (slice 2) · #981 (slice 3) | `1c8df7f8` · `6119da2b` | 2026-08-02 |
| W9 Slice 1 | #975 | `dfa5e5e7` | 2026-08-02 14:02 |
| W9 Slice 2 | #980 | `fa935674` | 2026-08-02 19:11 |
| W10 Slice 1 | #986 | `c4d564c1` | 2026-08-02 21:18 |
| W10 Slice 2 | #989 | `9bb01e3b` | 2026-08-02 22:21 |
| W10 Slice 3 | #992 | `2813c78b` | 2026-08-03 07:46 |
| W11 Slice 0 | #985 | `693e8efa` | 2026-08-02 20:48 |
| W12 Slice 1 | #976 | `f6fd6db7` | 2026-08-02 15:14 |
| W12 Slice 3 | #982 | `17fa290c` | 2026-08-02 17:37 |
| W14 Slice 1 | #984 | `d3ab92b3` | 2026-08-02 20:29 |
| W14 Slice 2 | #987 | `d79a627f` | 2026-08-02 21:43 |

Merged in the same train, not on the requested list:

| PR | Commit | Note |
|---|---|---|
| #978 | `578eb3e2` | W8 Slice 1 — employer organization context truth |
| #988 | `6433b1a3` | W11 assigned-worker project read — **carries an UNAPPLIED migration** |
| #990 | `0849d609` | W14 cross-tenant P0 — company demand intelligence owner scope |
| #983 / #991 | `c1b647b5` / `edb3a0fb` | docs-only migration-ledger records |

### Two naming facts that will otherwise read as gaps

1. **W7 has no "Slice 1".** The W7 audit's P0 list is empty. What shipped is
   slice 2 (photo evidence, closing P1-2) and slice 3 (deep-link query
   preservation, closing P1-1). Nothing is missing — the numbering starts at 2.
2. **W10 Slice 2 = PR #989**, whose commit subject is
   `fix(w10): fit outranks profile-touch recency…` with no "slice 2" label. It
   is the correct slice.

---

## 2. DEPLOYED STATE

| Field | Value |
|---|---|
| Production deployment | `5722693900`, sha `2813c78b`, **success**, 2026-08-03T07:49:54Z |
| Preceding production deploys in this train | `5721784597` @ `6433b1a3` (success) · `5722054767` @ `edb3a0fb` (success) |
| CI on `2813c78b` | `quality` **success** · `Analyze (javascript-typescript)` **success** · `Supabase Preview` **FAILURE** |

The `Supabase Preview` failure is not transient. Its output is:

```
Remote migration versions not found in local migrations directory.
```

That is CI reporting the production-ahead-of-main drift documented in §4.

---

## 3. MIGRATION APPLIED STATE

Verified against production's ledger **and** the live catalog — a ledger row
alone was not accepted as proof.

### Applied in this train

| Migration | Ledger version | Live-object proof |
|---|---|---|
| `20260802160000_org_membership_revocation_v1` | `20260802193558` | applied |
| `20260802170000_organization_rls_hardening_v1` | `20260802193843` | `organizations_select` = `owner_profile_id = auth.uid() OR belongs_to_organization(id) OR is_admin()` — the `using (true)` P0 is **CLOSED in production** |
| `20260714150000_ai_runs_audit_v1` | `20260803061937` | `ai_runs` exists, 27 columns, **0 rows** |

### Merged in code, NOT applied to production (3 from this train)

| Migration | Slice | Proof of absence in production |
|---|---|---|
| `20260802120000_experience_records_v1` | W6 Slice 3 | no `experience_records` / `experience_responses` relation |
| `20260802150000_booking_atomic_double_booking_v1` | W12 Slice 1 | `booking_requests` has **no exclusion constraint** (`pg_constraint contype='x'` → empty) |
| `20260803090000_project_assigned_worker_read_v1` | W11 (#988) | no `is_assigned_to_project()` function; `projects_select` still reads `owns_company(company_id) OR is_admin() OR (status='live' AND auth.uid() IS NOT NULL)` |

### Older migrations on `main` never applied (9, pre-dating this train)

`agency_clients_v1` · `company_locations_v1` · `company_memberships_v1` ·
`dashboard_preferences_v1` · `demand_interest_seen_v1` ·
`journal_profession_templates_v1` · `multi_source_talent_v1` ·
`open_markets_countries_draft_v1` · `worker_opportunity_seen_v1`

**Total unapplied repo migrations: 12.**

### Current migration baseline

| | |
|---|---|
| Migration files on `main` | **173** |
| Ledger rows in production | **170** |
| On `main`, not in production | 12 |
| In production, not on `main` | **4** (§4) |

The two totals do not subtract cleanly, and that is a fact about history rather
than an error: three legacy repo files were applied as more than one ledger row
each (`20260612091000_journal_entry_photos.sql` → the `_table` / `_rpc` /
`_storage` rows; `20260610190000_conversation_message_language.sql` → two rows
plus a `_check` row), and `agency_legacy_retype` exists in production with no
file on `main`. Reconciliation: 173 − 12 unapplied = 161 applied-from-file,
+ 5 legacy multi-row/orphan rows + 4 `usage_cost_events` rows = **170**.

---

## 4. PRODUCTION-AHEAD-OF-MAIN DRIFT

Four migrations are applied in production whose files do **not** exist on `main`:

```
20260728114008  usage_cost_events_v1
20260728114254  usage_cost_events_v1_reapply
20260728114301  usage_cost_events_truncate_guard_v1
20260728114353  usage_cost_events_v1_clean_start
```

`public.usage_cost_events` is live in production (20 columns, 0 rows). The
nearest repo files live only on the unmerged branch
`feat/canonical-usage-cost-event-model-v1` (**Draft PR #898**, `466062be` —
confirmed *not* an ancestor of `origin/main`), and **they do not match**.

Full byte/semantic comparison, dependency list, rollback status, DML analysis
and the recovery plan:
[`usage-cost-migration-drift-inventory-2026-08-03.md`](./usage-cost-migration-drift-inventory-2026-08-03.md).

**Verdict: `PRODUCTION_SCHEMA_DRIFT_REQUIRES_MANUAL_RECONCILIATION`.** No
recovery PR was opened, because the precondition (repo files exactly matching
production) is not met.

---

## 5. OWNER GATES STILL OPEN

| # | Gate | Blast radius |
|---|---|---|
| 1 | Apply `20260803090000_project_assigned_worker_read_v1` (W11 #988) | replaces the `projects_select` policy |
| 2 | Apply `20260802150000_booking_atomic_double_booking_v1` (W12) | EXCLUDE constraint on live bookings |
| 3 | Apply `20260802120000_experience_records_v1` (W6) | new tables, SECURITY DEFINER RPCs, GRANT/REVOKE |
| 4 | Reconcile the `usage_cost_events` drift (§4) — choose the repo-repair direction | migration history only; no production DDL |
| 5 | Assistant transcript persistence (W7 P1-3) — SQL sits in `docs/proposals/`, never moved into `supabase/migrations/` | conversation memory |
| 6 | The nine W4 owner-gated items (`evidence/premium-rebuild/w4-acceptance.md` §4) | unchanged |
| 7 | Provision `PROD_QA_*` | unblocks **all** authenticated production proof |
| 8 | Billing / commercial (#893–#898, #844, #883, #879) | payment activation — hard stop |
| 9 | W6 slice-3 decision 3 (apply the experience migration). Decisions 1 and 2 are moot — #974 is merged. | production schema |

---

## 6. PRODUCT STATUS, W1 → W22

### An honesty finding about the W numbering, first

Three incompatible "W" schemes exist in this repository:

1. `labourmarketai-premium-rebuild-execution-plan.md` — W1…W11, an older scheme
   (its "W8" is Calendar, its "W9" is Login).
2. `docs/plans/labourmarketai-real-user-workflow-rebuild-plan-v1.md` — W1…W4 "waves".
3. **The scheme actually being executed** — W1–W6 from the premium-rebuild stage
   ledger, then W7–W14 from the 2026-08-02/03 domain audits.

The W11 audit states this explicitly and refuses to invent dependencies:

> "**W13 / W14 — Undefined in this repository.** … I cannot state W13/W14
> dependencies without inventing them."

W14 was defined after that sentence was written. **W13 and W15–W22 have no
definition, no audit, no branch and no slice anywhere in the repo or in
production.** The only external hints are one line in the W8 audit naming
*"W13 Notifications"* and *"W16 Commercial"*. The `feat/cc/w13-business-profile`
branch belongs to the older **Wagon** numbering (Wagon 10–13, PRs #823–#826) and
is **not** this programme's W13.

No scope is fabricated for W15–W22 below.

### Per-W table

| W | Domain | Status | % | Main achievements | Remaining blockers | Next recommended slice |
|---|---|---|---|---|---|---|
| **W1** | Product + UI audit, landing repair, journal→capability loop | `COMPLETE` | 100 | Loop exists end-to-end; landing repaired | none | — |
| **W2** | Design tokens + shell | `COMPLETE` | 100 | Closed with W1 in the stage ledger | none tracked | — |
| **W3** | Chat-first workspace consolidation | `COMPLETE` | 100 | `/dashboard/advanced` **deleted** (0 files match); −7,487 LOC; deploy `5703264161`; FROZEN | none | — |
| **W4** | Professional identity | `COMPLETE` | 100 | Certificates + org-identity write paths; ONE display-name rule; deploy `5703997684`; FROZEN | 9 owner-gated items (documented, non-blocking) | — |
| **W5** | Journal / evidence / skills | `COMPLETE` | 100 | Dead-surface deletion, voice handoff into chat, evidence drill-down; FROZEN | none | — |
| **W6** | Trust | `COMPLETE_BUT_PENDING_PRODUCTION_MIGRATION` | 90 | ONE `EvidenceTier` module + one lexicon ×12 locales; `computeConfidence` containment (self-logged capped at 15, below the 30 substantiation line); experience domain on `?result=experiences` with **no new route**; fraud gates advisory-only; 43/43 SQL proof | `experience_records_v1` **unapplied** → the whole subjective domain is dark in production and fails closed | Owner gate 3: apply the migration |
| **W7** | Employee journey | `PARTIALLY_COMPLETE` | 55 | Audit found **zero P0**; photo evidence reachable from chat with client-side downscale (P1-2); `?next=` now preserves the query string (P1-1) | P1-3 conversation memory (owner gate; SQL not even in `supabase/migrations/`); P1-4 `/dashboard/profile` is 1007 lines / ~25 sections; P2-1 open-ended bookings skip the overlap guard | Measure `/dashboard/profile` at 375 px + section inventory before touching it |
| **W8** | Employer journey | `PARTIALLY_COMPLETE` | 20 | P0-1 closed: the active organization is no longer decorative | **8 of 9 employer executors unreachable from the chat**; the employer chat has **no result surface**; `runFindWorkers` stops at the workspace boundary; `/dashboard/candidates` is not candidates; no employer analytics | W8-2/W8-3: give the employer a result surface and wire the executors (the #974 file conflict is resolved) |
| **W9** | Organizations & teams | `PARTIALLY_COMPLETE` | 60 | **Both migrations APPLIED to production**; membership revocation real; `organizations using (true)` P0 **closed in prod** | Org-scoped demand spine missing (`customer_requests` has no organization column); manager permissions incomplete; `companies.profile_id` UNIQUE caps multi-org | Add `organization_id` to the demand spine (migration, owner-gated) — unblocks W8, W10 P1-3 and W14-7 at once |
| **W10** | Marketplace & matching | `PARTIALLY_COMPLETE` | 45 | P0-1 board now matches the *real* structured need; P0-2 fit outranks profile-touch recency; P0-3 staged retrieval replaces newest-200; **no migrations** — all three deployed | P1-1 map and board read two different demand tables; P1-2 "match signals" report profile completeness, not match facts; P1-3 org scope `BLOCKED_BY_W9_SCHEMA`; dead geography (no coordinate column, no geocoder) | Slice 7 — the symmetry guard; the audit calls it "the single highest-leverage test in the domain" |
| **W11** | Project operating system | `PARTIALLY_COMPLETE` | 25 | Slice 0: four results falsely marked `real` suppressed their own fallback — now `unverified` with a working route out; a `strong_irreversible` action no longer points at a 404; viewer-scoped "actual cost" labelled as such | **#988 migration unapplied** → an assigned worker still cannot read their own project, and project↔booking conflict detection can never fire; P0-1 `BLOCKED_BY_W9`; CLOSE lifecycle missing entirely | Apply #988, then Slice 3 (`manages_organization` on `projects_select`) — its prerequisite is now met |
| **W12** | Calendar & conflicts | `PARTIALLY_COMPLETE` | 40 | Slice 1: atomic double-booking prevention (row + advisory lock, EXCLUDE gist); Slice 3: a source filter can no longer hide a real conflict | **Slice 1 migration unapplied** → production has no DB-level double-booking guard; worker project bands stay empty until #988 lands | Apply the W12 migration |
| **W13** | *Undefined* (named "Notifications" once, in the W8 audit) | `NOT_STARTED` | 0 | none | no audit, no baseline, no scope | Write the W13 baseline before any slice |
| **W14** | Analytics & KPI | `PARTIALLY_COMPLETE` | 25 | W14-1 fabricated landing "confidence" removed; #987 AI-cost persistence result no longer silently discarded; **cross-tenant P0-3 closed** | 10 of 13 planned slices open; 5 charts still have no host; `dashboard_viewed` has no emitter; `/for-workers` still renders the OVR rating ring | **W14-11 is unblocked** — `ai_runs` is applied, so the first cost-by-model/by-feature reader can be built |
| **W15–W22** | *Undefined* | `NOT_STARTED` | 0 | none | **No scope exists in the repository.** W16 is hinted as "Commercial" and has open draft PRs (#893–#898, #844) but no W-stage baseline | Define them, or drop the numbering — an undefined stage cannot be planned against |

---

## 7. CUSTOMER READINESS

### Production data reality (read live, 2026-08-03)

| Object | Rows |
|---|---|
| profiles | 32 (26 worker · 4 company · 2 null) |
| workers | 32 |
| organizations | 10 (7 company · 3 agency) |
| journal entries | 36 |
| journal confirmations | 12 |
| **verified worker skills** | **2** |
| customer requests (demand) | 17 |
| service offerings | 2 |
| projects | 5 |
| **booking requests** | **0** |
| ai_runs / usage_cost_events | 0 / 0 |

**The single most important fact in this baseline: `booking_requests` is empty.
The marketplace loop — discover → request → accept → work → confirm — has never
completed once in production.** Everything downstream of "accept" is unexercised
by real users.

### Ratings — code being merged never raises a rating

| Segment | Rating | Why |
|---|---|---|
| **Workers** | `LIMITED PILOT` | The strongest journey: the W7 audit found **no P0**; journal → evidence → confirmation is real and has real production rows (36 entries, 12 confirmations); photo evidence now reaches the chat and phone-sized photos are downscaled instead of refused. Against that: only 2 verified skills exist platform-wide, conversation memory is owner-gated, `/dashboard/profile` is a 1007-line scroll on a phone, and no authenticated production proof exists. |
| **Employers** | `NOT READY` | (1) **Zero completed bookings ever.** (2) The employer's declared primary surface is the chat, and **8 of 9 employer executors are unreachable from it**; the employer chat has no result panel at all. (3) A cross-tenant read — admin viewers receiving the platform aggregate on a *company* surface — was only closed on 2026-08-02 (#990). |
| **Organizations** | `NOT READY` | Security spine real and applied (membership revocation; `organizations using (true)` closed). Product spine is not: `customer_requests` has no organization column, so a co-manager sees only their own demand; `projects_select` has no `manages_organization` branch; a dismissed manager still keeps project rights (W11 P0-1); `companies.profile_id` UNIQUE caps one company per profile. |
| **Schools** | `NOT READY` | **Not modelled.** Roles are `worker \| company \| agency \| customer`; `organizations.organization_type` is `company \| agency`. No school entity, no education-institution flow, no data. `worker_education_achievements_v1` records a *worker's* education — it does not model an institution as a customer. |
| **Universities** | `NOT READY` | Identical to Schools — no role, no organization type, no surface, no data. |
| **Recruiters / agencies** | `LIMITED PILOT` | Best-supported non-worker segment: the `agency` role exists, the agency↔client bridge shipped and was production-smoke-verified, and production holds 3 agency organizations + 3 `staffing_agency` companies. Same ceiling as employers — 0 bookings — and the agency candidate CRM is still an owner-gated draft (#858). |

### Promotion conditions — what each segment needs to move up

Conditions are cumulative: `PRODUCTION READY` also requires everything listed
for `PILOT READY`.

| Segment | → `PILOT READY` requires | → `PRODUCTION READY` additionally requires |
|---|---|---|
| **Workers** | `PROD_QA_*` provisioned; one full authenticated production pass (login → onboarding → profile → discovery → interest → journal entry → confirmation) with evidence; W12 + W11 migrations applied so a worker's calendar cannot silently hide a conflict; `/dashboard/profile` measured at 375 px and its worst overflow fixed | ≥1 completed real booking; conversation memory decided (apply or formally drop); ≥10 workers with ≥1 manager-confirmed skill each; empty/loading states consistent across the worker journey |
| **Employers** | Employer chat gains a result surface and ≥5 of 9 executors reachable; one authenticated production pass posting demand → seeing candidates → sending a request; W11 #988 applied so assigned-worker/project reads are truthful | ≥1 completed real booking accepted by a worker; employer analytics v1 (W14-6) org-scoped, not profile-scoped; `/dashboard/candidates` renamed or re-homed |
| **Organizations** | `organization_id` on the demand spine applied; W11 Slice 3 (`manages_organization` on `projects_select`) merged and applied; a two-manager production proof showing one org's data and only that org's | W11 P0-1 closed (a dismissed manager loses project rights); `companies.profile_id` UNIQUE lifted so one profile can hold >1 company; org-scoped analytics (W14-7) |
| **Schools** | An owner decision that schools are a product role at all, then: a `school` organization type or role, an onboarding path, and one real surface that answers a school's own question | A defined school↔worker↔employer relationship model with its own RLS and permission matrix, plus one real institution in a pilot |
| **Universities** | Same as Schools, decided separately — a university's question (graduate placement, cohort outcomes) is not a school's | Same as Schools |
| **Recruiters / agencies** | Everything under Employers, plus the agency candidate CRM (#858) merged out of draft | Everything under Employers, plus agency↔client data isolation proven with two agencies in production |

**Nothing in this train raises any segment's rating.** Merged code that is
unapplied, undeployed to a real user, or unproven under a real session does not
move a readiness state.

---

## 8. VISUAL / UX STATE

| Symptom | Current state | Evidence |
|---|---|---|
| **Duplicate profile hubs** | **PARTIALLY RESOLVED.** `/dashboard/advanced` is genuinely deleted (0 files). But `/dashboard/profile` is **1007 lines mounting ~25 sections**, with `/dashboard/account` beside it. Not a parallel *navigation* system (it is in `PANEL_PREFIXES`), but a de-facto second worker hub. W7 P1-4, open. | `app/[locale]/dashboard/profile/page.tsx` |
| **Dashboard-first UX** | **RESOLVED.** `/dashboard` renders `ConversationChat` and nothing else; the layout renders **no** wide chrome on that route (DOM absent, not painted over). | `app/[locale]/dashboard/page.tsx:20-28` |
| **Missing "Mano erdvė"** | **RESOLVED BY REMOVAL, not restoration.** MyZone no longer exists as a place. Its actions survive as `BASE_ACTIONS` ("the former MyZone fast actions") and `auth.dashboard.myZone.actions.*` is still the single copy source. If "Mano erdvė" is wanted as a *named destination*, it is genuinely gone — a product decision, not a regression. | `lib/dashboard/dashboard-module-registry.ts:146-207` |
| **Inconsistent cards** | **STILL INCONSISTENT.** 16 distinct `*card.tsx` components across four component roots. `action-card.tsx` declares itself "the product's reference action" while 15 others exist beside it. | `components/**/*card.tsx` |
| **Player card inconsistency** | **STILL INCONSISTENT, and one instance is rating-shaped.** Four player-card components + two rings. **`/for-workers` — a public marketing page — imports `PlayerCard` → `OVRRing`**: the last rating-shaped artefact a visitor can reach, against the "fit, not rating" doctrine. W14-13, open. Consolidation is explicitly risky (risk R3 — that operation caused the A-13 chart loss). | `app/[locale]/(marketing)/for-workers/page.tsx:17` → `components/app/player-card.tsx:19` |
| **Empty state inconsistency** | **STILL INCONSISTENT.** Two empty-state components serve **70** authenticated dashboard routes. | `components/app/empty-state.tsx` |
| **Loading inconsistency** | **STILL INCONSISTENT.** Two route-level `loading.tsx` files and 7 files using `animate-pulse` in the whole app. There is no skeleton primitive. | `apps/web/**` |
| **"ResultShell" inconsistency** | **Premise corrected: no component named `ResultShell` exists.** The canonical primitive is `components/app/workspace/result-body.tsx` (`InlineResult`). Its consistency is now **guarded and holding**: 5 kinds are `dataReadiness: "real"` (`player-card`, `calendar`, `market`, `opportunities`, `experiences`) and `result-body.tsx` has exactly those 5 `case` arms; the other 4 are `unverified` and route to the real screen. **One residual over-claim:** `experiences` is `real` while `experience_records` does not exist in production. It fails closed honestly at runtime, but the flag is not true today (W14 P2-7). | `lib/conversation/result-registry.ts`, `components/app/workspace/result-body.tsx` |

**Net:** the *architectural* UX defects are closed. The *systemic* consistency
defects (cards, player cards, empty states, loading states) are all open and
none of them has an owner.

---

## 9. PARALLEL WORK MAP

### Dependency graph

```
                    ┌───────────────────────────────────────────┐
                    │ OWNER GATE: apply 3 merged migrations     │
                    │  M1 experience_records_v1      (W6)       │
                    │  M2 booking_atomic_double_bkg  (W12)      │
                    │  M3 project_assigned_worker    (W11 #988) │
                    └───┬───────────┬───────────────┬───────────┘
                        │           │               │
            W6 experience│      W12 real│        W11 assigned-worker
              surfaces   │      conflict│          project read
                        │       guard   │               │
                        │               └──────┬────────┘
                        │                      ▼
                        │            W12 project↔booking conflicts
                        │            (needs M2 AND M3)
                        ▼
                 W14-12 moderation metrics

  W9 APPLIED (2026-08-02) ──► W11 Slice 3 (manages_organization)   ◄── UNBLOCKED NOW
                          └─► W11 P0-3 operations centre reachable

  ai_runs APPLIED (2026-08-03) ──► W14-11 AI cost reader           ◄── UNBLOCKED NOW

  W9 org column on demand spine (NOT WRITTEN, owner-gated)
        ├──► W8 org-scoped demand
        ├──► W10 P1-3 org scope on matching
        └──► W14-7 org scope on analytics ──► W14-6 employer analytics

  #898 usage_cost_events (drift, §4) ──► green `Supabase Preview` on main
```

### SAFE PARALLEL — no migration, no owner gate, no cross-claim

| Item | W | Files | Why safe |
|---|---|---|---|
| Symmetry guard: one fixture through both subject *and* need builders | W10-7 | 1 guard | Pure test. Highest leverage in the matching domain. |
| Match chips derive from `MatchResultV1`, not profile completeness | W10 P1-2 | 2 + guard | No overlap with W11/W14 files. |
| Retire dead geography (`distanceKm`, radius branch, 11 locale strings) | W10-6 | ~13 | Deleting unreachable code; no coordinate column exists to wire. |
| Chart render-path guard (5 charts have no host) | W14-2 | 1 guard | Guard-only. |
| Player-card a11y + zero state (hard-coded English `aria-label`) | W14-4 | 2 + guard | Isolated to `components/app/player-card/**`. |
| Telemetry truth-up: emit `dashboard_viewed` or delete it | W14-8 | 3 | No conflict. |
| Telemetry window honesty + mobile `overflow-x-auto` | W14-9 | 3 | Cosmetic + honest. |
| Retire the OVR ring from `/for-workers` | W14-13 | 2 | Marketing tree only — does **not** touch `worker-player-card.tsx` (risk R3). |
| Chat demand-creation honesty (request id, real status, continuation chip) | W8 §9.3 | 3 | The W6 result-registry conflict is resolved. |
| Wire or delete the unused `ExecWorkspace` parameter | W8 §9.4 | 2 | Documents an unimplemented intent either way. |
| Re-home / rename `/dashboard/candidates` | W8 §9.5 | 2 | Naming only. |
| Measure `/dashboard/profile` (375 px pass + section inventory) | W7 P1-4 | 0 code | Read-only; the audit forbids a blind fix. |
| Resolve the `experiences` `dataReadiness: "real"` over-claim | W14 P2-7 | 1 | One flag; the runtime already fails closed. |

**Contested files — one stream at a time:** `lib/conversation/result-registry.ts`,
`components/app/workspace/result-body.tsx`, `lib/planning/planning.ts`,
`docs/APPLIED_LEDGER.md`, `lib/supabase/types.ts`.

### SAFE AFTER W

| Item | Requires | Status |
|---|---|---|
| **W11 Slice 3** — `manages_organization` on `projects_select`/`_update` | W9 revocation applied | **SATISFIED 2026-08-02** — largest now-unblocked item |
| **W14-11** — first AI cost reader | `ai_runs` applied | **SATISFIED 2026-08-03** |
| W11 Slice 1 — project lifecycle write path | M3 applied first | pending |
| W12 project↔booking conflict detection | M2 **and** M3 | both pending |
| W14-6 employer analytics | W14-7 org scope | not started |
| W11 Slice 4 — project-scoped finance truth | W11 Slice 3 | after |

### BLOCKED

| Item | Blocked by | Type |
|---|---|---|
| W6 experience submission / moderation / dispute | M1 unapplied | owner gate |
| W12 DB-level double-booking guarantee | M2 unapplied | owner gate |
| W11 assigned-worker project read; empty worker project bands | M3 unapplied | owner gate |
| W7 P1-3 conversation memory | SQL in `docs/proposals/`, not `supabase/migrations/` | owner gate + missing file |
| W8 org-scoped demand, W10 P1-3, W14-7 | `customer_requests` has no organization column | schema, owner gate |
| W11 P0-1 dismissed-manager rights | W9 org-scoped project rights | W-dependency |
| Green `Supabase Preview` on main | §4 drift | owner decision |
| All authenticated production acceptance | `PROD_QA_*` unprovisioned | owner action |
| W16 commercial / billing | payment activation | hard stop |
| W13, W15, W17–W22 | no scope exists | needs a definition |

---

## 10. HIGHEST-ROI NEXT SLICES

Ordered by customer-facing value, not by ease.

1. **Prove the marketplace loop once, end-to-end, in production.**
   `booking_requests` is empty. Every readiness claim in this train sits above a
   loop that has never closed for a real user. Plan (non-executable, owner
   decision package): [`production-cycle-proof-plan-v1.md`](./production-cycle-proof-plan-v1.md).
2. **Apply M3 and M2.** Together they are a **safety** defect, not a feature: a
   worker assigned to a project cannot see it → their calendar is empty for
   those dates → no conflict is raised when they accept an overlapping booking →
   and the DB has no exclusion constraint to catch it either. The platform will
   report a clean schedule for a double-booked person.
3. **Give the employer a working chat surface (W8-2 / W8-3).** 8 of 9 employer
   executors are unreachable from the surface the product calls primary. The
   file conflict that deferred this is resolved.
4. **Add `organization_id` to the demand spine.** One migration that unblocks
   W8 org-scoped demand, W10 P1-3 and W14-7 → W14-6 simultaneously.
5. **W11 Slice 3** — its hard prerequisite was satisfied on 2026-08-02.
6. **Reconcile the §4 drift** — `main` carries a red check and any local rebuild
   produces the wrong schema.
7. **W10-7 symmetry guard** — cheapest high-value item on the list.
8. **Systemic UX consistency** — 2 empty-state components and 2 loading files for
   70 routes; nobody owns this.

**Deliberately NOT next:** consolidating the four player-card components (risk
R3), and anything under W13 or W15–W22 until those stages are defined.

---

## 11. RELATED CANONICAL DOCUMENTS

| Document | Role |
|---|---|
| [`premium-rebuild-live-state.md`](./premium-rebuild-live-state.md) | **Short canonical entry point.** Read first. |
| [`usage-cost-migration-drift-inventory-2026-08-03.md`](./usage-cost-migration-drift-inventory-2026-08-03.md) | §4 drift: full inventory + recovery plan |
| [`production-cycle-proof-plan-v1.md`](./production-cycle-proof-plan-v1.md) | Owner decision package for the first real production cycle |
| [`w7-employee-journey-read-only-audit.md`](./w7-employee-journey-read-only-audit.md) | Historical, 2026-08-02 @ `380c3679` |
| [`evidence/premium-rebuild/w8-employer-journey-audit.md`](./evidence/premium-rebuild/w8-employer-journey-audit.md) | Historical, 2026-08-02 @ `380c3679` |
| [`w10-marketplace-matching-audit.md`](./w10-marketplace-matching-audit.md) | Historical, 2026-08-02 @ `c05a4802` |
| [`w11-project-operating-system-audit.md`](./w11-project-operating-system-audit.md) | Historical, 2026-08-02 @ `c05a4802` |
| [`w14-analytics-kpi-audit.md`](./w14-analytics-kpi-audit.md) | Historical, 2026-08-02 @ `c05a4802` |

---

**Verdict: `POST_MERGE_PRODUCTION_READINESS_BASELINE_2026-08-03_COMPLETE`**

Merged: 15 PRs, all present. Deployed: `2813c78b` @ `5722693900`, success.
Applied: 3 of 6 train migrations. Unapplied: 12 repo migrations. Drift: 4
production migrations absent from `main`. Owner gates open: 9. No segment above
`LIMITED PILOT`. Production untouched by this audit.
