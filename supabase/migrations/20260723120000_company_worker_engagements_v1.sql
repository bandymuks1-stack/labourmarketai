-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`. Ships UNAPPLIED and deliberately WITHOUT
-- `@human-gate-approved` — RED in migration-safety CI is the intended state
-- until the owner reviews (new table + SECURITY DEFINER functions + grants =
-- RED-class).
--
-- 20260723120000 — company_worker_engagements v1 (employer full-journey P1:
-- accepted booking → limited engagement → project assignment bridge).
--
-- PROBLEM (2026-07-23 employer full E2E, factual dead-end): a company walks
-- scouting → interest → contact → booking proposed → worker ACCEPTS — and
-- then cannot assign that worker to any project. `assign_worker_to_project`
-- (20260609120000) requires `caller_manages_worker` = an active
-- company_workers/agency_workers roster row; the roster is reachable ONLY via
-- an email-keyed invitation (0027 / canonical invitations), and the scouting
-- candidate is anonymized (no email is ever exposed). An accepted booking
-- creates no roster row and no bridge — the canonical journey terminates at
-- /dashboard/bookings.
--
-- PRODUCT DECISION (owner, 2026-07-23): an accepted booking must NOT silently
-- make the worker a permanent roster member. It creates a LIMITED, AUDITABLE
-- company↔worker engagement that:
--   binds ONE worker to ONE company; carries provenance from the exact
--   accepted booking; makes the worker assignable ONLY to that company's own
--   projects; never reveals the worker's email; grants NO roster / agency /
--   instruction rights; is idempotent; can never arise from a proposed /
--   declined / withdrawn / expired or foreign booking; has explicit
--   active/ended states; and keeps its audit provenance after ending.
--
-- WHY A NEW TABLE (design decision B): company_workers is documented as the
-- email-invited permanent roster (0027 header) — reusing it would silently
-- grant instruction/roster semantics. engagement_contexts is the
-- organization-membership model (employee/freelancer/owner relationships)
-- with no booking provenance, feeding can_view_worker / journal contexts —
-- reusing it would widen blast radius. The smallest honest slice is ONE new
-- provenance-carrying table + the narrowest possible authorization extension
-- (project-assign gate only).
--
-- WHAT THIS ADDS:
--   1. table public.company_worker_engagements — RLS-enabled, writes
--      RPC-only (insert/update/delete revoked from authenticated).
--      Idempotency: unique(source_booking_id) + one ACTIVE row per
--      (company_id, worker_id) partial unique index.
--   2. respond_booking_request_v3 — v2 semantics verbatim (worker-only,
--      proposed-only, overlap guard, decline reasons) + on ACCEPT, in the
--      SAME transaction, creates/records the engagement idempotently.
--      Returns jsonb {decision, engagement} so the app can tell the honest
--      engagement outcome apart.
--   3. caller_has_booking_engagement_for_project(worker, project) — helper:
--      TRUE only when the caller OWNS a company holding an ACTIVE engagement
--      with this worker AND the project belongs to that same company's
--      canonical organization (organizations.legacy_company_id binding).
--   4. assign_worker_to_project — REPLACED: the roster gate is widened by
--      exactly one OR-branch (roster OR active accepted-booking engagement
--      for THIS project's company). can_manage_project stays required.
--      caller_manages_worker itself is NOT touched — instructions and every
--      other roster-gated surface keep their exact semantics.
--   5. list_booking_engagement_workers_v1() — caller-bound read for the
--      project-assign picker (worker id/profile/display name only; NO email,
--      NO contact fields).
--   6. end_company_worker_engagement_v1(id) — company owner or the worker
--      ends the engagement (status='ended', ended_at, ended_by). No delete —
--      the row IS the audit record.
--
-- COMPANY ORIGIN (deterministic, never a guess): the engagement's company is
-- derived from the booking's CANONICAL chain — booking_requests.request_id
-- (NOT NULL FK) → customer_requests.profile_id (the demand owner; the
-- propose RPC guarantees it equals booking.owner_id, and v3 re-verifies) →
-- companies.profile_id. The repo canon treats profile→company as unique
-- (callerCompanyId uses maybeSingle); if a demand-owner profile ever owns
-- MULTIPLE companies, v3 refuses to guess and returns the honest
-- 'ambiguous_company' non-mint state (the accept itself always stands).
-- There is NO created_at ordering and NO LIMIT-1 company pick anywhere.
--
-- GDPR / AUDIT MODEL (option A — issue #856 compatibility, NOT its fix):
--   * worker_id is NULLABLE with ON DELETE SET NULL; created_by / ended_by
--     (→ profiles) are ON DELETE SET NULL — this table can never block a
--     worker/profile erasure.
--   * subject_key (random uuid minted at creation, derived from nothing) is
--     the surviving pseudonymized audit subject: after erasure the row still
--     proves WHICH booking created WHICH company engagement WHEN, with no
--     identifiable subject left.
--   * A DETACHED row (worker_id IS NULL) grants NOTHING: the assign helper
--     and the picker RPC both require worker_id IS NOT NULL — active project
--     rights can never survive subject detachment.
--   * RETENTION: engagement rows are kept as non-identifying audit lineage
--     (company-side business record). The future #856 erasure flow may end
--     detached rows (status='ended') but never needs to delete them.
--
-- ABUSE BOUNDS: all ownership checks are caller-bound (auth.uid()) and
-- NULL-safe (`is distinct from`); no client-supplied company_id/worker_id is
-- trusted anywhere — the engagement is derived server-side from the booking's
-- canonical origin chain; engagement grants nothing outside the
-- project-assign gate; one active engagement per pair; one engagement per
-- booking, ever.
--
-- COMPATIBILITY / BACKFILL: none — new table ships empty; v1/v2 booking RPCs
-- keep working unchanged; the app calls v3 and falls back to v1 on
-- 42883/PGRST202 (accept is never lost; the UI reports the honest
-- needs_migration engagement state). No existing RLS policy is modified.
-- service_role table grants are NOT widened.
--
-- PRE-APPLY CHECK (run first, expect all four to return 0 rows / false):
--   select to_regclass('public.company_worker_engagements');           -- null
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--      ('respond_booking_request_v3','caller_has_booking_engagement_for_project',
--       'list_booking_engagement_workers_v1','end_company_worker_engagement_v1'); -- 0
--   select count(*) from public.booking_requests where status='accepted';  -- note the number
--   select version();  -- postgres 17.x
--
-- POST-APPLY VERIFICATION:
--   As the subject worker of a PROPOSED booking:
--     select public.respond_booking_request_v3('<booking id>','accepted','','');
--       → {"decision":"accepted","engagement":"created"}
--     repeat → error 'Booking is no longer open' (v2 semantics kept);
--     select count(*) from public.company_worker_engagements
--       where source_booking_id='<booking id>';                          -- exactly 1
--   As the company owner:
--     select * from public.list_booking_engagement_workers_v1();        -- 1 row, no email
--     select public.assign_worker_to_project('<own project id>','<worker profile id>'); -- uuid
--     select public.assign_worker_to_project('<FOREIGN project id>', ...); -- 42501
--   As an unrelated authenticated user:
--     select * from public.company_worker_engagements;                  -- 0 rows
--   As anon: every new function → permission denied.
--   GDPR detach simulation (in a ROLLED-BACK transaction):
--     begin;
--       delete from public.workers where id = '<engagement worker id>';
--         -- succeeds (no FK blocker); engagement row remains,
--         -- worker_id IS NULL, subject_key intact
--       select public.caller_has_booking_engagement_for_project(
--         '<old worker id>', '<project id>');                           -- false
--       select count(*) from public.list_booking_engagement_workers_v1(); -- 0
--     rollback;
--   + APPLIED_LEDGER.md row.
--
-- ROLLBACK: paired supabase/rollbacks/
-- 20260723120000_company_worker_engagements_v1.down.sql (drops the four new
-- functions + the table and RESTORES the original 20260609120000
-- assign_worker_to_project body verbatim).
-- ============================================================================

begin;

-- 1. The engagement table ----------------------------------------------------

create table if not exists public.company_worker_engagements (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  -- GDPR model A (issue #856 compatibility): the worker link is NULLABLE and
  -- detaches on worker deletion (ON DELETE SET NULL) — this table must never
  -- become another erasure blocker. The pseudonymized subject_key below is
  -- the surviving, non-identifying audit provenance; a DETACHED row grants
  -- NOTHING (every authorization/list path requires worker_id IS NOT NULL).
  worker_id         uuid references public.workers(id) on delete set null,
  -- Non-identifying audit subject reference: a random uuid minted at
  -- engagement creation, NOT derived from any worker/profile id. Survives
  -- worker erasure so the engagement's audit lineage (which booking, which
  -- company, when) stays intact without an identifiable subject.
  subject_key       uuid not null default gen_random_uuid(),
  -- Provenance: the exact accepted booking this engagement came from.
  -- RESTRICT: the audit origin cannot be silently deleted from under the
  -- engagement; removing a booking requires removing its engagement first.
  source_booking_id uuid not null references public.booking_requests(id) on delete restrict,
  status            text not null default 'active'
                      check (status in ('active','ended')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  -- Actor references detach on profile erasure (never block a deletion).
  ended_by          uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- The accepting worker's profile at mint time (detaches on erasure).
  created_by        uuid references public.profiles(id) on delete set null,
  -- One engagement per booking, ever (idempotency anchor for RPC retries).
  unique (source_booking_id)
);

-- At most ONE active engagement per company↔worker pair.
create unique index if not exists company_worker_engagements_active_pair_idx
  on public.company_worker_engagements (company_id, worker_id)
  where status = 'active';

create index if not exists company_worker_engagements_worker_idx
  on public.company_worker_engagements (worker_id)
  where worker_id is not null;
create index if not exists company_worker_engagements_company_idx
  on public.company_worker_engagements (company_id);

alter table public.company_worker_engagements enable row level security;

-- Read: the engagement's company owner, the subject worker, or admin.
drop policy if exists company_worker_engagements_select on public.company_worker_engagements;
create policy company_worker_engagements_select
  on public.company_worker_engagements for select
  using (
    public.owns_company(company_id)
    or exists (
      select 1 from public.workers w
       where w.id = worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- Writes are RPC-only.
grant select on public.company_worker_engagements to authenticated;
revoke insert, update, delete on public.company_worker_engagements from authenticated;
revoke all on public.company_worker_engagements from anon;
revoke all on public.company_worker_engagements from public;

-- 2. respond_booking_request_v3 — v2 semantics + transactional engagement ----

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

  -- Only the ADDRESSED worker may respond — a foreign caller can never
  -- accept someone else's booking (and therefore never mint an engagement).
  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;
  -- proposed-only: declined / withdrawn / expired / already-accepted rows are
  -- immutable here, so none of those states can ever create an engagement.
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

  -- Engagement: SAME transaction as the accept — an accepted booking is never
  -- left without its engagement record. Everything below is derived from the
  -- booking's CANONICAL origin chain server-side (booking.request_id →
  -- customer_requests.profile_id → companies); no client-supplied
  -- company/worker id exists and no implicit pick among companies is ever
  -- made — an ambiguous owner is an honest non-mint, never a guess.
  if p_decision = 'accepted' then
    -- The booking's demand row is mandatory (request_id NOT NULL) and the
    -- propose RPC guarantees the demand owner IS the booking owner; verify
    -- the invariant instead of trusting it.
    select cr.profile_id into v_demand_owner
      from public.customer_requests cr
     where cr.id = br.request_id;

    select count(*) into v_company_count
      from public.companies c
     where c.profile_id = v_demand_owner;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id
       or v_company_count = 0 then
      -- Honest partial: no resolvable canonical company origin — the accept
      -- stands, the engagement layer reports it truthfully.
      v_engagement := 'no_company';
    elsif v_company_count > 1 then
      -- The demand-owner profile owns MULTIPLE companies and the demand row
      -- carries no company binding — refusing to guess (repo canon treats
      -- profile→company as unique; see callerCompanyId's maybeSingle).
      v_engagement := 'ambiguous_company';
    else
      select c.id into v_company
        from public.companies c
       where c.profile_id = v_demand_owner;
    end if;

    if v_engagement is not null then
      null; -- already resolved to an honest non-mint state above
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.source_booking_id = br.id
    ) then
      -- Retry after success (unique source_booking_id) — nothing to mint.
      v_engagement := 'already_recorded';
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.company_id = v_company
         and e.worker_id = br.worker_id
         and e.status = 'active'
    ) then
      -- Another booking already binds this pair actively — never a duplicate.
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

-- 3. Engagement-scoped project authorization helper --------------------------

-- TRUE only when the CALLER owns a company that (a) holds an ACTIVE
-- accepted-booking engagement with this worker AND (b) canonically owns this
-- exact project (projects.organization_id → organizations.legacy_company_id).
-- This deliberately grants nothing beyond THAT company's own projects:
-- another company's project fails (b), a foreign caller fails the
-- caller-bound ownership, an ended engagement fails (a).
create or replace function public.caller_has_booking_engagement_for_project(
  p_worker_id  uuid,
  p_project_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.company_worker_engagements e
      join public.companies     c on c.id = e.company_id
      join public.projects      p on p.id = p_project_id
      join public.organizations o on o.id = p.organization_id
     where e.worker_id is not null
       and e.worker_id = p_worker_id
       and e.status = 'active'
       and c.profile_id is not distinct from auth.uid()
       and o.legacy_company_id is not distinct from e.company_id
  );
$$;
revoke all on function public.caller_has_booking_engagement_for_project(uuid, uuid) from public;
revoke all on function public.caller_has_booking_engagement_for_project(uuid, uuid) from anon;
grant execute on function public.caller_has_booking_engagement_for_project(uuid, uuid) to authenticated;

-- 4. assign_worker_to_project — the ONE widened gate -------------------------

-- Body identical to 20260609120000 except the roster clause gains exactly one
-- OR-branch. caller_manages_worker is untouched — instructions and every
-- other roster surface keep their semantics.
create or replace function public.assign_worker_to_project(
  p_project_id        text,
  p_worker_profile_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  w_pid   uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id    uuid;
  row_id  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  -- BOTH gates: caller manages THIS project AND the worker is on the caller's
  -- active roster OR holds an active accepted-booking engagement with the
  -- company that canonically owns THIS project (or admin). Neither alone is
  -- sufficient.
  if not (
    (public.can_manage_project(pid)
      and (public.caller_manages_worker(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;

  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  return row_id;
end;
$$;
revoke all on function public.assign_worker_to_project(text, text) from public;
revoke all on function public.assign_worker_to_project(text, text) from anon;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;

-- 5. Caller-bound picker read (NO email, NO contact fields) ------------------

create or replace function public.list_booking_engagement_workers_v1()
returns table (
  engagement_id     uuid,
  worker_id         uuid,
  worker_profile_id uuid,
  display_name      text,
  source_booking_id uuid,
  started_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id,
         e.worker_id,
         w.profile_id,
         coalesce(nullif(trim(w.display_name), ''),
                  'Kandidatas ' || left(e.worker_id::text, 6)),
         e.source_booking_id,
         e.started_at
    from public.company_worker_engagements e
    join public.companies c on c.id = e.company_id
    join public.workers   w on w.id = e.worker_id
   where e.worker_id is not null
     and e.status = 'active'
     and c.profile_id is not distinct from auth.uid()
   order by e.started_at desc;
$$;
revoke all on function public.list_booking_engagement_workers_v1() from public;
revoke all on function public.list_booking_engagement_workers_v1() from anon;
grant execute on function public.list_booking_engagement_workers_v1() to authenticated;

-- 6. Explicit end (company owner or the worker; never a delete) --------------

create or replace function public.end_company_worker_engagement_v1(
  p_engagement_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e   public.company_worker_engagements%rowtype;
  may_end boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into e from public.company_worker_engagements where id = p_engagement_id;
  if e.id is null then
    return false; -- honest no-op; no existence oracle beyond the caller's own rows
  end if;

  select public.owns_company(e.company_id)
      or exists (select 1 from public.workers w
                  where w.id = e.worker_id and w.profile_id = uid)
    into may_end;
  if not may_end then
    return false; -- foreign caller: indistinguishable from absent
  end if;

  if e.status is distinct from 'active' then
    return false; -- already ended — first end wins, audit row untouched
  end if;

  update public.company_worker_engagements
     set status = 'ended', ended_at = now(), ended_by = uid
   where id = e.id and status = 'active';
  return found;
end;
$$;
revoke all on function public.end_company_worker_engagement_v1(uuid) from public;
revoke all on function public.end_company_worker_engagement_v1(uuid) from anon;
grant execute on function public.end_company_worker_engagement_v1(uuid) to authenticated;

commit;
