-- ============================================================================
-- ROLLBACK for 20261025180000_booking_clash_acknowledged_marker_v1
--
-- Restores, exactly:
--   * `booking_requests_no_overlapping_accepted` with its ORIGINAL predicate
--       WHERE (status = 'accepted' AND start_date IS NOT NULL)
--   * `respond_booking_request_v4` as 20260915180000 defined it (no marker),
--     with the same grants and comment;
-- and removes the marker-scope trigger, its function and the
-- `clash_acknowledged` column.
--
-- GUARDED. Once an acknowledged overlap has been recorded, the original
-- constraint cannot be re-added over that data, and this rollback will not
-- rewrite, decline or re-status any booking to make it fit. So it REFUSES —
-- raises and changes nothing (the whole script is one transaction) — while
-- any two accepted bookings of one worker overlap. The owner decides what
-- happens to those bookings first; then this runs clean.
--
-- The `clash_acknowledged` receipts in booking_request_events are NOT
-- touched: they belong to 20260915180000 and stay true history.
--
-- Apply via Supabase MCP `apply_migration` only — never `supabase db push`.
-- ============================================================================

begin;

do $guard$
declare
  v_pairs integer;
begin
  select count(*) into v_pairs
    from public.booking_requests a
    join public.booking_requests b
      on b.worker_id = a.worker_id
     and b.id > a.id
   where a.status = 'accepted' and a.start_date is not null
     and b.status = 'accepted' and b.start_date is not null
     and daterange(a.start_date, coalesce(a.expected_end_date, a.start_date), '[]')
         && daterange(b.start_date, coalesce(b.expected_end_date, b.start_date), '[]');
  if v_pairs > 0 then
    raise exception
      'rollback refused: % overlapping accepted booking pair(s) exist (acknowledged clashes); the original constraint cannot be restored without changing bookings',
      v_pairs
      using errcode = '23P01';
  end if;
end
$guard$;

-- 1. The original constraint (no row can be refused: the guard proved there
--    is no overlap among accepted rows).
alter table public.booking_requests
  drop constraint if exists booking_requests_no_overlapping_accepted;

alter table public.booking_requests
  add constraint booking_requests_no_overlapping_accepted
  exclude using gist (
    worker_id with =,
    daterange(start_date, coalesce(expected_end_date, start_date), '[]') with &&
  )
  where (status = 'accepted' and start_date is not null);

-- 2. v4 exactly as 20260915180000 defined it.
create or replace function public.respond_booking_request_v4(
  p_booking_id uuid,
  p_decision text,
  p_reason_kind text,
  p_reason_note text,
  p_acknowledge_clash boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  is_subject_worker boolean;
  v_kind text := nullif(trim(coalesce(p_reason_kind, '')), '');
  v_note text := nullif(trim(coalesce(p_reason_note, '')), '');
  v_company uuid;
  v_demand_owner uuid;
  v_demand_org uuid;
  v_company_count integer := 0;
  v_engagement text := null;
  v_updated integer := 0;
  v_clashes uuid[] := '{}';
  v_clash uuid;
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

  -- L1: LOCK THE ROW FIRST.
  select * into br
    from public.booking_requests
   where id = p_booking_id
     for update;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;

  -- L1 status gate, evaluated AFTER the lock.
  if br.status is distinct from 'proposed' then
    if br.status = p_decision then
      return jsonb_build_object(
        'decision', p_decision,
        'engagement', case when p_decision = 'accepted'
                           then 'already_recorded' else null end,
        'idempotent', true
      );
    end if;
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    -- L2: serialise every accept for THIS worker.
    perform pg_advisory_xact_lock(hashtextextended(br.worker_id::text, 0));

    select coalesce(array_agg(other.id order by other.id), '{}')
      into v_clashes
      from public.booking_requests other
     where other.worker_id = br.worker_id
       and other.id <> br.id
       and other.status = 'accepted'
       and other.start_date is not null
       and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
           && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]');

    -- DEFAULT IS UNCHANGED: without an explicit acknowledgement this is the
    -- same refusal, with the same errcode, that v3 raises today.
    if array_length(v_clashes, 1) is not null and coalesce(p_acknowledge_clash, false) is not true then
      raise exception 'Conflicting accepted booking for these dates'
        using errcode = '23P01';
    end if;
  end if;

  update public.booking_requests
     set status = p_decision, updated_at = now()
   where id = br.id
     and status = 'proposed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  -- THE RECEIPT. One immutable row per counterpart the caller overlapped,
  -- written in the SAME transaction as the accept it belongs to. Nothing
  -- about either booking is altered, and no clash is marked resolved:
  -- `detectConflicts` will keep returning this overlap tomorrow.
  if p_decision = 'accepted' and coalesce(p_acknowledge_clash, false) is true then
    foreach v_clash in array v_clashes loop
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           related_booking_request_id)
        values (br.id, uid, 'clash_acknowledged', 'proposed', 'accepted', v_clash);
    end loop;
  end if;

  -- Engagement: SAME transaction as the accept. ORG-FIRST (M-P0-6).
  if p_decision = 'accepted' then
    select cr.profile_id, cr.organization_id
      into v_demand_owner, v_demand_org
      from public.customer_requests cr
     where cr.id = br.request_id;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id then
      v_engagement := 'no_company';
    elsif v_demand_org is not null then
      select o.legacy_company_id into v_company
        from public.organizations o
       where o.id = v_demand_org;
      if v_company is null then
        v_engagement := 'no_company';
      end if;
    else
      select count(*) into v_company_count
        from public.companies c
       where c.profile_id = v_demand_owner;

      if v_company_count = 0 then
        v_engagement := 'no_company';
      elsif v_company_count > 1 then
        v_engagement := 'ambiguous_company';
      else
        select c.id into v_company
          from public.companies c
         where c.profile_id = v_demand_owner;
      end if;
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

  return jsonb_build_object(
    'decision', p_decision,
    'engagement', v_engagement,
    -- The caller is TOLD what they overrode. Silence here would be the same
    -- defect as erasing the clash.
    'acknowledged_clashes', coalesce(array_length(v_clashes, 1), 0)
  );
end;
$function$;

revoke all on function public.respond_booking_request_v4(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.respond_booking_request_v4(uuid, text, text, text, boolean) to authenticated;

comment on function public.respond_booking_request_v4(uuid, text, text, text, boolean) is
  'RED #5. v3 plus an explicit clash acknowledgement. Only the addressed '
  'worker may call it (unchanged). Without p_acknowledge_clash it refuses an '
  'overlapping accept exactly as v3 does. With it, the accept proceeds AND a '
  'clash_acknowledged receipt is written per overlapping booking. The clash '
  'is not resolved, not hidden and not deleted.';

-- 3. The marker and its scope trigger.
drop trigger if exists booking_requests_clash_marker_scope on public.booking_requests;
drop function if exists public.booking_requests_clash_marker_scope();
alter table public.booking_requests
  drop column if exists clash_acknowledged;

commit;
