-- ============================================================================
-- 20260928140000 — an ACCEPTED booking is not rewritten by proposing again.
--
-- RED by rule (redefines a SECURITY DEFINER function). NOT APPLIED — draft PR
-- + needs-human-gate; apply only via Supabase MCP apply_migration after the
-- owner approves this exact diff. Never `db push`.
-- @human-gate-approved
--
-- WHY. Production walk 2026-09-28 (synthetic cast): a worker accepted a
-- booking starting 5 October; the employer proposed again for the same need.
-- `propose_booking_request` upserts on (owner_id, request_id, worker_id) and
-- its ON CONFLICT branch rewrote start_date / expected_end_date / role_text /
-- note / readiness_snapshot while keeping status = 'accepted' (it resets the
-- status only for withdrawn / declined / expired rows) — and logged a
-- 'proposed' event whose to_status did not match the row. The worker was
-- recorded as agreeing to 12 October, which they never saw.
--
-- The app refuses this since #1922 (`already-accepted`, before any RPC call).
-- This makes the same rule hold for ANY caller of the RPC — defence in depth.
--
-- WHAT CHANGES. One guard before the upsert: if this owner's row for this
-- request and worker is 'accepted', raise P0001 'Booking already accepted'.
-- Everything else is byte-identical to production (read back 2026-09-28):
-- auth, ownership, worker existence, date order, snapshot, upsert, event.
-- `propose_booking_request_v3` delegates to this function, so it inherits the
-- rule. Grants are restated explicitly at the end EXACTLY as production has
-- them (EXECUTE for authenticated only; public + anon revoked) so a local reset
-- reproduces them — no privilege is added or removed in production. No table,
-- column or policy changes; no data changes.
--
-- ROLLBACK: supabase/rollbacks/20260928140000_booking_accepted_not_rewritten_v1.down.sql
--   (restores the previous definition exactly).
-- ============================================================================

create or replace function public.propose_booking_request(
  p_request_id uuid,
  p_worker_id uuid,
  p_start_date text,
  p_expected_end_date text,
  p_location_country text,
  p_role_text text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid       uuid := auth.uid();
  v_start   date := nullif(p_start_date, '')::date;
  v_end     date := nullif(p_expected_end_date, '')::date;
  v_country char(2) := nullif(trim(coalesce(p_location_country, '')), '');
  v_snapshot jsonb;
  row_id    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customer_requests cr
                  where cr.id = p_request_id and cr.profile_id = uid) then
    raise exception 'Not your demand' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id) then
    raise exception 'Unknown worker' using errcode = 'P0002';
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'End date before start date' using errcode = '22023';
  end if;
  -- An accepted proposal is an agreement: its terms are not rewritten here.
  if exists (select 1 from public.booking_requests br
              where br.owner_id = uid
                and br.request_id = p_request_id
                and br.worker_id = p_worker_id
                and br.status = 'accepted') then
    raise exception 'Booking already accepted' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
           'captured_at', now(),
           'availability_status', w.availability_status,
           'available_from', w.available_from,
           'preferred_countries', w.preferred_countries,
           'verified_skill_count', (
             select count(*) from public.worker_skills ws
              where ws.worker_id = w.id and ws.verified),
           'document_count', (
             select count(*) from public.worker_documents wd
              where wd.worker_id = w.id)
         )
    into v_snapshot
    from public.workers w where w.id = p_worker_id;

  insert into public.booking_requests
      (owner_id, request_id, worker_id, status, start_date, expected_end_date,
       location_country, role_text, note, readiness_snapshot)
    values (uid, p_request_id, p_worker_id, 'proposed', v_start, v_end,
            v_country, nullif(trim(coalesce(p_role_text,'')), ''),
            nullif(trim(coalesce(p_note,'')), ''), coalesce(v_snapshot, '{}'::jsonb))
  on conflict (owner_id, request_id, worker_id)
  do update set
       status = case when public.booking_requests.status in ('withdrawn','declined','expired')
                     then 'proposed' else public.booking_requests.status end,
       start_date = excluded.start_date,
       expected_end_date = excluded.expected_end_date,
       location_country = excluded.location_country,
       role_text = excluded.role_text,
       note = excluded.note,
       readiness_snapshot = excluded.readiness_snapshot,
       updated_at = now()
  returning id into row_id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (row_id, uid, 'proposed', null, 'proposed');

  return row_id;
end;
$function$;

-- Grants exactly as production has them (read back 2026-09-28): EXECUTE for
-- authenticated only. Explicit, so a local reset cannot leave the definer
-- anon-reachable through default privileges.
revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;

