# W1–W22 CURRENT STATE MATRIX (updated 2026-08-07, main `779357aa` + PR #1048 `3115747a`)

Verdict: `W1_W22_MATRIX_UPDATED_NEXT_INCOMPLETE_W_IDENTIFIED`

Update of the 2026-08-06 recount after the **W6 production closure** and the
**PROD_QA multi-W production journey** (#1042). Every row marked
`re-verified 08-07` was checked against a PINNED worktree at `origin/main`
`779357aa` — never against the shared main tree, which a concurrent session
held at pre-W6 `6e50df3f` and which produced the false "W6 has no shipped
surface" report (root cause and correction:
`docs/audits/W6_EXPERIENCE_SURFACE_CURRENT_TRUTH.md`). Rows marked
`carried 08-06` are unchanged from the previous recount and were NOT
re-audited in this pass — they are not new claims.

Sources of truth used: production evidence (`prod-qa-multi-w-run/journey-log.json`,
production DB reads), merged/deployed code on `779357aa`, `docs/APPLIED_LEDGER.md`,
PR #1042 (production journey), PR #1048 (W6 reconciliation + write proof).

Classifications: `DONE` | `PARTIAL` | `SUPERSEDED` | `REMAINING` |
`OWNER_GATED` | `NOT_LAUNCH_CRITICAL` | `DEFERRED_LONG_TERM` |
`UNDEFINED_NEEDS_SCOPE`.

## What changed since the 2026-08-06 recount

1. **W6 CLOSED** — production write proof executed through the deployed
   surface. Row is `DONE`; it is no longer `PARTIAL`, no longer
   "production-proof-pending".
