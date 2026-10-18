-- ============================================================================
-- RED #4 + #5 proof harness — PRELUDE.
--
-- Builds the minimal FAITHFUL prerequisites so that the real migration
--   supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql
-- can be executed VERBATIM and its authority model measured. The migration
-- under test is NOT re-implemented here.
--
-- WHAT IS FAITHFUL, and how it was obtained: every CHECK constraint and every
-- RLS policy below was read out of PRODUCTION on 2026-09-15 via pg_constraint
-- and pg_policies and pasted verbatim, and `respond_booking_request_v3` is the
-- verbatim `pg_get_functiondef` body from production. Nothing here is written
-- from memory of what the schema "should" say.
--
-- WHAT IS A STAND-IN, stated so no result is over-read:
--   * `auth.uid()` is a session-GUC stub (`app.uid`), the same shim the
--     existing repo proofs use. It replaces JWT plumbing, NOT the policy
--     engine — RLS is genuinely enabled and genuinely evaluated below, and
--     every test runs as the non-owner role `authenticated`.
--   * `manages_organization()` is a real lookup over a members table rather
--     than production's definer function. The policies call it identically;
--     what is proven is the policy's use of it, not its own internals.
--   * Surrounding tables carry only the columns the policies and the RPC
--     touch. A column nothing under test reads cannot change a result.
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon;
  end if;
end $$;

create schema if not exists auth;

-- Session-scoped auth.uid() stub: each session sets `app.uid`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select false $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_company_id uuid
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (organization_id, profile_id)
);

-- Shape-faithful stand-in for production's definer predicate.
create or replace function public.manages_organization(p_org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.profile_id = auth.uid()
  );
$$;

-- ── PART A tables ──────────────────────────────────────────────────────────

create table if not exists public.organization_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  link_state text not null default 'unlinked',
  unique (id, organization_id)
);

create table if not exists public.organization_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_person_id uuid not null,
  imported_by_profile_id uuid references public.profiles(id) on delete set null,
  original_text text not null,
  activity_date date,
  constraint organization_evidence_records_org_scope unique (id, organization_id),
  constraint organization_evidence_records_person_fk
    foreign key (organization_person_id, organization_id)
    references public.organization_people(id, organization_id)
);

create table if not exists public.organization_evidence_parties (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.organization_evidence_records(id) on delete cascade,
  party_organization_id uuid references public.organizations(id) on delete cascade,
  party_role text not null
);

-- organization_evidence_events — columns + CHECKs verbatim from production.
create table if not exists public.organization_evidence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  record_id uuid not null,
  event_type text not null,
  actor_role text,
  actor_organization_id uuid references public.organizations(id) on delete set null,
  actor_profile_id uuid default auth.uid() references public.profiles(id) on delete set null,
  note text,
  replacement_record_id uuid references public.organization_evidence_records(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_evidence_events_record_fk
    foreign key (record_id, organization_id)
    references public.organization_evidence_records(id, organization_id) on delete cascade,
  constraint organization_evidence_events_event_type_check
    check (event_type = any (array['attested','attestation_withdrawn','independently_verified',
                                   'verification_withdrawn','withdrawn','reinstated',
                                   'disputed','corrected'])),
  constraint organization_evidence_events_actor_role
    check (((event_type = any (array['attested','independently_verified'])) = (actor_role is not null))),
  constraint organization_evidence_events_actor_role_check
    check (((actor_role is null) or (actor_role = any (array['employer','agency','client','end_client',
      'project_owner','subcontractor','education_provider','training_provider','assessor','verifier',
      'placement_provider','public_body','sector_body','other'])))),
  constraint organization_evidence_events_note_check
    check (((note is null) or (char_length(note) <= 1000)))
);

alter table public.organization_evidence_records enable row level security;
alter table public.organization_evidence_events  enable row level security;
alter table public.organization_evidence_parties enable row level security;
alter table public.organization_people           enable row level security;

