# Canonical work-time truth — `journal_entry_work_items` classification and the timesheet fix

**Date:** 2026-08-18
**Base:** `origin/main` @ `c6e2ea1a`
**Production DB:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai)
**Scope:** REQ-OPS-007 (timesheets), REQ-OPS-029/030/031 (workload / capacity)

---

## 0. The owner ruling this implements

> Use the existing Work Journal-derived data as the canonical source.
> `journal_entry_metrics` is the canonical persisted source for derived /
> structured work-time metrics. Do NOT create a second equivalent hours truth
> merely to populate `journal_entry_work_items`.

Intended chain:

```
WORK JOURNAL ENTRY
  → ORIGINAL USER EVIDENCE / FACT      journal_entries.original_text
  → STRUCTURED DERIVED METRICS         journal_entry_metrics
  → CANONICAL WORK-TIME VALUE          lib/journal/work-time.ts  ⇄  timesheet_compute_lines_v1
  → TIMESHEET                          timesheets.lines_snapshot
  → WORKLOAD / CAPACITY                lib/planning
  → REPORTING / OTHER DERIVED VIEWS    CSV export, calendar strip
```

---

## 1. What was actually broken

The inherited diagnosis was right but incomplete. It said: `timesheet_compute_lines_v1`
takes `work_date` from metrics and hours from the empty `journal_entry_work_items`.

Verified on production, that is true — and there were **three** independent
computations of a worker's hours, disagreeing on the same real rows:

| # | Where | Reads | Answer for entry `3c7d80e3` (2026-07-02) |
|---|---|---|---|
| 1 | `timesheet_compute_lines_v1` | `journal_entry_work_items` | **0 h** (table has 0 lifetime inserts) |
| 2 | `lib/planning/planning.ts` calendar strip | `quantity` metric only, when its unit is a time unit | **5 h** |
| 3 | `lib/structuring/recognize-entry.ts` reviewer inbox | re-parses `original_text` at display time | **9 h** |

Answer 3 is not theoretical: a real reviewer confirmation on production carries
the note *"Valandos: 9 valandos (Valandos neaiškios) … Sistema nespėlioja,
kuriam darbui priklauso valandos."*

The hours were in `journal_entry_metrics` the whole time.

### Production evidence (2026-08-18)

```
journal_entry_work_items         0 rows, 0 lifetime inserts
timesheets                       0 rows, 0 lifetime inserts   ← blast radius of a fix
journal_entries                 36 rows
journal_entry_metrics          114 rows
  fragment_time / hours         10 rows, total 27
  fragment_time / minutes        2 rows, total 35
  quantity      / hours          6 rows, total 42
  quantity      / square_meters  2 rows, total 100   ← output, NOT time
  work_date                     32 rows
```

**3 of 36 entries carry BOTH `fragment_time` rows and an entry-level
`quantity` in hours** — a real, not hypothetical, double-counting hazard, and
the entry-level number reconciles with neither the fragment total nor any
single fragment:

| Entry | Fragments | Fragment total | Entry `quantity` |
|---|---|---:|---:|
| `3c7d80e3` | 5 h + 1 h + 3 h | 9 h | 5 h |
| `3d2bb255` | 1 h + 3 h | 4 h | 5 h |
| `7d185907` | 15 min + 20 min + 4 h + 2 h + 1 h | 7.58 h | 4 h |

So "which store is canonical" was genuinely an owner-level call, and so is
"which metric inside that store wins".

---

## 2. `journal_entry_work_items` — the four questions, answered

### 2.1 Original intended semantic purpose

From its own migration header (`20260601090000`, RED slice 3):

> Durable storage for the per-work-item recognition that today is
> computed-only at display time (`lib/structuring/recognize-entry.ts`). …
> This lets recognition survive beyond a single render and lets a reviewer
> confirm/correct individual items.

Two purposes, not one:
* **(a)** persist per-item recognition (work type, evidence phrase, hours, certainty, provenance);
* **(b)** carry a **per-item reviewer decision** (`status`: suggested / confirmed / rejected / needs_clarification).

### 2.2 Does it hold information `journal_entry_metrics` cannot represent?

