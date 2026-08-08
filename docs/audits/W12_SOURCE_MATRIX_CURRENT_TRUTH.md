# W12 — calendar / planning source matrix, re-derived from current code

Derived from `main @ f67f6fee` by reading the code, not by trusting any earlier
inventory. Every row below was checked against
`apps/web/lib/planning/planning-model.ts`,
`apps/web/lib/planning/planning.ts`, the planning page and the guard suite.

## 0. Corrections to the recorded inventory

| earlier claim | current truth |
|---|---|
| "the three dated sources that really exist today" (the header comment of `planning-model.ts`, still present) | **eight** source types ship: `booking, project, task, journal, finance, invitation, absence, stage` |
| `planning-single-projection.test.ts`: "there is exactly ONE calendar projection" | true of the READ (`getPlanning`), false of conflict DERIVATION until this train — `buildMonthGrid` and `buildAgenda` each derived their own, from the filtered list |
| `planning-filter-conflict-truth.test.ts`: "does not introduce a second conflict engine", asserted as `detectConflicts(` appearing once in the page | the string appeared once; **three** derivations ran at runtime, because two of them are inside the builders the page calls |
| W12 = "calendar + conflicts", implicitly worker+employer | the employer has **no calendar surface at all** (see §4) |

## 1. Projection call sites (derived, not listed by hand)

`getPlanning` has **seven** consumers:

| consumer | range passed | filters? |
|---|---|---|
| `app/[locale]/dashboard/planning/page.tsx` | `visibleRange(view, anchor)` | **yes** — `?source=` |
| `lib/planning/calendar-result.ts` (`?result=calendar`) | `visibleRange("agenda", today)` | no |
| `lib/conversation/agenda-summary.ts` | agenda | no |
| `lib/conversation/opening-brief.ts` | agenda | no |
| `lib/world-state/work-context-server.ts` | agenda | no |
| `lib/ai-workspace/ai-context.ts` | agenda | no |
| `lib/ai-workspace/workflows.ts` | agenda | no |

Only the planning page filters, which is why the filter-truth defect was
confined to it. The other six pass the full model, so the truth-list parameter
added in this train defaults correctly for all of them.

View builders: `buildAgenda`, `buildMonthGrid`, `buildWeekView`,
`buildYearOverview`, `itemsForDay`. Of these only the first two derive truth of
their own (they call `detectConflicts`); the other three are pure shaping.

## 2. Source matrix

Legend for STATUS: `VERIFIED_WORKING` (read, projected and reachable by the
intended user), `PARTIAL`, `MISSING_PROJECTION`, `UNREACHABLE`, `OWNER_GATED`.

| # | source | canonical table | start / end semantics | day or time | open-ended | conflict? | "expected work"? | worker sees | employer sees | status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | booking | `booking_requests` | `start_date` / `expected_end_date`; missing end collapses to start | date-only | yes (null end) | **yes** — `accepted` + `incoming` only | **yes** | yes | ✗ no calendar | VERIFIED_WORKING (worker) |
| 2 | project (assigned) | `projects` via `project_worker_assignments` | `start_date` / `end_date` | date-only | yes | **yes** — `assigned` only | **yes** | ✗ | VERIFIED_WORKING |
| 3 | project (managed) | `projects` (own company + owned orgs) | same | date-only | yes | no | no | manager only | VERIFIED_WORKING |
| 4 | task | `work_tasks` | `due_at`, open tasks only | datetime (`startTime`) | n/a | no | no | yes | ✗ | VERIFIED_WORKING |
| 5 | journal | `journal_entries` + `journal_entry_metrics.work_date` | `journalStartDay(work_date, created_at)` — **the day worked, not the day typed** | date-only | no | no | no (it is the FACT) | yes | ✗ | VERIFIED_WORKING |
| 6 | finance | `finance_records` | paid → `paid_at`; unpaid → `due_date`; `overdue` derived | date-only | no | no | no | yes | ✗ | VERIFIED_WORKING |
| 7 | invitation | `invitations` (both directions, deduped) | lifecycle day: expiry / accepted / declined / revoked | date-only | no | no | no | yes | ✗ | VERIFIED_WORKING |
| 8 | absence | `worker_absences` | `start_date` / `end_date`, statuses `requested` + `approved` | date-only | no | **yes** — `approved` only | no (opposite of work) | yes | ✗ **see §4** | PARTIAL |
| 9 | stage | `project_stages` | actual dates override planned (mirrors the gantt) | date-only | yes | no | no | yes | ✗ | VERIFIED_WORKING |

