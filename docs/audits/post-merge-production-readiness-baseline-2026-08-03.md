# POST-MERGE PRODUCTION READINESS BASELINE — 2026-08-03

> Read-only audit. No code changed, no commit created, no deploy, no merge, no
> migration applied. This document is the new release baseline and supersedes
> `docs/audits/premium-rebuild-live-state.md`, which is stale (it stops at "W6 OPEN").

**Audited artefacts**
- `origin/main` @ `2813c78bc44127be3642e78ef2e78ab13d9dfe33`
- Production Supabase project `gorgitwvdzxbnaxhrsrw` (read-only queries)
- Vercel production deployments via the GitHub deployments API
- Audit documents on unmerged branches `audit/w10-…`, `audit/w11-…`, `audit/w14-…`,
  `audit/w7-…`, and the untracked W8 audit in `labourmarketai-w8-audit`

---

## STEP 1 — MAIN VERIFICATION

`origin/main` HEAD = **`2813c78b`** ("W10 Slice 3 — staged retrieval…", #992, merged 2026-08-03T07:46Z).

The local checkout at `C:\Users\Mano\Documents\labourmarketai` is on `main` at `6e50df3f`
— **21 commits behind `origin/main`**. Every statement below is about `origin/main`.

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

Also merged in the same train, not on the requested list:
- **#978** `578eb3e2` — W8 Slice 1 (employer organization context truth)
- **#988** `6433b1a3` — W11 assigned-worker project read (**carries an UNAPPLIED migration**)
- **#990** `0849d609` — W14 cross-tenant P0 (company demand intelligence owner scope)
- **#983** `c1b647b5`, **#991** `edb3a0fb` — docs-only migration-ledger records

### Two naming facts that matter

1. **W7 has no "Slice 1".** The audit's P0 list is empty; what shipped is slice 2
   (photo evidence, P1-2) and slice 3 (deep-link query preservation, P1-1).
   Nothing is missing — the numbering simply starts at 2.
2. **W10 Slice 2 = PR #989**, whose commit subject is `fix(w10): fit outranks
   profile-touch recency…` rather than a "slice 2" label. It is the correct slice.

---

## STEP 2 — PRODUCTION STATE (four separate columns, never mixed)

### A. Merged in code (`origin/main`)

All 15 train PRs above. CI on HEAD: `quality` **success**, CodeQL **success**,
`Supabase Preview` **FAILURE** (see the drift finding in D).

### B. Deployed to production

Vercel production deployment **`5722693900`** for sha `2813c78b`, state **success**,
2026-08-03T07:49:54Z. Production is running main HEAD.

Every train commit produced a successful production deployment (`5721784597` @ `6433b1a3`,
`5722054767` @ `edb3a0fb`, `5722693900` @ `2813c78b`).

**Caveat that limits every "deployed" claim below:** there is still no provisioned
`PROD_QA_*` account (`docs/audits/evidence/premium-rebuild/prod-qa-account.md`,
`PROVISIONED: NO`). **No authenticated production proof exists for any role.** All
authenticated acceptance in this train is local-stack + browser-proof evidence.

### C. Production migration applied

Verified directly against `supabase_migrations.schema_migrations` and against live
schema objects.

**Applied in this train:**

| Migration | Applied | Verified live |
|---|---|---|
| `20260802160000_org_membership_revocation_v1` | 2026-08-02 19:35 | yes |
| `20260802170000_organization_rls_hardening_v1` | 2026-08-02 19:38 | `organizations_select` = `owner_profile_id = auth.uid() OR belongs_to_organization(id) OR is_admin()` — the `using (true)` P0 is **CLOSED in production** |
| `20260714150000_ai_runs_audit_v1` | 2026-08-03 06:19 | `ai_runs` table exists, 27 columns, **0 rows** |

**Merged in code but NOT applied to production (3, from this train):**

| Migration | Slice | Production evidence of absence |
|---|---|---|
| `20260802120000_experience_records_v1` | W6 Slice 3 | no `experience_records` / `experience_responses` table |
| `20260802150000_booking_atomic_double_booking_v1` | W12 Slice 1 | `booking_requests` has **no exclusion constraint** |
| `20260803090000_project_assigned_worker_read_v1` | W11 (#988) | no `is_assigned_to_project()` function; `projects_select` still reads `owns_company(company_id) OR is_admin() OR (status='live' AND auth.uid() IS NOT NULL)` |

**Older migrations on main that were never applied (9, pre-dating this train):**
`agency_clients_v1`, `company_locations_v1`, `company_memberships_v1`,
`dashboard_preferences_v1`, `demand_interest_seen_v1`, `journal_profession_templates_v1`,
`multi_source_talent_v1`, `open_markets_countries_draft_v1`, `worker_opportunity_seen_v1`.

**Total unapplied repo migrations: 12.**

### D. NEW FINDING — production schema is ahead of `main` (drift, P1)

Four migrations are **applied in production but their files do not exist on `main`**:

```
20260728114008  usage_cost_events_v1
20260728114254  usage_cost_events_v1_reapply
20260728114301  usage_cost_events_truncate_guard_v1
20260728114353  usage_cost_events_v1_clean_start
```

The `usage_cost_events` table is live in production (20 columns, 0 rows). Its migration
files live only on the unmerged branch `feat/canonical-usage-cost-event-model-v1`
(**Draft PR #898**, `466062be` — confirmed *not* an ancestor of `origin/main`).

This is exactly what the red `Supabase Preview` check on main HEAD is reporting:
> `Remote migration versions not found in local migrations directory.`

**Consequence:** a `supabase db reset` / local-stack rebuild produces a schema that does
not match production, and the migration ratchet's baselines are computed against a tree
that is missing four applied objects. This is a standing red check on `main`, not a
transient failure.

### E. Owner gates still open

| # | Gate | Blast radius |
|---|---|---|
| 1 | Apply `experience_records_v1` (W6) | new tables, SECURITY DEFINER RPCs, GRANT/REVOKE |
| 2 | Apply `booking_atomic_double_booking_v1` (W12) | EXCLUDE constraint on live bookings |
| 3 | Apply `project_assigned_worker_read_v1` (W11 #988) | replaces `projects_select` policy |
| 4 | Merge/apply the `usage_cost_events` chain (#898) or roll it back in prod | resolves the D drift |
| 5 | Assistant transcript persistence (W7 P1-3) — SQL sits in `docs/proposals/`, not in `supabase/migrations/` | conversation memory |
| 6 | Nine W4 owner-gated items (`w4-acceptance.md` §4) | unchanged |
| 7 | Provision `PROD_QA_*` | unblocks *all* authenticated production proof |
| 8 | Billing / commercial (PRs #893–#898, #844, #883, #879) | payment activation — hard stop |
| 9 | Three W6 slice-3 decisions (architecture / merge / apply) — decisions 1 and 2 are now moot (merged); **decision 3 remains** | production schema |

---

## STEP 3 — PRODUCT STATUS, W1 → W22

### First, an honesty finding about the W numbering

Three incompatible "W" schemes exist in this repository:

1. **`docs/audits/labourmarketai-premium-rebuild-execution-plan.md`** — W1…W11, an
   older scheme (its "W8" is Calendar, its "W9" is Login).
2. **`docs/plans/labourmarketai-real-user-workflow-rebuild-plan-v1.md`** — W1…W4 "waves".
3. **The scheme actually being executed** — W1–W6 from `premium-rebuild-live-state.md`,
   then W7–W14 from the 2026-08-02/03 domain audits.

The W11 audit states this explicitly and refuses to invent dependencies:
> "**W13 / W14 — Undefined in this repository.** … I cannot state W13/W14 dependencies
> without inventing them."

W14 was defined after that sentence was written (an `audit/w14-analytics-kpi` branch and
three merged PRs exist). **W13 and W15–W22 have no definition, no audit, no branch and
no slice anywhere in the repo or in production.** The only external hints are one line in
the unmerged W8 audit naming *"W13 Notifications"* and *"W16 Commercial"*. The
`feat/cc/w13-business-profile` branch belongs to the older **Wagon** numbering
(Wagon 10–13, PRs #823–#826) and is **not** this programme's W13.

I will not fabricate scope for W15–W22. They are listed as `NOT_STARTED` **and undefined**.

### The per-W table

| W | Domain | Status | % | Main achievements | Remaining blockers | Next recommended slice |
|---|---|---|---|---|---|---|
| **W1** | Product + UI audit, landing repair, journal→capability loop | `COMPLETE` | 100 | Loop exists end-to-end; landing repaired | none | — |
| **W2** | Design tokens + shell | `COMPLETE` | 100 | Closed with W1 in the stage ledger | none tracked | — |
| **W3** | Chat-first workspace consolidation | `COMPLETE` | 100 | `/dashboard/advanced` **deleted** (verified: 0 files); −7,487 LOC; deploy `5703264161`; FROZEN | none | — |
| **W4** | Professional identity | `COMPLETE` | 100 | Certificates + org-identity write paths; ONE display-name rule; deploy `5703997684`; FROZEN | 9 owner-gated items (documented, not blocking) | — |
| **W5** | Journal / evidence / skills | `COMPLETE` | 100 | Dead-surface deletion, voice handoff into chat, evidence drill-down; FROZEN | none | — |
| **W6** | Trust | `COMPLETE_BUT_PENDING_PRODUCTION_MIGRATION` | 90 | ONE `EvidenceTier` module + one lexicon ×12 locales; `computeConfidence` containment (self-logged capped at 15, below the 30 substantiation line); experience domain on `?result=experiences` with **no new route**; fraud gates advisory-only; 43/43 SQL proof | `experience_records_v1` **unapplied** → the whole subjective domain is dark in production and fails closed | Owner decision 3: apply the migration |
| **W7** | Employee journey | `PARTIALLY_COMPLETE` | 55 | Audit found **zero P0**; photo evidence reachable from chat with client-side downscale (P1-2); `?next=` now preserves the query string (P1-1) | P1-3 conversation memory (**owner gate**, SQL not even in `supabase/migrations/`); P1-4 `/dashboard/profile` is 1007 lines / ~25 sections — a de-facto second worker hub; P2-1 open-ended bookings skip the overlap guard | Measure `/dashboard/profile` at 375 px and produce the section inventory before touching it |
| **W8** | Employer journey | `PARTIALLY_COMPLETE` | 20 | P0-1 closed: the active organization is no longer decorative | **8 of 9 employer executors are unreachable from the chat**; the employer chat has **no result surface**; `runFindWorkers` stops at the workspace boundary; `/dashboard/candidates` is not candidates; no employer analytics | W8-2/W8-3: give the employer a result surface and wire the executors (the result-registry conflict with W6 is now resolved — #974 is merged) |
| **W9** | Organizations & teams | `PARTIALLY_COMPLETE` | 60 | **Both migrations APPLIED to production**; membership revocation real; `organizations using (true)` P0 **closed in prod** | Org-scoped demand spine missing (`customer_requests` has no organization column); manager permissions incomplete; `companies.profile_id` UNIQUE still caps multi-org | Add `organization_id` to the demand spine (migration, owner-gated) — it unblocks W8, W10 P1-3 and W14-7 at once |
| **W10** | Marketplace & matching | `PARTIALLY_COMPLETE` | 45 | P0-1 board now matches the *real* structured need (was rendering requirements it never evaluated); P0-2 fit outranks profile-touch recency (activity could previously beat competence on every demand); P0-3 staged retrieval replaces newest-200; **no migrations** — all three deployed | P1-1 map and board read two different demand tables; P1-2 "match signals" report profile completeness, not match facts; P1-3 org scope `BLOCKED_BY_W9_SCHEMA`; dead geography (no coordinate column, no geocoder) | Slice 7 — the symmetry guard (one fixture through both subject *and* need builders). The audit calls it "the single highest-leverage test in the domain"; it would have caught P0-1 at write time |
| **W11** | Project operating system | `PARTIALLY_COMPLETE` | 25 | Slice 0 shipped: four results falsely marked `real` suppressed their own fallback — now `unverified` with a working route out; a `strong_irreversible` action no longer points at a 404; viewer-scoped "actual cost" is labelled as such; #988 written and merged | **#988 migration unapplied** → an assigned worker still cannot read their own project, and project↔booking conflict detection can never fire; P0-1 (dismissed manager keeps rights) `BLOCKED_BY_W9`; P0-3 needed W9 applied — **that prerequisite is now met**; CLOSE lifecycle missing entirely | Apply #988, then Slice 3 (`manages_organization` on `projects_select`) — its hard prerequisite is now satisfied |
| **W12** | Calendar & conflicts | `PARTIALLY_COMPLETE` | 40 | Slice 1: atomic double-booking prevention (row + advisory lock, EXCLUDE gist); Slice 3: a source filter can no longer hide a real conflict | **Slice 1 migration unapplied** → production still has no DB-level double-booking guard; worker project bands empty until W11 #988 lands | Apply the W12 migration — it is the only thing between the code and a real safety guarantee |
| **W13** | *Undefined* (named "Notifications" once, in an unmerged audit) | `NOT_STARTED` | 0 | none | no audit, no baseline, no scope | Write the W13 baseline before any slice |
| **W14** | Analytics & KPI | `PARTIALLY_COMPLETE` | 25 | W14-1 fabricated landing "confidence" percentage removed; W14-2/#987 AI-cost persistence result no longer silently discarded; **cross-tenant P0-3 closed** — a company surface was receiving the platform-wide aggregate for admin viewers | 10 of 13 planned slices open; 5 charts still have no host; `dashboard_viewed` has no emitter; `/for-workers` still renders the OVR rating ring | **W14-11 is now unblocked** — `ai_runs` is applied, so the first cost-by-model/by-feature reader can be built (the table has 0 rows today) |
| **W15–W22** | *Undefined* | `NOT_STARTED` | 0 | none | **No scope exists in the repository.** W16 is hinted as "Commercial" and has open draft PRs (#893–#898, #844) but no W-stage baseline | Define them, or drop the numbering — an undefined stage cannot be planned against |

---

## STEP 4 — CUSTOMER READINESS

Grounding facts, read live from production on 2026-08-03:

| Object | Rows |
|---|---|
| profiles | 32 (26 worker · 4 company · 2 null) |
| workers | 32 |
| organizations | 10 (7 company · 3 agency) |
| journal entries | 36 |
| journal confirmations | 12 |
| verified worker skills | **2** |
| customer requests (demand) | 17 |
| service offerings | 2 |
| projects | 5 |
| **booking requests** | **0** |
| ai_runs / usage_cost_events | 0 / 0 |

**The single most important fact in this report: `booking_requests` is empty. The
marketplace loop — discover → request → accept → work → confirm — has never completed
once in production.** Everything downstream of "accept" is unexercised by real users.

| Segment | Rating | Why |
|---|---|---|
| **Workers** | `LIMITED PILOT` | The strongest journey. The W7 audit found **no P0**. Journal → evidence → confirmation is real and has real production rows (36 entries, 12 confirmations). Photo evidence now reaches the chat and phone-sized photos are downscaled instead of refused. Against that: only 2 verified skills exist platform-wide, conversation memory is owner-gated, `/dashboard/profile` is a 1007-line scroll on a phone, and **no authenticated production proof exists for the worker journey** (no `PROD_QA_*`). Suitable for hand-held pilots, not for unassisted signup at scale. |
| **Employers** | `NOT READY` | Three independent blockers. (1) **Zero completed bookings ever** — the buy-side action the product exists for has never succeeded in production. (2) The employer's declared primary surface is the chat, and **8 of 9 employer executors are unreachable from it**; the employer chat has no result surface at all. (3) A cross-tenant read (admin viewers receiving the platform aggregate on a *company* surface) was only closed on 2026-08-02 (#990). Candidate discovery ranking was also only corrected in this same train. |
| **Organizations** | `NOT READY` | The security spine is now real and **applied in production** (membership revocation; `organizations using (true)` closed). The product spine is not: `customer_requests` has no organization column, so a co-manager sees only their own demand, never their organization's; `projects_select` has no `manages_organization` branch, so the operations centre is unreachable by people the DB already trusts to write to it; a dismissed manager still keeps project rights (W11 P0-1). `companies.profile_id` remains UNIQUE, capping one company per profile. |
| **Schools** | `NOT READY` | **Not modelled at all.** Roles are `worker \| company \| agency \| customer`; organization types are `company \| agency`. No school entity, no education-institution flow, no data. Nothing to pilot. |
| **Universities** | `NOT READY` | Same as Schools — no entity, no role, no surface, no data. `worker_education_achievements_v1` records a *worker's* education; it does not model an institution as a customer. |
| **Recruiters / agencies** | `LIMITED PILOT` | The best-supported non-worker segment: the `agency` role exists, the agency↔client bridge shipped and was production-smoke-verified, and production holds 3 agency organizations and 3 `staffing_agency` companies. It hits the same ceiling as employers — 0 bookings, and the agency's own candidate CRM is still an owner-gated draft (#858). |

**No segment is `PILOT READY` or `PRODUCTION READY`.** The blocker is common to all of
them and is not a code blocker: no authenticated production acceptance has ever been run,
because `PROD_QA_*` is unprovisioned.

---

## STEP 5 — VISUAL / UX AUDIT (current `origin/main`)

| Symptom | Current state | Evidence |
|---|---|---|
| **Duplicate profile hubs** | **PARTIALLY RESOLVED.** `/dashboard/advanced` is genuinely deleted (0 files match). But `/dashboard/profile` is **1007 lines mounting ~25 sections** — the setup journey, live profile, hub overview, trust block, availability, languages, education, achievements, external profiles, capabilities and skill clarification on one scroll — and `/dashboard/account` sits beside it. It is not a parallel *navigation* system (it is correctly in `PANEL_PREFIXES`), but it is a de-facto second worker hub. W7 P1-4, open. | `app/[locale]/dashboard/profile/page.tsx` |
| **Dashboard-first UX** | **RESOLVED.** `/dashboard` root renders `ConversationChat` and nothing else; the layout renders **no** wide chrome on that route (DOM absent, not painted over). The chat supplies its own header and 5-item bottom nav. | `app/[locale]/dashboard/page.tsx:20-28` |
| **Missing "Mano erdvė"** | **RESOLVED BY REMOVAL, not by restoration.** MyZone no longer exists as a place. Its actions survive as `BASE_ACTIONS` in `dashboard-module-registry.ts` ("the former MyZone fast actions") and its i18n keys `auth.dashboard.myZone.actions.*` are still the single copy source. If "Mano erdvė" is still wanted as a *named destination*, it is genuinely gone and that is a product decision, not a regression. | `lib/dashboard/dashboard-module-registry.ts:146-207` |
| **Inconsistent cards** | **STILL INCONSISTENT.** 16 distinct `*card.tsx` components across `components/app`, `components/ui`, `components/visual`, `components/intelligence`. `action-card.tsx` declares itself derived from "the owner-approved MyZone grid card, the product's reference action" — i.e. one component claims canonical status while 15 others exist beside it. | `components/**/*card.tsx` |
| **Player card inconsistency** | **STILL INCONSISTENT, and one instance is rating-shaped.** Four player-card components (`player-card.tsx`, `worker-player-card.tsx`, `workspace/player-card-result.tsx`, `marketing/player-card-showcase.tsx`) plus two rings (`ovr-ring.tsx`, `readiness-ring.tsx`). **`/for-workers` — a public marketing page — imports `PlayerCard`, which imports `OVRRing`**: the last rating-shaped artefact a visitor can reach, and a direct tension with the §19 "fit, not rating" doctrine. W14-13, open. Consolidating these is explicitly forbidden without care — risk R3 says that operation caused the A-13 chart loss. | `app/[locale]/(marketing)/for-workers/page.tsx:17` → `components/app/player-card.tsx:19` |
| **Empty state inconsistency** | **STILL INCONSISTENT.** Exactly two empty-state components (`empty-state.tsx`, `team-roster-empty-state.tsx`) serve **70** authenticated dashboard routes. Everything else rolls its own. | `components/app/empty-state.tsx` |
| **Loading inconsistency** | **STILL INCONSISTENT.** Only 2 route-level `loading.tsx` files (`/cv`, `/dashboard`) and 7 files using `animate-pulse` across the entire app. There is no skeleton primitive. | `apps/web/**` |
| **"ResultShell" inconsistency** | **The premise needs correcting: no component named `ResultShell` exists.** The canonical primitive is `components/app/workspace/result-body.tsx` (`InlineResult`). Its consistency is now **guarded and holding**: after W11 Slice 0, exactly 5 kinds are `dataReadiness: "real"` (`player-card`, `calendar`, `market`, `opportunities`, `experiences`) and `result-body.tsx` has exactly those 5 `case` arms; the other 4 (`journal`, `project`, `evidence`, `invoice`) are `unverified` and route to the real full screen via the fallback. **One residual over-claim:** `experiences` is marked `real` while `experience_records` does not exist in production. It fails closed honestly at runtime, but the readiness flag is not true today (W14 P2-7). | `lib/conversation/result-registry.ts`, `components/app/workspace/result-body.tsx` |

**Net:** the *architectural* UX defects (second dashboard, dashboard-first entry,
lying result readiness) are closed. The *systemic* consistency defects (cards, player
cards, empty states, loading states) are all still open and none of them has an owner.

---

## STEP 6 — PARALLEL WORK MAP

### Dependency graph

```
                    ┌───────────────────────────────────────────┐
                    │ OWNER GATE: apply 3 merged migrations     │
                    │  M1 experience_records_v1      (W6)       │
                    │  M2 booking_atomic_double_bkg  (W12)      │
                    │  M3 project_assigned_worker    (W11 #988)  │
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

  W9 org column on demand spine (NOT YET WRITTEN, owner-gated)
        ├──► W8 org-scoped demand
        ├──► W10 P1-3 org scope on matching
        └──► W14-7 org scope on analytics ──► W14-6 employer analytics

  #898 usage_cost_events (drift) ──► green `Supabase Preview` on main
```

### SAFE PARALLEL — start today, no migration, no owner gate, no cross-claim

| Item | W | Files | Why safe |
|---|---|---|---|
| Symmetry guard: one fixture through both subject *and* need builders | W10-7 | 1 guard | Pure test. Highest leverage in the matching domain. |
| Match chips derive from `MatchResultV1`, not profile completeness | W10 P1-2 | 2 + guard | No overlap with W11/W14 files. |
| Retire dead geography (`distanceKm`, radius branch, 11 locale strings) | W10-6 | ~13 | Deleting unreachable code; no coordinate column exists to wire. |
| Chart render-path guard (5 charts have no host) | W14-2 | 1 guard | Guard-only. |
| Player-card a11y + zero state (`readiness-ring` aria-label is hard-coded English) | W14-4 | 2 + guard | Isolated to `components/app/player-card/**`. |
| Telemetry truth-up: emit `dashboard_viewed` or delete it | W14-8 | 3 | No conflict. |
| Telemetry window honesty + mobile `overflow-x-auto` | W14-9 | 3 | Cosmetic + honest. |
| Retire the OVR ring from `/for-workers` | W14-13 | 2 | Marketing tree only — does **not** touch `worker-player-card.tsx` (risk R3). |
| Chat demand-creation honesty (request id, real status, continuation chip) | W8 §9.3 | 3 | The W6 result-registry conflict is resolved (#974 merged). |
| Wire or delete the unused `ExecWorkspace` parameter | W8 §9.4 | 2 | Documents an unimplemented intent either way. |
| Re-home / rename `/dashboard/candidates` (it is not candidates) | W8 §9.5 | 2 | Naming only. |
| Measure `/dashboard/profile` (375 px pass + section inventory) | W7 P1-4 | 0 code | Read-only; the audit forbids a blind fix. |
| Resolve the `experiences` `dataReadiness: "real"` over-claim | W14 P2-7 | 1 | One flag; the runtime already fails closed. |

**Hard rule for this column:** `lib/conversation/result-registry.ts`,
`components/app/workspace/result-body.tsx`, `lib/planning/planning.ts`,
`docs/APPLIED_LEDGER.md` and `lib/supabase/types.ts` are **contested files**. Only one
parallel stream may hold each at a time.

### SAFE AFTER W — prerequisite already satisfied, sequence respected

| Item | Requires | Status of the requirement |
|---|---|---|
| **W11 Slice 3** — `manages_organization` on `projects_select`/`projects_update` | W9 revocation applied | **SATISFIED 2026-08-02.** This is the largest now-unblocked item. |
| **W14-11** — first AI cost reader (cost by model / by feature) | `ai_runs` applied | **SATISFIED 2026-08-03.** |
| W11 Slice 1 — project lifecycle write path (`set_project_status_v1`) | Slice 2 (#988) applied first, or `live` becomes readable by everyone | M3 pending |
| W12 project↔booking conflict detection | M2 **and** M3 | both pending |
| W14-6 employer analytics | W14-7 org scope | not started |
| W11 Slice 4 — project-scoped finance truth | Slice 3 | after W11-3 |

### BLOCKED

| Item | Blocked by | Type |
|---|---|---|
| W6 experience submission, moderation, dispute — the whole domain | M1 unapplied | owner gate |
| W12 DB-level double-booking guarantee | M2 unapplied | owner gate |
| W11 assigned-worker project read; empty worker project bands | M3 unapplied | owner gate |
| W7 P1-3 conversation memory | SQL is in `docs/proposals/`, not `supabase/migrations/` | owner gate + a missing file |
| W8 org-scoped demand, W10 P1-3, W14-7 | `customer_requests` has no organization column | schema, owner gate |
| W11 P0-1 dismissed-manager rights | W9 org-scoped project rights | W-dependency |
| Green `Supabase Preview` on main | 4 prod migrations absent from main (#898) | owner decision: merge or roll back |
| All authenticated production acceptance, every segment | `PROD_QA_*` unprovisioned | owner action |
| W16 commercial / billing (#893–#898, #844, #883, #879) | payment activation | hard stop |
| W13, W15, W17–W22 | no scope exists | needs a definition |

---

## STEP 7 — NEXT PRIORITIES, BY BUSINESS VALUE

Ordered by customer-facing value, not by ease.

**1. Prove the marketplace loop once, end-to-end, in production.**
`booking_requests` is empty. Every readiness claim, every matching improvement and every
trust signal in this train sits above a loop that has never closed for a real user. This
needs `PROD_QA_*` provisioned (owner) and one hand-run of discover → request → accept →
log work → confirm. Until this exists, the honest answer to "is it ready" is unknowable
rather than "not yet". **Highest value in the report.**

**2. Apply the three merged migrations — M3 and M2 first.**
M3 (`project_assigned_worker_read`) and M2 (`booking_atomic_double_booking`) are not
features; together they are a **safety** defect. Today a worker assigned to a project
cannot see it, so their calendar shows nothing for those dates, so no conflict is raised
when they accept an overlapping booking — and the DB has no exclusion constraint to catch
it either. The platform will report a clean schedule for a double-booked person. M1
(experiences) is a feature and can follow.

**3. Give the employer a working chat surface (W8-2 / W8-3).**
8 of 9 employer executors are unreachable from the surface the product declares primary,
and the employer chat has no result panel at all. This is the reason employers cannot
self-serve, and the file conflict that was deferring it (#974) is resolved. This converts
Employers from `NOT READY` toward a real pilot.

**4. Add `organization_id` to the demand spine (one migration, owner-gated).**
It is the single change that unblocks three different W stages at once: W8 org-scoped
demand, W10 P1-3, W14-7 → W14-6. Today a legitimate co-manager sees only their own
requests, never their organization's.

**5. W11 Slice 3 — `manages_organization` on `projects_select`.**
Its hard prerequisite (W9 applied) was satisfied yesterday. It makes the operations
centre reachable by the people the database already trusts to write to it.

**6. Resolve the production↔repo drift (#898).**
`main` carries a red `Supabase Preview` check and any local rebuild produces the wrong
schema. Either merge the `usage_cost_events` chain or roll it back in production. This is
maintenance, but it silently corrupts every future migration-safety judgement.

**7. W10-7 symmetry guard.**
Cheapest high-value item on the list: one guard test that would have caught W10 P0-1 at
write time, and prevents the demand and supply sides drifting apart again.

**8. Systemic UX consistency: empty states, loading states, cards.**
2 empty-state components and 2 loading files for 70 routes. This is the visible quality
gap a pilot customer will feel first, and nobody currently owns it.

**Deliberately NOT recommended next:** consolidating the four player-card components
(risk R3 — that exact operation caused the A-13 chart loss), and anything under W13 or
W15–W22 until those stages are actually defined.

---

## DOCUMENTATION CORRECTIONS REQUIRED (not applied — no commit was created)

1. `docs/audits/premium-rebuild-live-state.md` — states "_Last updated: 2026-08-01 (W4
   closed)_", lists W6 as **OPEN** and production SHA as `7621acab`. Reality: W6 slices
   1–4 merged, W7–W14 executed, production SHA `2813c78b`. **The file is 8 stages stale
   and is the document continuation sessions are told to read first.**
2. The W7, W10, W11 and W14 audit documents exist **only on unmerged branches**
   (`audit/w7-employee-journey`, `audit/w10-marketplace-matching`,
   `audit/w11-project-operating-system`, `audit/w14-analytics-kpi`). PR #992 cites
   `docs/audits/w10-marketplace-matching-audit.md` as if it were on main; it is not.
   The W8 audit exists only as an **untracked file** in a worktree.
3. There is no `w7`–`w14` baseline in `docs/audits/evidence/premium-rebuild/`; the
   baseline series stops at `w6-baseline.md`.

These are documentation errors of fact. Correcting them requires commits, which this
audit was instructed not to create.

---

**Verdict: `POST_MERGE_PRODUCTION_READINESS_BASELINE_2026-08-03_COMPLETE`**

Merged: 15 PRs, all present. Deployed: yes, `2813c78b` @ `5722693900` success.
Applied: 3 of 6 train migrations. Unapplied: 12 repo migrations. Drift: 4 production
migrations absent from main. Owner gates open: 9. No segment above `LIMITED PILOT`.
