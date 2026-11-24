-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711290000 — booking lifecycle v2 (marketplace precision programme,
-- decision pack MP-4; gap map
-- docs/launch/marketplace-precision-booking-gap-map-v1.md §6/§9).
--
-- PROBLEM (audit-verified): the live booking flow has no response deadline,
-- no cancellation/decline reason capture, no reschedule of an open proposal,
-- and the `expired` status has NO writer — a proposal that is never answered
-- sits "proposed" forever and the UI can only derive a display-side "stale"
-- state.
--
-- SOLUTION (smallest honest slice) — all ADDITIVE, all existing RPCs and
-- callers untouched:
--
--   1. booking_requests.response_deadline_date date — optional, owner-set,
--      validated in the RPC (>= current date when set).
--   2. booking_request_events.reason_kind / reason_note — append-only reason
--      capture on the event row (closed kind set + bounded note; the events
--      table stays the audit truth, no update path).
--   3. events.event_type CHECK widened to include 'rescheduled' and
--      'deadline_set' (drop + re-add of the named constraint ONLY).
--   4. respond_booking_request_v2 — v1 semantics (worker-only, proposed-only,
--      overlap guard) + optional decline reason.
--   5. withdraw_booking_request_v2 — v1 semantics (owner-only, proposed-only)
--      + optional withdraw reason.
--   6. reschedule_booking_proposal_v1 — owner-only, PROPOSED-only date change
--      (an accepted booking is never mutated in place; changing an accepted
--      booking = withdraw + new proposal, which stays visible in events).
--   7. set_booking_response_deadline_v1 — owner-only, proposed-only.
--   8. expire_stale_booking_requests_v1 — is_admin()-ONLY sweep: proposed
--      rows past their response_deadline_date (or older than p_stale_days
--      when no deadline) → 'expired' + one event each. NOTE: this only
--      ENABLES expiry; wiring it to any scheduler is a SEPARATE owner
--      decision (no scheduler is installed by this migration).
--
-- ABUSE BOUNDS: closed reason kinds, note <= 500, deadline sanity in RPC,
-- admin-only sweep capped at 500 rows per call.
-- COMPATIBILITY / BACKFILL: none — additive columns are NULL for existing
-- rows; v1 RPCs keep working unchanged in either apply order.
-- ROLLBACK: paired 20260711290000_booking_lifecycle_v2.down.sql (drops the
-- four new functions and two columns, restores the original event_type CHECK).
--
-- POST-APPLY VERIFICATION:
--   As a company owner: set_booking_response_deadline_v1(<id>, current_date + 7);
--   reschedule_booking_proposal_v1(<id>, current_date + 14, current_date + 30, null);
--   As the worker: respond_booking_request_v2(<id>, 'declined', 'dates_unsuitable', null);
--   As admin: select expire_stale_booking_requests_v1(14);
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions,
-- grants, constraint change = RED-class; annotation downgrades the CI
-- finding only — the OWNER still applies manually).
-- ============================================================================

begin;

-- 1/2. Additive columns ------------------------------------------------------

alter table public.booking_requests
  add column if not exists response_deadline_date date;

alter table public.booking_request_events
  add column if not exists reason_kind text
    check (reason_kind is null or reason_kind in
      ('dates_unsuitable','conditions_unsuitable','already_booked',
       'position_filled','need_changed','dates_changed','no_response','other')),
  add column if not exists reason_note text
    check (reason_note is null or char_length(reason_note) <= 500);

-- 3. Widen the event vocabulary (named constraint drop + re-add ONLY) --------

alter table public.booking_request_events
  drop constraint if exists booking_request_events_event_type_check;
alter table public.booking_request_events
  add constraint booking_request_events_event_type_check
  check (event_type in
    ('proposed','accepted','declined','withdrawn','expired',
     'rescheduled','deadline_set'));

-- 4. Respond v2 — v1 semantics + optional decline reason ---------------------

