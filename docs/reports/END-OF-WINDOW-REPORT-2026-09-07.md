# END-OF-WINDOW REPORT — LabourMarket.ai, 2026-09-07

**Branch** `claude/company-historical-work-import-agatsq` · **PR** #1600 (draft,
`needs-human-gate`) · 16 commits.

**CI on head `ed7def15`:** `quality` ✅ · `e2e-smoke` ✅ · `mobile` ✅ · CodeQL ✅ ·
`migration-safety` ❌ **by design** (3 findings, 2 unapproved migrations) ·
Supabase Preview skipped (concurrent-branch limit, not this PR).
Local: typecheck ✅ · lint 0 errors ✅ · build ✅ · **1,220 files / 20,574 tests** ✅ ·
all 13 `quality` gates ✅ · product gate **0 new surfaces** ✅.

**NO HUMAN WALK WAS PERFORMED.** Nothing below is marked `HUMAN_UI_PROVEN`.
Walks are deferred to the next window, as instructed.

---

## 0. EVIDENCE LEVELS USED

| level | means |
|---|---|
| `CODE_PROVEN` | exists, typechecks, wired to a real caller |
| `TEST_PROVEN` | behaviour pinned by tests that fail when broken |
| `PRODUCTION_RPC_PROVEN` | the real RPC executed on production and returned |
| `PRODUCTION_DATA_PATH_PROVEN` | executed end-to-end on production data under real users' auth |
| `PRODUCTION_PERSISTENCE_PROVEN` | wrote rows to production that are still there |
| `HUMAN_UI_PROVEN` | a person used it in a browser |

A level is claimed only where it was actually reached. Where the ceiling is set
by an unapplied migration, that is said rather than rounded up.

---

## 1. THE SPECIFIC ITEMS REQUESTED

### 1.1 "Kam pateikti atliktą darbą?" / work-verifier routing — **BUILT AND USABLE**

`TEST_PROVEN` (wiring) + `PRODUCTION_DATA_PATH_PROVEN` (the gap it closes).

`work-verification-state.ts` shipped 2026-09-06 with the full model — nine
states, a first-class "nobody" verifier, one honest next action each — and
**zero consumers**. Every test passed and the worker was shown a blank.

Now derived per entry on `/dashboard/journal` from that entry's own context,
with one real destination: *"name who you did this for"* → the self-declared
work-history editor, which writes the engagement context a confirmation can
reach. Telling someone to identify a verifier without saying where is the same
dead end in different words.

The guard pins the **wiring**, not the derivation — a unit test could never have
caught this, because the derivation was never wrong.

### 1.2 Orphaned / unverifiable work and verification-state consumption — **PARTIAL**

`PRODUCTION_DATA_PATH_PROVEN`.

Measured on production: **56 active `employee` engagement contexts with no
organization**; **17 of 34** live journal entries sit in one; all unconfirmed.
Half of all recorded work on this platform can reach no verifier.

This window made that VISIBLE and gave it a next step. It did **not** make those
56 contexts resolvable — that requires the employer to exist on the platform.
Until then, "evidence" for half the recorded work is self-report with an honest
label. Classifying it as anything better would be false.

### 1.3 FREE / COMMITTED / UNAVAILABLE semantics — **BUILT AND USABLE**

`TEST_PROVEN`.

Three states, and — after the owner's correction, which caught a defect I
introduced the same day — three **constraint kinds** beneath them:

| constraint | meaning | overridable |
|---|---|---|
| `none` | nothing known stands in the way | yes |
| `commitment` | accepted booking or active assignment | **yes** |
| `hard_constraint` | approved leave | no |

**The defect, stated plainly.** The morning's fix correctly stopped calling a
booked worker "free". But the project field's candidate list filtered
`state === "free"`, so the moment that landed everyone with an accepted booking
silently vanished from every candidate list. A correct fix one layer down
produced a worse lie one layer up: a COMMITMENT rendered as a PROHIBITION,
decided by nobody. Fixed in `ed7def15`.

### 1.4 Capacity using approved absences, accepted bookings, active assignments — **BUILT AND USABLE**

`TEST_PROVEN` + `PRODUCTION_DATA_PATH_PROVEN`.

Before this window capacity read **one** signal — approved absences. Measured on
production: `worker_absences` **0 rows**; `booking_requests` **1 accepted**;
`project_worker_assignments` **3 active**. The one input consulted was empty and
the only real commitments that existed were invisible, so every worker read
FREE, always, while the calendar on the same screen showed the booking.