| `journal_entry_work_items` column | Represented in `journal_entry_metrics`? |
|---|---|
| `title` | yes — `parsed_fragment` `"N\|rawPhrase"` |
| `evidence_phrase` | yes — same row |
| `hours_numeric` + `unit` | yes — `fragment_time` `value_numeric` + `unit_slug` (FK-checked against `productivity_units`) |
| `work_type_key` | yes — `fragment_activity` `"N\|label"` |
| `source` (computed / reviewer_corrected / worker_corrected) | yes — `journal_entry_metrics.source` (worker_input / ai_extracted / manager_corrected) |
| `certainty` (clear / partial / unclear) | **partially** — `unresolved_fragment` and `unknown_phrase` markers express "not resolved"; the clear-vs-partial split is not stored |
| `status` (per-ITEM reviewer decision) | **no** — reviewer decisions are per-ENTRY, in `journal_entry_confirmations.confirmation_scope` |
| `organization_id` (denormalised) | derivable — `journal_entries.engagement_context_id → engagement_contexts.organization_id` |

The index-prefix convention (`"N|…"`) is what makes metrics sufficient: it binds
a duration to *its own* activity and *its own* evidence phrase, so a fragment's
time can never drift to another activity. `lib/journal/edit-entry.ts` already
relied on exactly this to reload an entry for editing.

**Conclusion: for work time, metrics represent everything work-items could, and
represent it as the worker's own evidence rather than as a derived copy.**

### 2.3 Every current reader and schema dependency

| Reader | Kind | Disposition |
|---|---|---|
| `timesheet_compute_lines_v1` (`20260817170000`) | SQL, the only hours consumer | **re-pointed** to `journal_entry_metrics` |
| `getMyWorkItemHours` (`lib/timesheets/timesheets.ts:509`) | TS, workload strip | **re-pointed and renamed** `getMyJournalWorkHours` |
| `lib/planning/workload-model.ts` | doc comment only | comment corrected |
| `apps/web/lib/supabase/types.ts` | generated types | left as-is (table still exists) |
| `20260602120000_journal_entry_skills.sql` | mentions it in a comment | no dependency |
| guard tests | assert *about* it | updated to assert the deprecation |

**Writers: none.** No migration and no TypeScript path has ever inserted a row.
Confirmed by `pg_stat_all_tables.n_tup_ins = 0` and by a repo-wide scan that is
now a permanent guard.

### 2.4 Disposition

**Removed/deprecated as duplicate truth — but not dropped in this slice.**

* It is **not** populated. Populating it to satisfy readers is exactly what the
  ruling forbids, and after this change it has **zero readers**.
* It is **not** dropped: destructive DDL stays owner-gated (§3/§4 of the
  operating rules). It keeps its 0 rows, its RLS and its grants.
* The deprecation is recorded **in the database itself** via `comment on table`,
  so a session reading the schema rather than the repo still sees it.
* The one genuinely distinct semantic it carried — a **per-item reviewer
  decision** — was never built and has no rows. It is recorded in §6 below as an
  open product question, not silently inherited. If it is ever wanted, it must be
  built as a decision layer *over* the canonical metrics, never as a competing
  hours store.

---

## 3. The canonical rule

Implemented once, in two mirrored places pinned together by
`lib/guards/journal-canonical-work-time.test.ts`:

* SQL: `timesheet_compute_lines_v1` (migration `20260818150000`)
* TS: `apps/web/lib/journal/work-time.ts`

Per **live** journal entry (not deleted, not superseded, not replaced by a live
correction), scoped to the worker and to the organization behind the entry's own
engagement context, **exactly one** work-time source is selected:

* **A.** `fragment_time` rows — one line each — whenever the entry has at least
  one usable row. First row per index wins.
* **B.** otherwise the entry-level `quantity` metric, and only when its unit is a
  time unit. One line for the whole entry. Latest row wins.
* **C.** otherwise the entry contributes no work-time line. It stays a journal
  fact; it is simply not an hours fact.

**A and B are never summed.** The `not exists (select 1 from frag …)` clause is
the mechanism — double counting is structurally impossible, not merely avoided.

When an entry carries both, the ignored entry-level value is reported in
`conflicts` on the snapshot, with the entry id, the value and the unit. It is
**visible and auditable, never silently dropped, and never migrated into an
authoritative number.**

### Determinism of hours / minutes / quantity

| Unit | Treatment |
|---|---|
| `hours` | totals into hours |
| `minutes` | `value / 60`, rounded to 2 dp **per line**, at the same place in both SQL and TS so they cannot drift |
| `days` | totals as **day units**, never multiplied into hours — there is no approved workday length |
| non-time (`square_meters`, `pieces`, …) | productivity **output**; can never enter work time |