create or replace function public.respond_booking_request_v2(
  p_booking_id  uuid,
  p_decision    text,
  p_reason_kind text,
  p_reason_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  is_subject_worker boolean;
  v_kind text := nullif(trim(coalesce(p_reason_kind, '')), '');
  v_note text := nullif(trim(coalesce(p_reason_note, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision not in ('accepted','declined') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if v_kind is not null and v_kind not in
       ('dates_unsuitable','conditions_unsuitable','already_booked','other') then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Reason note too long' using errcode = '22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;
  if br.status <> 'proposed' then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    if exists (
      select 1 from public.booking_requests other
       where other.worker_id = br.worker_id
         and other.id <> br.id
         and other.status = 'accepted'
         and other.start_date is not null
         and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
             && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]')
    ) then
      raise exception 'Conflicting accepted booking for these dates'
        using errcode = '23P01';
    end if;
  end if;

  update public.booking_requests
     set status = p_decision, updated_at = now()
   where id = br.id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  return p_decision;
end;
$$;
revoke all on function public.respond_booking_request_v2(uuid, text, text, text) from public;
grant execute on function public.respond_booking_request_v2(uuid, text, text, text) to authenticated;

-- 5. Withdraw v2 — v1 semantics + optional withdraw reason -------------------

create or replace function public.withdraw_booking_request_v2(
  p_booking_id  uuid,
  p_reason_kind text,
  p_reason_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  v_kind text := nullif(trim(coalesce(p_reason_kind, '')), '');
  v_note text := nullif(trim(coalesce(p_reason_note, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_kind is not null and v_kind not in
       ('position_filled','need_changed','dates_changed','other') then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Reason note too long' using errcode = '22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if br.owner_id <> uid then
    raise exception 'Only the proposing company may withdraw' using errcode = '42501';
  end if;
  if br.status <> 'proposed' then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  update public.booking_requests
     set status = 'withdrawn', updated_at = now()
   where id = br.id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, 'withdrawn', 'proposed', 'withdrawn', v_kind, v_note);

  return 'withdrawn';
end;
$$;
revoke all on function public.withdraw_booking_request_v2(uuid, text, text) from public;
grant execute on function public.withdraw_booking_request_v2(uuid, text, text) to authenticated;

-- 6. Reschedule an OPEN proposal (owner-only; accepted rows never mutate) ----

create or replace function public.reschedule_booking_proposal_v1(
  p_booking_id uuid,
  p_start_date date,
  p_end_date   date,
  p_note       text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_start_date is null then
    raise exception 'Start date required' using errcode = '22023';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End before start' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note too long' using errcode = '22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if br.owner_id <> uid then
    raise exception 'Only the proposing company may reschedule' using errcode = '42501';
  end if;
  if br.status <> 'proposed' then
    raise exception 'Only an open proposal can be rescheduled' using errcode = '22023';
  end if;

  update public.booking_requests
     set start_date = p_start_date,
         expected_end_date = p_end_date,
         updated_at = now()
   where id = br.id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, 'rescheduled', 'proposed', 'proposed', null, v_note);

  return 'rescheduled';
end;
$$;
revoke all on function public.reschedule_booking_proposal_v1(uuid, date, date, text) from public;
grant execute on function public.reschedule_booking_proposal_v1(uuid, date, date, text) to authenticated;

-- 7. Response deadline (owner-only, proposed-only) ---------------------------

create or replace function public.set_booking_response_deadline_v1(
  p_booking_id uuid,
  p_deadline   date
) returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_deadline is not null and p_deadline < current_date then
    raise exception 'Deadline in the past' using errcode = '22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if br.owner_id <> uid then
    raise exception 'Only the proposing company may set a deadline' using errcode = '42501';
  end if;
  if br.status <> 'proposed' then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  update public.booking_requests
     set response_deadline_date = p_deadline, updated_at = now()
   where id = br.id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (br.id, uid, 'deadline_set', 'proposed', 'proposed');

  return p_deadline;
end;
$$;
revoke all on function public.set_booking_response_deadline_v1(uuid, date) from public;
grant execute on function public.set_booking_response_deadline_v1(uuid, date) to authenticated;

-- 8. Admin-only expiry sweep (enabling function; scheduling is a SEPARATE
--    owner decision — nothing here installs a scheduler) ---------------------

create or replace function public.expire_stale_booking_requests_v1(
  p_stale_days integer default 14
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  expired_count integer := 0;
  r record;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id from public.booking_requests br
     where br.status = 'proposed'
       and (
         (br.response_deadline_date is not null and br.response_deadline_date < current_date)
         or (br.response_deadline_date is null
             and br.created_at < now() - make_interval(days => p_stale_days))
       )
     limit 500
  loop
    update public.booking_requests
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           reason_kind, reason_note)
        values (r.id, uid, 'expired', 'proposed', 'expired', 'no_response', null);
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$$;
revoke all on function public.expire_stale_booking_requests_v1(integer) from public;
grant execute on function public.expire_stale_booking_requests_v1(integer) to authenticated;

commit;
