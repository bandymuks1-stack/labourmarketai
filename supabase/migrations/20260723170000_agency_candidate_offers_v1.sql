-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY
--
-- NO `@human-gate-approved` annotation is present ON PURPOSE: the owner has
-- NOT yet approved this migration. Migration-safety CI is RED by design until
-- the owner reviews it — the same un-applied state PR #857's
-- company_worker_engagements migration ships in. Application to production
-- happens ONLY after explicit owner OK, via Supabase MCP `apply_migration`.
-- Never `db push`.
-- ============================================================================
--
-- agency_candidate_offers v1 — the agency's INTERNAL candidate CRM log
-- (canonical journey, Direction A). Lets a staffing agency record, for its OWN
-- operational tracking, which of its ACTIVE roster workers it is lining up for
-- which of its OWN needs.
--
-- ██ SCOPE HONESTY (owner decision 2026-07-23) ██
-- This is NOT an agency→REAL-CLIENT bridge. In this model the "client" is the
-- agency's own private CRM record (agency_clients, sibling draft 20260713160000),
-- NOT a real platform company/account; the need is a customer_requests row the
-- AGENCY owns; and the agency itself is the only actor. No external client is
-- invited, connected, or reviews anything here. A REAL two-subject bridge
-- (real client company invited + consenting, client-owned customer_request,
-- client-side review of the candidate) is a SEPARATE, not-yet-built P1 tracked
-- in its own GitHub issue. Do not read this table as closing that bridge.
--
-- ██ HUMAN GATE — DO NOT APPLY WITHOUT EXPLICIT OWNER OK ██
-- Status: DRAFT / DEFERRED. Committed for review only, AND pending the owner
-- separately confirming this internal CRM module is wanted now. The consumer UI
-- (the staffing-agency internal candidate log on the canonical
-- /dashboard/company workspace) detects the missing table/RPCs
-- (42P01 / PGRST205 / 42883 / PGRST202) and shows an honest "prepared, owner
-- activation pending" state until this is applied.
--
-- DIRECTION A (owner decision 2026-07-05): an agency IS a company whose
-- companies.company_type='staffing_agency'. This migration does NOT touch the
-- legacy public.agencies table and creates NO second identity. It reuses:
--   * companies                — the agency identity (owns_company gate);
--   * company_workers          — the agency's OWN roster (status='active');
--   * customer_requests        — the canonical structured need the agency owns.
--
-- WHAT THIS IS: one additive side table binding
--   (agency company, ACTIVE roster worker, the agency's OWN need) → a logged
-- candidate entry. It is a private PROPOSAL/tracking record, NEVER a new labour
-- demand and NEVER a match/booking. Booking stays the existing
-- propose_booking_request path; an accepted booking stays compatible with the
-- PR #857 engagement bridge with no migration here.
--
-- WHAT THIS IS NOT: not a third identity, not an agency dashboard, not a real
-- client connection, not a parallel candidate/demand/booking model, not a
-- public worker catalogue, not a marketplace. No outbound action of any kind.
--
-- SECURITY (fail-closed):
--   RLS SELECT: the agency that made the offer (owns_company(company_id)) OR
--   the need's owner (customer_requests.profile_id = auth.uid(), forward-
--   compatible with a real connected client owning the request) OR is_admin().
--   Private surface — no public/worker/anon read of the offer set.
--   Writes: RPC-only (submit_agency_candidate_offer_v1 /
--   withdraw_agency_candidate_offer_v1; SECURITY DEFINER, owner-checked
--   server-side, pinned search_path). Table grant to authenticated: SELECT.
--   The submit RPC enforces, server-side, EVERY authorization rule:
--     * the caller owns a staffing_agency company (not_agency otherwise);
--     * the worker is an ACTIVE company_workers roster member of THAT company
--       (worker_not_on_roster otherwise — no foreign / inactive roster worker);
--     * the request is the CALLER'S OWN customer_requests row
--       (request_not_found otherwise — never a foreign/unpublished need, and no
--       existence oracle: only the caller's own rows are probed).
--   Idempotent: unique (company_id, worker_id, request_id) + ON CONFLICT
--   re-affirms 'offered' — a repeated submit never duplicates.
--
-- Rollback: supabase/rollbacks/20260723170000_agency_candidate_offers_v1.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Table ─────────────────────────────────────────────────────────────
create table if not exists public.agency_candidate_offers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id)         on delete cascade,
  worker_id   uuid not null references public.workers(id)           on delete cascade,
  request_id  uuid not null references public.customer_requests(id) on delete cascade,
  status      text not null default 'offered'
                check (status in ('offered', 'withdrawn')),
  note        text check (note is null or char_length(note) <= 500),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, worker_id, request_id)
);