-- Supabase grants these by default; the harness must too, or a policy that
-- calls auth.uid() fails on schema permission instead of on its predicate.
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
-- EXACTLY production's grant set (information_schema.role_table_grants,
-- 2026-09-15): INSERT,SELECT and nothing else. An earlier draft of this
-- harness also granted UPDATE/DELETE on the events table, which made the
-- harness MORE permissive than production — the wrong direction for a safety
-- proof, and it would have let a passing result mean less than it looked.
grant select, insert on public.organization_evidence_records to authenticated;
grant select, insert on public.organization_evidence_events to authenticated;
grant select on public.organization_evidence_parties to authenticated;
grant select on public.organization_people to authenticated;

-- Permissive helper policies for the SURROUNDING tables, so a failure below is
-- always the policy under test and never a missing read on a join table.
drop policy if exists harness_people_select on public.organization_people;
create policy harness_people_select on public.organization_people for select to authenticated using (true);
drop policy if exists harness_parties_select on public.organization_evidence_parties;
create policy harness_parties_select on public.organization_evidence_parties for select to authenticated using (true);

-- ── The EXACT production policies (pg_policies, 2026-09-15) ────────────────

drop policy if exists organization_evidence_records_insert on public.organization_evidence_records;
create policy organization_evidence_records_insert on public.organization_evidence_records
  for insert to authenticated
  with check (manages_organization(organization_id) and (imported_by_profile_id = auth.uid()));

drop policy if exists organization_evidence_records_select on public.organization_evidence_records;
create policy organization_evidence_records_select on public.organization_evidence_records
  for select to authenticated
  using (manages_organization(organization_id) or (exists (
           select 1 from organization_people op
            where op.id = organization_evidence_records.organization_person_id
              and op.linked_profile_id = auth.uid() and op.link_state = 'linked'))
         or (exists (select 1 from organization_evidence_parties p
            where p.record_id = organization_evidence_records.id
              and p.party_organization_id is not null
              and manages_organization(p.party_organization_id)))
         or is_admin());

drop policy if exists organization_evidence_events_attest on public.organization_evidence_events;
create policy organization_evidence_events_attest on public.organization_evidence_events
  for insert to authenticated
  with check (manages_organization(organization_id) and (actor_profile_id = auth.uid())
              and (event_type <> 'independently_verified'::text));

drop policy if exists organization_evidence_events_verify on public.organization_evidence_events;
create policy organization_evidence_events_verify on public.organization_evidence_events
  for insert to authenticated
  with check ((event_type = 'independently_verified'::text) and (actor_profile_id = auth.uid())
    and (not manages_organization(organization_id)) and (actor_organization_id is not null)
    and manages_organization(actor_organization_id)
    and (exists (select 1 from organization_evidence_parties p
                  where p.record_id = organization_evidence_events.record_id
                    and p.party_organization_id = organization_evidence_events.actor_organization_id
                    and p.party_role = any (array['client','end_client','project_owner','assessor','verifier','public_body'])))
    and (not (exists (select 1 from (organization_evidence_records r
                 join organization_people op on op.id = r.organization_person_id)
                where r.id = organization_evidence_events.record_id
                  and op.linked_profile_id = auth.uid()))));

drop policy if exists organization_evidence_events_select on public.organization_evidence_events;
create policy organization_evidence_events_select on public.organization_evidence_events
  for select to authenticated
  using (manages_organization(organization_id) or (exists (
           select 1 from (organization_evidence_records r
             join organization_people op on op.id = r.organization_person_id)
            where r.id = organization_evidence_events.record_id
              and op.linked_profile_id = auth.uid() and op.link_state = 'linked'))
         or (exists (select 1 from organization_evidence_parties p
            where p.record_id = organization_evidence_events.record_id
              and p.party_organization_id is not null
              and manages_organization(p.party_organization_id)))
         or is_admin());

-- ── PART B tables — verbatim from 20260613100100 + 20260711290000 ──────────

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null
);

create table if not exists public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  source_booking_id uuid unique,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_requests (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  request_id         uuid not null references public.customer_requests(id) on delete cascade,
  worker_id          uuid not null references public.workers(id) on delete cascade,
  status             text not null default 'proposed'
                       check (status in ('proposed','accepted','declined','withdrawn','expired')),
  start_date         date,
  expected_end_date  date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- production carries `unique (owner_id, request_id, worker_id)`; the clash
  -- fixtures need three bookings for one worker under one demand, which that
  -- unique forbids. It is unrelated to the overlap logic under test, so the
  -- harness omits it and says so rather than pretending production lacks it.
  check (expected_end_date is null or start_date is null or expected_end_date >= start_date)
);

