# W12 — filter-independent calendar truth (browser proof)

Evidence for the fix in `feat/cc/w12-projection-truth-v1`: `buildMonthGrid` and
`buildAgenda` derived conflicts, the journal mark and the "unfilled" mark from
the FILTERED item list, so `?source=booking` changed what the calendar claimed
was true.

## Fixture (local stack only, disposable `@local.test` accounts)

Today = 2026-08-08.

| record | dates | note |
|---|---|---|
| accepted incoming booking | 2026-08-04 .. 2026-08-12 | the caller is the worker |
| approved absence | 2026-08-10 .. 2026-08-14 | overlaps the booking's tail |
| journal entry (`work_date`) | 2026-08-05 | a PAST booked day, really recorded |

URL under test: `/lt/dashboard/planning?view=month&date=2026-08-08&source=booking`
— the filter hides the absence and the journal rows.

## Before → after, measured in the running app

| day | before | after | meaning |
|---|---|---|---|
| 2026-08-05 | `unfilled: true`, `journal: false` | `journal: true`, `unfilled: false` | the day WAS recorded; the product had claimed it was not |
| 2026-08-10 | `conflict: false` | `conflict: true` | booking overlaps approved leave |
| 2026-08-12 | `conflict: false` | `conflict: true` | same overlap |
| 2026-08-04 | `unfilled: true` | `unfilled: true` | genuinely unfilled — negative control, mark still works |
| 2026-08-06 | `unfilled: true` | `unfilled: true` | genuinely unfilled — negative control |

The "before" column was produced by temporarily reverting only the page wiring
(`buildAgenda`/`buildMonthGrid` back to `visibleItems`-only) against the same
fixture and the same URL, then restoring it.

Unfiltered vs filtered after the fix: the conflict / journal / unfilled marks
are IDENTICAL; only `count` differs (2 → 1 on days where the filter hides a
row), which is the intended contract — count is a render question, the marks
are not.

## Responsive proof

`month-booking-filter-<width>.png`, widths 320 / 360 / 375 / 390 / 412 / 768 / 1440.

At every width: no horizontal overflow (`scrollWidth === innerWidth`), 42 month
cells with none overflowing the viewport, and a minimum control height of
**44px** across all 60 tappable controls (the product's touch floor). 0 page
errors. The only console errors are the pre-existing report-only CSP notice
about `upgrade-insecure-requests`, unrelated to this change.
