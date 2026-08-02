-- ============================================================================
-- ROLLBACK for 20260802150000_booking_atomic_double_booking_v1.sql
-- (W12 Slice 1 — atomic double-booking prevention).
--
-- REVERSES:
--   1. drops the `booking_requests_no_overlapping_accepted` EXCLUDE constraint;
--   2. restores the PRE-SLICE bodies of respond_booking_request_v3, _v2 and v1
--      VERBATIM (the race-prone read-then-check-then-update shape as applied by
--      20260723120000 / 20260711290000 / 20260613100100).
--
-- DELIBERATELY NOT REVERSED:
--   * `btree_gist` stays installed. Dropping a shared extension is never part
--     of a feature rollback — another object could come to depend on it, and
--     an installed-but-unused extension is inert.
--   * No booking row is touched. This rollback mutates NO data: it cannot
--     create, cancel, re-status or delete any booking. If overlapping accepted
--     rows were somehow created while the constraint was absent, they are left
--     exactly as they are for an owner decision.
--
-- WARNING: running this restores a KNOWN P0 data-integrity defect (two
-- employers can hold overlapping accepted bookings for the same worker under
-- concurrency). Use only to unblock a failed apply.
-- ============================================================================

begin;

alter table public.booking_requests
  drop constraint if exists booking_requests_no_overlapping_accepted;

-- ── restore v3 (pre-slice body, as applied by 20260723120000) ──────────────
create or replace function public.respond_booking_request_v3(
  p_booking_id  uuid,
  p_decision    text,
  p_reason_kind text,
  p_reason_note text
) returns jsonb
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
  v_company uuid;
  v_demand_owner uuid;
  v_company_count integer := 0;
  v_engagement text := null;
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
  if br.status is distinct from 'proposed' then
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

  if p_decision = 'accepted' then
    select cr.profile_id into v_demand_owner
      from public.customer_requests cr
     where cr.id = br.request_id;

    select count(*) into v_company_count
      from public.companies c
     where c.profile_id = v_demand_owner;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id
       or v_company_count = 0 then
      v_engagement := 'no_company';
    elsif v_company_count > 1 then
      v_engagement := 'ambiguous_company';
    else
      select c.id into v_company
        from public.companies c
       where c.profile_id = v_demand_owner;
    end if;

    if v_engagement is not null then
      null;
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.source_booking_id = br.id
    ) then
      v_engagement := 'already_recorded';
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.company_id = v_company
         and e.worker_id = br.worker_id
         and e.status = 'active'
    ) then
      v_engagement := 'already_active';
    else
      insert into public.company_worker_engagements
          (company_id, worker_id, source_booking_id, created_by)
        values (v_company, br.worker_id, br.id, uid)
      on conflict (source_booking_id) do nothing;
      v_engagement := 'created';
    end if;
  end if;

  return jsonb_build_object('decision', p_decision, 'engagement', v_engagement);
end;
$$;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from public;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from anon;
grant execute on function public.respond_booking_request_v3(uuid, text, text, text) to authenticated;

-- ── restore v2 (pre-slice body, as applied by 20260711290000) ──────────────
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

-- ── restore v1 (pre-slice body, as applied by 20260613100100) ──────────────
create or replace function public.respond_booking_request(
  p_booking_id uuid,
  p_decision   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  br       public.booking_requests%rowtype;
  is_owner_worker boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision not in ('accepted','declined') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_owner_worker;
  if not is_owner_worker then
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
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (br.id, uid, p_decision, 'proposed', p_decision);

  return p_decision;
end;
$$;
revoke all on function public.respond_booking_request(uuid, text) from public;
grant execute on function public.respond_booking_request(uuid, text) to authenticated;

commit;
