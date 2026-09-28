-- ============================================================================
-- ROLLBACK for 20260928140000_booking_accepted_not_rewritten_v1
--
-- Restores `propose_booking_request` exactly as production had it before the
-- apply (definition read back 2026-09-28 via pg_get_functiondef): no
-- accepted-row guard. CREATE OR REPLACE keeps the existing grants. No data to
-- unwind — the migration changes behaviour only.
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

-- PART 2 rollback: restore reschedule_booking_proposal_v1 exactly as
-- production had it (read back 2026-09-28: proposed-only), then drop the
-- additive event column. Rows reopened by part 2 stay 'proposed' — the worker
-- still decides. Export the preserved accepted terms first:
--   select booking_request_id, created_at, previous_terms
--     from public.booking_request_events where previous_terms is not null;
create or replace function public.reschedule_booking_proposal_v1(p_booking_id uuid, p_start_date date, p_end_date date, p_note text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;
revoke all on function public.reschedule_booking_proposal_v1(uuid, date, date, text) from public, anon;
grant execute on function public.reschedule_booking_proposal_v1(uuid, date, date, text) to authenticated;

alter table public.booking_request_events drop column if exists previous_terms;

-- PART 3 rollback: the proposer-name read did not exist before.
drop function if exists public.booking_proposer_names_v1(uuid[]);