Every source degrades independently (`PlanningSourceState`: `ok` /
`unavailable` / `managers-only` / `workers-only` / `error`) and renders an
honest per-source note rather than fake rows.

## 3. Conflict semantics — proven, not assumed

- **Inclusive day ranges.** `rangesOverlapInclusive(aStart, aEnd, bStart, bEnd)`
  is `aStart <= bEnd && bStart <= aEnd`, mirroring the DB accept guard's
  `daterange(start, coalesce(end, start), '[]') && …` (errcode `23P01`).
- **Touching edges ARE an overlap.** A booking ending 08-12 and one starting
  08-12 conflict. This is the product contract, inherited from the DB guard —
  not an assumption.
- **A missing end collapses to the start day** (`coalesce(end, start)`), so an
  open-ended record occupies exactly one day rather than an infinite band.
- **Only three of nine sources participate**, all of them the caller's OWN
  dated commitments: accepted incoming bookings, personally assigned projects,
  approved absences. Proposals, declined rows, outgoing company rows, managed
  project bands, requested (unapproved) absences, tasks, finance, invitations
  and stages never conflict. Flagging any of those would invent a problem no
  record proves.
- **`indicatesExpectedWork` is deliberately narrower still** — only accepted
  incoming bookings and assigned projects — because it drives the "you have
  not recorded this day" claim, which must only be made about a day the product
  can prove was a working day.

## 4. The employer half of W12 is absent

`/dashboard/company/planning` is **not a calendar**. It reads `getWorkforce()`
and renders demand / gap-risk timelines ("workforcePlanning"). It does not
import the planning model, does not call `getPlanning`, and computes no
conflicts.

The only employer-side absence read is `getManagerPendingAbsences`, which
filters `status = 'requested'` — an approval queue, not a schedule. **No
surface shows an employer an APPROVED absence.**

So of the W12 employer questions:

| question | answerable today |
|---|---|
| Who is scheduled? | ✗ |
| On what day / time? | ✗ |
| For which work / assignment? | ✗ |
| Which engagement? | ✗ (also blocked by #1047, still owner-gated) |
| Is somebody unavailable? | ✗ — approved leave is invisible to the employer |
| Is there a scheduling conflict? | ✗ |
| What changed? | ✗ |

**STATUS: MISSING_PROJECTION.** This is not a defect in the shipped code — it
is a capability that was never built. It is the single largest remaining W12
gap and it is not safely closable in one slice: an employer-visible absence
read is a real privacy decision (which employers may see whose leave, and at
what granularity), so it is **OWNER_GATED**, not merely unfinished.

The worker half, by contrast, answers all eleven of its questions.

## 5. Worker acceptance — all eleven answerable

| question | how |
|---|---|
| What am I doing today? | agenda view, day group `isToday` |
| …tomorrow? | agenda; `itemsForDay` |
| …this week? | week view + the 7-day strip |
| Which days did I work? | month grid `hasJournal` |
| Which journal days contain entries? | same mark — and it is now filter-independent |
| What booking is upcoming? | booking rows, agenda-ordered |
| Which assignment is it connected to? | `project` meta field |
| Which engagement? | `workspace` / `organization` meta, via `engagement_contexts` |
| Am I unavailable? | absence rows |
| Do I have overlapping commitments? | conflict badge + named partner |
| What happened on a selected past day? | day view at any anchor date |

## 6. Open items

| item | state |
|---|---|
| employer calendar | MISSING_PROJECTION, OWNER_GATED (privacy decision on leave visibility) |
| #1047 booking→engagement org resolution | still Draft + owner-gated; not crossed |
| travel time | no provider-independent seam exists. Nothing fabricates a duration today, which is the correct default — UNKNOWN is absent, not zero. A seam is only worth adding once a real consumer exists |
| open-ended booking | **no owner decision outstanding.** The architecture already implies one interpretation and it is enforced in two places that agree: `effectiveEndDay` collapses a missing end to the start day, matching the DB guard's `coalesce(end, start)`. An open-ended booking occupies exactly its start day for conflict purposes |
| race / double-booking | guarded in the DB (`respond_booking_request` + `23P01` exclusion), with an e2e spec at `tests/e2e/w12-atomic-double-booking.spec.ts` against a dedicated local stack. Not re-run this session — the fixture needs a second Supabase stack on :55321 |
