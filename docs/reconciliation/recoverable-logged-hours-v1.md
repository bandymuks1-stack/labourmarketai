# Reconciliation register — hours the worker wrote that were never kept

**Status 2026-08-20:**

| Class | Entries | Workers | Range |
|---|---|---|---|
| `RECOVERABLE_IN_ORG_CONTEXT` | **11** | 2 | 2026-05-27 → 2026-07-05 |
| `RECOVERABLE_BUT_CONTEXT_UNRESOLVED` | **3** | 3 | 2026-06-02 → 2026-07-28 |
| **Total** | **14** | 4 | |

Nothing was recovered automatically. Nothing may be.

Classifier (read-only, repeatable):
[`scripts/db-proof/recoverable-logged-hours.sql`](../../scripts/db-proof/recoverable-logged-hours.sql)

## What happened to them

Until 2026-08-20 the composer posted fragments only when their status was
`confirmed`, and the entry-level duration only when its own status was
`confirmed`. Everything still `pending` was dropped **silently**, while the
entry saved and looked successful. A one-tap "confirm all" control existed;
nothing said that skipping it discarded what the worker had written.

Measured over the 26 live journal entries: **16 stated hours in the worker's
own words, 4 kept them, 14 lost them** — and all 14 had not one confirmed
fragment. Two entries in the entire database had ever had one.

The cause was never parsing. The durations were read correctly; they just never
left the browser.

## Why they are not corrected automatically

Doctrine §7: the platform never presents inferred data as though a human had
asserted it. Re-parsing `"3h staliaus darbai / 6,5h betonavimas"` and writing
6.5 hours onto a person's timesheet — hours that will be approved, and may be
paid — would manufacture a claim that worker never made. That is worse than the
loss it repairs.

So recovery is **the worker's act**, one entry at a time.

## How a worker recovers one

Open the entry and save it again. The composer re-derives the durations from
the same text, and since 2026-08-20 it **cannot** drop them quietly: an
unreviewed duration blocks the save until the worker keeps it or discards it
deliberately.

The edit path runs through `journal_entry_supersede_v2`, so recovery is a
hash-chained correction, not an edit in place: a NEW entry carries the kept
hours, `correction_of` / `superseded_by` are stamped, and the original row
stays intact and readable with its author, its time and its text.

## The two classes

**`RECOVERABLE_IN_ORG_CONTEXT` (11)** — the entry already sits in an
organization-scoped context, so recovering it lands the hours directly on that
employer's timesheet. These are the ones one edit away from being real.

**`RECOVERABLE_BUT_CONTEXT_UNRESOLVED` (3)** — the entry also sits in an
org-less context, so recovering the hours answers only half the question; which
engagement the work belonged to is the separate, deliberately unanswered
question in
[`engagement-context-misroutes-v1.md`](engagement-context-misroutes-v1.md).
Several entries in that set are plainly personal work, for which the org-less
context is correct and the hours were never meant for an employer.

## No new entry can join this set

The save path now refuses to discard unreviewed durations
(`lib/journal/unconfirmed-work-time.ts`), pinned by
`lib/guards/logged-hours-not-silently-dropped.test.ts` — including that the
save path may not promote a pending suggestion to `confirmed`, which would be
the same fabrication by another route.

## Why this register exists rather than a bulk fix

Because until these 14 are recovered — or deliberately abandoned — **production
holds no real attributed work-time at all**. Every downstream consumer
(task→cost attribution, actuals→capacity forecasting) would be reading an empty
table. That is why neither was built ahead of this.

---

## Real human acceptance test — WAITING_FOR_REAL_USER_EVENT

The chain below is verified end-to-end against production functions, but **no
real employer-attributed hour exists yet**, so the last proof needs a signed-in
person. This test deliberately requires **no invented work**: the work already
happened and the worker already wrote the hours down — only the structured
duration was dropped by the pre-2026-08-20 composer.

**Who.** Either owner of a `RECOVERABLE_IN_ORG_CONTEXT` entry. Measured
2026-08-21:

| Worker | Recoverable entries in an org context | Span |
|---|---|---|
| Ramūnas Šukys (`01353767`) | **9** | 2026-05-31 → 2026-07-05 |
| Donatas (`dc3284ea`) | 3 | 2026-05-30 → 2026-07-29 |

**Recommended entry** — Ramūnas, `b9c8bfae-9e27-49a5-a244-f4a0b753594c`,
work_date 2026-07-05, organization `20b2c802-…`, stated duration `9h`. It is the
newest, carries a single unambiguous duration, and already has a `work_date`
metric, so nothing about the day has to be decided.

### The steps (the whole test is one edit)

1. Sign in normally as that worker. No impersonation, no service role.
2. Open the Work Journal and find that entry.
3. Open it for editing and save it again.
4. The composer re-derives the duration from the same text. Since 2026-08-20 it
   **cannot** drop it silently: it names the unreviewed duration and blocks the
   save. **Keep** it — that confirmation is the worker's own claim, which is the
   only thing that may turn written text into recorded time (doctrine 7).
5. Confirm the engagement context if asked. It must be the **organization**
   context, not the personal one.
6. Do not attach a task unless a genuine one exists — task attribution is proven
   and optional, and inventing one would corrupt the evidence.

### What must then be true

Each of these is a real assertion, not a screenshot:

- the ORIGINAL entry is still readable, with its author, time and text intact —
  recovery goes through `journal_entry_supersede_v2`, so a NEW entry carries the
  kept hours and `correction_of` / `superseded_by` are stamped;
- the new entry carries a `journal_entry_metrics` row with
  `metric_slug='fragment_time'` (or entry-level `quantity`), `unit_slug='hours'`
  and `value_numeric = 9`;
- that entry sits in the **organization** context;
- `timesheet_compute_lines_v1(worker, org, period)` returns a line for
  2026-07-05 carrying those 9 hours — the same call the timesheet UI makes;
- the existing draft timesheet recomputes rather than staying at `0.00`
  (create/refresh/submit all recompute from the canonical function);
- nothing was written to `journal_entry_work_items` — it stays at 0 rows.

### What this test finally proves

It converts `REAL_EMPLOYER_SCOPED_USAGE` from NOT_YET_PROVEN to proven, and it
is the first time production would hold **any** attributed work-time. Until it
happens, every downstream consumer — task→cost attribution, actuals→capacity —
is correctly reading an empty set, and building them further would be building
over nothing.

### Rules for whoever runs it

- Do **not** create a journal entry describing work that did not happen.
- Do **not** confirm a duration on the worker's behalf.
- Do **not** re-point a historical entry's engagement context to make the funnel
  look successful — that question is deliberately open in
  [`engagement-context-misroutes-v1.md`](engagement-context-misroutes-v1.md).
- If neither worker has time to do this, the correct status is
  **WAITING_FOR_REAL_USER_EVENT**, and unrelated product work continues.
