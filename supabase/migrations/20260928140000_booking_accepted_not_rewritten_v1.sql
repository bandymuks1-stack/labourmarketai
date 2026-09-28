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
