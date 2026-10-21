-- ============================================================================
-- booking_propose_reachable_open_v1 — a booking proposal reaches only a worker
-- this company may contact, only on an open need, and never re-opens a
-- proposal the worker declined or the company withdrew (owner-approved fix
-- programme 2026-10-21, item "booking proposals").
--
-- RED by rule: a SECURITY DEFINER function is replaced (g) and its grants are
-- restated (h). Draft PR + needs-human-gate; apply only via Supabase MCP
-- apply_migration after the owner approves this exact SQL. Never `db push`.
--
-- DEFECT. propose_booking_request (latest body 20260928140000) checked only
-- that the caller created the need and that the worker row exists. So a
-- company could
--   * send a proposal (and its notification) to ANY worker id — including a
--     person who never consented to be found and has no relationship with the
--     company;
--   * propose on a CLOSED need;
--   * re-open a 'declined' or 'withdrawn' proposal: the ON CONFLICT branch set
--     status back to 'proposed' — overriding the worker's "no", and, because
--     the 30-per-24h cap counts created_at, re-sending without limit.
--
-- CHANGE (inside the one function; propose_booking_request_v3 and
-- respond_agency_candidate_offer_v1 delegate to it, so they inherit it):
--   1. REACHABLE — fail-closed `if not coalesce((...), false)`:
--        public.can_view_worker(p_worker_id)  — the platform's one "may this
--          caller see this worker" predicate: self / admin, an employer with
--          the worker's granted discoverability consent, an active roster /
--          engagement / organization relationship, an active project
--          assignment (20260827210000). The scouting pool the propose button
--          sits on is already can_view_worker-scoped, so no UI path loses a
--          candidate;
--        OR an open (offered / accepted) agency candidate offer of THIS worker
--          on THIS need to a client company the caller owns, on a still-active
--          share — the agency placement chain (the agency holds the roster
--          relationship and offered the person; the client usually has no
--          can_view_worker arm of its own). Without this arm accepting an
--          agency candidate would stop creating the booking.
--      Refused with 'worker_not_reachable' (42501), checked BEFORE the
--      existence check so a probe cannot tell a hidden worker from no worker.
--   2. OPEN — the need's status is not 'closed' (customer_requests status
--      vocabulary 0028: draft | submitted | in_review | needs_followup |
--      approved | closed; 'closed' is the only end state close_demand_v1
--      writes). Refused with 'demand_closed' (P0001).
--   3. NOT RE-OPENED — the caller's existing row for (need, worker) is read
--      FOR UPDATE; 'accepted' keeps its refusal ('Booking already accepted'),
--      'declined' / 'withdrawn' are refused with 'booking_not_reopenable'
--      (P0001). The ON CONFLICT branch now re-opens only an 'expired' row
--      (silence, not an answer). The lock closes the check-then-upsert race.
--   Everything else is byte-identical to 20260928140000: auth, ownership,
--   date order, readiness snapshot, upsert columns, event row.
--
-- PRODUCT NOTE (owner decision required — architecture review question B):
--   the bookings page's "propose again" (Capability G, PR 6b: rebook from a
--   declined / withdrawn outgoing booking) relied on the resurrection this
--   migration removes. The app half of this PR retires that button; the
--   declined row keeps its "find another worker" next step. If the owner
--   wants a company to re-offer after ITS OWN withdrawal, remove 'withdrawn'
--   from the refusal list below (one word) and keep the button for that
--   status only.
--
-- No table, column, policy or data change.
--
-- ROLLBACK: supabase/rollbacks/20261021095200_booking_propose_reachable_open_v1.down.sql
--   (restores the 20260928140000 body verbatim, grants as before).
-- ============================================================================

begin;

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
  v_need_status text;
  v_existing    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select cr.status into v_need_status
    from public.customer_requests cr
   where cr.id = p_request_id and cr.profile_id = uid;
  if not found then
    raise exception 'Not your demand' using errcode = '42501';
  end if;
  -- The worker must be one this company may contact (see header).
  if not coalesce((
       public.can_view_worker(p_worker_id)
       or exists (
         select 1
           from public.agency_candidate_offers o
           join public.agency_client_request_shares s
             on s.id = o.request_share_id and s.status = 'active'
          where o.request_id = p_request_id
            and o.worker_id = p_worker_id
            and o.status in ('offered', 'accepted')
            and public.owns_company(o.client_company_id))
     ), false) then
    raise exception 'worker_not_reachable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id) then
    raise exception 'Unknown worker' using errcode = 'P0002';
  end if;
  -- A proposal is made on an OPEN need.
  if v_need_status is not distinct from 'closed' then
    raise exception 'demand_closed' using errcode = 'P0001';
  end if;
  if v_end is not null and v_start is not null and v_end < v_start then
    raise exception 'End date before start date' using errcode = '22023';
  end if;

  select br.status into v_existing
    from public.booking_requests br
   where br.owner_id = uid
     and br.request_id = p_request_id
     and br.worker_id = p_worker_id
     for update;
  -- An accepted proposal is an agreement: its terms are not rewritten here.
  if v_existing = 'accepted' then
    raise exception 'Booking already accepted' using errcode = 'P0001';
  end if;
  -- An answered proposal stays answered: the worker's "no" (declined) and the
  -- company's own withdrawal are not turned back into an open proposal.
  if v_existing in ('declined', 'withdrawn') then
    raise exception 'booking_not_reopenable' using errcode = 'P0001';
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
       status = case when public.booking_requests.status = 'expired'
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

-- Grants exactly as before: EXECUTE for authenticated only.
revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;

commit;

-- ROLLBACK
--   supabase/rollbacks/20261021095200_booking_propose_reachable_open_v1.down.sql
