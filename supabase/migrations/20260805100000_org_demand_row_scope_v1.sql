-- ============================================================================
-- DRAFT — OWNER-GATED — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner review.
-- Never `db push`. This file deliberately carries NO gate-approval annotation:
-- it ships RED under the migration-safety classifier, and that RED is the
-- designed, honest state until the owner reviews the package
-- (docs/human-gates/org-demand-row-scope-gate.md) and applies it manually.
--
-- 20260805100000 — Org Demand Spine, Stage B: organization ROW scope for the
-- demand chain (customer_requests → demand_shortlist → booking_requests).
--
-- DOCTRINE (Org Demand Spine): every employer demand belongs to the ACTIVE
-- ORGANIZATION; authority is derived server-side; org scope flows
-- demand → matching → shortlist → contact → booking; there is NO second org
-- model; the profile_id / owner_id legs STAY during the transition (this
-- migration is strictly additive to them).
--
-- VERIFIED PRODUCTION FACTS (read-only check, 2026-08-05):
--   * customer_requests  = 17 rows; ALL 17 resolvable to an organization via
--     profile_id → companies.profile_id → organizations.legacy_company_id.
--   * demand_shortlist   =  1 row; resolvable via the same bridge (owner_id).
--   * booking_requests   =  0 rows.
--   → 100% backfill coverage, zero ambiguous rows. The backfill below is
--     still coded defensively: a row whose bridge does not resolve to
--     EXACTLY ONE organization stays NULL instead of guessing.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds nullable `organization_id uuid references public.organizations(id)`
--      to customer_requests, demand_shortlist, booking_requests (+ partial
--      indexes). Nullable + additive: no existing write path can break.
--   2. Backfills all three tables through the bridge join
--      (profile_id/owner_id → companies.profile_id →
--      organizations.legacy_company_id), only where the bridge is
--      unambiguous. RAISE NOTICE prints before/after counts.
--   3. Extends the three SELECT policies with an ADDITIVE org-membership leg
--      (belongs_to_organization / manages_organization — both from applied
--      migrations 20260802170000 / 0013). Every existing leg is kept
--      verbatim. INSERT/UPDATE/DELETE policies are NOT touched in v1:
--      reads gain org scope first; writes stay profile-derived.
--   4. Redefines the four demand-chain write RPCs (save_customer_request,
--      save_demand_draft, submit_demand_request, propose_booking_request) to
--      stamp organization_id SERVER-SIDE from the caller's MEMBERSHIP
--      (resolve_caller_organization_id — owned + actively managed
--      organizations, exactly-one-or-NULL) — never from a client argument
--      (no p_organization_id parameter exists or is accepted). Bodies are
--      carried byte-exact from their owning migrations (0028 /
--      20260530150000 / 20260613100100) except the stamping addition.
--      propose_booking_request_v3 (20260716121000) is a pure rate-limit
--      wrapper that delegates to v1, so stamping v1 covers both call paths.
--   5. demand_shortlist has NO write RPC — the app writes it via direct
--      owner-scoped DML (apps/web/lib/scouting/scouting.ts upsert). A BEFORE
--      INSERT OR UPDATE trigger therefore stamps organization_id
--      server-side; an authenticated client can neither choose nor move
--      the organization of a shortlist row.
--   6. customer_requests carries the SAME BEFORE trigger: 0028 grants
--      `update` on the table to authenticated with a profile-only WITH
--      CHECK, so without a trigger the new column would be forgeable via a
--      raw PostgREST PATCH. The trigger makes a stamped org immutable and
--      every authenticated write server-derived.
--
-- WHAT THIS IS AND IS NOT (honest classification):
--   ORGANIZATION_DEMAND_ROW_SCOPE_V1_SAFE_BACKFILL_BRIDGE_ACTIVE_CONTEXT_V2_REQUIRED
--   A caller with EXACTLY ONE actable organization stamps correctly. A
--   multi-organization caller stamps NULL (fail-closed) because the DB
--   cannot see the cookie-held active workspace until 20260714210000
--   applies. This is NOT complete multi-organization support; V2 (explicit
--   workspace-selected stamping) replaces ONE function body, zero DDL.
--
-- SECURITY DEFINER HYGIENE: every function (re)defined here re-states its
-- revoke/grant pair INCLUDING an explicit `revoke ... from anon` — required
-- for any SECURITY DEFINER function created after the 20260722160000 closure
-- (see apps/web/lib/guards/secdef-local-reset-reproducibility.test.ts).
--
-- RED CLASSES CARRIED (why this is owner-gated): SECURITY DEFINER
-- (re)definitions, GRANT/REVOKE statements, RLS policy changes
-- (drop+recreate of three SELECT policies), DML at apply time (the
-- backfill UPDATEs), and two new triggers.
--
-- ROLLBACK: supabase/rollbacks/20260805100000_org_demand_row_scope_v1.down.sql
-- (restores the original policies and function bodies byte-exact, drops the
-- trigger/helper and the added columns — safe because the columns are
-- additive and nothing else references them).
-- ============================================================================

