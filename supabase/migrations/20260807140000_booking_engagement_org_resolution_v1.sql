-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`. Ships UNAPPLIED and deliberately WITHOUT
-- `@human-gate-approved` — RED in migration-safety CI is the intended state
-- until the owner reviews (SECURITY DEFINER replacement + grants = RED-class).
--
-- 20260807140000 — booking→engagement bridge: organization-first company
-- resolution (post-M-P0-6 follow-through).
--
-- PROBLEM (observed LIVE in production, 2026-08-06): the applied
-- `respond_booking_request_v3` (20260802150000, W12 atomic body) resolves the
-- engagement company by `companies.profile_id = <demand owner>` and HONESTLY
-- returns `'ambiguous_company'` — minting nothing — whenever the demand owner
-- holds MORE THAN ONE company. Accepted [QA-SYNTHETIC] booking `88a43ead…`
-- minted no engagement for exactly this reason: the QA owner holds two
-- companies. That honesty was correct pre-multi-org ("repo canon treats
-- profile→company as unique"), but M-P0-6 (org demand spine v2,
-- 20260806200000, APPLIED TO PROD 2026-08-06) made multi-company actors a
-- SUPPORTED product state — and gave every demand row the exact disambiguator
-- the bridge was missing: `customer_requests.organization_id`, stamped from
-- the VALIDATED active workspace, immutable by trigger, inherited by the
-- whole demand chain.
--
-- FIX: resolve the engagement company THROUGH THE BOOKING'S DEMAND
-- ORGANIZATION first. The chain stays fully server-derived:
--
--   booking.request_id (NOT NULL FK)
--     → customer_requests.organization_id   (validated-workspace stamp)
--       → organizations.legacy_company_id   (the org's canonical company)
--
-- `legacy_company_id` is a single-valued column on the ONE org row, so this
-- direction is deterministic — no count, no ordering, no LIMIT, no guess.
-- A NULL-organization (personal / pre-org) demand falls back to the EXACT
-- profile-singleton rule the applied body uses today, byte-preserved:
-- 0 companies → 'no_company', >1 → 'ambiguous_company' (still an honest
-- non-mint), 1 → that company. An organization that carries no bound company
-- (legacy_company_id NULL — e.g. a team/agency org) resolves to the honest
-- 'no_company' non-mint; the accept itself ALWAYS stands in every branch.
--
-- WHAT IS PRESERVED VERBATIM from the applied W12 body (20260802150000):
--   L1  row lock (`select … for update`), the post-lock status gate, the
--       IDEMPOTENT same-decision replay (no second event row), and the
--       status-guarded UPDATE with its fail-closed row_count assertion;
--   L2  `pg_advisory_xact_lock` keyed on the worker id, taken AFTER the row
--       lock (single lock order — no deadlock cycle), serialising accepts
--       across different bookings of the same worker;
--   L3  is untouched — the `booking_requests_no_overlapping_accepted`
--       EXCLUDE constraint is a table object, not part of this function;
--   the worker-only authorization, decision/reason validation, overlap
--   guard, event insert, and the engagement idempotency chain
--   (unique source_booking_id → 'already_recorded'; active pair →
--   'already_active'; `on conflict do nothing`).
--
-- WHAT THIS MIGRATION DOES **NOT** TOUCH:
--   * `respond_booking_request` (v1) and `_v2` — they remain the thin
--     delegators installed by 20260802150000 and pick this body up for free.
--   * `company_worker_engagements` — no schema change; same states, so the
--     app needs NO change (`booking-actions.ts` passes the state through).
--   * The engagement state vocabulary — 'created' / 'already_recorded' /
--     'already_active' / 'no_company' / 'ambiguous_company'. No new state:
--     org-resolved demands simply stop landing in 'ambiguous_company'.
--   * RLS policies, table grants, the L3 constraint, btree_gist.
--
-- WHY NOT booking_requests.organization_id: the booking's own stamp is
-- INHERITED from the demand row by the 20260806200000 trigger/backfill; the
-- demand row is the chain's origin and the value the immutability trigger
-- protects, so the resolution reads the origin (`customer_requests`) — the
-- same row the body already loads for the owner-invariant check.
--
-- SECURITY: signature unchanged — still NO client-supplied company/org/worker
-- id anywhere; the organization is read from the server-stamped, immutable
-- demand row, whose stamp was membership-validated at creation
-- (has_org_demand_access) and can never be claimed via raw PATCH (the
-- attribution guard trigger). The demand-owner ↔ booking-owner invariant
-- check is kept as-is.
--
-- PRE-APPLY CHECK (run first, expect exactly this):
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='customer_requests'
--      and column_name='organization_id';                              -- 1 (M-P0-6 applied)
--   select to_regclass('public.company_worker_engagements');           -- not null
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='respond_booking_request_v3'; -- 1
--
-- POST-APPLY VERIFICATION:
--   As the subject worker of a PROPOSED booking whose demand is stamped with
--   an organization owned by a MULTI-company owner:
--     select public.respond_booking_request_v3('<booking id>','accepted','','');
--       → {"decision":"accepted","engagement":"created"}   (was ambiguous_company)
--     select company_id from public.company_worker_engagements
--      where source_booking_id='<booking id>';
--       → the organization's legacy_company_id, exactly
--     repeat the call → {"decision":"accepted","engagement":"already_recorded",
--       "idempotent":true} and NO second booking_request_events row.
--   A NULL-organization demand from a multi-company owner still returns
--     'ambiguous_company' with nothing minted (fallback unchanged).
--   + APPLIED_LEDGER.md row.
--
-- ROLLBACK: paired supabase/rollbacks/
-- 20260807140000_booking_engagement_org_resolution_v1.down.sql — restores the
-- 20260802150000 v3 body verbatim (profile-singleton resolution only).
-- ============================================================================

begin;

-- ── 0. Safety assertions — this body reads M-P0-6's column ──────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'customer_requests'
       and column_name = 'organization_id'
  ) then
    raise exception 'customer_requests.organization_id missing — apply 20260806200000 (org demand spine v2) BEFORE this migration';
  end if;
  if to_regclass('public.company_worker_engagements') is null then
    raise exception 'company_worker_engagements missing — apply 20260723120000 BEFORE this migration';
  end if;
end $$;

-- ── 1. respond_booking_request_v3 — W12 atomic body, org-first resolution ───

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

  -- Engagement: SAME transaction as the accept. Everything is derived from
  -- the booking's canonical origin chain server-side. ORG-FIRST (M-P0-6): a
  -- demand stamped with an organization names the engagement company
  -- deterministically via organizations.legacy_company_id — a single-valued
  -- column on the one org row, so no count / ordering / LIMIT pick can exist
  -- in this direction. Only a NULL-organization (personal / pre-org) demand
  -- uses the legacy profile-singleton fallback, where an ambiguous
  -- multi-company owner is still an honest non-mint, never a guess.
  if p_decision = 'accepted' then
    -- The booking's demand row is mandatory (request_id NOT NULL) and the
    -- propose RPC guarantees the demand owner IS the booking owner; verify
    -- the invariant instead of trusting it. The organization stamp on the
    -- same row is server-written only (validated at creation by
    -- has_org_demand_access, immutable via the attribution guard trigger).
    select cr.profile_id, cr.organization_id
      into v_demand_owner, v_demand_org
      from public.customer_requests cr
     where cr.id = br.request_id;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id then
      -- Broken origin invariant — honest non-mint; the accept stands.
      v_engagement := 'no_company';
    elsif v_demand_org is not null then
      -- ORG-FIRST: the demand's validated organization → its canonical
      -- company. Deterministic single-row read; no fallback mixing.
      select o.legacy_company_id into v_company
        from public.organizations o
       where o.id = v_demand_org;
      if v_company is null then
        -- Organization without a bound company (team/agency org) — the
        -- engagement primitive binds a company, so this is an honest
        -- non-mint, not a guess at some other company.
        v_engagement := 'no_company';
      end if;
    else
      -- PRE-ORG FALLBACK: NULL-organization demand — the exact
      -- profile-singleton rule of the applied 20260802150000 body.
      select count(*) into v_company_count
        from public.companies c
       where c.profile_id = v_demand_owner;

      if v_company_count = 0 then
        v_engagement := 'no_company';
      elsif v_company_count > 1 then
        -- Multi-company owner with an unattributed demand: still refusing
        -- to guess. New demands from multi-company actors carry the
        -- organization stamp and take the org-first branch instead.
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

  return jsonb_build_object('decision', p_decision, 'engagement', v_engagement);
end;
$$;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from public;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from anon;
grant execute on function public.respond_booking_request_v3(uuid, text, text, text) to authenticated;

commit;

-- ROLLBACK: see
-- supabase/rollbacks/20260807140000_booking_engagement_org_resolution_v1.down.sql
