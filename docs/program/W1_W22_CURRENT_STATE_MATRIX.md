# W1–W22 CURRENT STATE MATRIX (recounted 2026-08-06, main `4f61a22b`)

Verdict: `W1_W22_PROGRAM_RECOUNTED_READY_FOR_NEXT_INCOMPLETE_W`

Read-only recount per the owner directive 2026-08-06 §10, verified against
CURRENT main (every headline claim spot-checked in code/migrations/ledger —
NOT copied from the 2026-08-03 baseline, which is 3 days and ~14 merges
stale). Canonical prior sources: `docs/audits/premium-rebuild-live-state.md`
(stage ledger), `docs/audits/post-merge-production-readiness-baseline-2026-08-03.md`
§6 (full table). The M-P0-1…M-P0-8 multi-org train
(`docs/architecture/MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md`) is a SUCCESSOR
programme that closed several W blockers — credited per-W below.

Classifications: `DONE` | `PARTIAL` | `SUPERSEDED` | `REMAINING` |
`OWNER_GATED` | `NOT_LAUNCH_CRITICAL` | `DEFERRED_LONG_TERM`.

## Cross-cutting blockers (gate several W rows at once)

1. **`PROD_QA_*` accounts unprovisioned** (`docs/audits/evidence/premium-rebuild/prod-qa-account.md`)
   → NO authenticated production proof exists for ANY role. One owner
   decision unblocks the production-proof half of W6/W7/W8/W11/W12.
2. **`booking_requests` = 0 rows in prod** — the marketplace loop has never
   closed once with a real user.
3. **`usage_cost_events` production-ahead-of-main drift** — Supabase Preview
   CI red; `docs/audits/usage-cost-migration-drift-inventory-2026-08-03.md`.
4. **Ledger "Deferred" list stale** — still lists `20260714210000_company_memberships_v1`
   although the applied successor (`20260806090000`) exists.

## The matrix

