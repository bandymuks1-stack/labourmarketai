# END-OF-WINDOW REPORT — 2026-09-07

Two views, as required. Nothing below is softened, and no evidence level is
claimed that was not earned.

**Branch:** `claude/company-historical-work-import-agatsq` · **PR:** #1600
(draft, `needs-human-gate`) · 10 commits, 72 files, +13,769 / −95.
**Checks:** `typecheck` ✅ · `lint` ✅ 0 errors · `build` ✅ · `vitest` **1,219
files, 20,549 tests, 2 skipped** ✅ · `migration-safety` **RED, 3 findings, as
intended** (two unapproved migrations, neither carrying `@human-gate-approved`).

**No human UI walk was performed.** Per the owner's timing correction, walks
are deferred to the next window. Nothing here is marked `HUMAN_UI_PROVEN`.

---

## VIEW 1 — IMPLEMENTATION STATUS

Evidence levels, weakest to strongest:

| level | means |
|---|---|
| `CODE_PROVEN` | it exists, typechecks, and is wired to a real caller |
| `TEST_PROVEN` | its behaviour is pinned by tests that fail when broken |
| `PRODUCTION_DATA_PATH_PROVEN` | executed against the production database through the real path, under real users' auth |
| `PRODUCTION_PERSISTENCE_PROVEN` | it wrote rows to production that are still there |
| `HUMAN_UI_PROVEN` | a person used it in a browser |

### 1.1 Organization historical evidence import

| piece | evidence | note |
|---|---|---|
| Schema (8 tables, 21 policies) | `TEST_PROVEN` | Asserted against the SQL itself by `organization-evidence-import-v1.test.ts` (32 tests). **NOT applied.** |
| Pure core (states, fingerprints, matching, parsing) | `TEST_PROVEN` | 50 tests over meaning, not plumbing |
| Server core (`import-core.ts`) | `CODE_PROVEN` | Cannot exceed this: the tables do not exist on production |
| Human UI (`/dashboard/company/evidence-import`) | `CODE_PROVEN` | Builds; renders its honest `needs-migration` state today |
| MCP capabilities (11) | `TEST_PROVEN` | Registered in the canonical registry; guard pins the whole flow is exposed |
| Subject side (profile card + accept/refuse) | `CODE_PROVEN` | |
| Rollback | `CODE_PROVEN` | Guarded: refuses while any evidence exists |

**Ceiling reached.** Every layer that can be proven without applying the
migration has been. `PRODUCTION_PERSISTENCE_PROVEN` requires the owner gate.

### 1.2 Self-confirmation is not independent confirmation

| piece | evidence |
|---|---|
| Read-side classification (`deriveIndependentReviewResult`, provenance, verification ladder) | `TEST_PROVEN` (16 tests) |
| The defect it fixes | `PRODUCTION_DATA_PATH_PROVEN` — 13 confirmations on production, **3 self-confirmed** by one person holding an `owner` engagement, all `approved` |
| Write-side block in `review_journal_entry` | **NOT DONE** — RED, owner decision 1 |

### 1.3 "Kam pateikti atliktą darbą?" — orphaned work

| piece | evidence |
|---|---|
| The model (`work-verification-state.ts`, shipped 2026-09-06) | `TEST_PROVEN` — and it had **zero consumers** until this window |
| The wiring into `/dashboard/journal` | `CODE_PROVEN` + `TEST_PROVEN` (19 tests pinning the WIRING, not the derivation) |
| The scale of the gap | `PRODUCTION_DATA_PATH_PROVEN` — **56** active `employee` engagement contexts with **no organization**; **17 of 34** live journal entries sit in one; all unconfirmed |

### 1.4 Employer supply discovery

| piece | evidence |
|---|---|
| `list_open_supply_for_employers()` | `PRODUCTION_DATA_PATH_PROVEN` — created in a transaction on production, called under three real users' auth, rolled back. **A: 2 of 2 · B (the supplier): 1 of 2 · C (plain worker): 0, no exception.** Function does not exist on production. |
| The gap it closes | `PRODUCTION_DATA_PATH_PROVEN` — `customer_requests_select` is own-row/admin/org-demand-access; 2 submitted `agency_offer` rows readable by nobody else |
| App layer + surface | `CODE_PROVEN` + `TEST_PROVEN` (15 tests, mostly pinning what it must NOT expose) |
| Applied to production | **NO** — RED, owner-gated |