begin;

-- ── 1. Columns (nullable, additive) ─────────────────────────────────────────

alter table public.customer_requests
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.demand_shortlist
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.booking_requests
  add column if not exists organization_id uuid references public.organizations(id);

create index if not exists customer_requests_organization_idx
  on public.customer_requests (organization_id) where organization_id is not null;
create index if not exists demand_shortlist_organization_idx
  on public.demand_shortlist (organization_id) where organization_id is not null;
create index if not exists booking_requests_organization_idx
  on public.booking_requests (organization_id) where organization_id is not null;

-- ── 2. Backfill via the bridge join (unambiguous rows only) ─────────────────
-- Bridge: <profile column> → companies.profile_id → organizations.legacy_company_id.
-- companies.profile_id is UNIQUE (one company per profile), but
-- organizations.legacy_company_id carries only a plain index — so the
-- backfill stamps ONLY when the bridge resolves to EXACTLY ONE organization.
-- Rows that do not resolve stay NULL (verified: none exist today).
--
-- The backfill DELIBERATELY uses the legacy bridge while the go-forward
-- resolver (§3) is membership-derived: every pre-existing demand row was
-- created through a company-owner employer surface, so the mirrored company
-- organization IS the historically correct attribution for those rows. New
-- rows are stamped by §3's stricter rule.

do $$
declare
  v_total   bigint;
  v_before  bigint;
  v_after   bigint;
begin
  -- customer_requests (bridge column: profile_id)
  select count(*), count(organization_id) into v_total, v_before
    from public.customer_requests;
  raise notice 'org_demand_row_scope_v1: customer_requests BEFORE backfill: % rows, % stamped', v_total, v_before;

  update public.customer_requests cr
     set organization_id = b.org_id
    from (
      select c.profile_id as profile_id, (array_agg(o.id))[1] as org_id
        from public.companies c
        join public.organizations o on o.legacy_company_id = c.id
       group by c.profile_id
      having count(o.id) = 1
    ) b
   where cr.organization_id is null
     and cr.profile_id = b.profile_id;

  select count(organization_id) into v_after from public.customer_requests;
  raise notice 'org_demand_row_scope_v1: customer_requests AFTER backfill: % of % rows stamped', v_after, v_total;

  -- demand_shortlist (bridge column: owner_id)
  select count(*), count(organization_id) into v_total, v_before
    from public.demand_shortlist;
  raise notice 'org_demand_row_scope_v1: demand_shortlist BEFORE backfill: % rows, % stamped', v_total, v_before;

  update public.demand_shortlist ds
     set organization_id = b.org_id
    from (
      select c.profile_id as profile_id, (array_agg(o.id))[1] as org_id
        from public.companies c
        join public.organizations o on o.legacy_company_id = c.id
       group by c.profile_id
      having count(o.id) = 1
    ) b
   where ds.organization_id is null
     and ds.owner_id = b.profile_id;

  select count(organization_id) into v_after from public.demand_shortlist;
  raise notice 'org_demand_row_scope_v1: demand_shortlist AFTER backfill: % of % rows stamped', v_after, v_total;

  -- booking_requests (bridge column: owner_id) — 0 rows in prod today; coded anyway.
  select count(*), count(organization_id) into v_total, v_before
    from public.booking_requests;
  raise notice 'org_demand_row_scope_v1: booking_requests BEFORE backfill: % rows, % stamped', v_total, v_before;

  update public.booking_requests br
     set organization_id = b.org_id
    from (
      select c.profile_id as profile_id, (array_agg(o.id))[1] as org_id
        from public.companies c
        join public.organizations o on o.legacy_company_id = c.id
       group by c.profile_id
      having count(o.id) = 1
    ) b
   where br.organization_id is null
     and br.owner_id = b.profile_id;

  select count(organization_id) into v_after from public.booking_requests;
  raise notice 'org_demand_row_scope_v1: booking_requests AFTER backfill: % of % rows stamped', v_after, v_total;
