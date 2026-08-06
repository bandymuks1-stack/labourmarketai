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
| W6 | Trust / experience domain | **Schema ACTIVE in prod** (`20260802120000` + `20260806230000` applied) AND **surface SHIPPED on main** (`?result=experiences` real + rendered, submit/moderation/response/dispute wired, /dashboard/admin band) — the 2026-08-06 'no shipped surface' claim was a stale-tree audit artifact, reconciled in docs/audits/W6_EXPERIENCE_SURFACE_CURRENT_TRUTH.md | #972–#974 #977 #1008 #1037 #1042 #1048 | `20260802120000` + `20260806230000` APPLIED | local ✔ (35/35 + 43/43) / prod write **pending — READY** (retained booking `88a43ead` is the eligible interaction) | production QA write proof: person→org + org→worker submissions, operator moderation clicks, response, count-only render | **PARTIAL — schema + surface DONE, prod write proof pending** | **yes** | run the §8 W6 production proof with the retained cast |
| W7 | Employee journey | ~55% + **production journey PROVEN with synthetic QA** (availability edit, discoverability consent, interest, booking accept, roster invite→accept — evidence in #1042) | #979 #981 #1042 | none own | local ✔ + **prod journey ✔** | P1-3 conversation memory; P1-4 profile 1007 lines; P2-1 open-ended bookings skip the overlap guard | **PARTIAL** | **yes** | measure profile at 375px + section inventory (audit-first) |
| W8 | Employer journey / chat workspace | Materially advanced + **production journey PROVEN for the shipped employer path** (demand submit, scouting, shortlist-gated contact, booking proposal — #1042) | #978 #1006 #1007 #1017 #1027 #1031 #1032 #1033 #1042 | via M-P0-6 APPLIED | local ✔ + **prod journey ✔** | `/dashboard/candidates` naming/home; employer analytics v1 missing (W14-6); agency actions unscoped; worker-board fan-out fix owner-gated (#1046) | **PARTIAL** | **yes** | employer analytics v1 org-scoped (W14-6) |
| W9 | Organizations & teams | **Structurally closed by the M-P0 train**: ownership cap removed, memberships v1 + commands + authority widening + durable workspace + consumer slice ALL applied/merged; §5 16-assertion journey PASS (#1034) | #975 #980 #983 + #1019 #1021–#1024 #1026 #1027 #1032 #1034 | 5 M-P0 migrations APPLIED (see APPLIED_LEDGER) | local ✔ ×4 proofs / prod schema ✔ | remaining read-path `getOwnCompany()` (dashboard layout fallback, market-map — recorded ratchet); housekeeping: deferred-list entry for old `20260714210000` stale | **PARTIAL → near-DONE** | **yes** | migrate the two remaining read/render sites |
| W10 | Marketplace & matching | Was 45%; P0-1/#986, P0-2/#989, P0-3/#992, P1-1/#1001 (canonical demand truth) closed; P1-3 org scope UNBLOCKED (spine applied) | #986 #989 #992 #1001 #1033 | consumes `20260806200000` APPLIED | local ✔ (14/14 two-org proof) | match chips report profile completeness, not match facts (P1-2); dead geography (no coordinates/geocoder); **W10-7 symmetry guard not written** | **PARTIAL** | no | **W10-7 symmetry guard** (1 test file — highest leverage per the audit) |
| W11 | Project operating system | Schema blockers CLOSED; **production PROVEN: project creation, worker assignment, assignment ENDING** (`end_worker_project_assignment`, #1042). **NO project-completion UI exists** — do not claim it | #985 #988 #1002 #1007 #1042 | `20260803090000` + `20260804120000` APPLIED | local ✔ + prod create/assign/end ✔ | operations page deep-link only (F7); project-completion + roster-engagement-end controls UNSHIPPED; lifecycle never fully run by a real user | **PARTIAL** | **yes** | real entry point for the operations centre (F7) + completion control |
| W12 | Calendar & conflicts | Core guard APPLIED; **production PROVEN: booking acceptance AND cross-company overlap REFUSAL live** (Gama booking stayed proposed — #1042). Engagement minting for multi-company owners returns honest `ambiguous_company` — NOT proven until #1047 applies and replay proves it | #976 #982 #1003 #1042 | `20260802150000` APPLIED | local 21/21 + **prod conflict ✔** | 9 calendar sources with NO model; engagement mint blocked for multi-company owners (owner-gated #1047) | **PARTIAL** | **yes** | source #7: real date columns on `customer_requests` |
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