No migration was needed — the rows were always readable under existing RLS
(`pwa_select`, `booking_requests_select`); nothing read them.

`commitmentsKnown` joins `absencesKnown`: a surface must be able to say which of
its inputs actually answered.

### 1.5 Overlaps as warnings rather than prohibitions — **BUILT AND USABLE**

`TEST_PROVEN`.

The candidate list offers committed people, sorted after the unconflicted ones,
carrying what they are already on and until when. Only a hard constraint
withholds a row — and that is **counted and reported**
(`withheldByHardConstraint`), never dropped in silence: a planner must be able
to see the list is shorter than the roster and why.

Guards pin both halves, including that the three constraint kinds map 1:1 onto
the three states — that mismatch is exactly how "committed" would drift back
into meaning "unavailable".

**Not yet built** (honestly MISSING, see §3): alternatives-on-conflict, the
explicit authorized-override record, the audit row for an override, and any
learning from actual-vs-planned execution. What exists today is
DETECT → WARN. The chain beyond that is not started.

### 1.6 Historical person/company work import — **BLOCKED** (built end to end, unapplied)

`TEST_PROVEN` throughout; `CODE_PROVEN` for the server layer; ceiling set by the
owner gate.

ORGANIZATION-rooted, never company-rooted: an employer's timesheet, an agency's
assignment report, a school's placement log and a training provider's assessment
are one chain on one record table, differing by `activity_kind` and
`supplier_role`. Eight additive tables, 21 policies.

Five guarantees live in the schema rather than in code: an import cannot write
an attested or verified state; evidence has no UPDATE and no DELETE policy;
independent verification requires a recorded party that is neither subject nor
supplier; fact and derived never merge; the same source imports once.

**People without accounts are first-class**: `organization_people` is
deliberately not a platform identity, and the link is two-sided — an
organization OFFERS, and only the person accepts or refuses.

It cannot write a row until the migration is approved.

### 1.7 Real timesheet / work-report → Living Evidence Graph — **PARTIAL**

`CODE_PROVEN`.

The chain RAW HISTORY → PARSE → ENTITY RESOLUTION → RECONCILIATION → OWNERSHIP →
PROVENANCE → EVIDENCE exists end to end. The next link —
EVIDENCE → **COMPETENCY** — does **not**:
`organization_evidence_competency_signals` is created by the migration and
**nothing extracts signals into it**. That is the single largest unfinished edge
of the import, and it is honestly MISSING, not partial.

### 1.8 Authorized ChatGPT / Claude / agent actions — **BUILT AND USABLE**

`TEST_PROVEN`.

Twelve capabilities existed. This window added **twelve more**: eleven
`evidence.*` covering the entire import flow, plus `workforce.availability` —
the first of the owner's company questions to become an authorized canonical
action rather than a chat-only answer.

**One implementation, not two.** A guard asserts on the source that the human
transport and the agent transport import every write from the same core, that
neither queries the evidence tables directly, that the commit gate is one shared
module, and that no transport uses a service-role client.

Still chat-only, not capabilities: *"ko mums trūks spalį?"* (needs a forecast
model), *"rask brigadą projektui"* (needs the team model), *"parodyk, kas
vėluoja"*.

### 1.9 Planning / calendar / capacity — **PARTIAL**

Capacity: fixed and correct (§1.4, §1.5). Calendar: untouched this window.
Planning: the workforce planning zone composes the reads; forecast and
future-demand models do not exist.

### 1.10 Evidence → capability → competency → qualification / RPL → deployability — **PARTIAL**

`TEST_PROVEN` for the model and its wiring.

`READINESS_ITEM_DOCUMENT_TYPES.qualification_or_skill_evidence` mapped to two
document slugs and nothing else — on a row whose own name promised to accept
skill evidence. Someone with years of independently confirmed work and no paper
read identically to someone with nothing.

The five concepts are now held apart: DEMONSTRATED CAPABILITY, FORMAL
QUALIFICATION, RECOGNIZED EQUIVALENCE (RPL), VALID CREDENTIAL, MISSING FORMAL
REQUIREMENT. The load-bearing rule is tested from both sides: **demonstrated
capability never satisfies a formal requirement** (a required certificate is
required; implying otherwise would put someone on a site they may not lawfully
be on), and it stops being invisible.

Routes: confirmed work → prior-learning review; unconfirmed work → seek
confirmation first (not a course for work already done); nothing recorded →
training.