### 1.5 Capacity reads committed work

| piece | evidence |
|---|---|
| `getEmployerWorkerCommitments` + three-state capacity | `CODE_PROVEN` + `TEST_PROVEN` (9 new tests) |
| The defect | `PRODUCTION_DATA_PATH_PROVEN` — `worker_absences` **0 rows** (the only signal capacity read), `booking_requests` **1 accepted**, `project_worker_assignments` **3 active** (both ignored). Every worker read FREE, always. |
| No migration | pure TS over rows RLS already allowed |

### 1.6 Real work ≠ "certificate missing"

| piece | evidence |
|---|---|
| `capability-standing.ts` (5 concepts) + wiring | `CODE_PROVEN` + `TEST_PROVEN` (17 tests) |
| The contradiction | `CODE_PROVEN` — `qualification_or_skill_evidence` mapped to 2 document slugs and nothing else |
| Independence excludes self-confirmation | `TEST_PROVEN`, source-pinned |

### 1.7 Reconciliation and governance

| piece | evidence |
|---|---|
| 16 migrations wrongly documented as unapplied | `PRODUCTION_DATA_PATH_PROVEN` |
| Ledger snapshot refreshed 234 → 266 | `PRODUCTION_DATA_PATH_PROVEN` |
| Three stale apply-status comments corrected | `CODE_PROVEN` |
| Market map serves demand only | `TEST_PROVEN` |
| Human-gate package + owner receipt | `CODE_PROVEN` — both Auth advisors re-read live today and **still firing** |

---

## VIEW 2 — VISION RECONCILIATION

Against the canonical vision: **a living global labour and work graph**.

### 2.1 The graph, node by node

| node | class | the honest reason |
|---|---|---|
| PEOPLE | **BUILT AND USABLE** | 56 profiles, 56 workers |
| REAL WORK | **PARTIAL** | 40 journal entries; **half of them can reach no verifier** |
| SKILLS | **BUILT AND USABLE** | 50 worker skills, 161 in the registry |
| EXPERIENCE | **PARTIAL** | 79 engagement contexts, but **56 have no organization** |
| EVIDENCE | **PARTIAL** | 13 confirmations, 3 of them self-confirmed |
| QUALIFICATIONS | **PARTIAL** | 4 education rows, **1 worker document**, 0 training assignments |
| COMPANIES | **BUILT AND USABLE** | 17 organizations, 19 memberships |
| AGENCIES | **PARTIAL** | supply declarable since long ago; **discoverable only after this window's gated read is approved** |
| TEAMS / BRIGADES | **BUILT BUT NOT CONNECTED** | tables shipped, **0 rows ever** |
| PROJECTS | **BUILT AND USABLE** | 9 projects, 5 assignments |
| SITES / OBJECTS | **ARCHITECTURE ONLY** | **1** work object on the whole platform |
| TASKS / WORK STAGES | **BUILT BUT NOT CONNECTED** | `work_tasks`, `journal_entry_work_items` — 0 rows |
| AVAILABILITY | **PARTIAL** | work cards exist; `worker_absences` **0 rows** |
| CAPACITY | **PARTIAL** | correct as of this window; still reads only 3 real commitments |
| CURRENT DEMAND | **BUILT AND USABLE** | 20 customer requests, 5 interest signals |
| FUTURE DEMAND | **MISSING** | no forecast model exists |
| EDUCATION / TRAINING / RECOGNITION | **PARTIAL** | programmes applied; **RPL is a model added this window with no assessment flow behind it** |
| COUNTRIES / JURISDICTIONS | **BUILT AND USABLE** | 11 locales, market countries, posting documents |
| MOBILITY | **PARTIAL** | preferred countries exist; no corridor model |
| MARKET SIGNALS | **PARTIAL** | 76 Eurostat observations, 76,747 vacancies **from one source in one country** |
| COMMERCIAL OPPORTUNITIES | **MISSING** | no path from a market signal to a named opportunity |

### 2.2 Where the product still NARROWS or CONTRADICTS the vision

Stated plainly, because the owner asked for it unsoftened.