"Is this unit time?" is answered by `productivity_units.category = 'time'` — the
data, not a hardcoded list.

### Provenance

Every derived line carries `metricId`, `metricSource`
(`worker_input` / `ai_extracted` / `manager_corrected`), `derivedFrom`
(`fragment_time` / `entry_quantity`) and `evidencePhrase` — the worker's own
words. A derived hour is always traceable back to the evidence it came from.

### Edits, corrections and recalculation

Unchanged in design and now actually reachable:

* editing a confirmed entry writes a correction/supersede row; the derivation
  excludes the superseded original, so an edit **re-derives** rather than
  accumulates;
* `draft` / `reopened` timesheets recompute on refresh;
* a `submitted` snapshot stays frozen by the existing trigger;
* the original journal evidence is never rewritten or deleted by any of this.

### Timezone / work-date semantics

The day the work **happened** wins: the entry's own `work_date` metric when it is
a plain `YYYY-MM-DD`, else the created UTC day. A plain ISO day needs no
conversion and never enters a locale formatter; anything malformed is ignored
rather than guessed at. Several `work_date` rows resolve to the latest stated
day, deterministically in both SQL and TS.

### Tenant isolation

`timesheet_compute_lines_v1` is `SECURITY DEFINER` and is only ever called by the
gated commands, which resolve `worker_id` from `auth.uid()` and check
`belongs_to_organization` before passing an org. The derivation additionally
scopes rows by `engagement_contexts.organization_id = p_organization_id`, so work
logged for org A can never appear on org B's sheet. The function keeps its exact
signature and its `revoke … from public/anon/authenticated`; the reviewed
anon/SECDEF allowlist is unaffected. The TS workload read runs under the caller's
own RLS-scoped client and reads only their own worker's entries.

---

## 4. Proof

### 4.1 Repo

* `pnpm -F web test` — **966 files, 15,978 tests, 0 failures**
* `pnpm -F web typecheck` — clean
* `pnpm -F web lint` — 0 errors
* `node .github/scripts/migration-safety.mjs --self-test` — 26 passed, 0 failed
* placeholders / constitution / fit-signal / pilot-honesty / pricing-honesty /
  worker-plain-language guards — all clean

30 of those tests are the new `lib/journal/work-time.test.ts`, covering every
case the ruling named: unit determinism, day-units, non-time units, double
counting, duplicate rows, conflict reporting, entries with no hours, zero and
negative values, malformed indices, work-date precedence, multiple work-date
rows, several entries on one day, provenance, idempotent line keys, and the
three real production entries above reproduced verbatim.

### 4.2 Production, read-only

The derivation body was run verbatim against production with `p_worker_id` bound
to a real worker, **before** any migration was applied. Where the old code
produced **zero** lines, it produced **9 real lines from real Work Journal
evidence**:

