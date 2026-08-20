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
