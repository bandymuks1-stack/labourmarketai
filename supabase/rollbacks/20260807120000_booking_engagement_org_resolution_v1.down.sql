-- ============================================================================
-- ROLLBACK for 20260807120000_booking_engagement_org_resolution_v1.sql.
--
-- Restores the 20260802150000 (W12 slice 1) `respond_booking_request_v3` body
-- VERBATIM — the profile-singleton company resolution, including its honest
-- 'ambiguous_company' non-mint for multi-company demand owners. All W12
-- layers (L1 row lock + idempotent replay, L2 advisory lock) are part of that
-- restored body; the L3 EXCLUDE constraint was never touched by the forward
-- migration and is not touched here.
--
-- Running this re-opens the KNOWN gap: an organization-stamped demand from a
-- multi-company owner goes back to minting NO engagement on accept.
--
-- No table, policy, grant surface, or delegator (v1/v2) is changed here —
-- the forward migration replaced only this one function body.
-- ============================================================================

begin;

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
  v_updated integer := 0;
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

  -- L1: LOCK THE ROW FIRST. Under READ COMMITTED a blocked `for update` re-reads
  -- the LATEST committed version after the holder commits, so the status gate
  -- below sees the winner's outcome rather than the stale pre-race snapshot.
  select * into br
    from public.booking_requests
   where id = p_booking_id
     for update;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- AUTHORIZATION IS NEVER DELEGATED TO A CONSTRAINT. Only the ADDRESSED
  -- worker may respond — checked here, server-side, from auth.uid() only. No
  -- client-supplied worker/company id exists in this signature.
  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;

  -- L1 status gate, evaluated AFTER the lock.
  if br.status is distinct from 'proposed' then
    -- IDEMPOTENT REPLAY: the same decision already landed (duplicate submit,
    -- retried request, double-tapped confirmation). Report the achieved state
    -- WITHOUT writing a second event/audit row and WITHOUT re-running the
    -- engagement branch.
    if br.status = p_decision then
      return jsonb_build_object(
        'decision', p_decision,
        'engagement', case when p_decision = 'accepted'
                           then 'already_recorded' else null end,
        'idempotent', true
      );
    end if;
    -- A DIFFERENT decision on a closed row stays the pre-slice error.
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    -- L2: serialise every accept for THIS worker. Locking br's row (L1) does
    -- not lock the OTHER overlapping booking's row, so without this the
    -- check-then-act below is still a TOCTOU window. Taken AFTER the row lock
    -- — a single, consistent lock order, so two accepts can never deadlock.
    perform pg_advisory_xact_lock(hashtextextended(br.worker_id::text, 0));

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

  -- L1: the status guard makes the write itself conditional. Combined with the
  -- row lock this is belt-and-braces, but it also means any future caller that
  -- reaches this UPDATE without the lock still cannot double-apply.
  update public.booking_requests
     set status = p_decision, updated_at = now()
   where id = br.id
     and status = 'proposed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- Unreachable while the row lock is held; kept as a fail-closed assertion
    -- so a silent no-op can never be reported as a successful response.
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  -- Engagement: SAME transaction as the accept — unchanged from the applied
  -- v3 body. Everything is derived from the booking's canonical origin chain
  -- server-side (booking.request_id → customer_requests.profile_id →
  -- companies); an ambiguous owner is an honest non-mint, never a guess.
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

commit;