**1. It is still closer to a job board than to a work graph.** The single
largest data asset is 76,747 scraped vacancies — one source, one country. The
graph the vision describes has 40 journal entries, 1 work object and 0 tasks
behind it. Demand is real; the *work* side is a rounding error next to the
vacancy dump.

**2. Half of all recorded work is unverifiable by construction.** 56 active
`employee` contexts with no organization. A person logs real work into a
context with nobody above it. This window made that VISIBLE and gave it a next
step; it did not make those 56 contexts resolvable, because that needs the
employer to exist on the platform. Until then, "evidence" for half the work is
self-report with a label.

**3. Verification is rare enough to be almost theoretical.** 2 verified skills
on the entire platform, both belonging to one person. The whole flywheel —
evidence → competency → matching — rests on a number that is 2.

**4. Historical import, the thing that would fix 1–3 fastest, is blocked on one
approval.** It is built end to end and cannot write a row. The vision says
history is foundational; today it is a pull request.

**5. Supply and demand are still asymmetric.** Demand has an intake, a board, a
scouting engine and interest signals. Supply has one declarable row type and,
until this window, no reader at all. Even now the reader is gated.

**6. ~40 shipped, RLS-guarded tables have never held a row.** Teams,
marketplace listings, matches, agreements, contracts, proposals, assets,
absences, training, performance, procurement, onboarding, all five `lmc_*`.
That is not waste — most of it is correct and waiting — but it is the exact
measure of the gap between BUILT and USABLE, and it is large.

**7. The repository under-reports itself.** 16 migrations documented as
unapplied are applied. Two of eight audit sweeps commissioned for the
reconciliation were themselves misled by those comments. This is a governance
defect that costs real rediscovery time every window.

**8. Two capabilities shipped this window were found built-and-unwired.**
`work-verification-state.ts` (2026-09-06) had zero consumers. That is the
dominant local failure mode: correct model, green tests, connected to nothing.
Both guards added this window pin the WIRING, not the derivation, for that
reason.

**9. AI is an operator only for import.** 11 evidence capabilities plus the
earlier 12. None of the owner's company questions — *"kas laisvas kitą
savaitę?"*, *"ko mums trūks spalį?"*, *"rask brigadą projektui"* — is an
authorized canonical action yet. Capacity is a chat answer, not a capability.

**10. Social acquisition and the commercial-opportunity chain do not exist.**
Not partial: MISSING. No post generation, no distribution, no candidate intake
from a channel, no signal → opportunity path.

### 2.3 What this window moved

Honestly small, and structural rather than cosmetic:

* the supply side of the market became readable (gated);
* half of all recorded work stopped being silently unverifiable;
* "who is free?" stopped being wrong for every worker;
* real experience stopped collapsing into "certificate missing";
* self-confirmation stopped rendering as employer confirmation;
* the import engine exists end to end, for a human and an agent, over one core.

---

## HIGHEST-VALUE EXECUTABLE CONTINUATION

Ordered by graph value per unit of risk. Items 1–2 need the owner; 3–6 do not.

1. **Approve the two gated migrations** (evidence import, supply discovery).
   Both have full packages; the first unblocks the single fastest route out of
   defects 1–3 above.
2. **Decide the four live-UI migrations** from the nine-migration matrix.
   Users have been shown "not enabled yet" since ~2026-07-13.
3. **Make capacity an authorized capability**, not only a chat answer — the
   first of the owner's company questions to become an agent-callable action.
   No migration; the core exists.
4. **Connect work objects and tasks to the journal.** 1 object and 0 tasks
   against 40 entries is the emptiest edge in the graph, and the journal
   already carries a site metric that nothing resolves to an object.
5. **Extract competency signals from committed evidence** — the REAL WORK →
   EVIDENCE → COMPETENCY edge. The table exists in the gated migration; the
   pure extractor can be built and tested now.
6. **Finish the stale-status sweep** (owner decision 7). Three comments were
   corrected; the sweep is evidence-based and mechanical, and it stops the
   rediscovery tax every future window pays.

Deferred deliberately: future demand, corridors, commercial opportunities and
social acquisition. Each needs a real data foundation the graph does not have
yet, and building them now would produce exactly the fragment-optimisation the
owner's correction forbids.