create index if not exists idx_agency_candidate_offers_company
  on public.agency_candidate_offers(company_id);
create index if not exists idx_agency_candidate_offers_request
  on public.agency_candidate_offers(request_id);

drop trigger if exists trg_agency_candidate_offers_updated_at
  on public.agency_candidate_offers;
create trigger trg_agency_candidate_offers_updated_at
  before update on public.agency_candidate_offers
  for each row execute function public.set_updated_at();

-- ── 2. RLS (fail-closed) ─────────────────────────────────────────────────
alter table public.agency_candidate_offers enable row level security;

drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(company_id)
    or exists (
      select 1 from public.customer_requests cr
      where cr.id = request_id and cr.profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- NO insert/update/delete policies — writes go through the RPCs below only.
grant select on public.agency_candidate_offers to authenticated;

-- ── 3. Write RPCs (owner-gated, SECURITY DEFINER, pinned search_path) ─────
create or replace function public.submit_agency_candidate_offer_v1(
  p_request_id uuid,
  p_worker_id  uuid,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_id         uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  -- The caller must own a staffing_agency company (Direction A identity).
  select c.id into v_company_id
  from public.companies c
  where c.profile_id = v_uid
    and c.company_type = 'staffing_agency';
  if v_company_id is null then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  -- The worker must be an ACTIVE roster member of THAT agency company.
  if not exists (
    select 1 from public.company_workers cw
    where cw.company_id = v_company_id
      and cw.worker_id = p_worker_id
      and cw.status = 'active'
  ) then
    raise exception 'worker_not_on_roster' using errcode = '42501';
  end if;

  -- The need must be the CALLER'S OWN row on the canonical demand table.
  -- (Only the caller's own rows are probed — no foreign/unpublished-need
  --  existence oracle; satisfies "no offering a candidate to a foreign,
  --  unpublished need".)
  if not exists (
    select 1 from public.customer_requests cr
    where cr.id = p_request_id
      and cr.profile_id = v_uid
  ) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent: re-submitting the same (company, worker, need) re-affirms the
  -- offer, never duplicates. A previously withdrawn offer is re-offered.
  insert into public.agency_candidate_offers
    (company_id, worker_id, request_id, status, note, created_by)
  values
    (v_company_id, p_worker_id, p_request_id, 'offered', v_note, v_uid)
  on conflict (company_id, worker_id, request_id) do update
    set status     = 'offered',
        note       = coalesce(excluded.note, public.agency_candidate_offers.note),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.withdraw_agency_candidate_offer_v1(p_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Only the agency that OWNS the offer's company may withdraw it. A foreign
  -- agency's update matches zero rows and returns false (never an error leak).
  update public.agency_candidate_offers aco
     set status = 'withdrawn',
         updated_at = now()
    from public.companies c
   where aco.id = p_offer_id
     and c.id = aco.company_id
     and c.profile_id = v_uid;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) from public;
revoke all on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) from anon;
grant execute on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) to authenticated;

revoke all on function public.withdraw_agency_candidate_offer_v1(uuid) from public;
revoke all on function public.withdraw_agency_candidate_offer_v1(uuid) from anon;
grant execute on function public.withdraw_agency_candidate_offer_v1(uuid) to authenticated;

-- ROLLBACK: supabase/rollbacks/20260723170000_agency_candidate_offers_v1.down.sql
-- (reverse SQL — new table + two new functions only; fully reversible.)