end $$;

-- ── 3. Server-side membership resolver (the ONE stamping authority) ─────────
-- Zero-argument on purpose: it resolves auth.uid() only, so it can never be
-- used to probe another profile's organization, and no RPC can accept an
-- organization id from the client.
--
-- MEMBERSHIP-DERIVED, NOT legacy-bridge-derived. An earlier draft keyed this
-- on companies.profile_id → organizations.legacy_company_id — the exact
-- fallback apps/web/lib/company/employer-company-context.ts bans, and it
-- answered WRONGLY (the company org) for a caller who also owns team
-- organizations (the team-creation RPC of 20260705220000 is live in
-- prod). This version derives the
-- caller's ACTABLE organizations from the canonical spines:
--   * organizations they own (organizations.owner_profile_id), plus
--   * organizations they actively manage (engagement_contexts, the same
--     owner/manager/external_manager set as public.manages_organization).
-- EXACTLY ONE actable organization → that one. Zero, or two-plus (multi-org
-- callers, whose active workspace the DB cannot see — it lives in an
-- httpOnly cookie until 20260714210000 applies) → NULL. Wrong-by-absence,
-- never wrong-by-assertion: stamping honestly stays NULL instead of
-- guessing. Explicit workspace-selected stamping is ACTIVE_CONTEXT_V2 —
-- redefining this ONE function body; zero DDL.
--
-- SECURITY DEFINER so the stamping triggers (which run in the DML caller's
-- context) resolve membership without depending on the caller's RLS view of
-- organizations/engagement_contexts.

create or replace function public.resolve_caller_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (array_agg(org_id))[1]
    from (
      select o.id as org_id
        from public.organizations o
       where o.owner_profile_id = auth.uid()
      union
      select ec.organization_id
        from public.engagement_contexts ec
       where ec.profile_id = auth.uid()
         and ec.status = 'active'
         and ec.relationship_slug in ('owner','manager','external_manager')
    ) s
  having count(*) = 1
$$;

revoke all on function public.resolve_caller_organization_id() from public;
revoke all on function public.resolve_caller_organization_id() from anon;
grant execute on function public.resolve_caller_organization_id() to authenticated;

-- ── 4. demand_shortlist trigger (no RPC write path exists for this table) ───
-- The app writes demand_shortlist via a direct owner-scoped upsert
-- (apps/web/lib/scouting/scouting.ts::setShortlist). Stamping therefore lives
-- in a BEFORE trigger:
--   * authenticated INSERT: organization_id is ALWAYS server-derived — any
--     client-supplied value is overwritten, never trusted;
--   * authenticated UPDATE: once stamped, the organization is immutable
--     (a client can never move a shortlist row to another org); an unstamped
--     row is healed from the caller's bridge;
--   * no-JWT contexts (service role maintenance, migration DML) pass through
--     untouched, so backfills stay possible.

