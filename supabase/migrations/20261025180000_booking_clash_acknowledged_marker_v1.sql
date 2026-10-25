-- ============================================================================
-- 20261025180000 — COMPLETE RED #5: an acknowledged booking clash can be
-- recorded.
--
-- RED (owner-gated). PREPARED, NOT APPLIED. Draft PR + `needs-human-gate`;
-- apply only via Supabase MCP `apply_migration` after the owner approves this
-- exact diff. Never `supabase db push`.
--
-- Findings this file trips, all intentional, all for the owner to approve:
--   * security-definer-function — `respond_booking_request_v4` is redefined
--     (same signature, still SECURITY DEFINER, pinned search_path); the
--     trigger function is SECURITY INVOKER (no `security definer`).
--   * grant-or-revoke — v4's grants are restated EXACTLY as production has
--     them (EXECUTE to authenticated; public + anon revoked). Nothing widens.
--   * create-trigger — the marker-scope trigger below.
--   * drop constraint — `booking_requests_no_overlapping_accepted` is dropped
--     and re-added in the SAME transaction with a narrower WHERE.
--
-- NO `@human-gate-approved` MARKER: the owner has not approved this yet, so
-- migration-safety reports it RED and this PR stays a draft with
-- `needs-human-gate`. The marker is added only on the owner's explicit
-- written approval of this exact diff, never by the agent.
--
-- WHY (production 2026-10-25 17:27 UTC, walk orders-bookings run
-- 40216243755, step O-5). 20260915180000 (RED #5, owner-approved) let v4 skip
-- its own clash check when the worker acknowledges the overlap, and writes a
-- `clash_acknowledged` receipt. It never relaxed the TABLE constraint:
--
--   booking_requests_no_overlapping_accepted
--     EXCLUDE USING gist (worker_id WITH =,
--       daterange(start_date, COALESCE(expected_end_date, start_date), '[]') WITH &&)
--     WHERE (status = 'accepted' AND start_date IS NOT NULL)
--
-- so the acknowledged UPDATE to 'accepted' fails with 23P01 ("conflicting
-- key value violates exclusion constraint"), the whole transaction rolls
-- back (no receipt either), and the booking stays 'proposed'. The owner's
-- decision has no way to land.
--
-- WHAT CHANGES — the smallest structure that lets it land:
--   1. `booking_requests.clash_acknowledged boolean not null default false`.
--      A constraint cannot read `booking_request_events`, so the decision has
--      to be visible on the row itself. Every existing row gets `false`
--      (a metadata-only default in PG 11+, no table rewrite, no UPDATE).
--   2. The exclusion constraint is re-created with ONE added condition:
--        … WHERE status = 'accepted' AND start_date IS NOT NULL
--                AND NOT clash_acknowledged
--      Every UNacknowledged accepted booking is protected exactly as today:
--      two of them can still never overlap.
--   3. v4 sets `clash_acknowledged = true` in the SAME UPDATE that accepts,
--      and ONLY when the person acknowledged AND a clash really exists
--      (`v_clashes` non-empty). An acknowledged accept with nothing to
--      overlap stays fully protected. The receipt rows are unchanged.
--   4. A BEFORE trigger keeps the marker honest: it can never outlive the
--      acceptance it was given for. It is forced to false on INSERT, whenever
--      the row is not 'accepted', and whenever the worker or the dates change;
--      and once a row is accepted it cannot be flipped later. So a
--      reschedule (accepted → proposed, new dates), an expiry, a withdrawal or
--      a re-proposal all hand the row back to the full constraint.
--
-- WHAT DOES NOT CHANGE
--   * `respond_booking_request_v3` — untouched. The default accept refuses an
--     overlap with the same errcode and message as today.
--   * v4 without `p_acknowledge_clash` — byte-identical behaviour.
--   * No row is updated, deleted or re-statused. No RLS policy changes.
--     authenticated still has SELECT only on `booking_requests`; every write
--     still arrives through a SECURITY DEFINER function, so no client can set
--     the marker directly.
--   * The clash is not resolved or hidden: both bookings keep their dates,
--     `detectConflicts` keeps returning the overlap, the receipt names the
--     counterpart.
--
-- KNOWN LIMIT (stated, not hidden): an acknowledged row is outside the
-- constraint, so a LATER accept that overlaps only that row is refused by
-- the RPCs' own clash check (which reads every accepted row, acknowledged or
-- not, under the per-worker advisory lock) rather than by the constraint.
--
-- PRE-APPLY CHECK (read-only):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'booking_requests_no_overlapping_accepted';
--   -- expect the definition quoted above.
--
-- POST-APPLY VERIFICATION (read-only):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'booking_requests_no_overlapping_accepted';
--   -- expect: ... WHERE (((status = 'accepted'::text) AND (start_date IS NOT
--   --         NULL) AND (NOT clash_acknowledged)))
--   select count(*) from public.booking_requests where clash_acknowledged; -- 0
--   then re-run walk orders-bookings O-5: "accept anyway" →
--   `booking-clash-acknowledged` is shown, the booking is 'accepted', and one
--   `clash_acknowledged` event per counterpart exists.
--
-- ROLLBACK: supabase/rollbacks/20261025180000_booking_clash_acknowledged_marker_v1.down.sql
-- ============================================================================

begin;

-- ── 1. The marker on the row ────────────────────────────────────────────────
alter table public.booking_requests
  add column if not exists clash_acknowledged boolean not null default false;

comment on column public.booking_requests.clash_acknowledged is
  'RED #5 completion. TRUE only on an ACCEPTED booking the worker accepted '
  'through respond_booking_request_v4 while knowingly overlapping another '
  'accepted booking (a clash_acknowledged receipt per counterpart is in '
  'booking_request_events). Such a row is outside the '
  'booking_requests_no_overlapping_accepted constraint. Forced back to false '
  'by booking_requests_clash_marker_scope whenever the row stops being '
  'accepted or its worker/dates change.';

-- ── 2. The marker cannot outlive the acceptance it was given for ───────────
create or replace function public.booking_requests_clash_marker_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    -- Nothing is ever created already-acknowledged.
    new.clash_acknowledged := false;
  elsif new.status is distinct from 'accepted' then
    -- Reopened, declined, withdrawn, expired: back under the full constraint.
    new.clash_acknowledged := false;
  elsif new.worker_id is distinct from old.worker_id
     or new.start_date is distinct from old.start_date
     or new.expected_end_date is distinct from old.expected_end_date then
    -- The acknowledgement covered THESE dates for THIS worker, nothing else.
    new.clash_acknowledged := false;
  elsif old.status is distinct from 'accepted' then
    -- The accept transition itself: the accepting function decides
    -- (v4 sets true only on an acknowledged real clash; v3 leaves false).
    null;
  else
    -- An already-accepted row: the marker is fixed at the moment of accept.
    new.clash_acknowledged := old.clash_acknowledged;
  end if;
  return new;
end;
$function$;

comment on function public.booking_requests_clash_marker_scope() is
  'RED #5 completion. Keeps booking_requests.clash_acknowledged scoped to the '
  'one acceptance it was given for. SECURITY INVOKER; writes only NEW.';

drop trigger if exists booking_requests_clash_marker_scope on public.booking_requests;
create trigger booking_requests_clash_marker_scope
  before insert or update on public.booking_requests
  for each row execute function public.booking_requests_clash_marker_scope();

-- ── 3. The constraint: unacknowledged accepts stay exactly as protected ────
-- Dropped and re-added in ONE transaction, so there is no instant without it.
-- Every current accepted row already satisfies the OLD (stricter) constraint
-- and every row has clash_acknowledged = false, so the ADD cannot fail on
-- existing data and changes nothing about it.
alter table public.booking_requests
  drop constraint if exists booking_requests_no_overlapping_accepted;

alter table public.booking_requests
  add constraint booking_requests_no_overlapping_accepted
  exclude using gist (
    worker_id with =,
    daterange(start_date, coalesce(expected_end_date, start_date), '[]') with &&
  )
  where (status = 'accepted' and start_date is not null and not clash_acknowledged);

comment on constraint booking_requests_no_overlapping_accepted on public.booking_requests is
  'Two overlapping ACCEPTED bookings for one worker are impossible, unless the '
  'worker knowingly accepted the overlap (clash_acknowledged, RED #5, set only '
  'by respond_booking_request_v4 with a receipt).';

-- ── 4. v4: same signature, same body, plus the marker in the same UPDATE ───
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
  v_mark boolean := false;
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

    -- THE MARKER (this migration). Only an acknowledged accept that really
    -- overlaps something leaves the constraint; anything else stays under it.
    v_mark := coalesce(p_acknowledge_clash, false) is true
              and array_length(v_clashes, 1) is not null;
  end if;

  update public.booking_requests
     set status = p_decision,
         clash_acknowledged = (p_decision = 'accepted' and v_mark),
         updated_at = now()
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

-- Restated EXACTLY as production has them (20260915180000); nothing widens.
revoke all on function public.respond_booking_request_v4(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.respond_booking_request_v4(uuid, text, text, text, boolean) to authenticated;

comment on function public.respond_booking_request_v4(uuid, text, text, text, boolean) is
  'RED #5. v3 plus an explicit clash acknowledgement. Only the addressed '
  'worker may call it (unchanged). Without p_acknowledge_clash it refuses an '
  'overlapping accept exactly as v3 does. With it, the accept proceeds, the '
  'row is marked clash_acknowledged (outside the overlap constraint) AND a '
  'clash_acknowledged receipt is written per overlapping booking. The clash '
  'is not resolved, not hidden and not deleted.';

commit;

-- ============================================================================
-- ROLLBACK (exact; also shipped as the runnable .down.sql named above)
--
-- Refuses — raises, changes nothing — while any acknowledged accepted booking
-- still overlaps another accepted booking of the same worker, because the
-- original constraint could not be re-added over that data and no booking is
-- ever rewritten or re-statused to make it fit. Otherwise: restores the
-- original constraint, the previous v4 body (20260915180000) and its grants,
-- drops the trigger + function, and drops the column.
-- ============================================================================
