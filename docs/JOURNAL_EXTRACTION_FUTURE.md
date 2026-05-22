# Work Journal — future automatic extraction (documentation only)

> **Status:** Future design note. **Nothing in this document is implemented.**
> No AI, parser, or auto-extraction exists or is added by the Critical Path
> Fixes sprint. The journal today captures **manual** entries only (free text +
> optional work direction, quantity, unit). This file records the *intended*
> future flow so it is built honestly when the time comes.

## Intended future flow

```text
Worker writes a natural-language entry
  → system SUGGESTS date / time / location / work categories / skills / quantities / units
  → worker REVIEWS and CONFIRMS (or edits) every suggestion
  → manager / client can later confirm the entry
  → confirmed proof strengthens contextual fit signals (never a universal score — see §10)
```

## Journal text → structured work lines

A single free-text entry can describe **several** work items, each with its own
quantity, unit, time, and location (e.g. "laid 40 m² of tiles in the kitchen in
the morning, then helped carry materials for 2 h, then cleaned the site"). The
worker is told (in the form copy) to **write everything freely** in the
description; the structured Quantity/Unit fields are an *optional quick summary*,
not the only place for numbers.

The future, non-faked flow turns that one narrative into reviewable **work
lines**:

```text
One free-text entry
  → system PROPOSES N structured work lines, each: { work direction?, quantity?, unit?, time?, location?, note }
  → worker REVIEWS, edits, and CONFIRMS each line (or rejects it)
  → only confirmed lines become stored structured data (journal_entry_metrics / a future work-lines table)
  → nothing is written as fact before the worker confirms it
```

Each proposed line is a **suggestion**, shown next to the original text, with a
clear "you wrote this — is this right?" review step. The worker can merge, split,
edit, or discard lines. The original free text always remains the source of
record (it is never overwritten by the structured interpretation).

## Future exports (built only on confirmed data)

Once work lines are confirmed, the same structured data can power **exports** —
all derived from real, worker-confirmed entries, never fabricated:

- **Personal CV / work history** — a chronological, human-readable record of
  what the worker actually did, per direction.
- **Excel / CSV-style work log** — confirmed work lines (date, direction,
  quantity, unit, location, note) the worker (or, with permission, an employer)
  can download.
- **Skill proof signals** — confirmed work lines feed *contextual* coverage /
  readiness signals (§10), never a universal score, and only where the evidence
  is traceable to confirmed entries.

Exports must reflect only confirmed data; unconfirmed suggestions are excluded.

## Non-negotiable rules for that future flow

1. **Suggestions are never silently persisted as confirmed facts.** Any
   AI/extraction output is a *proposal* the worker must review and accept. Until
   accepted it is stored, if at all, as an unconfirmed suggestion
   (`journal_entry_extractions` already exists for this, unused in M1) — never
   merged into `journal_entry_metrics` as `worker_input`.
2. **Provenance is explicit.** The schema already distinguishes
   `source in ('worker_input','ai_extracted','manager_corrected')` on
   `journal_entry_metrics`. Extracted values must carry `ai_extracted` until a
   human confirms them.
3. **No fake AI now.** Until a real extraction model is wired and traceable, the
   form stays manual. Showing a fake "we understood your entry" is forbidden
   (PRODUCT_CONSTITUTION §5, DEMO_TO_REAL_DATA_POLICY).
4. **Signals stay contextual.** Confirmed proof feeds *contextual fit/coverage*
   signals only — never one universal human/business rating
   (PRODUCT_CONSTITUTION §10, `docs/CONTEXTUAL_FIT_SIGNALS.md`).

## What exists today (after Critical Path Fixes v1)

- Manual entry: free text ("What did you do today?") is the required proof of
  record; optional **work direction** (any of the worker's directions, or
  general), optional **quantity + unit**, optional date/site.
- Stored as `journal_entries` (`entry_type_slug` freeform/hybrid) +
  `journal_entry_metrics` (`source = 'worker_input'`), hash-chained, private
  (`visibility 'closed'`) until a manager confirms (the existing declare→confirm
  loop).
- `journal_entry_extractions` table exists in schema but is **not used** — it is
  the home for the future flow above.
