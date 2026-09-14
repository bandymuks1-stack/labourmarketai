# AUDIT CHECKPOINT — end-to-end, 2026-09-14

Owner scope: **AUDIT ONLY.** No production mutation, no migration, no RLS, no
auth, no legal semantics, no RED/owner-gated decision was touched. Nothing in
this document was implemented; it is the evidence base for the next window.

Supersedes nothing. It continues from
`CONTINUATION_CHECKPOINT_2026-09-13_production-completion.md`, and it
**contradicts that checkpoint's closing claim** ("ONE non-gated item remains").
Six non-gated defects are named below, three of them evidence-honesty defects
with live production data behind them.

## Exact state as measured

| | |
|---|---|
| Branch | `claude/labourmarket-audit-ikzeez` (identical to `origin/main`, 0 ahead / 0 behind at audit start) |
| `main` | `b77657e` (#1738) |
| Typecheck | `pnpm -F web typecheck` → **exit 0** |
| Unit suite | `pnpm exec vitest run` → **1330 files, 22 716 passed, 2 skipped, 0 failed**, 312 s |
| `migration-safety.mjs` | GREEN (no migration files changed) |
| `check:anon-secdef-allowlist` | **exit 2 — refuses to run**, no `DB_URL`. GOV-1 confirmed inert |
| Production DB | `gorgitwvdzxbnaxhrsrw`, read-only SQL via Supabase MCP — **verified working** |
| Production HTTP | NOT reached from this container. No claim is made about the deployed site |

### Production reality, read directly (2026-09-14)

| Table | Rows |
|---|---|
| `public_vacancies` | **89 021** |
| `engagement_contexts` | 81 |
| `journal_entries` | **65** (46 live · 8 deleted · 11 superseded) |
| `profiles` | 57 |
| `organizations` | 17 |
| `projects` | 9 |
| `conversations` | 5 |
| `experience_records` | 2 |
| `project_handover_entries` · `education_programs` | 1 each |
| `defects` · `project_budgets` · `procurement_inquiries` · `business_trips` · `learning_signals` · `organization_evidence_records` | **0** |
| Applied migrations | **278** (repo carries 280 `.sql`, none of them rollback files) |

The one capability operating at real scale is **external vacancy ingestion**.
Everything else is single-digit-to-double-digit usage. That is the honest size
of this product today.

---

## P0 CHECK — none found

No unauthorized-access, data-loss or integrity-breach defect was found. The
audit was stopped on no finding.

- **548 `security definer` declarations across the migrations; every one pins
  `search_path`.** The single grep hit without one
  (`20260705150000_customer_requests_status_transition_guard.sql`) is a comment
  stating the function is deliberately INVOKER. Clean.
- The 2026-08-02 `organizations_select using (true)` P0 was found and closed by
  `20260802170000_organization_rls_hardening_v1.sql`. Confirmed still closed.
- Remaining `using (true)` policies are reference/lookup tables (`skills`,
  `countries`, `plans`, `relationship_types`, `profession_templates`,
  `education_types`) or `to authenticated` governance metadata. Appropriate.

### Supabase advisors — read and triaged, 2026-09-14

| Level | Finding | Verdict |
|---|---|---|
| ERROR ×1 | `public.worker_absence_scheduling` is a SECURITY DEFINER view | **NOT a defect — a deliberate privacy IMPROVEMENT.** `20260808120000` narrowed the base policy so a manager sees the absence NOTE only while a request is pending, and added this view exposing scheduling columns only, for approved absences, carrying `caller_manages_worker(worker_id) OR is_admin() OR self` as its own predicate. Grant is `authenticated SELECT`; no anon. The migration's own §B explains why `security_invoker` would add nothing. **Do not "fix" this — it is a regression if reverted.** Record it as an accepted advisor exception so it stops consuming audit time |
| WARN ×2 | `usage_cost_events_forbid_mutation` / `_forbid_truncate` have mutable `search_path` | Real, small. Trigger guards; pin `search_path`. GREEN-class |
| WARN ×385 | authenticated may execute SECURITY DEFINER functions | Expected — that is this product's architecture (RPC-pinned writes). Not actionable per-row |
| WARN ×9 | anon may execute SECURITY DEFINER functions | Governed by `check:anon-secdef-allowlist`, which is inert (GOV-1) |
| WARN ×1 | leaked-password protection disabled | Owner setting, one click in the Supabase dashboard |
| INFO ×4 | RLS enabled, no policy | Fail-closed by construction. Verify intent, no urgency |

---

## FINDING 1 — the capability register is wrong about four of its six
## `BUILT_NOT_CONNECTED` rows, and two guards cannot detect it

**This is the most important finding, because the register is what every
future session reads instead of the code.**

### The false claims

| Row | Register says | Measured truth |
|---|---|---|
| **MKT-5** Procurement | `surfaces: []`, *"No route; an anchor only … Genuinely unreachable — this one is correct."* | **Reachable and fully wired.** `app/[locale]/dashboard/finance/procurement-section.tsx` is mounted on `finance/page.tsx` (lines 280 and 872) with **nine** server actions bound to real `<form action=…>` elements. `/dashboard/finance` carries `surfaceRoute` in `dashboard-module-registry.ts:340`, is linked from `/dashboard/reports`, `commercial-panel.tsx` and `dashboard-search.ts`, and `procurement-actions.ts:91` redirects to `…/finance?proc=…#procurement` |
| **MKT-6** Business trips | same wording | **Reachable and fully wired.** `trips-section.tsx` mounted on the same page, eight server actions, `trips-actions.ts:88` redirects to `…#trips` |
| **WRK-8** Defects | *"0 rows; no human path opens it … Genuinely unreachable"* | **Reachable and fully wired.** `ProjectDefectsPanel` is rendered at `projects/[id]/operations/page.tsx:595`; it is a client component calling `reportDefectAction`, `setDefectStatusAction`, `addDefectCorrectionAction`, `deleteDefectAction` through `useTransition`. The operations route is linked from `arena/project-map.tsx`, `company-home-field-section.tsx` (×2) and `project-assignment-manager.tsx` |
| **WRK-10** Project economics | *"exists with no surface … Genuinely unreachable"* | **Reachable and fully wired.** `ProjectEconomicsPanel` rendered at the same page, line 570, calling `setBudgetLineAction` |

Correctly classified: **WRK-9** (handover — its own note already says it is
reachable from project operations) and **EDU-5** (`/dashboard/learning` — every
reference is a `revalidatePath`; independently re-confirmed).

### Why the guard did not catch it

Both disconnection guards are **vacuous for all six rows**:

```ts
// lib/guards/capability-register.test.ts:272
if (row.status !== "BUILT_NOT_CONNECTED" || row.coreModule === null) continue;
```
All six rows carry `coreModule: null` → the body never runs.

```ts
// lib/guards/capability-register.test.ts:311-316
for (const route of row.surfaces.map(dashboardRouteOf)) { … }
```
All six rows carry `surfaces: []` → the loop never iterates.

**The structural rule this reveals: the register can only detect
over-claiming, never under-claiming.** A row that names no module and no
surface is unfalsifiable, and `BUILT_NOT_CONNECTED` is exactly the status that
invites naming neither. The register's 38 green tests say nothing about these
six rows.

**The reasoning error behind the four false notes:** each cites *zero rows in
production* and *no dedicated route in the dashboard module registry* as proof
of unreachability. Neither is. Zero rows is a usage fact; and a capability can
be surfaced as a SECTION of another registered route. This is the register's
own **SEP-8** collapse (DATA EXISTS ≠ REACHABLE ≠ VISIBLE ≠ ACTIONABLE)
committed inside the file that defines SEP-8.

**User impact:** four working capabilities are recorded as dead. Two prior
windows were already sent to rebuild an existing path by a false register entry
(the EDU-2 case, #1731). This is the same failure with four more entries loaded.

**Smallest safe action (GREEN, no schema):** reclassify the four rows with
their real `coreModule` + `surfaces`; then remove the `coreModule === null`
escape and require `BUILT_NOT_CONNECTED` to name either a module or a route so
the claim is checkable. Do not delete anything.

---

## FINDING 2 — the Verified CV and the profile overstate a person's evidence
## trail by counting deleted and superseded journal entries

**Live in production now.**

`lib/profile/trust-signals.ts:48` reads:

```ts
.from("journal_entries").select("id").eq("worker_id", workerId)
```

with **no `deleted_at` and no `superseded_by` filter**, and returns its length
as `journalEntries`, documented in the same file as *"Own journal entries
(evidence trail length)"*.

**Measured against production:** 65 total entries, **46 live**. 8 deleted, 11
superseded, **4 workers affected**. The count is overstated by up to 41 %.

Consumers — both of them trust surfaces:
- `app/[locale]/dashboard/profile/page.tsx:435`
- **`lib/cv-export/verified-cv.ts:313`** — the Verified CV, the product's
  central living trust object, which leaves the platform.

The same function's `managerConfirmations` counts confirmations over that same
unfiltered id list. Currently harmless by luck — `conf_all = 13` and
`conf_live = 13`, no confirmation presently sits on a non-live entry — but it
is wrong by construction and will inflate the moment a confirmed entry is
corrected.

**The canonical rule already exists and this reader bypasses it:**
`lib/journal/journal-list-core.ts:198` — `v3.rows.filter((e) => !e.deleted_at
&& !e.superseded_by)`.

**Two neighbours of the same class:**
- `lib/player-card/player-card.ts:298` counts confirmations over an unfiltered
  entry-id list — while **line 326 in the same file** filters `deleted_at` for
  the activity read. One file, two answers.
- `lib/capabilities/registry.ts:424` takes the newest entry's `hash_self` with
  no live filter, so the integrity head served over MCP can point at a
  retracted entry.

**Breadth:** 34 non-test modules read `journal_entries` directly; **23 never
mention `superseded_by`.** Not all need to — writers and correction-chain
readers legitimately see everything — but no shared reader enforces the rule,
so it must be re-derived 34 times.

**Smallest safe action (GREEN):** one exported live-entry predicate beside
`journal-list-core`; point `trust-signals`, `player-card` and
`capabilities/registry` at it; add a guard that executes the real reader
against a superseded fixture. **Do not write the guard by constructing its own
input** — that is exactly lesson 1 of the 2026-09-13 checkpoint, and this
defect survived 22 716 tests because no test ran the reader.

---

## FINDING 3 — two answers to "does this worker meet the language requirement",
## and the second collapses UNKNOWN into NOT-MET

`languageLevelSatisfies` is defined twice:

| Definition | Returns | Unknown level string |
|---|---|---|
| `lib/market/match-criteria-v2.ts:243` (canonical; re-exported by `match-v1.ts`) | `boolean \| null` | **`null` — UNKNOWN.** Correct per SEP-7 |
| `lib/workforce/capacity-model.ts:176` (private second copy) | `boolean` | **`false` — NOT MET.** SEP-7 collapse |

The second copy is used at `capacity-model.ts:407` to compute
`languageGaps`, which feeds `totalHeadcountShortfall` on the employer capacity
and gap timeline (CAL-4). Its `CEFR_ORDER` is a closed six-value list and the
level string is **not normalised**, while the language code beside it in the
same expression **is** (`norm(l.lang) === norm(need.lang)`).

**Concrete failure:** a worker whose level is stored `"b2"` rather than `"B2"`
— or as `"fluent"`, or any non-CEFR code — is counted as not meeting a `B2`
requirement. The employer is shown a headcount shortfall that may not exist,
presented as a fact rather than as an unknown.

**Smallest safe action (GREEN):** delete the second copy, import the canonical
one, and make `capacity-model` decide the `null` case explicitly — a gap of
unknown size is not a gap of size zero, and it is not a filled requirement
either. Both directions are wrong; the code must say which it means.

---

## FINDING 4 — SKL-9 (RPL) is recorded MISSING; the model exists and its
## only real input is hardcoded `false`

Register: *"Nothing at any layer."*

Measured: `lib/qualification/capability-standing.ts` implements the full
**SEP-6** five-state ladder including `recognized_equivalence`, with the RPL
branch live at line 160-166, and it is imported by
`lib/projects/worker-project-asks.ts` and `lib/qualification/capability-evidence.ts`.

The flag that reaches it, `hasRecognizedEquivalence`, has exactly **one
non-test producer**: `lib/projects/worker-project-access.ts:299`, which
hardcodes `false`. Every other occurrence is inside
`capability-standing.test.ts`, which sets it `true` itself. No table, no
column, no RPC, no writer anywhere records an equivalence.

So SKL-9 is not MISSING — it is the register's own **`inert_bridge`**: live
code whose input can never be true, defended by tests that manufacture the
input. Same class as Finding 2.

**Why it matters for planning:** the remaining work is not "design and build
RPL". The decision model is done and consumed. What is missing is the
*record* — a persisted equivalence, a writer, an assessor authorisation — and
who may assert an equivalence is an **owner decision**, not an engineering one.
Recording it as MISSING hides that the blocker is a policy question.

---

## FINDING 5 — the production migration-parity snapshot is 5 rows stale, which
## is the exact recurrence of a defect this repository already documented

`docs/migrations/production-ledger-snapshot.json`: `row_count: 273`,
`read_at: 2026-09-08`, max version `20260908110702`.
Production **now holds 278**, max version `20260911094312`.

The five applied since the snapshot:

```
20260908143925  accept_invitation_binds_org_membership_v1
20260909061411  20260904120000_first_party_supply_representation_v1
20260909105602  20260908120000_education_program_correction_v1
20260910091912  organization_people_candidate_relationship_v1
20260911094312  productivity_units_universal_v1
```

`docs/migrations/production-parity-register.md` describes this happening on
2026-08-23 (snapshot 232, production 234) and returning a **false PASS**. It
has happened again, 5 wide. Snapshot-mode parity is therefore currently
unreliable, and the live gate is inert for want of `SUPABASE_DB_URL` (GOV-1).

**Note for whoever refreshes it:** ledger `version` is the APPLY timestamp, not
the filename prefix — three of the five above carry a filename inside `name`
under a different `version`. Match on `name`, never on the prefix.

**Smallest safe action:** refresh the snapshot from the live ledger in the same
commit as the `APPLIED_LEDGER.md` row. Trivial, and it is not optional.

---

## FINDING 6 — CI has no database, so the entire authenticated product has
## zero automated end-to-end verification

- The repo holds **95 Playwright specs**.
- `.github/workflows/e2e-smoke.yml` runs **five** of them
  (`E2E_SPECS`), and applies `E2E_GREP_INVERT: "auth-gated routes"`.
- Floor `MIN_EXPECTED: 27`. Every executed test is anonymous: landing,
  localization, mobile overflow, auth-form touch targets, social-auth matrix.
- No workflow starts Supabase or supplies a DB. `quality.yml` runs typecheck,
  lint, vitest and a long list of static copy/route guards.

So **90 specs covering the real product journeys run nowhere** — not in CI, and
not locally either: the 2026-09-13 checkpoint measured that this container has
no Docker, so local Supabase cannot boot.

This is the root cause behind the numbers everyone keeps re-encountering: 17 of
106 capabilities `HUMAN_UI_PROVEN`, and thirteen Codex findings in one session
none of which 22 716 tests caught.

### What the 867-guard number actually buys

| Measure | Count |
|---|---|
| Guard files in `lib/guards` | 867 |
| …that call `readFileSync` at all | 814 |
| …that read files and import **no** `@/lib` module | **642 (74 %)** |
| Co-located behavioural unit tests elsewhere in `lib` | 463 |
| Component / render tests | **0** |

Much of the 642 is legitimate and well-built — JSON config pins like
`mobile-release-config.test.ts`, i18n parity, SQL policy pins. The point is
narrower: **the guard count is not a behavioural-coverage number**, and the
defect classes that actually ship here — a hardcoded `false`, a `?? 0`, a
divergent second copy, a control wired to nothing, a missing `superseded_by` —
are invisible to a grep over source text. Findings 2, 3 and 4 in this document
are all of that class, and all three sit under a fully green suite.

---

## FINDING 7 — the register enumerates roughly half the product

68 of 141 `apps/web/lib` subdirectories carry **no anchor** in
`capability-register.ts`. Some are correctly out of scope (`lib/supabase`,
`lib/hooks`, `lib/config`, `lib/test`). Substantial domain subsystems are not:

`lib/staffing` (15 files) · `lib/vacancy-sources` (14) · `lib/buyer` (12) ·
`lib/world-state` (10) · `lib/operations` (8) · `lib/work-market` (8) ·
`lib/organization-people` (6) · `lib/supply-bridge` (6) ·
`lib/estimate` / `lib/timesheet-import` / `lib/ai-workspace` / `lib/seo` (5 each) ·
`lib/approvals` / `lib/eurostat-import` (4) · `lib/qualification` (2, and it
holds the SKL-9 model of Finding 4).

Example: **DEM-4** anchors `lib/vacancy-import` and `lib/vacancy-store` and
describes "external vacancy ingestion". The pipeline is four modules —
`vacancy-sources` (providers, normalisation, dedup, hashing, cursor,
validation) and `vacancy-runner` (ingestion, operator actions) are the other
half, 17 files, unregistered. They are **not duplicates**; the import graph
shows one clean layering. They are simply absent from the product's own
inventory, and this is the pipeline carrying all 89 021 rows.

### Two routes reachable by nobody, in the register nowhere

`/dashboard/admin/import-sandbox` and
`/dashboard/admin/intelligence-observations` have **zero references of any
kind** in the codebase — no `href`, no registry row, no `revalidatePath`. Both
are real, superadmin-gated, env-flag-gated owner tools with server actions.
The admin index links all 18 of its other children and not these two.

Likely deliberate (both are flag-off-by-default owner instruments). But
"deliberate" must be written down, or the next audit spends a window
rediscovering them — which is what this one did.

---

## Duplicates and parallel implementations — full result

Prefer CONNECT/FIX/CONSOLIDATE. Nothing below should be deleted for looking
duplicated.

| Pair | Verdict |
|---|---|
| `languageLevelSatisfies` × 2 | **REAL DIVERGENCE — Finding 3.** Canonical: `match-criteria-v2.ts` |
| `journal_entries` live-filter, re-derived across 34 readers | **REAL DIVERGENCE — Finding 2.** Canonical: `journal-list-core.ts:198` |
| `deriveSkillEvidence` × 2 (`lib/profile/skill-evidence.ts`, `lib/player-card/evidence-visuals.ts`) | **Name collision only** — different signatures, different jobs (counts vs. render bars). Rename one; no behaviour risk |
| `readAuthority`, `providerKindFor`, `boundedEditDistance`, `isIsoDay`, `addDays`, `sentenceFromReturnPath`, `listOwnReadinessItems` | Same-name, different domains or trivial date/string helpers. Low risk. Worth one shared `lib/time` home for `addDays`/`isIsoDay` when something else touches those files |
| four `vacancy-*` modules | **NOT duplicates** — one layered pipeline (sources → import → store → runner). Register them (Finding 7); do not consolidate |

---

## Journeys — reconstructed and re-verified

`docs/…/journey-register.ts` is broadly accurate and unusually honest. Two
corrections:

**"Learners join the cohort" is classed `BROKEN` on zero usage alone** — the
note says so explicitly: *"Production holds zero cohort members … no human has
ever put a person into one."* All five write paths exist and are reachable on
`/dashboard/company`. Meanwhile **WRK-6** applies the opposite standard to the
same fact: *"What is 0 is USAGE … which is a human fact and not a code gap."*
One of the two standards must go. Until then "10 broken or unbuilt links" is
not a usable backlog number — it mixes missing code with missing users.

**The RED gate for "the subject may refuse an imported record" governs a table
with 0 rows.** `organization_evidence_records` is empty. The analysis behind
that gate is excellent and correct; its *priority* should reflect that it
currently serves nobody, and that the import path itself has never been used
in production.

| Actor | End-to-end state, verified |
|---|---|
| **PERSON** | Live. Record → confirm → evidence → skills → profile/CV works on web and on the phone (`/(shell)/log-work` → `journal.create_draft` → `journal.confirm` over `/api/mcp`, verified in `src/screens/journal-composer.tsx`). **Degraded by Finding 2 at the readback step** — the trail is counted, not filtered |
| **COMPANY** | Live except team→project assignment (WRK-6, needs an FK, owner-gated). 0 teams exist. Procurement, trips, defects and budgets are reachable (Finding 1) and unused |
| **AGENCY** | Live except brigade-as-a-unit matching. `matchTeamToNeed` is complete; the block is that `get_team_capability_summary_v1` returns rows only to owner/manager/admin — an RLS **disclosure decision**, not wiring |
| **INSTITUTION** | Programme → cohort → demand → outcomes → CSV export all live (#1731). Cohort membership unused. RPL is Finding 4 |
| **CROSS-ACTOR (import)** | Subject's right to refuse: RED, owner-gated, 0 rows |
| **CHAT / MCP** | 28 capabilities in `lib/capabilities` + `lib/mcp`; 54 conversation actions. `/dashboard/hours` is reachable **only through chat chips** — legitimate, and worth recording so a future navigation audit does not call it orphaned |

---

## Web / mobile parity

Mobile ships **6 screens** — today, journal, log-work, profile, settings, plus
sign-in/register — against **72 dashboard routes** on web. It consumes **6 of
28** capabilities (`profile.get`, `journal.list`,
`journal.work_intelligence.get`, `journal.create_draft`, `journal.confirm`,
`context.list`/`context.switch`).

Absent from mobile: opportunities and matching, calendar and planning,
conversations, notifications, CV, organizations, demand, evidence import,
search and the map.

That is a coherent, honest v1 slice — record-and-review — not a parity gap to
be closed before release. The store gates are elsewhere.

**Store readiness** (per `docs/mobile/STORE_RELEASE_READINESS_2026-09-13.md`,
re-read and still accurate): agent-executable work remains on Android runtime
proof, icons/splash generation, the mobile context-holdings read, and the two
`.well-known` association files. Owner gates 1–7 — icon art approval, Apple
Developer Program, Google Play account + upload key, the collected-data and
Data Safety declarations, store metadata wording, support contact, screenshots
— block submission absolutely.

---

## COMPLETION MATRIX

Only items whose classification this audit changed, or which it verified as
blocking, are listed. The 106-row register remains the base inventory.

| Item | Register says | **Audit says** | Evidence | Smallest safe action |
|---|---|---|---|---|
| MKT-5 Procurement | BUILT_NOT_CONNECTED | **BUILT_AND_CONNECTED** (0 usage) | `finance/page.tsx:280,872`; 9 form actions | Reclassify |
| MKT-6 Business trips | BUILT_NOT_CONNECTED | **BUILT_AND_CONNECTED** (0 usage) | `finance/page.tsx`; `trips-actions.ts:88` | Reclassify |
| WRK-8 Defects | BUILT_NOT_CONNECTED | **BUILT_AND_CONNECTED** (0 usage) | `operations/page.tsx:595` | Reclassify |
| WRK-10 Project economics | BUILT_NOT_CONNECTED | **BUILT_AND_CONNECTED** (0 usage) | `operations/page.tsx:570` | Reclassify |
| SKL-9 RPL | MISSING | **PARTIAL / inert_bridge** | `capability-standing.ts:160`; `worker-project-access.ts:299` hardcodes `false` | Reclassify; owner decides who may assert equivalence |
| Trust / CV entry count | not registered | **BROKEN** | `trust-signals.ts:48`; 65 counted vs 46 live | One shared live-entry predicate + a reader-executing guard |
| Capacity language gap | CAL-4 PARTIAL | **BROKEN (SEP-7)** | `capacity-model.ts:176,407` | Import the canonical fn; decide `null` explicitly |
| Register disconnection guards | passing | **FALSE-GREEN** | `capability-register.test.ts:272,311` | Remove the `coreModule === null` escape |
| Parity snapshot | PASS in snapshot mode | **STALE ×5** | snapshot 273 vs production 278 | Refresh in the same commit as the ledger row |
| Authenticated e2e | GOV-3 PARTIAL | **ABSENT** | 5 of 95 specs; auth block inverted | A DB in CI — see critical path |
| `/dashboard/admin/import-sandbox`, `…/intelligence-observations` | absent | **ORPHAN_ROUTE, unregistered** | 0 references of any kind | Register + record as deliberate, or link from admin index |
| ~68 unanchored `lib` subsystems | absent | **UNREGISTERED** | anchor-vs-filesystem diff | Anchor, or mark infrastructure |
| `usage_cost_events_*` search_path | absent | **WARN** | Supabase advisor | Pin `search_path` |
| `worker_absence_scheduling` definer view | absent | **ACCEPTED EXCEPTION** | `20260808120000` §B; predicate inline | Document; do not revert |

---

## CRITICAL PATH, dependency-ordered

### A) Autonomously finishable, no gate

**A1 — Truth repair (do first; everything downstream reads it).**
Reclassify the five register rows; remove the two vacuous guard escapes;
register the unanchored subsystems and the two orphan admin routes; refresh the
parity snapshot; resolve the BROKEN-on-zero-usage inconsistency between EDU-2
and WRK-6 into one stated rule. Blocks nothing technically and misleads
everything until done.

**A2 — The three honesty defects.** Findings 2, 3 and 4's code half: the shared
live-entry predicate wired into `trust-signals` / `player-card` /
`capabilities/registry`; the `languageLevelSatisfies` convergence with an
explicit `null` decision. Each needs a guard that **executes the reader**.
A2 is the only item on this list that is wrong on a real user's screen today.

**A3 — Small security hygiene.** Pin `search_path` on the two
`usage_cost_events` trigger functions. GREEN-class migration, reversible.

**A4 — A database in CI.** The unlock for everything else. Postgres service
container + apply `supabase/migrations` + seed, then drop
`E2E_GREP_INVERT: "auth-gated routes"` and widen `E2E_SPECS` toward the 95.
Raise `MIN_EXPECTED` as coverage lands, never lower it. This converts ~90 dead
specs into the product's first real end-to-end verification and is the durable
answer to "13 findings, none caught".

**A5 — Mobile agent-executable remainder.** Context-holdings read; Android
runtime proof **only after verifying a GitHub Linux runner actually provides
`/dev/kvm`** — the 2026-09-13 window measured that this container cannot, so do
not rediscover that. The two `.well-known` files are preparable but not
completable until the owner's store identifiers exist.

### B) Owner decisions — no agent may resolve these

The six standing register decisions (**PER-11**, **ORG-2**, **EVID-2**,
**EVID-6**, **MKT-7**, **GOV-1**), plus:

1. **The phone walkthrough, and a signed-in production walkthrough on web.**
   Nothing replaces it. 17 of 106 capabilities are `HUMAN_UI_PROVEN`.
2. **Who may assert a recognised equivalence** (SKL-9 / Finding 4) — a policy
   question wearing an engineering costume.
3. **Employer-side team matching** — opening
   `get_team_capability_summary_v1` beyond owner/manager/admin is a disclosure
   decision.
4. **WRK-6 brigade → project assignment** — schema change.
5. **The subject's right to refuse an imported record** — RED. Note the table
   holds 0 rows when prioritising.
6. **Leaked-password protection** — one dashboard toggle.

### C) External prerequisites

`SUPABASE_DB_URL` read-only Actions secret (activates two dormant security
gates); Apple Developer Program; Google Play account + upload signing key; icon
source art or approval to generate from `apps/web/public/app-icon.svg`; store
metadata wording; support contact; the collected-data and Play Data Safety
declarations; screenshots from a signed-in production device.

### D) HUMAN_UI_PROVEN / runtime proof

Nothing in this audit was driven in a browser. Production HTTP is unreachable
from this container (egress policy). Every claim here is CODE_PROVEN,
TEST_PROVEN or — where it came from live SQL — PRODUCTION_DATA_PATH_PROVEN, and
is labelled as such above.

---

## ESTIMATES — agent execution time

Not human-team time. One agent working window ≈ one focused session ending in a
merged PR. Ranges are wide on purpose; the dominant uncertainty is stated for
each.

| Track | Optimistic | Realistic | Conservative | Dominant uncertainty |
|---|---|---|---|---|
| A1 truth repair | 1 | 1–2 | 3 | How many of the 68 unanchored subsystems need real classification vs. an infrastructure tag |
| A2 three honesty defects | 1 | 2 | 3–4 | Writing guards that execute readers, when the existing idiom is grep-over-source; and how many of the 23 unfiltered journal readers legitimately need everything |
| A3 search_path pin | <1 | <1 | 1 | None |
| **A4 database in CI** | 2 | **4–7** | 10–14 | Whether the 90 unrun specs still pass. They have not been executed in a long time; assume meaningful rot. This is the single largest and least predictable item |
| A5 mobile remainder | 1 | 2–3 | 5 | KVM on a GitHub Linux runner is unverified. If unavailable, Android runtime proof has no in-CI path at all |
| Register→reality sweep for the other 54 PARTIAL rows | 2 | 4–6 | 10 | Finding 1 found four wrong rows in six. The PARTIAL rows have not been audited at this depth and the same error rate cannot be ruled out |

**Production-complete WEB product** — A1+A2+A3+A4 plus the PARTIAL sweep and
whatever it surfaces: **optimistic 6, realistic 12–18, conservative 30+
windows.** Then gated on B1 (the human walkthrough), which no amount of agent
time substitutes for.

**Production-complete MOBILE product** — the current 6-screen slice is
functionally complete for what it claims; A5 plus icons: **2–4 windows
realistic**, and it does not become "complete" in any broader sense without an
owner decision about which further capabilities the phone should carry.

**Store-submission-ready** — agent side **2–4 windows** (icons, associations,
Android proof). Then **hard-stopped on owner gates C**: no agent can create a
store account, hold a signing key, take a signed-in screenshot, or answer a
legal declaration. Wall-clock here is owner-determined, not agent-determined.

**Fully connected final architecture as specified** — the graph in
`product-truth.mjs` includes capabilities that are genuinely unbuilt and
partly owner-gated: RPL/equivalence (SKL-9 + policy), capacity reservation
(CAL-7), shifts/rotas (CAL-8), utilisation/FTE (CAL-9), planned-vs-actual
learned duration (CAL-10 — the flywheel's learning loop), saved searches and
alerts (DEM-8), team→project assignment (WRK-6). **Realistic 40–70 windows**,
conservative meaningfully higher, and **it is not an agent-time question**:
CAL-9 depends on CAL-10, CAL-10 depends on CAL-7, and WRK-6 and SKL-9 are
blocked on owner decisions today. Sequencing, not throughput, is the
constraint.

**Assumptions behind every number:** each window ends in a merged GREEN-class
PR; no RED migration is attempted without an owner gate; CI stays as fast as it
is now (unit suite 312 s); nothing in the 90 unrun e2e specs turns out to
require a schema change. **Weakest assumption, by a distance: A4.** Ninety
specs that have not run in CI are ninety unknowns, and the estimate for
everything downstream moves with them.

---

## WHAT PREVENTS REAL USERS FROM USING IT TODAY

Ranked. Nothing here is a code blocker in the ordinary sense.

1. **Nobody has walked it signed-in.** 17 of 106 capabilities are
   `HUMAN_UI_PROVEN`; the deployed site was not reachable from this container.
   The product may be usable today and nobody has established that it is.
2. **There are almost no users.** 57 profiles, 46 live journal entries, 17
   organizations, 5 conversations, 0 teams, 0 cohort members, 0 evidence
   imports. Most journeys are unblocked and unused. That is a distribution
   position, not an engineering one — and several capabilities recorded as
   "broken" are only unused (Finding 1, and the EDU-2/WRK-6 inconsistency).
3. **The trust numbers a person sees are overstated** (Finding 2). The one
   defect on this list that actively misinforms a real user, on the CV that
   leaves the platform.
4. **An employer may be shown a staffing gap that does not exist** (Finding 3).
5. **No authenticated regression safety** (Finding 6). Not user-visible; it is
   why the four above survived to be found by an audit rather than by CI.
6. **The mobile app cannot be installed from a store.** Owner gates C.

---

## PLAIN ANSWERS

**WHAT IS ACTUALLY COMPLETE?** External vacancy ingestion, at real scale
(89 021 rows, a clean four-module pipeline). The PERSON record→confirm→evidence
loop on web and phone. Organization creation, membership and cross-org
isolation. The institution programme→cohort→demand→outcomes→export chain.
Booking→engagement. The AI runtime with cost ceilings and egress control. The
security posture: 548/548 SECURITY DEFINER functions pin `search_path`, the
2026-08 RLS P0 is closed, no new P0 found. And — genuinely rare — a governance
apparatus that is mostly honest about itself.

**WHAT EXISTS BUT IS NOT CONNECTED?** Much less than the register says.
Genuinely unreachable: `/dashboard/learning` (EDU-5), `/dashboard/talent`,
`/dashboard/admin/import-sandbox`, `/dashboard/admin/intelligence-observations`.
Everything else previously listed as disconnected — procurement, business
trips, defects, project economics, the handover passport — is wired and simply
unused.

**WHAT IS DUPLICATED/PARALLEL?** Two real divergences: `languageLevelSatisfies`
(SEP-7 collapse in the second copy) and the journal live-entry rule re-derived
across 34 readers with 23 omitting it. One harmless name collision
(`deriveSkillEvidence`). The four `vacancy-*` modules are layered, not
duplicated.

**WHAT IS BROKEN?** The evidence-trail count on the profile and the Verified CV
(live, 4 workers). The capacity language gap (UNKNOWN reported as NOT-MET). The
RPL branch that can never fire. Two register guards that check nothing. The
parity snapshot, 5 rows stale. And the register's own account of four
capabilities.

**WHAT IS MISSING?** Confirmed absent at every layer: capacity reservation
(CAL-7), shifts/rotas (CAL-8), utilisation/FTE (CAL-9), planned-vs-actual
learned duration (CAL-10), saved searches and alerts (DEM-8), team→project
assignment (WRK-6). Also missing, and more consequential than any of them: a
database in CI, and therefore any automated proof that the signed-in product
works.

**WHAT REQUIRES OWNER DECISION?** The six standing register decisions
(PER-11, ORG-2, EVID-2, EVID-6, MKT-7, GOV-1); who may assert a recognised
equivalence; employer-side team-matching disclosure; the WRK-6 schema change;
the subject's right to refuse an imported record (RED); the seven store gates;
and the walkthrough.

**WHAT PREVENTS REAL USERS FROM USING IT TODAY?** Ranked above. In one line:
not missing features — missing proof that what exists works, and missing users.

**HOW MUCH AGENT EXECUTION TIME REMAINS?** Production-complete web:
**12–18 windows realistic** (6 optimistic, 30+ conservative). Mobile as
currently scoped: **2–4**. Store-submission-ready: **2–4 agent windows, then
owner-gated absolutely**. The fully connected architecture as specified:
**40–70 realistic**, and constrained by decision sequencing rather than by
agent throughput. The single largest uncertainty in every one of these numbers
is A4 — ninety end-to-end specs that have not executed in CI.

---

## DO-NOT-REGRESS

- `worker_absence_scheduling` is SECURITY DEFINER **on purpose** and the
  Supabase advisor will always flag it ERROR. It narrows what a manager sees.
  Reverting it to `security_invoker` re-widens absence-note disclosure.
- The four capabilities in Finding 1 are **live**. Do not "wire" them; they are
  wired. Fix the register.
- `lib/journal/journal-list-core.ts:198` is the live-entry rule. A second copy
  is the defect — extract and share it, do not re-derive it.
- `lib/market/match-criteria-v2.ts` is the one language-level comparison, and
  its `null` is load-bearing. A `boolean` return is the defect.
- `MIN_EXPECTED` in `e2e-smoke.yml` is a floor. Widening `E2E_SPECS` must raise
  it. It may never be lowered to make a red run green.
- Ledger `version` is the APPLY timestamp, not the filename prefix. Match
  parity on `name`.
- SKL-9's assessment model is built and consumed. The gap is the record and the
  policy, not the model.