create or replace function public.demand_shortlist_stamp_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    -- No JWT context (service role / SQL maintenance): trust the given value.
    return new;
  end if;
  if tg_op = 'UPDATE' and old.organization_id is not null then
    -- Immutable once stamped: an authenticated caller can never move a
    -- shortlist row to another organization.
    new.organization_id := old.organization_id;
  elsif new.owner_id = v_caller then
    -- The row's own person, INSERT or heal-on-UPDATE: server-derived only —
    -- any client-supplied value is overwritten, never trusted.
    new.organization_id := public.resolve_caller_organization_id();
  elsif tg_op = 'UPDATE' then
    -- A caller who is NOT the row's person (admin path) must never stamp
    -- someone else's row from their OWN membership.
    new.organization_id := old.organization_id;
  else
    new.organization_id := null;
  end if;
  return new;
end $$;

-- Trigger-only function: executes via the trigger machinery, never called
-- directly — nobody needs (or gets) EXECUTE on it.
revoke all on function public.demand_shortlist_stamp_organization() from public;
revoke all on function public.demand_shortlist_stamp_organization() from anon;
revoke all on function public.demand_shortlist_stamp_organization() from authenticated;

drop trigger if exists demand_shortlist_stamp_org on public.demand_shortlist;
create trigger demand_shortlist_stamp_org
  before insert or update on public.demand_shortlist
  for each row execute function public.demand_shortlist_stamp_organization();

-- ── 4b. customer_requests trigger (closes the direct-PATCH forgery) ─────────
-- 0028 grants `select, update` on customer_requests to authenticated, and its
-- UPDATE policy checks only `profile_id = auth.uid()` — so without a trigger
-- the newly added organization_id would be settable/movable/clearable by any
-- authenticated owner via a raw PostgREST PATCH, injecting their row into an
-- arbitrary organization's demand view (the new read leg would fire for that
-- org's members). The RPCs stamp correctly, but the raw column must not be a
-- side door. Same contract as the shortlist trigger:
--   * once stamped, immutable to authenticated callers;
--   * the row's own person gets a server-derived stamp (INSERT or heal — the
--     heal also closes the "update branches do not stamp" gap for rows whose
--     resolver was NULL at creation and unambiguous later);
--   * a caller who is not the row's person (admin) never stamps it from
--     their own membership;
--   * no-JWT contexts (service role, migration DML) pass through untouched.

create or replace function public.customer_requests_stamp_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.organization_id is not null then
    new.organization_id := old.organization_id;
  elsif new.profile_id = v_caller then
    new.organization_id := public.resolve_caller_organization_id();
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
  else
    new.organization_id := null;
  end if;
  return new;
end $$;

revoke all on function public.customer_requests_stamp_organization() from public;
revoke all on function public.customer_requests_stamp_organization() from anon;
revoke all on function public.customer_requests_stamp_organization() from authenticated;

drop trigger if exists customer_requests_stamp_org on public.customer_requests;
create trigger customer_requests_stamp_org
  before insert or update on public.customer_requests
  for each row execute function public.customer_requests_stamp_organization();

-- ── 5. ADDITIVE RLS: org-membership read leg on the three SELECT policies ───
-- Every existing leg is kept verbatim; the ONLY change is the appended
-- `or (organization_id is not null and (belongs_to_organization(...) or
-- manages_organization(...)))` leg. Write policies are untouched in v1.

-- 5a. customer_requests_select — original legs from 0028.
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests for select
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or (organization_id is not null
        and (public.belongs_to_organization(organization_id)
             or public.manages_organization(organization_id)))
  );

-- 5b. demand_shortlist_select — original legs from 20260612220000.
drop policy if exists demand_shortlist_select on public.demand_shortlist;
create policy demand_shortlist_select on public.demand_shortlist for select
  using (
    owner_id = auth.uid()
    or public.is_admin()
    or (organization_id is not null
        and (public.belongs_to_organization(organization_id)
             or public.manages_organization(organization_id)))
  );

