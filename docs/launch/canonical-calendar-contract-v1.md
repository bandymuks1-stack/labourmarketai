# Canonical calendar contract v1 (core-network area C)

## Product principle

The calendar is a PLAN. The work journal is FACT. Reports, evidence, CV
and history are source-linked outcomes. There is exactly ONE calendar
surface — `/dashboard/planning` — and it is a pure projection: it owns no
event rows, duplicates no records, and every event deep-links to its real
source object. Editing happens on the source (or its editor), never on a
calendar copy.

## Views & navigation

`?view=agenda|day|week|month|year` + `?date=YYYY-MM-DD` + `?source=`
(plain searchParams — the URL is the whole state; server component, no
calendar library):

- **month** — full Mon–Sun grid, real per-day coverage counts + conflict
  tint; each cell links to the day view;
- **week** — 7 stacked, touch-friendly day groups (Monday start);
- **day** — the day's items or an honest empty note;
- **year** — 12 month cells with real intersect counts, linking to month;
- **agenda** — the existing forward window (unchanged semantics) + week
  strip (cells now link to day view);
- prev / today / next per-view stepping + a native `<input type=date>`
  GET form.

All date math is pure UTC day strings (`planning-model.ts`) — switching
locale can never move an event to another day; DST cannot shift a
date-only band. Timed values (task `due_at`) are normalised to their UTC
day — documented, consistent, and testable.

## Sources integrated (real records only)

| Source | Table / read | Date | Deep link |
|---|---|---|---|
| Bookings (proposed+accepted) | `listMyBookings()` (RLS) | start/expected_end | /dashboard/bookings |
| Project date bands | `projects` via legacy company + OWNED organizations (RLS, deduped, bounded) | start/end | /dashboard/projects/[id] |
| Task due dates | `listMyTasks()` open+dated | due_at → UTC day | /dashboard/tasks |
| Journal FACTS | own `journal_entries`, `deleted_at IS NULL`, `superseded_by IS NULL`, bounded 200 in the visible range | created_at → UTC day | /dashboard/journal?editing=<id>#journal-composer |

Journal notes: restore/remove flows update the projection automatically
(the read excludes soft-deleted rows — a removed entry disappears, a
restored one returns); facts never join conflict detection.

Booking lifecycle: an accepted booking appears automatically (no second
manual event); cancellation/withdrawal removes it from the plan statuses;
reschedule moves the SAME source row.

## Conflicts

Unchanged real semantics: inclusive `daterange '[]' &&` overlap, mirroring
the booking accept guard; only the caller's own accepted incoming bookings
and own assigned projects compete. Server-side enforcement stays in
`respond_booking_request` (23P01). The UI invents no conflicts.

## Sources with NO real model — documented blockers (not simulated)

- **Leave / vacation / sickness** — no table exists. Additive model
  possible later (`worker_absences`: worker_id, kind, start/end, RLS
  owner+manager) — a separate owner-gated slice.
- **Meetings / appointments** — no model.
- **Holidays** — no trusted source model.
- **Availability windows / shifts / rosters** — only static preference
  flags exist (`workers.availability_status`, `available_from`); no dated
  windows.
- **Service orders / demand** — `customer_requests.start_period` and
  `.duration` are FREE TEXT, not dates; cannot be projected without a
  schema change (owner-gated).
- **Instruction due dates** — instructions are `conversation_messages`
  rows with no deadline column.
- **Worker-side assigned-project dates** — assignment rows exist but no
  worker-facing dated read; the `assigned` conflict context stays
  defined-but-unpopulated (honest per-source note).

The calendar is therefore NOT called complete: it is the canonical surface
with 4 real sources live and the remaining sources explicitly blocked on
real models.

## Access & separation

Every read is RLS-scoped and fail-closed: bookings via their own policies,
projects via company/org ownership, tasks via creator/assignee/manager,
journal via own worker id. A person sees no other company's private
events; a manager sees only permitted bands. No private exact-location
data is projected (sources expose city/country strings only).

## Navigation placement

Planning is a dashboard module (grid card on the control-room home for
ALL roles + command finder + MyZone action) — the normal user path, not a
buried link. The primary tab bar stays catalogue-derived (unchanged by
design; adding a 6th mobile tab is a separate IA decision).

## Empty state

Real next actions only: propose a booking (/dashboard/bookings), create a
task (/dashboard/tasks), record completed work (/dashboard/journal).

## Guards

`apps/web/lib/guards/planning.test.ts` (46 tests): read-only composition,
bounded known reads, real links, conflict semantics, agenda math, month/
week/year/day pure-math contracts, journal deep link + fact rules, view
shells + date navigation, 5-locale copy catalogue.