-- ============================================================================
-- PART 2 (owner decision 2026-09-28, "APPROVED — #1923"): a worker's
-- acceptance covers ONLY the terms they saw. When the company changes a
-- material term of an ACCEPTED booking, the acceptance is not carried over:
-- the previous accepted terms are preserved in the event log, the booking
-- returns to 'proposed' with the new terms, and the worker decides again.
--
-- Smallest change on the existing model — no second booking system:
--   * one nullable jsonb column on the existing event log, `previous_terms`
--     (the accepted terms as they stood when changed; null on every other
--     event). Additive; readable under the unchanged
--     booking_request_events_select policy (owner or the addressed worker).
--   * `reschedule_booking_proposal_v1` (the existing "change dates" RPC) now
--     also accepts an ACCEPTED row. Identical to production for a 'proposed'
--     row. For an 'accepted' row whose dates actually change: status ->
--     'proposed', respond-by date cleared (it belonged to the old offer),
--     event 'rescheduled' accepted -> proposed carrying previous_terms. The
--     same dates on an accepted row change nothing (returns 'unchanged').
--   * `propose_booking_request` (above) still refuses an accepted row —
--     re-proposing is not the way to change an agreement.
-- The worker's re-accept goes through respond_booking_request_v4 unchanged
-- (it requires 'proposed'); the engagement created by the first acceptance is
-- reused there ('already_recorded') — no duplicate engagement.
-- ============================================================================

alter table public.booking_request_events
  add column if not exists previous_terms jsonb;

comment on column public.booking_request_events.previous_terms is
  'The ACCEPTED terms as they stood when the company changed them (start/end date, role, country, note, accepted_at). Set only on a rescheduled accepted->proposed event; null otherwise.';

create or replace function public.reschedule_booking_proposal_v1(
  p_booking_id uuid,
  p_start_date date,
  p_end_date date,
  p_note text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_accepted_at timestamptz;
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

  select * into br from public.booking_requests where id = p_booking_id for update;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if br.owner_id <> uid then
    raise exception 'Only the proposing company may reschedule' using errcode = '42501';
  end if;
  if br.status not in ('proposed', 'accepted') then
    raise exception 'Only an open proposal can be rescheduled' using errcode = '22023';
  end if;

  if br.status = 'accepted' then
    if br.start_date is not distinct from p_start_date
       and br.expected_end_date is not distinct from p_end_date then
      return 'unchanged';
    end if;

    select max(e.created_at) into v_accepted_at
      from public.booking_request_events e
     where e.booking_request_id = br.id and e.to_status = 'accepted';

    update public.booking_requests
       set start_date = p_start_date,
           expected_end_date = p_end_date,
           status = 'proposed',
           response_deadline_date = null,
           updated_at = now()
     where id = br.id and status = 'accepted';

    insert into public.booking_request_events
        (booking_request_id, actor_id, event_type, from_status, to_status,
         reason_kind, reason_note, previous_terms)
      values (br.id, uid, 'rescheduled', 'accepted', 'proposed', 'dates_changed', v_note,
              jsonb_build_object(
                'start_date', br.start_date,
                'expected_end_date', br.expected_end_date,
                'role_text', br.role_text,
                'location_country', br.location_country,
                'note', br.note,
                'accepted_at', v_accepted_at));

    return 'reopened';
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
$function$;

-- Grants exactly as production has them (read back 2026-09-28): EXECUTE for
-- authenticated only.
revoke all on function public.reschedule_booking_proposal_v1(uuid, date, date, text) from public, anon;
grant execute on function public.reschedule_booking_proposal_v1(uuid, date, date, text) to authenticated;

-- ============================================================================
-- PART 3 (owner decision 2026-09-28, "BOOKING IDENTITY — SHOW THE PROPOSING
-- COMPANY: YES"): a worker receiving a proposal can see WHICH organization
-- makes it. The identity is the booking's canonical `organization_id` (set by
-- the demand-chain inherit trigger) — nothing is copied into booking storage.
--
-- The worker cannot read `organizations` (organizations_select: owner /
-- member / admin), and that policy is NOT loosened. Instead one narrow read:
-- for booking ids the CALLER is a party to (the proposing owner or the
-- addressed worker — the same parties booking_request_events_select admits),
-- the organization's public-facing name (display_name, else legal_name).
-- No ids, no contact data, no other organization field. At most 50 ids.
-- ============================================================================

create or replace function public.booking_proposer_names_v1(p_booking_ids uuid[])
returns table(booking_id uuid, organization_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select br.id,
         coalesce(nullif(trim(o.display_name), ''), nullif(trim(o.legal_name), ''))
    from public.booking_requests br
    join public.organizations o on o.id = br.organization_id
   where br.id = any (p_booking_ids[1:50])
     and (br.owner_id = auth.uid()
          or exists (select 1 from public.workers w
                      where w.id = br.worker_id and w.profile_id = auth.uid()));
$function$;

revoke all on function public.booking_proposer_names_v1(uuid[]) from public, anon;
grant execute on function public.booking_proposer_names_v1(uuid[]) to authenticated;