**MISSING beyond the model:** no RPL assessment flow, no equivalence decision
record, no deployability surface for an employer. The chain is named and
wired at one row; it is not yet a system.

### 1.11 Supply → demand → matching — **PARTIAL**

Supply discovery: `PRODUCTION_DATA_PATH_PROVEN`, **BLOCKED** on the owner gate.

Six market-direction fixes were all subtractive. Production carries 2 submitted
`agency_offer` rows and `customer_requests_select` is own-row / admin / org-
demand-access — so **no employer could discover available workforce at all**.
The supply side was written and unreadable, which is also what made declaring it
pointless.

`list_open_supply_for_employers()` — proven on production inside a transaction
under three real users' auth, then rolled back (manager 2 of 2; the supplying
agency 1 of 2, its own withheld; a plain worker 0 with no exception). Six
non-identifying columns; no name, no contact, no free text.

**Matching itself: NOT TOUCHED this window.** The existing deterministic
match-v1 engine runs over worker supply only; organizational capacity is not an
input to it.

### 1.12 The four verticals

| vertical | class | honest reason |
|---|---|---|
| **Worker** | **PARTIAL** | Journal → evidence → skills is real (40 entries, 50 skills). Verification is 2 skills platform-wide. Half of recorded work is unverifiable. |
| **Company** | **PARTIAL** | Roster, projects, demand intake, scouting, capacity all real. Teams/brigades, tasks, assets, absences: 0 rows ever. |
| **Agency** | **PARTIAL** | Can declare supply and bridge to clients. Discovery of that supply is built and **blocked** on the gate. |
| **Institution / college** | **ARCHITECTURE ONLY** | See §5. |

### 1.13 Data preservation, provenance, rollback, anti-orphaning — **BUILT AND USABLE**

`TEST_PROVEN`.

* **Preservation** — no UPDATE and no DELETE policy on evidence records; nothing
  is deleted to undo anything. Withdrawal is an append-only event; the record
  and the reason both stay readable.
* **Provenance never collapsed** — six separate columns: subject, supplying
  organization, supplier capacity, the person who stated it, the importer, a
  recorded third party, plus the lifecycle actor. An agency is never rendered as
  the end employer.
* **Rollback** — both migrations ship a rollback; the evidence one refuses to
  run while any record, session or roster person exists.
* **Anti-orphaning** — composite foreign keys `(child, organization)` make
  cross-org drift unrepresentable; a hash chain per import session; idempotency
  on `(organization_id, record_fingerprint)`.
* **Self-confirmation** — 3 real rows on production, preserved and reclassified,
  never deleted; write-side and read-side agree.

### 1.14 Canonical master register — **BUILT AND USABLE** (corrected 2026-09-07, post-merge)

`TEST_PROVEN`.

