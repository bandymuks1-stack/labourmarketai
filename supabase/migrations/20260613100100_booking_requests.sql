-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude review.
-- Never `db push`.
--
-- Pre-payment readiness sprint (PR2) — Booking requests + calendar core.
-- Persists the (until now INERT) state machine in
-- apps/web/lib/booking/booking-state.ts: proposed → accepted|declined by the
-- WORKER only, proposed → withdrawn by the company, proposed → expired by the
-- system. The company can NEVER self-accept (no fake acceptance, §7).
--
-- Builds on the Step 4B decision packet
-- (docs/audits/communication-booking/STEP_4B_BOOKING_DECISION.md), extended
-- with: a readiness_snapshot captured at propose time, an expected_end_date +
-- country/role context for conflict detection, an append-only event log, and
-- overlap-conflict prevention on accept (no double-booking).
--
-- Honesty invariants:
--   * worker acceptance is a SECURITY DEFINER RPC (narrow, auditable) — never a
--     broad UPDATE grant;
--   * accept is BLOCKED if the worker already has an accepted booking whose
--     [start, end] overlaps — no silent double-commit;
--   * contacts stay hidden — booking does NOT reveal contact details (that is a
--     later, separate paid/contact slice; canViewWorkerContact stays false);
--   * readiness_snapshot stores what was true at propose time (immutable record).
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. Booking requests (company → worker proposals) ──────────────────────────
create table if not exists public.booking_requests (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  request_id         uuid not null references public.customer_requests(id) on delete cascade,
  worker_id          uuid not null references public.workers(id) on delete cascade,
  status             text not null default 'proposed'
                       check (status in ('proposed','accepted','declined','withdrawn','expired')),
  start_date         date,
  expected_end_date  date,
  location_country   char(2),
  role_text          text check (role_text is null or char_length(role_text) <= 200),
  note               text check (note is null or char_length(note) <= 2000),
  readiness_snapshot jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (owner_id, request_id, worker_id),
  check (expected_end_date is null or start_date is null or expected_end_date >= start_date)
);
create index if not exists booking_requests_owner_idx
  on public.booking_requests (owner_id, request_id);
create index if not exists booking_requests_worker_idx
  on public.booking_requests (worker_id, status);

-- 2. Append-only event log (status lifecycle audit) ─────────────────────────
create table if not exists public.booking_request_events (
  id                 uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  actor_id           uuid not null references public.profiles(id),
  event_type         text not null
                       check (event_type in ('proposed','accepted','declined','withdrawn','expired')),
  from_status        text,
  to_status          text not null,
  created_at         timestamptz not null default now()
);
create index if not exists booking_request_events_idx
  on public.booking_request_events (booking_request_id, created_at);

-- 3. RLS ─────────────────────────────────────────────────────────────────────
alter table public.booking_requests enable row level security;
alter table public.booking_request_events enable row level security;

-- Company (owner) sees its own proposals; the worker (subject) sees proposals
-- addressed to them; admin sees all. Default-closed (§4).
drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- Reads on the event log follow the same visibility as the parent booking.
drop policy if exists booking_request_events_select on public.booking_request_events;
create policy booking_request_events_select on public.booking_request_events
  for select to authenticated
  using (
    exists (select 1 from public.booking_requests br
             where br.id = booking_request_id
               and (br.owner_id = auth.uid()
                    or exists (select 1 from public.workers w
                                where w.id = br.worker_id and w.profile_id = auth.uid())))
    or public.is_admin()
  );
-- No insert/update/delete policies: ALL writes go through the RPCs below.
-- Append-only: no update/delete policy on events, ever.

-- 4. Propose (company owner) ────────────────────────────────────────────────
create or replace function public.propose_booking_request(
  p_request_id       uuid,
  p_worker_id        uuid,
  p_start_date       text,
  p_expected_end_date text,
  p_location_country text,
  p_role_text        text,
  p_note             text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  -- Owner must own the demand.
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

  -- Readiness snapshot at propose time (immutable record of what was true).
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
$$;
revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;

-- 5. Respond (worker accept/decline) — with overlap-conflict prevention ──────
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

  -- Only the SUBJECT worker may accept/decline.
  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_owner_worker;
  if not is_owner_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;

  -- State machine: only proposed → accepted|declined.
  if br.status <> 'proposed' then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  -- Conflict guard: on accept, refuse if an overlapping accepted booking exists.
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

-- 6. Withdraw (company owner) ────────────────────────────────────────────────
create or replace function public.withdraw_booking_request(
  p_booking_id uuid
) returns text
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
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (br.id, uid, 'withdrawn', 'proposed', 'withdrawn');

  return 'withdrawn';
end;
$$;
revoke all on function public.withdraw_booking_request(uuid) from public;
grant execute on function public.withdraw_booking_request(uuid) to authenticated;

-- 7. Grants — SELECT only; all writes are RPC-only ──────────────────────────
grant select on public.booking_requests to authenticated;
grant select on public.booking_request_events to authenticated;

commit;

-- ROLLBACK: see supabase/rollbacks/20260613100100_booking_requests.down.sql
-- (guarded drop — refuses if booking_requests holds rows).