| W | Purpose | State (verified) | Merged PRs | Prod schema | Proof | Exact remaining gaps | Class | Pre-pilot? | Next executable slice |
|---|---|---|---|---|---|---|---|---|---|
| W1 | Product/UI audit + landing repair + journal→capability loop | Complete; evidence dir with 4 browser PNGs | premium-rebuild integration | none | browser ✔ | none | **DONE** | no | — |
| W2 | Design tokens + shell | Ledger says complete; superseded in practice by visual system S1–S3 (`visual-contract-v1.md`). `ResultShell.tsx` + skeleton primitive NOW exist (closing two 08-03 baseline findings) | #996 #997 #999 #1000 #1005 | none | S2/S3 evidence | 16 distinct `*card.tsx`; 4 player-card variants + 2 rings; 2 empty-state components for ~70 routes (ratchet-guarded) | **PARTIAL + NOT_LAUNCH_CRITICAL** | no | ratchet `card-border` count DOWN via `visual-contract-v1.test.ts` |
| W3 | Chat-first workspace consolidation | Complete, FROZEN; `dashboard/advanced` = 0 files on main; −7,487 LOC | (pre-#968 train) | none | browser ✔ + deploy | none | **DONE** | no | — |
| W4 | Professional identity (Player Card) | Complete, FROZEN at `426e87aa` | (W4 train) | none | browser ✔ | 9 owner-gated items (`w4-acceptance.md` §4) | **DONE + OWNER_GATED remainder** | no | owner reviews the 9-item list |
| W5 | Journal / evidence / skills | Complete-frozen at `7621acab` with carried gaps | #968–#971 | none | browser ✔ | clarify-flow is a write-only sink; `candidate_skills` write path unaudited; obsolete `journal.visibility_scope`; Draft #867 unmerged; prod has only 2 verified skills | **PARTIAL (frozen ⇒ DEFERRED_LONG_TERM)** | no | close the clarify-flow sink (2 files, no migration) |
| W6 | Trust / experience domain | **Schema ACTIVE in prod** (applied 2026-08-04, ledger 173→174); `experiences` result = `real`; local full cycle proven. **Author/subject slice CODE COMPLETE 2026-08-06**: org-scoped bookings resolve organization subjects, `author_side` model added, moderation queue names subject+author side; DB proof 35/35 + v1 regression 43/43 + rollback cycle + browser 9/9 (`docs/human-gates/experience-author-subject-v1-gate.md`) | #972–#974 #977 #1008 + author/subject PR #1037 | `20260802120000` APPLIED; `20260806230000` **APPLIED 2026-08-06 13:56 UTC (W6-D1), ledger 184→185, version `20260806135649`** | local ✔ / prod write **pending PROD_QA execution (approved)** | production write proof via the approved PROD_QA journey | **SCHEMA COMPLETE + APPLIED — write proof in flight** | no | run the approved PROD_QA journey |
| W7 | Employee journey | ~76%; zero P0; P1-1/#981, P1-2/#979 closed; **P1-4 inventory DONE**; **W7-S1 SHIPPED**; **W7-S3 SHIPPED**; **W7-S2 SHIPPED** | #979 #981 #1051 #1052 #1053 | none own | local journey ✔ (83 shots) + profile inventory (`docs/audits/W7_PROFILE_FULL_INVENTORY.md`) + W7-S1 before/after (`W7_S1_PROFILE_HUB_OVERVIEW.md`) + W7-S3 six DOM fingerprints, zero product-visible differences (`W7_S3_PROFILE_READ_WATERFALL.md`) + **W7-S2 19/19 keyboard+persistence checks at 1440 and 375, ARIA-tree scan** (`W7_S2_PROFILE_ACCESSIBILITY.md`) | **W7-S1 DONE** — five duplicate readiness summaries → ONE `ProfileHubOverview`; height −13.6…−19.0% desktop / −14.3…−19.1% mobile; overview moved 4th block→1st. **W7-S3 DONE** — read waterfall 43→9 serial stages, 17→5 sequential DB round trips; behaviour-identical (fingerprint-proven); local timing INCONCLUSIVE and stated as such. **W7-S2 DONE** — `worker-availability-prefs-form` sub-44px 36→0, tabbable radios per group 3→1 with Arrow/Home/End, selection no longer colour-only; page-wide sub-44px 71→35. CORRECTION: the audit's "34 unlabelled inputs" counted `input[type=hidden]`; the honest page-wide figure is **2**, neither in that form. PROFILE simplicity 1.0→1.86→**2.14** (still NEEDS_POLISH, not PASS). REMAINING: W7-S4 two misplaced sections; W7-S5 non-worker identity copy; A-1 two unlabelled inputs (external-profile URL, CV file); A-2 ~34 sub-44px targets across ~12 other components; A-3 v1/v2 first-vs-third-person copy mismatch; P1-3 conversation memory (SQL still in `docs/proposals/`); P2-1 open-ended bookings skip the overlap guard | **PARTIAL** | **yes** | W7-S4 — move `#managed-companies` → `/dashboard/company` and `MessageButton` → `/dashboard/communication` (pure moves, no migration); fold in A-1 if convenient |
| W8 | Employer journey / chat workspace | Was 20%; **materially advanced**: #1006 gave the chat a real `candidates` result + callers; #1007 made assign-worker reachable; #1027/#1032 fixed non-owner members' `company-not-owned`; org demand spine APPLIED | #978 #1006 #1007 #1017 #1027 #1031 #1032 #1033 | via M-P0-6 `20260806200000` APPLIED | local ✔ | `/dashboard/candidates` naming/home; employer analytics v1 missing (W14-6); agency actions unscoped | **PARTIAL** | **yes** | employer analytics v1 org-scoped (W14-6) — unblocked by the applied demand spine |
| W9 | Organizations & teams | **Structurally closed by the M-P0 train**: ownership cap removed, memberships v1 + commands + authority widening + durable workspace + consumer slice ALL applied/merged; §5 16-assertion journey PASS (#1034) | #975 #980 #983 + #1019 #1021–#1024 #1026 #1027 #1032 #1034 | 5 M-P0 migrations APPLIED (see APPLIED_LEDGER) | local ✔ ×4 proofs / prod schema ✔ | remaining read-path `getOwnCompany()` (dashboard layout fallback, market-map — recorded ratchet); housekeeping: deferred-list entry for old `20260714210000` stale | **PARTIAL → near-DONE** | **yes** | migrate the two remaining read/render sites |
| W10 | Marketplace & matching | Was 45%; P0-1/#986, P0-2/#989, P0-3/#992, P1-1/#1001 (canonical demand truth) closed; P1-3 org scope UNBLOCKED (spine applied) | #986 #989 #992 #1001 #1033 | consumes `20260806200000` APPLIED | local ✔ (14/14 two-org proof) | match chips report profile completeness, not match facts (P1-2); dead geography (no coordinates/geocoder); **W10-7 symmetry guard not written** | **PARTIAL** | no | **W10-7 symmetry guard** (1 test file — highest leverage per the audit) |
| W11 | Project operating system | Was 25%; both schema blockers CLOSED (assigned-worker read + lifecycle APPLIED); `project` result = `real` (#1007) | #985 #988 #1002 #1007 | `20260803090000` + `20260804120000` APPLIED | local ✔ / prod: 5 projects all `draft` | operations page reachable only by deep link (F7); dismissed-manager rights must consume the applied membership authority; lifecycle never run by a real user | **PARTIAL** | **yes** | real entry point for the operations centre (F7, no migration) |
| W12 | Calendar & conflicts | Core guard APPLIED (row lock + advisory + EXCLUDE gist); 21/21 concurrency proof local; §5 journey proved the CROSS-COMPANY conflict live | #976 #982 #1003 | `20260802150000` APPLIED | local ✔ / prod race unexercised (0 bookings) | **9 calendar sources with NO model** (availability, shifts, vacation, sick, meetings, holidays, service-order TEXT dates, instruction due dates, travel) — each additive schema + UI, owner-gated | **PARTIAL** | **yes** (proof) | source #7: real date columns on `customer_requests` (only source with an existing model) |
| W13 | Notifications (name appears ONCE, in W8's audit) | **Scope never defined** — yet code exists: `lib/notifications/spine.ts` (8 signals), `notification-panel.tsx`; 2 signals blocked on deferred seen-marker migrations | — | 2 deferred migrations | hydration repro doc | the SCOPE itself | **REMAINING (undefined)** | no | write the W13 baseline FROM the existing spine code before any slice |
| W14 | Analytics & KPI | Was 25%; P0s closed; #1015 (11 mid-funnel events + cost writer + admin AI-cost view) + #1031 (org attribution seam) landed | #984 #987 #990 #991 #1015 #1031 | `ai_runs` APPLIED (0 rows, AI disabled); `usage_cost_events` APPLIED (drift item) | admin surfaces live | ~10 of 13 slices open; 5 charts with no host; no `dashboard_viewed` emitter; server rows hardcode `locale:"lt"`; **90-day `ai_runs` retention REQUIRED before enabling any AI provider** | **PARTIAL** | no | W14-6 employer analytics org-scoped (prereq #1031/#1033 landed) |
| W15 | — | **NO DEFINITION EXISTS** (independently re-grepped) | — | — | — | the scope itself | **REMAINING (undefined)** | no | define or drop the number |
| W16 | "Commercial" (one-line hint in W8's audit) | Superseded by **M-P0-7** + Stripe TEST v2 (#1030 merged; #1035 Draft owner-gated; #844 closed superseded) | #1014 #1030; Draft #1035 | `20260806220000` UNAPPLIED (owner gate) | unit/guard ✔ | apply the v2 schema (gate); TEST credentials (owner); **Stripe Live NOT AUTHORIZED** | **SUPERSEDED + OWNER_GATED** | no (test mode only) | owner: env package `docs/billing/STRIPE_TEST_ENV_OWNER_PACKAGE.md` |
| W17–W22 | — | **NO DEFINITION EXISTS** — the baseline itself says "an undefined stage cannot be planned against" | — | — | — | the scope itself | **REMAINING (undefined)** | no | define or drop the numbers |

## First genuinely incomplete W (launch-relevant, executable now)

**W6 — Trust / experience domain.** W1/W3 are done; W2 is guard-ratcheted
polish (not launch-critical); W4's remainder and W5 are frozen/owner-gated.
W6 is schema-active with a NAMED modelling defect (employer-subject
experiences stored as worker-subject) whose fix is pure code+gated-migration
work, plus a production write proof waiting only on the PROD_QA owner gate.
The sequential train (`SEQUENTIAL_W_EXECUTION_TRAIN.md`) therefore starts at
W6.