create table if not exists public.booking_request_events (
  id                 uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  actor_id           uuid not null references public.profiles(id),
  event_type         text not null,
  from_status        text,
  to_status          text not null,
  reason_kind        text,
  reason_note        text,
  created_at         timestamptz not null default now(),
  constraint booking_request_events_event_type_check
    check (event_type = any (array['proposed','accepted','declined','withdrawn','expired',
                                   'rescheduled','deadline_set'])),
  constraint booking_request_events_reason_note_check
    check (((reason_note is null) or (char_length(reason_note) <= 500)))
);

-- RE-RUN ISOLATION: restore the exact PRE-migration state so a second run
-- cannot inherit the previous run's column/constraint and pass vacuously.
alter table if exists public.booking_request_events
  drop constraint if exists booking_request_events_clash_receipt;
alter table if exists public.booking_request_events
  drop column if exists related_booking_request_id;
drop function if exists public.respond_booking_request_v4(uuid, text, text, text, boolean);
drop policy if exists "organization_evidence_events_subject_dispute" on public.organization_evidence_events;
drop index if exists public.organization_evidence_events_one_dispute_per_actor;

-- ── respond_booking_request_v3 — VERBATIM from production pg_get_functiondef
--    (2026-09-15). v4 must behave identically except where the migration says
--    otherwise, so the baseline has to be the real body, not a paraphrase. ───
create or replace function public.respond_booking_request_v3(p_booking_id uuid, p_decision text, p_reason_kind text, p_reason_note text)
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

  select * into br from public.booking_requests where id = p_booking_id for update;
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
    if br.status = p_decision then
      return jsonb_build_object('decision', p_decision,
        'engagement', case when p_decision = 'accepted' then 'already_recorded' else null end,
        'idempotent', true);
    end if;
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    perform pg_advisory_xact_lock(hashtextextended(br.worker_id::text, 0));
    if exists (
      select 1 from public.booking_requests other
       where other.worker_id = br.worker_id and other.id <> br.id
         and other.status = 'accepted' and other.start_date is not null
         and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
             && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]')
    ) then
      raise exception 'Conflicting accepted booking for these dates' using errcode = '23P01';
    end if;
  end if;

  update public.booking_requests set status = p_decision, updated_at = now()
   where id = br.id and status = 'proposed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status, reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  if p_decision = 'accepted' then
    select cr.profile_id, cr.organization_id into v_demand_owner, v_demand_org
      from public.customer_requests cr where cr.id = br.request_id;
    if v_demand_owner is null or v_demand_owner is distinct from br.owner_id then
      v_engagement := 'no_company';
    elsif v_demand_org is not null then
      select o.legacy_company_id into v_company from public.organizations o where o.id = v_demand_org;
      if v_company is null then v_engagement := 'no_company'; end if;
    else
      select count(*) into v_company_count from public.companies c where c.profile_id = v_demand_owner;
      if v_company_count = 0 then v_engagement := 'no_company';
      elsif v_company_count > 1 then v_engagement := 'ambiguous_company';
      else select c.id into v_company from public.companies c where c.profile_id = v_demand_owner;
      end if;
    end if;
    if v_engagement is not null then null;
    elsif exists (select 1 from public.company_worker_engagements e where e.source_booking_id = br.id) then
      v_engagement := 'already_recorded';
    elsif exists (select 1 from public.company_worker_engagements e
                   where e.company_id = v_company and e.worker_id = br.worker_id and e.status = 'active') then
      v_engagement := 'already_active';
    else
      insert into public.company_worker_engagements (company_id, worker_id, source_booking_id, created_by)
        values (v_company, br.worker_id, br.id, uid)
      on conflict (source_booking_id) do nothing;
      v_engagement := 'created';
    end if;
  end if;

  return jsonb_build_object('decision', p_decision, 'engagement', v_engagement);
end;
$function$;

grant execute on function public.respond_booking_request_v3(uuid,text,text,text) to authenticated;
