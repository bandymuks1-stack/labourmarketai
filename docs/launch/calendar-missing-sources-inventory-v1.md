# Calendar missing-sources inventory v1 (area C follow-up)

The canonical calendar (`/dashboard/planning`) projects 4 REAL sources:
bookings, project date bands, task due dates, journal facts. The sources
below remain genuinely ABSENT — no fake events exist for any of them, and
the calendar vision is NOT complete until each gets a real model. Every
row is a separate, owner-gated additive slice.

| # | Source | Model today | Required additive schema | Required RLS | Create/edit UI | Calendar adapter | Deep link | Tests | Context |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Availability windows | NONE (only static `workers.availability_status`, `available_from` flags) | `worker_availability_windows`: id, worker_id FK, start_date, end_date, kind (available/unavailable), note ≤200 | owner (`owns_worker`) full; employer visibility ONLY via existing consent gates (`can_view_worker`) — fail-closed | worker profile / planning empty-state action; RPC-only writes | new `availability` source_type; band render; feeds booking-conflict hints (advisory, not blocking, until backend enforces) | `/dashboard/profile#availability` (or a dedicated editor) | RPC auth matrix, RLS leak, adapter math, DST/day-band | person |
| 2 | Work schedules / shifts | NONE (no shift/roster tables) | `work_shifts`: id, organization_id FK, project_id nullable, worker_id FK, shift_date, start_time, end_time, tz note | manager (`manages_organization`) write; assigned worker read own | company/project operations board panel | TIMED events (first timed source — needs day-view hour rendering decision) | project operations board | overlap rules vs bookings, cross-org leak, timed-render | both |
| 3 | Vacation / leave | NONE | `worker_absences`: id, worker_id FK, kind ('vacation','leave'), start_date, end_date, status (requested/approved), approver | worker own write-request; manager of an ACTIVE engagement approve/read; others none | worker planning empty-state + profile; manager approval queue | band render; conflict-eligible vs accepted bookings | absence editor | approval flow, conflict pairing, RLS | both |
| 4 | Sick days | NONE | same `worker_absences` table, kind='sick' (no separate model) | as #3; extra privacy: kind visible to manager, never to other companies | one-tap "sick today" action | as #3 | as #3 | privacy of kind across orgs | both |
| 5 | Meetings / appointments | NONE | `appointments`: id, organizer_profile_id, organization_id nullable, project_id nullable, starts_at, ends_at, tz, title ≤160, location_ref, participants join table | organizer + participants read; organizer write; RPC-only participant management | planning "add" action + project/company surfaces | TIMED events; participants chips | appointment detail (new small route) or organizer editor | participant auth, cross-context leak, DST | both |
| 6 | Holidays | NONE (no trusted source) | `public_holidays`: country char(2), holiday_date, name — ADMIN-seeded from an owner-approved source only (no scraping, no third-party API without owner decision) | read-all authenticated; admin-only writes | admin seeding screen or reviewed SQL seed | all-day info layer (never conflict-eligible) | none (informational) | country filter, no-conflict rule | both |
| 7 | Service-order dates | Model exists but dates are TEXT (`customer_requests.start_period`, `.duration`) | additive `requested_start_date date`, `requested_end_date date` columns + intake capture; NO backfill parsing of free text (honest NULL for old rows) | existing customer_requests RLS unchanged | demand intake form date fields | new `order` source_type once columns exist | existing demand/request surfaces | intake validation, adapter, old-row NULL honesty | company |
| 8 | Instruction due dates | Instructions are `conversation_messages` rows — NO deadline column | additive `instruction_due_at timestamptz` on conversation_messages (nullable, instruction rows only) OR a separate `instruction_deadlines` table (cleaner, avoids widening the message row) | participant-scoped (existing conversation RLS) | instruction composer due-date field | `instruction` source_type, due-day anchor | the conversation thread | append-only doctrine respected, participant leak | both |
| 9 | Travel / arrival planning | NONE | candidate: `worker_travel_plans`: worker_id, depart_date, arrive_date, origin/destination country (NO exact addresses), related booking_id nullable | worker own; company visibility only for an ACCEPTED booking's counterpart | booking-accept follow-up prompt | band render tied to the booking | bookings page | privacy (no exact locations), booking linkage | both |

Ordering recommendation (value ÷ effort): 3+4 (absences — one table
covers both), then 7 (order dates — unlocks the biggest existing source),
then 1 (availability windows), then 8, 2, 5, 9, 6.

Shared rules for every slice: additive + reversible + RLS-enabled +
paired rollback + APPLIED_LEDGER + owner gate (no `db push`); events stay
projections with `source_type`/`source_id` deep links; no detached
calendar rows; no fake events while a model is absent.