-- 5c. booking_requests_select — original legs from 20260613100100
-- (owner / addressed worker / admin), kept verbatim.
drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
    or (organization_id is not null
        and (public.belongs_to_organization(organization_id)
             or public.manages_organization(organization_id)))
  );

-- ── 6. RPC redefinitions: stamp organization_id server-side ─────────────────
-- Bodies carried byte-exact from their owning migrations; the ONLY change in
-- each is the stamping addition (organization_id column + the
-- resolve_caller_organization_id() value in the INSERT, marked
-- "org-spine v1"). No function gains or changes a parameter.

-- 6a. save_customer_request — original body: 0028_customer_requests.sql.
create or replace function public.save_customer_request(
  p_request_id           uuid,
  p_title                text,
  p_need_summary         text default null,
  p_country              text default null,
  p_location             text default null,
  p_role_or_work_type    text default null,
  p_team_size            integer default null,
  p_start_period         text default null,
  p_duration             text default null,
  p_language_requirement text default null,
  p_notes                text default null,
  p_status               text default 'draft'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  resolved_id      uuid;
  cleaned_title    text := nullif(trim(coalesce(p_title, '')), '');
  cleaned_status   text := lower(trim(coalesce(p_status, 'draft')));
  customer_uuid    uuid;
  current_status   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_title is null or char_length(cleaned_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if cleaned_status not in ('draft','submitted','in_review','needs_followup','approved','closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- Owner cannot self-promote to admin-only statuses.
  if cleaned_status in ('in_review','needs_followup','approved','closed') then
    if not public.is_admin() then
      cleaned_status := 'submitted';
    end if;
  end if;

  -- Resolve customer_id (optional FK).
  select id into customer_uuid
    from public.customers
   where profile_id = uid
   limit 1;

  if p_request_id is null then
    insert into public.customer_requests (
      profile_id, customer_id, title, need_summary, country, location,
      role_or_work_type, team_size, start_period, duration,
      language_requirement, notes, status,
      organization_id -- org-spine v1: server-derived, never a client argument
    ) values (
      uid, customer_uuid, cleaned_title,
      nullif(trim(coalesce(p_need_summary, '')), ''),
      nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      nullif(trim(coalesce(p_role_or_work_type, '')), ''),
      p_team_size,
      nullif(trim(coalesce(p_start_period, '')), ''),
      nullif(trim(coalesce(p_duration, '')), ''),
      nullif(trim(coalesce(p_language_requirement, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      cleaned_status,
      public.resolve_caller_organization_id() -- org-spine v1
    )
    returning id into resolved_id;
    return resolved_id;
  end if;

  -- Update path: must own the row.
  select status into current_status
    from public.customer_requests
   where id = p_request_id and profile_id = uid;
  if current_status is null then
    -- Either does not exist OR not owned by caller — admin can use a
    -- separate admin-only path; this RPC is owner-only updates.
    raise exception 'Request not found or not owned' using errcode = '42501';
  end if;

  -- Never let a non-admin owner demote out of submitted back to draft.
  if not public.is_admin() then
    if current_status = 'submitted' and cleaned_status = 'draft' then
      cleaned_status := 'submitted';
    end if;
  end if;

  update public.customer_requests set
    title                = cleaned_title,
    need_summary         = nullif(trim(coalesce(p_need_summary, '')), ''),
    country              = nullif(trim(coalesce(p_country, '')), ''),
    location             = nullif(trim(coalesce(p_location, '')), ''),
    role_or_work_type    = nullif(trim(coalesce(p_role_or_work_type, '')), ''),
    team_size            = p_team_size,
    start_period         = nullif(trim(coalesce(p_start_period, '')), ''),
    duration             = nullif(trim(coalesce(p_duration, '')), ''),
    language_requirement = nullif(trim(coalesce(p_language_requirement, '')), ''),
    notes                = nullif(trim(coalesce(p_notes, '')), ''),
    status               = cleaned_status,
    updated_at           = now()
   where id = p_request_id
     and (profile_id = uid or public.is_admin())
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) from public;
revoke all on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) from anon;
grant execute on function public.save_customer_request(uuid, text, text, text, text, text, integer, text, text, text, text, text) to authenticated;

-- 6b. save_demand_draft — original body: 20260530150000_demand_intake_consolidation.sql.
-- The draft-update branch is untouched: an existing draft was either created
-- through this RPC (already stamped) or backfilled above.
create or replace function public.save_demand_draft(
  p_kind text,
  p_title text,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  select id into v_id from public.customer_requests
   where profile_id = uid and kind = p_kind and status = 'draft' limit 1;

  if v_id is not null then
    update public.customer_requests
       set title = coalesce(v_title, title),
           payload = coalesce(p_payload, '{}'::jsonb),
           original_language = coalesce(p_original_language, original_language),
           updated_at = now()
     where id = v_id;
  else
    insert into public.customer_requests
      (profile_id, kind, title, payload, original_language, status,
       organization_id) -- org-spine v1: server-derived, never a client argument
    values
      (uid, p_kind, coalesce(v_title, '—'), coalesce(p_payload, '{}'::jsonb),
       coalesce(p_original_language, 'lt'), 'draft',
       public.resolve_caller_organization_id()) -- org-spine v1
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.save_demand_draft(text, text, jsonb, text) from public;
revoke all on function public.save_demand_draft(text, text, jsonb, text) from anon;
grant execute on function public.save_demand_draft(text, text, jsonb, text) to authenticated;

-- 6c. submit_demand_request — original body: 20260530150000_demand_intake_consolidation.sql.
create or replace function public.submit_demand_request(
  p_kind text,
  p_title text,
  p_need_summary text default null,
  p_payload jsonb default '{}'::jsonb,
  p_original_language text default 'lt'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_kind not in ('company_request','agency_offer','buyer_request','customer_request') then
    raise exception 'invalid_kind';
  end if;

  insert into public.customer_requests
    (profile_id, kind, title, need_summary, payload, original_language, status,
     organization_id) -- org-spine v1: server-derived, never a client argument
  values
    (uid, p_kind, coalesce(v_title, '—'),
     nullif(btrim(coalesce(p_need_summary, '')), ''),
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_original_language, 'lt'), 'submitted',
     public.resolve_caller_organization_id()) -- org-spine v1
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.submit_demand_request(text, text, text, jsonb, text) from public;
revoke all on function public.submit_demand_request(text, text, text, jsonb, text) from anon;
grant execute on function public.submit_demand_request(text, text, text, jsonb, text) to authenticated;

-- 6d. propose_booking_request — original body: 20260613100100_booking_requests.sql.
-- propose_booking_request_v3 (20260716121000) delegates here unchanged, so
-- both the v3 and the v1 fallback call path stamp identically. The
-- on-conflict branch additionally heals a NULL organization_id on
-- re-proposal (it never overwrites a stamped one).
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
       location_country, role_text, note, readiness_snapshot,
       organization_id) -- org-spine v1: server-derived, never a client argument
    values (uid, p_request_id, p_worker_id, 'proposed', v_start, v_end,
            v_country, nullif(trim(coalesce(p_role_text,'')), ''),
            nullif(trim(coalesce(p_note,'')), ''), coalesce(v_snapshot, '{}'::jsonb),
            public.resolve_caller_organization_id()) -- org-spine v1
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
       -- org-spine v1: heal a NULL stamp on re-proposal, never move a set one.
       organization_id = coalesce(public.booking_requests.organization_id, excluded.organization_id),
       updated_at = now()
  returning id into row_id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (row_id, uid, 'proposed', null, 'proposed');

  return row_id;
end;
$$;

revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;

commit;

-- ROLLBACK: supabase/rollbacks/20260805100000_org_demand_row_scope_v1.down.sql