2. **W7 / W8 / W11 / W12 gained REAL production write proof** (#1042) with
   synthetic-but-real QA identities. These are production facts, not local
   proofs.
3. **One #1042 claim is REFUTED by this pass**: "NO project-completion
   control exists". A completion control **is** shipped and reachable —
   `LifecycleControls` in `apps/web/components/app/workspace/project-result.tsx:350`
   → `setProjectStatusAction` → `set_project_status_v1`
   (`supabase/migrations/20260804120000_project_lifecycle_v1.sql:132`),
   landed by #1007, present on `origin/main`. It was **not exercised** in the
   production journey. W11 is therefore limited by *missing production proof*,
   not by *missing UI* — a materially different gap. (Same defect class as the
   W6 stale-tree error: a "does not exist" claim made without a pinned tree.)
4. **Cross-cutting blocker #1 is PARTIALLY LIFTED**: PROD_QA accounts were
   provisioned and used. Authenticated production proof now exists for worker,
   employer-owner, manager and admin roles.
5. **Cross-cutting blocker #2 is LIFTED**: `booking_requests` is no longer 0 —
   the marketplace loop closed end-to-end in production (proposal → accept →
   cross-company conflict refusal).

## Cross-cutting blockers (current)

1. ~~`PROD_QA_*` accounts unprovisioned~~ — **LIFTED 2026-08-06/07.** Synthetic
   QA cast retained and revoke-ready (owner `f394ca7f…`, manager `dca5ed71…`,
   worker `c267dc8b…`).
2. ~~`booking_requests` = 0 rows in prod~~ — **LIFTED.** Booking `88a43ead`
   accepted; conflicting booking `435488f2` refused and left `proposed`.
3. **GitHub Actions unavailable account-wide** — every run since 2026-08-06
   ~18:00Z queues ~15 min then reports `failure` with a `cancelled` job and
   **zero steps** (verified: run `31127823769`, job `quality`, `steps: 0`).
   Nothing can merge under normal checks. Owner-only billing gate.
4. **`usage_cost_events` production-ahead-of-main drift** — Supabase Preview
   CI red; `docs/audits/usage-cost-migration-drift-inventory-2026-08-03.md`.
5. **Ledger "Deferred" list stale** — `20260714210000_company_memberships_v1`
   is superseded by the applied `20260806090000` under the same migration
   `name`; awaiting an owner decision to retire or rework.

## The matrix

| W | Purpose | State (verified) | Merged PRs | Prod schema | Proof | Exact remaining gaps | Class | Pre-pilot? | Next executable slice |
|---|---|---|---|---|---|---|---|---|---|
| W1 | Product/UI audit + landing repair + journal→capability loop | Complete; evidence dir with 4 browser PNGs *(carried 08-06)* | premium-rebuild integration | none | browser ✔ | none | **DONE** | no | — |
| W2 | Design tokens + shell | Ledger complete; superseded in practice by visual system S1–S3. `ResultShell.tsx` + skeleton primitive exist *(carried 08-06)* | #996 #997 #999 #1000 #1005 | none | S2/S3 evidence | 16 distinct `*card.tsx`; 4 player-card variants + 2 rings; 2 empty-state components for ~70 routes (ratchet-guarded) | **PARTIAL + NOT_LAUNCH_CRITICAL** | no | ratchet `card-border` count DOWN via `visual-contract-v1.test.ts` |
| W3 | Chat-first workspace consolidation | Complete, FROZEN; `dashboard/advanced` = 0 files on main; −7,487 LOC *(carried 08-06)* | (pre-#968 train) | none | browser ✔ + deploy | none | **DONE** | no | — |
| W4 | Professional identity (Player Card) | Complete, FROZEN at `426e87aa` *(carried 08-06)* | (W4 train) | none | browser ✔ | 9 owner-gated items (`w4-acceptance.md` §4) | **DONE + OWNER_GATED remainder** | no | owner reviews the 9-item list |
| W5 | Journal / evidence / skills | Complete-frozen at `7621acab` with carried gaps *(carried 08-06)* | #968–#971 | none | browser ✔ | clarify-flow is a write-only sink; `candidate_skills` write path unaudited; obsolete `journal.visibility_scope`; Draft #867 unmerged; prod has only 2 verified skills | **PARTIAL (frozen ⇒ DEFERRED_LONG_TERM)** | no | close the clarify-flow sink (2 files, no migration) — reopening W5 is an owner decision |
| **W6** | **Trust / experience domain (fit, not rating)** | **CLOSED — see the exact row below** *(re-verified 08-07)* | #972–#974 #977 #1008 #1037 #1048 | `20260802120000` + `20260806230000` APPLIED | **production write proof ✔** | none in scope | **DONE** | yes | — (W6 is closed; do not reopen) |
| W7 | Employee journey | `PRODUCTION_JOURNEY_PROVEN` — see the exact row below *(re-verified 08-07)* | #979 #981 #1042 | none own | local ✔ (83 shots) + **prod journey ✔** | P1-3 conversation memory (SQL still in `docs/proposals/`, never a migration); P1-4 `/dashboard/profile` **1007 lines** ≈25 sections; P2-1 open-ended bookings skip the overlap guard | **PARTIAL — journey proven, scope open** | **yes** | measure `/dashboard/profile` at 375px + section inventory (audit output only — a blind fix is forbidden) |
| W8 | Employer journey / chat workspace | `SHIPPED_EMPLOYER_PATH_PRODUCTION_PROVEN` — see the exact row below *(re-verified 08-07)* | #978 #1006 #1007 #1017 #1027 #1031 #1032 #1033 #1042 #1043 | M-P0-6 `20260806200000` + `20260807090000` APPLIED | local ✔ + **prod journey ✔** | `/dashboard/candidates` naming/home; employer analytics v1 missing (W14-6); agency actions unscoped; worker-board fan-out (#1046, owner-gated); **booking→engagement mint through the org bridge NOT proven (#1047)** | **PARTIAL — shipped employer path proven** | **yes** | employer analytics v1, org-scoped (W14-6) |
| W9 | Organizations & teams | Structurally closed by the M-P0 train; §5 16-assertion journey PASS (#1034); Finding-2 fresh-org owner membership applied + merged (#1043) *(carried 08-06, +#1043 08-07)* | #975 #980 #983 #1019 #1021–#1024 #1026 #1027 #1032 #1034 #1043 | 6 M-P0 migrations APPLIED | local ✔ ×4 / prod schema ✔ / **prod invite→accept ✔ (#1042)** | remaining read-path `getOwnCompany()` (dashboard layout fallback, market-map — recorded ratchet); stale deferred-list entry for `20260714210000` | **PARTIAL → near-DONE** | **yes** | migrate the two remaining read/render sites |
| W10 | Marketplace & matching | P0-1/#986, P0-2/#989, P0-3/#992, P1-1/#1001 closed; P1-3 org scope UNBLOCKED *(carried 08-06)* | #986 #989 #992 #1001 #1033 | consumes `20260806200000` APPLIED | local ✔ (14/14 two-org proof) | match chips report profile completeness, not match facts (P1-2); dead geography (no coordinates/geocoder); **W10-7 symmetry guard not written** | **PARTIAL** | no | **W10-7 symmetry guard** (1 test file — highest leverage per the audit) |
| W11 | Project operating system | Split truth — see the exact row below *(re-verified 08-07)* | #985 #988 #1002 #1007 #1042 | `20260803090000` + `20260804120000` APPLIED | local ✔ + **prod create/assign/end ✔**; completion **not exercised** | operations page reachable only by deep link (F7); **project completion control shipped + reachable but never run in production**; no roster-engagement-end control; dismissed-manager rights must consume the applied membership authority | **PARTIAL — PROJECT_ASSIGNMENT_PATH_PROVEN** | **yes** | operations-centre real entry point (F7, no migration), then exercise completion in the next PROD_QA leg |
| W12 | Calendar & conflicts | Split truth — see the exact row below *(re-verified 08-07)* | #976 #982 #1003 #1042 | `20260802150000` APPLIED | local 21/21 + **prod booking + prod conflict refusal ✔** | engagement mint through multi-company org resolution pending #1047; **9 calendar sources with NO model** (availability, shifts, vacation, sick, meetings, holidays, service-order TEXT dates, instruction due dates, travel) — each additive schema + UI, owner-gated | **PARTIAL — BOOKING_AND_CONFLICT_PROVEN_ENGAGEMENT_BRIDGE_GATE_PENDING** | **yes** | source #7: real date columns on `customer_requests` (only source with an existing model) |
| W13 | Notifications | Scope never written as a W baseline, but the implementation is NOT zero: `lib/notifications/spine-signals.ts` ships an **8-signal catalogue** (`pending-invitations`, `unread-messages`, `incoming-service-requests`, `service-request-responses`, `pending-bookings`, `booking-responses`, `open-task-attention`, `new-job-matches`) + `spine.ts` fetcher + `notification-panel.tsx` + nav badges; every signal is guard-pinned to a real clearing route *(re-verified 08-07)* | — | `20260706120000_booking_requests_seen` APPLIED; `20260714170000_worker_opportunity_seen_v1` + `20260717150000_demand_interest_seen_v1` **DEFERRED/UNAPPLIED** | guard `notification-spine.test.ts` + hydration repro doc | the SCOPE document; `new-job-matches` returns 0 until the seen-marker migration applies; the interest-response signal has no catalogue row at all (no seen model) | **UNDEFINED_NEEDS_SCOPE** — scoping act is "write the baseline FROM the shipped spine", not greenfield | no | write the W13 baseline from the 8-signal catalogue before any slice |
| W14 | Analytics & KPI | P0s closed; #1015 (11 mid-funnel events + cost writer + admin AI-cost view) + #1031 (org attribution seam) landed *(carried 08-06)* | #984 #987 #990 #991 #1015 #1031 | `ai_runs` APPLIED (0 rows, AI disabled); `usage_cost_events` APPLIED (drift item) | admin surfaces live | ~10 of 13 slices open; 5 charts with no host; no `dashboard_viewed` emitter; server rows hardcode `locale:"lt"`; **90-day `ai_runs` retention REQUIRED before enabling any AI provider** | **PARTIAL** | no | W14-6 employer analytics org-scoped |
| W15 | — | **NO DEFINITION EXISTS** — re-grepped 08-07: 3 hits, all of them this matrix and the two docs that say the number is undefined. Zero code, zero schema, zero hint | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP unless the owner claims the number) | no | owner defines or drops |
| W16 | "Commercial" | Superseded by **M-P0-7** + Stripe TEST v2 (#1030 merged, #1040 merged — schema ACTIVE in prod; #844 closed superseded). Full state in §Stripe below *(re-verified 08-07)* | #1014 #1030 #1040 | `20260806220000` applied via #1040 | unit/guard ✔ | TEST credentials (owner); **Stripe Live NOT AUTHORIZED** | **SUPERSEDED + OWNER_GATED** | no (test mode only) | owner: env package `docs/billing/STRIPE_TEST_ENV_OWNER_PACKAGE.md` |
| W17 | — | **NO DEFINITION EXISTS** — 0 references anywhere in `docs/` or `apps/web` (re-grepped 08-07) | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP) | no | owner defines or drops |
| W18 | — | **NO DEFINITION EXISTS** — 0 references (re-grepped 08-07) | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP) | no | owner defines or drops |
| W19 | *(seed: "Mobile / A11y / Perf")* | **NOT fully undefined** — exactly one named hint exists: `docs/audits/w7-employee-journey-read-only-audit.md:482` says "**W19 Mobile/A11y/Perf** — Owns A1–A4. W7-5 should hand its evidence to W19 rather than fix in place". A real track seed, but no baseline document (re-grepped 08-07) | — | — | — | the baseline; W7's A1–A4 findings are the ready-made input | **UNDEFINED_NEEDS_SCOPE** (seeded — strongest candidate of the undefined block) | no | write the W19 baseline from W7 A1–A4 |
| W20 | — | **NO DEFINITION EXISTS** — 0 references (re-grepped 08-07) | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP) | no | owner defines or drops |
| W21 | — | **NO DEFINITION EXISTS** — 0 references (re-grepped 08-07) | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP) | no | owner defines or drops |
| W22 | — | **NO DEFINITION EXISTS** — every hit is the range label "W1–W22" / "W4–W22", never a scope (re-grepped 08-07) | — | — | — | the scope itself | **UNDEFINED_NEEDS_SCOPE** (recommend DROP) | no | owner defines or drops |

