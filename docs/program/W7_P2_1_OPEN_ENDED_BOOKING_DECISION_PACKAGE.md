# W7 P2-1 — open-ended booking: product decision package

> Status: **OWNER DECISION REQUIRED — nothing here is implemented.**
> The honesty half shipped in #1056 (`bookingEndHint` + guard
> `w7-p2-1-open-ended-booking-honesty.test.ts`): the form now states that an
> empty end date books a single day. This package is the capability half's
> decision input. It deliberately contains **no migration SQL** — writing one
> before these definitions are settled would encode a guess.

## 0. Current truth (verified, `b9cfdb0a`)

- `booking_requests_no_overlapping_accepted` `EXCLUDE` constraint and
  `respond_booking_request_v3` both band on
  `daterange(start_date, coalesce(expected_end_date, start_date), '[]')` —
  an empty end is a **single-day** hold, and every day after day one of an
  "ongoing" booking is invisible to double-booking protection.
- `worker_absences`, project stages and travel are **out of scope** of the
  constraint by its own scope-boundary comment.
- The original migration recorded **0 accepted rows** at apply time; any
  band change must re-run that preflight in production.

## 1. The ten questions, answered per model

Three coherent models. Each answers the brief's ten questions; mixing
answers across models re-creates the incoherence this package exists to
prevent.

### Model A — review-date ("unknown but finite, always re-affirmed")

"Open-ended" means *the end is unknown, not unbounded*. An open-ended
booking must carry a **review date** (product default: start + 30 days,
employer-editable). The calendar band is `[start, review_date]`; before it
lapses, either party extends (a new review date) or it closes.

| # | question | answer |
|---|---|---|
| 1 | what does no end date mean? | "we don't know the end yet" — never "forever" |
| 2 | indefinite commitment or unknown duration? | unknown duration, re-affirmed at every review date |
| 3 | what blocks the worker calendar? | `[start, current review_date]` — always finite |
| 4 | can an employer create one indefinitely? | no — an un-extended booking lapses at review; extension is an explicit act |
| 5 | how does the worker later close it? | worker or employer sets an actual end ≤ review date; both see the change |
| 6 | interaction with project/engagement end? | project end caps the review date (a booking cannot be reviewed past its project's end) |
| 7 | what does another company see? | "booked until <review date>" — a finite, honest availability signal |
| 8 | overlap checking? | unchanged mechanics — bands stay finite, `EXCLUDE` constraint keeps its shape, only the upper bound source changes |
| 9 | travel/calendar intelligence? | fully functional — finite bands mean travel windows and conflict warnings keep working |
| 10 | rollback/backfill? | backfill existing NULL-end rows to `review_date = start + 30d` (or leave as single-day, owner choice); rollback restores `coalesce(end, start)`; production preflight for rows whose new band would collide |

### Model B — true indefinite (`[start, ∞)` until ended)

"Open-ended" means *until someone ends it*. The band's upper bound becomes
NULL-unbounded in both the `EXCLUDE` constraint and
`respond_booking_request_v3`.

| # | question | answer |
|---|---|---|
| 1 | no end date | "employed here until further notice" |
| 2 | commitment kind | indefinite commitment |
| 3 | calendar block | `[start, ∞)` |
| 4 | employer creates indefinitely? | **must be restricted to ACCEPTED bookings only** — an indefinite *proposal* blocking a worker forever is a denial-of-service on their availability; proposals stay single-day until accepted |
| 5 | worker closes it | worker-initiated end (with notice-period semantics the product does not have yet — a new concept this model forces) |
| 6 | project/engagement end | must auto-end the booking, else a booking outlives its project — new trigger/consistency surface |
| 7 | other companies see | "booked indefinitely" — the worker is commercially invisible until ended; **this is a cross-company commercial decision, not a technical one** |
| 8 | overlap checking | constraint drop + re-add with NULL-unbounded upper; every future booking for that worker conflicts by definition |
| 9 | travel/calendar intelligence | degraded — unbounded bands break "next free window" computations unless special-cased everywhere |
| 10 | rollback/backfill | hardest: un-representable once real ∞-bookings exist; rollback would have to invent end dates |

### Model C — status-flag ("ongoing" is a state, not a band) — closest to today

The calendar band stays exactly as shipped (single-day for empty end). A
separate **ongoing status** on the engagement/booking says "this relationship
is live" without holding calendar days.

| # | question | answer |
|---|---|---|
| 1 | no end date | "single-day hold + an ongoing relationship flag" |
| 2 | commitment kind | neither — the calendar makes no duration claim at all |
| 3 | calendar block | `[start, start]` only (unchanged) |
| 4 | employer creates indefinitely? | the flag yes, calendar hold no |
| 5 | worker closes it | clears the flag; no calendar consequence |
| 6 | project/engagement end | flag lives on the engagement, so it ends with it naturally |
| 7 | other companies see | worker looks free — honest about the calendar, silent about the relationship (today's shipped copy already says this) |
| 8 | overlap checking | unchanged — which means the W12 protection still does not cover ongoing work beyond day one |
| 9 | travel/calendar intelligence | unchanged |
| 10 | rollback/backfill | trivial — additive flag, no band change |

## 2. Recommendation

**Model A (review-date).** Reasons, in order:

1. It is the only model where double-booking protection — the W12 capability
   whose silent absence #1056 had to disclose — actually covers ongoing work,
   without the unbounded-band blast radius of Model B.
2. Every band stays finite, so the `EXCLUDE` constraint, travel intelligence
   and "next free window" logic keep their current shape.
3. The review date is honest labour-market reality (rotations, trial
   periods, "until the frost"), and it converts the DoS question (#4) from a
   policy problem into a mechanical lapse.
4. Rollback stays representable (question 10) — Model B's does not once real
   data exists.

Model C is the do-least fallback if the owner wants zero migration risk now;
it is already 90% shipped and would only add the relationship flag. Model B
is not recommended without notice-period and auto-end semantics that do not
exist yet.

## 3. What stays gated

Whatever model is chosen: constraint drop/re-add, RPC change, backfill and
production preflight (re-check the accepted-rows count — 0 at original
apply) are all **owner-gated migration work**. This package's only output is
the decision.
