-- 20260531091638_matching_engine_why.sql
-- M4 — real matching "why" engine. PROPOSAL / owner-gated — DO NOT auto-apply.
--
-- RED / needs-human-gate (see docs/handoffs/TASK-M4-MATCHING-WHY-GATE.md).
-- Apply MANUALLY via Supabase MCP only AFTER the owner confirms the data-model
-- decisions in the gate doc. Additive + reversible. No destructive drops.
-- No RLS loosening (access only widens to a match's legitimate participants —
-- the request owner and the matched worker; never anon, never `using (true)`).
-- Ships NO fabricated data: the compute RPC is intentionally disabled
-- (`where false`) until the owner approves worker eligibility + the SKL formula.
--
-- OWNER DECISIONS REQUIRED BEFORE APPLY:
--   (1) demand source = canonical customer_requests (assumed here);
--   (2) LT->NL reinforcement worker eligibility set;
--   (3) SKL scoring weights + which dimensions are in v1 (only SKL has real
--       data; REL/SPD/SAF/ADP/TRS/availability/relocation => missingData).

-- ── 1. matches: link to the canonical demand + kanban status (additive) ──────
alter table public.matches
  add column if not exists customer_request_id uuid
    references public.customer_requests(id) on delete cascade;
alter table public.matches
  add column if not exists corridor text;
alter table public.matches
  add column if not exists match_status text not null default 'considered'
    check (match_status in ('considered','shortlisted','rejected'));

create index if not exists matches_customer_request_idx
  on public.matches (customer_request_id);
-- job_demand_id may be null for customer_request-based matches; the legacy
-- unique (worker_id, job_demand_id) does not constrain those rows, so add a
-- partial unique for the canonical path.
create unique index if not exists matches_worker_request_uniq
  on public.matches (worker_id, customer_request_id)
  where customer_request_id is not null;

-- ── 2. explicit grants (RLS still gates EVERY row; SELECT/INSERT only) ───────
grant select on public.matches to authenticated;
grant select, insert on public.match_actions to authenticated;

-- ── 3. read gate: also recognise customer_request-based matches ─────────────
--      (legacy job_demand chain preserved; canonical chain added — access only
--       widens to the request owner + the matched worker)
create or replace function public.can_access_match(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches mt
    join public.workers w        on w.id  = mt.worker_id
    join public.job_demands jd   on jd.id = mt.job_demand_id
    join public.projects p       on p.id  = jd.project_id
    join public.companies co     on co.id = p.company_id
    where mt.id = m
      and (w.profile_id = auth.uid() or co.profile_id = auth.uid())
  ) or exists (
    select 1 from public.matches mt
    join public.workers w                 on w.id  = mt.worker_id
    join public.customer_requests cr      on cr.id = mt.customer_request_id
    where mt.id = m
      and (w.profile_id = auth.uid() or cr.profile_id = auth.uid())
  )
$$;

-- ── 4. deterministic compute RPC — request owner / admin only ───────────────
--      Transparent scoring. Missing signals are reported in reasons.missingData,
--      NEVER fabricated. Shipped DISABLED (`where false`) until the owner
--      approves eligibility + the SKL formula (decision #2 + #3).
create or replace function public.compute_matches_for_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_count integer := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select profile_id into v_owner from public.customer_requests where id = p_request_id;
  if v_owner is null then return 0; end if;
  if not (public.is_admin() or v_owner = uid) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- v1 corridor: LT_TO_NL_REINFORCEMENT. The eligibility predicate and the SKL
  -- formula are intentionally left as `where false` + score 0 so this persists
  -- nothing until the owner signs off — the engine never invents a candidate.
  insert into public.matches
    (worker_id, customer_request_id, score, reasons, corridor, computed_at)
  select
    w.id,
    p_request_id,
    0,
    jsonb_build_object(
      'overallScore', 0,
      'corridor', 'LT_TO_NL_REINFORCEMENT',
      'dimensions', jsonb_build_object(),
      'summary', jsonb_build_object('lt', '', 'en', ''),
      'missingData', jsonb_build_array(
        'SKL_formula_pending_owner', 'REL', 'SPD', 'SAF', 'ADP', 'TRS',
        'availability', 'relocation_readiness')
    ),
    'LT_TO_NL_REINFORCEMENT',
    now()
  from public.workers w
  where false  -- DISABLED: owner must approve eligibility + scoring first
  on conflict (worker_id, customer_request_id) where customer_request_id is not null
    do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.compute_matches_for_request(uuid) from public;
grant execute on function public.compute_matches_for_request(uuid) to authenticated;

-- ── 5. kanban setter — request owner / matched worker only ──────────────────
create or replace function public.set_match_status(p_match_id uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_status not in ('considered', 'shortlisted', 'rejected') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if not (public.can_access_match(p_match_id) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.matches
     set match_status = p_status, updated_at = now()
   where id = p_match_id;
  return p_status;
end $$;
revoke all on function public.set_match_status(uuid, text) from public;
grant execute on function public.set_match_status(uuid, text) to authenticated;

-- ── ROLLBACK (manual) ───────────────────────────────────────────────────────
-- drop function if exists public.set_match_status(uuid, text);
-- drop function if exists public.compute_matches_for_request(uuid);
-- -- restore can_access_match to the 0001 (job_demand-only) body;
-- revoke select on public.matches from authenticated;
-- revoke select, insert on public.match_actions from authenticated;
-- drop index if exists public.matches_worker_request_uniq;
-- drop index if exists public.matches_customer_request_idx;
-- alter table public.matches drop column if exists match_status;
-- alter table public.matches drop column if exists corridor;
-- alter table public.matches drop column if exists customer_request_id;