**This section originally read DOCUMENTATION ONLY, and that is no longer true.**
It was written before main moved. Merging `origin/main` (five commits, #1601 and
#1604 among them) brought in exactly the thing this section named as the
highest-value governance work remaining:

* `apps/web/lib/product-gate/capability-register.ts` — the machine-readable half
  of §6, using the owner's six-value vocabulary;
* `apps/web/lib/guards/capability-register.test.ts` and
  `.github/scripts/product-truth.mjs` — the enforcement. A capability id present
  in one half and absent from the other is a **CI failure**.
* The register is now authoritative for STATUS; the table in
  `CAPABILITY_INVENTORY.md` §6 is a dated snapshot beside it.

`docs/CAPABILITY_INVENTORY.md` §6 still holds ~90 capabilities across 12 domains
plus §6.4's nine-migration matrix, and main added rows for this branch's own
work: **DEM-9** (organizational supply discovery, BLOCKED), **CAL-10**
(planned-vs-actual learning, MISSING) and **GOV-9** (the executable
constitution).

The correction is recorded rather than quietly rewritten, because the original
finding was accurate when written and the fix came from elsewhere — which is
itself worth knowing.

### 1.15 Permanent regression journeys / capability reachability — **PARTIAL**

`TEST_PROVEN`.

Ten reachability/journey guards exist (dashboard-chain, feature-reachability,
marketplace-loop, product-nouns, invitation-attention, market-map-anchor,
public-contact, user-journey-interaction-contract, …). They pin that surfaces
are **reachable**. They do not walk a journey end to end against real data, and
there is **no e2e suite directory** — `e2e-smoke` is a build-and-boot check.

Two capabilities were nonetheless found built-and-unwired this window
(`work-verification-state`, and the capacity/candidate-list break I introduced),
which is direct evidence that reachability guards do not catch dead wiring.

### 1.16 Remaining P0 launch gaps

1. Two migrations unapplied → import and supply discovery inert (§6).
2. Both Supabase Auth settings still non-compliant (§7).
3. Half of recorded work unverifiable (56 org-less contexts).
4. 2 verified skills platform-wide — the trust ladder isalmost theoretical.
5. Competency extraction missing → the evidence→competency edge is absent.
6. ~40 shipped, RLS-guarded tables with **zero rows ever**.
7. ~~Master register unenforced~~ — **closed** by #1601/#1604, merged in
   (see §1.14). The register is machine-checked; the snapshot table beside it
   is not, and that residue is the only part left.
8. Matching does not consume organizational capacity.
9. No override/audit/learning chain beyond DETECT → WARN.
10. `SUPABASE_DB_URL` absent → two CI gates honestly inert.

### 1.17 College / institution release readiness — **ARCHITECTURE ONLY. NOT RELEASE-READY.**

What exists: `education_programs`, cohorts and learner outcomes are **applied**
on production; `lib/education/` holds programs, learners and outcomes reads;
`InstitutionProgramsSection` and `InstitutionLearnersSection` mount inside the
company workspace; the organization capability model already carries education
and training-provider roles; the evidence import's supplier roles include
`education_provider`, `training_provider`, `placement_provider` and `assessor`.

What does not: **1 programme and 1 cohort on production, 0 learner outcomes
flowing**, no institution-specific onboarding, no placement→work→evidence
journey walked, no RPL/equivalence path, and the import that would let a college
bring its placement history is gated. There is no institution vertical to
release yet — there is a foundation for one.

### 1.18 The two migration human-gate decisions — **OWNER**

Package: `docs/human-gate/HG-2026-09-07-organization-evidence-import-v1.md`.

**A. `20260907114500_organization_evidence_import_v1`** — 8 new empty tables, 21
policies. RED for exactly one reason: eight `GRANT`s, because this project has
no default privileges for `authenticated` (verified against three existing
tables). No trigger, no `SECURITY DEFINER`, no `using (true)`, no
`ALTER`/`DROP POLICY`, no data DML, nothing to `anon`.

**B. `20260907153000_employer_supply_discovery_v1`** — one new gated
`SECURITY DEFINER` reader plus its grant. Creates one function; alters no table,
policy or existing privilege; writes no row. Proven on production in a
transaction and rolled back.

Neither carries `-- @human-gate-approved`, deliberately: the marker asserts an
owner approved the file, and no such decision exists.

### 1.19 Both Supabase Auth owner actions — **OWNER, still outstanding**

Receipt: `docs/owner/OWNER-ACTIONS-RECEIPT-2026-09-07.md`. Both advisors were
re-read live from production **today** and both still fire:

* `auth_otp_long_expiry` — set Email OTP expiry ≤ 3600s.
* `auth_leaked_password_protection` — enable it.

Owner-only dashboard settings; no tool available to this session can write
Supabase Auth configuration. **Do not record either as done until the advisor
disappears.**

---

## 2. THE FULL GRAPH — every node classified

| node | class | evidence / honest reason |
|---|---|---|
| PEOPLE | BUILT AND USABLE | 56 profiles, 56 workers |
| REAL WORK | PARTIAL | 40 journal entries; half reach no verifier |
| SKILLS | BUILT AND USABLE | 50 worker skills, 161 registry |
| EXPERIENCE | PARTIAL | 79 engagement contexts, **56 with no organization** |
| EVIDENCE | PARTIAL | 13 confirmations, 3 self-confirmed |
| QUALIFICATIONS | PARTIAL | 4 education rows, **1 worker document**, 0 training assignments |
| COMPANIES | BUILT AND USABLE | 17 organizations, 19 memberships |
| AGENCIES | BLOCKED | supply declarable; discovery built, gated |
| TEAMS / BRIGADES | BUILT BUT NOT CONNECTED | tables shipped, **0 rows ever** |
| PROJECTS | BUILT AND USABLE | 9 projects, 5 assignments |
| SITES / OBJECTS | ARCHITECTURE ONLY | **1** work object platform-wide |
| TASKS / WORK STAGES | BUILT BUT NOT CONNECTED | 0 rows |
| AVAILABILITY | PARTIAL | work cards real; `worker_absences` **0 rows** |
| CAPACITY | BUILT AND USABLE | correct as of this window; 3 real commitments to read |
| CURRENT DEMAND | BUILT AND USABLE | 20 customer requests, 5 interest signals |
| FUTURE DEMAND | MISSING | no forecast model |
| EDUCATION / TRAINING / RECOGNITION | ARCHITECTURE ONLY | see §1.17 |
| COUNTRIES / JURISDICTIONS | BUILT AND USABLE | 11 locales, market countries, posting docs |
| MOBILITY | PARTIAL | preferred countries; no corridor model |
| MARKET SIGNALS | PARTIAL | 76 Eurostat observations; 76,747 vacancies from **one source, one country** |
| COMMERCIAL OPPORTUNITIES | MISSING | no signal → opportunity path |
| SOCIAL ACQUISITION | MISSING | not partial — absent |
| DATA FLYWHEEL / LEARNING | MISSING | no actual-vs-planned learning anywhere |

---

## 3. WHERE THE PRODUCT STILL NARROWS OR CONTRADICTS THE VISION

Unsoftened, as required.

1. **It is still closer to a job board than to a work graph.** The single largest
   data asset is 76,747 scraped vacancies from one country. The graph behind it
   is 40 journal entries, 1 work object, 0 tasks.
2. **Half of all recorded work is unverifiable by construction.** Now visible
   and actionable; still unverifiable.
3. **Verification is almost theoretical.** 2 verified skills platform-wide, both
   one person. The whole flywheel rests on that number.
4. **The thing that would fix 1–3 fastest is blocked on one approval.**
5. **Supply and demand remain asymmetric.** Demand has intake, board, scouting,
   interest signals. Supply has one row type and a reader that is gated.
6. **~40 shipped RLS-guarded tables have never held a row.**
7. **The repository under-reports itself.** 16 migrations documented as
   unapplied are applied; six such claims corrected this window, object by
   object — and the obvious filename-based sweep is *invalid* here (it reported
   231 of 235 "unapplied", including one verified applied minutes earlier).
8. **Built-and-unwired is the dominant local failure mode.** Two instances this
   window, one of them mine. Both new guards pin WIRING, not derivation.
9. **A correct fix can produce a worse lie one layer up.** The capacity →
   candidate-list break is the clearest example, and the owner caught it, not
   the tests.
10. ~~**The canonical register is documentation, not enforcement.**~~
    **Struck 2026-09-07, post-merge.** It was true when written and is not now:
    #1601/#1604 landed `capability-register.ts`, its guard and `product-truth.mjs`,
    so the register is machine-checked in `quality` (see §1.14). What survives of
    this narrowing is narrower: the **prose snapshot table** beside the register
    is still unenforced, so it can drift from the register the way file-header
    comments drifted from the ledger (§3.7).
11. **AI is an operator for import and one capacity question; not yet for
    planning, forecasting or team assembly.**
12. **No learning loop exists.** FACT / PLAN / FORECAST are correctly kept
    distinct — because only FACT is implemented.

---

## 4. WHAT THIS WINDOW ACTUALLY MOVED

* supply became readable (gated);
* half of recorded work stopped being silently unverifiable;
* "who is free?" stopped being wrong for every worker;
* a commitment stopped being silently converted into a prohibition;
* real experience stopped collapsing into "certificate missing";
* self-confirmation stopped reading as employer confirmation;
* the import engine exists end to end, for a human and an agent, over one core;
* six stale apply-status claims corrected, six correct ones deliberately left;
* a page I should not have built was removed rather than waived.

---

## 5. WHY IMPLEMENTATION STOPS HERE

Two items of the authorized sequence remain unexecuted: **matching** and the
**P0 journey sweep**. Both are blocked in substance rather than in effort:
matching over organizational capacity needs the supply reader applied, and a
journey sweep over imported history needs the import applied. Building either
now would be building on data that cannot exist yet.

The two gates in §1.18 and §1.19 are therefore the critical path, and they are
the owner's.

---

## 6. HIGHEST-VALUE CONTINUATION, once the gates are decided

1. Apply both migrations; import a **small authorized sample** first, never the
   full archive.
2. Competency extraction — the missing EVIDENCE → COMPETENCY edge.
3. ~~Make the master register machine-checked~~ — **done on main** (#1601,
   #1604), merged into this branch. What remains is keeping the dated §6
   snapshot table in step with the machine half.
4. Matching over organizational capacity, not only worker supply.
5. The override → audit → actual-result → learning chain beyond DETECT → WARN.
6. Decide the four live-UI migrations from the nine-migration matrix.