| work_day | rule | value | hours | evidence (worker's own words) |
|---|---|---|---:|---|
| 2026-05-25 | fragment_time | 15 minutes | 0.25 | 15 minučių atlikau programėlės patikrinimą |
| 2026-05-25 | fragment_time | 20 minutes | 0.33 | valandą dvidešimt minučių programavau pataisymus |
| 2026-05-25 | fragment_time | 4 hours | 4.00 | 4 valandas glaisčiau sienas |
| 2026-05-25 | fragment_time | 2 hours | 2.00 | dvi valandas prižiūrėjau žirgus |
| 2026-05-25 | fragment_time | 1 hours | 1.00 | valandą su puse dėsčiau paskaitą … |
| 2026-06-24 | entry_quantity | 9 hours | 9.00 | *(entry-level; no fragments)* |
| 2026-07-02 | fragment_time | 5 hours | 5.00 | Šiandien rinkome laikrodžius … |
| 2026-07-02 | fragment_time | 1 hours | 1.00 | Tvarkiau ofisą - 1 h |
| 2026-07-02 | fragment_time | 3 hours | 3.00 | tęsiau programavimą projekto labour market ai … |

**No synthetic row was created to produce this.** It is a `select`.

Two lifecycle cases are proven by the same run on real data:
* entry `3d2bb255` (1 h + 3 h) is **superseded by** `3c7d80e3` (5 h + 1 h + 3 h) —
  a real worker edit. Only the live version contributes: 9 h, not 13 h.
* the three dual-source entries each contribute their fragment total, and their
  entry-level `quantity` appears in `conflicts` rather than in the sum.

---

## 5. What is still NOT proven, and why

**An org-scoped timesheet is still empty in production, and that is a usage fact,
not a code defect.**

| Engagement shape | Live entries | Entries carrying work time |
|---|---:|---:|
| `employee`, `organization_id IS NULL` (personal engagement) | 13 | **4** |
| `employee`, `organization_id` set | 12 | **0** |
| `owner`, `organization_id` set | 1 | 0 |

Every hour ever recorded on this platform was logged against a **personal**
engagement — the org-less `employee` context that
`20260702140000_worker_personal_engagement.sql` provisions for every worker so
they can journal before having an employer. `timesheets.organization_id` is
`NOT NULL`, so those hours legitimately have no org document to land on.

The honest consequences:

* **Work Journal → workload / capacity is proven end-to-end on real production
  data** — that path is personal and needs no org.
* **Work Journal → timesheet is proven correct on real production evidence**
  (§4.2) but **cannot yet be proven as a non-empty org document**, because no
  worker has journalled hours against an employer.
* Closing that last gap requires either a real worker logging real hours against
  an org engagement, or a product decision to allow a personal timesheet
  (§6). It does **not** require, and must not be faked with, seeded rows.

---

## 6. Open owner questions raised by this work

1. **Personal timesheets.** Should a worker be able to produce a timesheet for
   work logged on their personal engagement (self-employed, between employers)?
   Today `timesheets.organization_id` is `NOT NULL`, so they cannot. This is the
   single reason the org timesheet is empty despite real recorded hours.
2. **Per-item reviewer decisions.** `journal_entry_work_items.status` was the one
   semantic metrics do not carry. It was never built. Do we want per-activity
   confirm/reject, or is per-entry confirmation
   (`journal_entry_confirmations`) sufficient? If wanted, it must be a decision
   layer over canonical metrics, never a second hours store.
3. **Dropping the deprecated table.** It is empty, commented and unreferenced.
   Dropping it is a one-line owner-gated migration whenever wanted.
4. **A parser defect found while reading real data, deliberately not fixed here.**
   Entry `7d185907` fragment 2 reads *"valandą dvidešimt minučių"* (1 h 20 min)
   but stored `20 minutes` — the composite duration lost its hour. Fragment 5
   reads *"valandą su puse"* (1.5 h) and stored `1 hours`. These are
   `extract-journal-suggestions` parsing gaps, upstream of everything here. The
   canonical rule faithfully derives from what was stored; correcting the stored
   values would be a silent migration of the worker's evidence and is not done.
   Filed as a separate defect.
5. **The reviewer inbox still re-parses raw text** (`recognize-entry.ts`) instead
   of reading the persisted metrics. It is a display/review model and out of this
   slice's scope, but it is the last surface that can still disagree with the
   canonical value.

---

## 7. Files

| File | Change |
|---|---|
| `supabase/migrations/20260818150000_journal_canonical_work_time_v1.sql` | new — replaces one function body, 2 comments, re-asserts revokes; no DDL/DML |
| `supabase/rollbacks/20260818150000_journal_canonical_work_time_v1.down.sql` | new — restores the v1 body, states plainly that rolling back returns timesheets to 0 lines |
| `apps/web/lib/journal/work-time.ts` | new — the canonical rule, pure |
| `apps/web/lib/journal/work-time.test.ts` | new — 30 tests |
| `apps/web/lib/guards/journal-canonical-work-time.test.ts` | new — pins SQL⇄TS, forbids any writer, pins the deprecation |
| `apps/web/lib/timesheets/timesheets.ts` | `getMyWorkItemHours` → `getMyJournalWorkHours`, reads metrics |
| `apps/web/lib/timesheets/timesheets-model.ts` | line shape: `lineKey`/`derivedFrom`/`evidencePhrase`/`metricSource`, snapshot `source` + `conflicts`, CSV columns |
| `apps/web/lib/planning/planning.ts` | calendar duration now uses the canonical rule |
| `apps/web/app/[locale]/dashboard/planning/*` | line key + corrected comment |
| guard baselines (4 files) | migration count 226 → 227, marker list, calendar assertion |