## W6 — final row (CLOSED)

**Status: `DONE`.**
**Verdict: `W6_FIT_NOT_RATING_SURFACE_SHIPPED_AND_PRODUCTION_PROVEN`.**

Evidence recorded (full detail: `docs/audits/W6_EXPERIENCE_SURFACE_CURRENT_TRUTH.md`):

| # | Claim | Evidence |
|---|---|---|
| 1 | Experience schema active in production | `20260802120000_experience_records_v1` applied 2026-08-04 15:12:14 UTC; `20260806230000` applied 2026-08-06 13:56 UTC (ledger version `20260806135649`, 184→185) |
| 2 | Author-side AND subject-side model active | `author_side` column live; org-scoped bookings resolve organization subjects (#1037); production API logs show `experience_records?…author_side` reads running live |
| 3 | Worker → organization experience submitted and published | `dce74d70-…`, submitted 2026-08-06 20:27 UTC via `?result=experiences`; moderated → `published` |
| 4 | Organization → worker experience submitted and published | `23e52ec7-…`, same run; moderated → `published` |
| 5 | Organization response submitted through the SHIPPED UI | 21:18 UTC as `qa.owner+multiw` (`f394ca7f…`) via `ExperienceResponseForm`; shipped success state rendered; `experience_responses` 0 → 1 (`caf2e340-…`), attached to `dce74d70` only |
| 6 | Duplicate response REFUSED live | second UI submission → `experience-response-error-response_exists`; row count stayed 1 |
| 7 | Moderation proven | operator approved both records on the `/lt/dashboard/admin` band-2d queue, 20:49 UTC |
| 8 | Count-only aggregation proven | `get_experience_counts` → `{positive:1, negative:0, disputed:0, total_considered:1}` for both subjects; the response never moved the counts (right-of-reply is not a score input) |
| 9 | No stars | no star UI; guard-pinned |
| 10 | No numeric score | no rating column in schema; no aggregate beyond the counts RPC |
| 11 | No universal ranking | no cross-subject ordering surface exists |
| 12 | Unrelated authenticated actor sees zero rows | a real unrelated production user: 0 experience rows, 0 responses (RLS) |
| 13 | Anonymous access denied | `anon` → 42501 on the table **and** on the counts RPC |
| 14 | QA demands closed | both `[QA-SYNTHETIC]` demands closed via the reviewed lifecycle control; worker board renders zero synthetic rows |

Write-set discipline: the entire production write-set of the proof session is
the one response row. QA login was a one-time admin-minted passwordless link,
consumed on use; session logged out and purged. No demand reopened. No real
user contacted.

## W7 — final row

**Status: `PARTIAL` — proven half: `PRODUCTION_JOURNEY_PROVEN`.**

Proven in production (#1042, `prod-qa-multi-w-run/journey-log.json`):

- **Worker discoverability consent** — availability edited in the player-card
  editor, then discoverability consent given on the privacy page; the
  consent-gated visibility chain proven end-to-end.
- **Interest / application** — worker interest signal `6f6a6676` on the
  `[QA-SYNTHETIC]` org demand `02684b8a`.
- **Employer shortlist** — "Domina" shortlist action.
- **In-app conversation** — opened with contact details hidden.
- **Booking proposal** — `88a43ead` received and accepted by the worker.

Remaining scope (separate; does **not** reopen the proven journey):

- P1-3 conversation memory — SQL still lives in `docs/proposals/`, never became
  a migration.
- P1-4 `/dashboard/profile` is 1007 lines, ≈25 sections — measure at 375px and
  produce a section inventory **before** any split (the audit forbids a blind fix).
- P2-1 open-ended bookings skip the overlap guard.

## W8 — final row

**Status: `PARTIAL` — proven half: `SHIPPED_EMPLOYER_PATH_PRODUCTION_PROVEN`.**

Proven in production (#1042, plus #1043 for the membership seed):

- **Multi-org active workspace** — orgs A/B/C created via
  `save_company_setup_v3`; workspace isolation + durable switching (Finding-1
  fixed live, #1039).
- **Demand attribution** — org demand `02684b8a` correctly attributed to Alfa
  through the M-P0-6 org spine.
- **Shortlist** — "Domina" on the worker's interest signal.
- **Conversation** — in-app, contacts hidden until the shortlist gate.
- **Booking proposal** — `88a43ead` proposed by the employer.
- **Roster invite / accept** — owner invite → worker accept → `company_workers`
  ACTIVE on Alfa; member directory renders; owner→manager invite→accept proven
  with a full audit trail (Finding-2 closed by `20260807090000`, ledger
  `20260806173650`, memberships 10→13, #1043).
- **Project creation and assignment** — project `d9d5fcd9` created, worker
  assigned.

**NOT claimed:** booking→engagement minting through the org bridge. The bridge
honestly returned `ambiguous_company` for the multi-company owner. It becomes
claimable only after **#1047 is applied and replay-proven** — not before.

## W11 — final row (split truth)

**Status: `PARTIAL — PROJECT_ASSIGNMENT_PATH_PROVEN`.**

| Element | State | Evidence |
|---|---|---|
| Project creation | **PROVEN in production** | project `d9d5fcd9` (#1042 step 11) |
| Worker assignment | **PROVEN in production** | same step, via `assign_worker_to_project` |
| Assignment ending | **PROVEN in production** | `end_worker_project_assignment` (#1042 steps 12–13) |
| Project lifecycle schema | **ACTIVE in production** | `20260803090000` + `20260804120000` applied; `set_project_status_v1` live |
| Project completion UI | **SHIPPED AND REACHABLE — NOT production-proven** | `LifecycleControls` at `apps/web/components/app/workspace/project-result.tsx:350`, rendered inside the `project` result (`dataReadiness: "real"`, `openedBy: ["company.assign-worker", "company.who-waits"]` — a real action, not a hand-typed `?result=`), calling `setProjectStatusAction` → `set_project_status_v1`, with an explicit irreversible-completion confirmation and a real server-returned `assignmentsEnded` count. Landed by #1007, present on `origin/main` |

Why not `DONE`: the completion control exists and is reachable, but **no real
user and no QA run has ever executed it in production**. Per §4 the W is not
marked fully done until the deployed completion control is production-proven.

Correction recorded: PR #1042's line "NO project-completion control … exist(s)
(W11 lifecycle UI unshipped)" is **refuted** for the project-completion half by
this pass. The roster-engagement-end half of that claim stands — no such
control exists.

Remaining: operations centre reachable only by deep link (F7); no
roster-engagement-end control; dismissed-manager rights must consume the
applied membership authority.

## W12 — final row (split truth)

**Status: `PARTIAL — BOOKING_AND_CONFLICT_PROVEN_ENGAGEMENT_BRIDGE_GATE_PENDING`.**

| Element | State | Evidence |
|---|---|---|
| Booking proposal | **PROVEN in production** | `88a43ead` proposed (#1042 step 7) |
| Booking acceptance | **PROVEN in production** | worker accepted via the W12 respond path (step 8) |
| Cross-company overlap refusal | **PROVEN in production** | Gama's overlapping booking `435488f2` refused — "Tu jau turi priimtą rezervaciją šioms datoms" — and left `proposed` (step 9) |
| Atomic conflict guard | **PROVEN** | `20260802150000_booking_atomic_double_booking_v1` applied (prod ledger `20260803203723`); row lock + advisory lock + EXCLUDE gist; 21/21 local concurrency proof; the production refusal above is the live exercise |
| Engagement mint through multi-company org resolution | **PENDING #1047** | the bridge returned an honest `ambiguous_company` for the multi-company owner; Draft PR #1047 ships the org-first resolution UNAPPLIED and owner-gated |

Not claimable as complete before #1047 applies **and** a production replay
proves the mint.

Also remaining: 9 calendar sources with no model (availability, shifts,
vacation, sick, meetings, holidays, service-order TEXT dates, instruction due
dates, travel) — each an additive schema + UI, owner-gated.

## Defect-train dependency mapping

None of these is a new W. Each maps to an owning W or platform track.

| PR | Defect | Owning W / track | State | Blocks |
|---|---|---|---|---|
| **#1044** | Admin company-verification: silent in-flight/outcome feedback — dual-channel status delivery | **Platform track: Admin operations** (surfaced by the W8 employer path; not a W-scoped feature) | OPEN, Ready for Review, `mergeStateStatus=BLOCKED` — GitHub Actions outage, not a code problem | nothing product-side; blocks operator confidence in the verification queue |
| **#1045** | Founder admin-grant path broken — narrow `service_role` column grants | **Platform track: Auth / admin authority** (prerequisite for admin-verifying orgs; gates PROD_QA steps 6–16) | Draft, owner-gated, **UNAPPLIED** | operator admin-verification of Alfa → the remaining multi-org PROD_QA steps |
| **#1046** | Worker demand board: multi-company fan-out / wrong org attribution — one row per demand, correct company | **W8** (employer demand attribution) with a **W10** read-surface effect | Draft, owner-gated, ships **UNAPPLIED** | correctness of the worker board under multi-org; does not block the proven W8 path |
| **#1047** | Booking→engagement organization resolution — closes the `ambiguous_company` dead-end | **W12** (primary); **W8** consumes the result | Draft, owner-gated, **UNAPPLIED** | the ONLY thing between W12 and full completion; also the W8 "engagement minting" claim |

## Stripe and LMC (recorded separately from W completion)

**Stripe** — *not* a W completion signal; it is a commercial track that runs
under W16/M-P0-7:

- Stripe **multi-subject schema ACTIVE in production** (`20260806220000_stripe_multi_subject_v2`,
  merged via #1040). One payer may hold Personal + org A + org B on the same
  plan key (two partial unique indexes).
- Application code **merged and deployed** — `resolveBillingSubject`,
  capability-gated (`manage-billing`, owner/admin only), fail-closed on
  ambiguity (`organization_required`), webhook signature + replay/idempotency,
  live-key structural block.
- **TEST environment pending external owner input** — credentials not supplied;
  `docs/billing/STRIPE_TEST_ENV_OWNER_PACKAGE.md`.
- **Stripe Live NOT AUTHORIZED.** `PAYMENTS_ENABLED=false`;
  `LIVE_PAYMENTS_ENABLED = false as const`.

**LMC** — exact state:

`LMC_LEDGER_FOUNDATION_PRODUCTION_ACTIVE_END_USER_ECONOMY_DISABLED`

- The immutable ledger foundation (#843) is applied and live in production.
- **Zero call sites.** Re-grepped 08-07: no non-guard consumer of `lmc-flags`
  or `LMC_*` exists in `apps/web`.
- Six kill switches are `false as const` and guard-pinned
  (`apps/web/lib/billing/lmc-flags.ts`): `LMC_PURCHASES_ENABLED`,
  `LMC_PROMOTIONAL_GRANTS_ENABLED`, `LMC_REFERRALS_ENABLED`,
  `STRIPE_LMC_TOPUPS_ENABLED`, `LIVE_PAYMENTS_ENABLED`, `LMC_SPENDING_ENABLED`.
  Flipping any is an owner-only production gate.
- This is **NOT** a completed product economy. No user can earn, buy, hold or
  spend an LMC. Do not classify it as shipped commercial functionality.

## First genuinely incomplete W

**W7 — Employee journey.**

Walk of the canonical sequence:

| W | Why it is not the answer |
|---|---|
| W1, W3 | `DONE` — do not reopen |
| W2 | `PARTIAL` but `NOT_LAUNCH_CRITICAL`; it is a ratchet interleaved opportunistically, never taken as "the one W" |
| W4 | `DONE`; remainder is 9 owner-gated review items |
| W5 | FROZEN — reopening is an owner decision (excluded: owner gate) |
| W6 | **`DONE` as of this update** — do not reopen |
| **W7** | **`PARTIAL` with real, safe, unblocked work: P1-4 profile measurement + section inventory needs no migration, no owner gate, no production write** |

W7 is selected over the also-incomplete W8/W11/W12 because it is earlier in
canonical sequence *and* its next slice carries zero gates. W11's and W12's
strongest next steps both sit behind gates (#1047 apply for W12; a PROD_QA leg
for W11's completion proof), so the exclusion rule in §9.2 does not need to
skip W7 at all.

## Next-window command

> Take W7. Re-audit the employee journey on CURRENT main in a PINNED worktree
> (never the shared main tree — that is what produced the false W6 "no shipped
> surface" report). Baseline: `docs/audits/w7-employee-journey-read-only-audit.md`.
> Execute W7 P1-4 as an AUDIT-ONLY slice: measure `/dashboard/profile`
> (1007 lines) at 375px and 1440px in the local browser, produce a complete
> section inventory (~25 sections: name, purpose, data source, render cost,
> 375px behaviour, overflow/console/hydration findings), and identify which
> sections belong on the profile vs. elsewhere. Do NOT split the file in this
> window — the audit forbids a blind fix. Output: an audit document + browser
> evidence + a proposed slice list. Then update the W7 matrix row. Do not touch
> W8+ in the same window. No migration, no owner gate, no production write.

## Standing owner gates (unchanged)

No Stripe Live, no live keys, no charges, no LMC flag activation, no paid
infrastructure, no real-user/company contact, no second production company,
no `#1016`/old-`#844` migration apply. Apply decisions for #1045, #1046 and
#1047 are owner-only. Restoring GitHub Actions is an owner-only billing action.
