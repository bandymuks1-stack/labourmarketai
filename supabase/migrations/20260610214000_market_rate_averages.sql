-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (S4 / feat/cc/s4-termometras-market). Never `db push`.
--
-- Admin market rate averages (S4 item 2) — the SECOND component of the
-- owner-locked thermometer formula:
--   score = (position average in project + admin-entered market average) / 2.
--
-- Honesty invariants baked in:
--   * rows are entered BY AN ADMIN BY HAND from real sources — every row
--     carries source_note + source_status (default 'needs_source', the
--     country_document_requirements pattern) and entered_by/entered_at;
--     nothing here is scraped, estimated or invented;
--   * basis is explicit ('monthly_eur' — the same basis as the worker-card
--     salary_min_eur/salary_max_eur fields it is averaged against);
--   * the table ships EMPTY — the thermometer stays at insufficient_data
--     until an admin enters real, sourced figures.
-- Write path: admin-only SECURITY DEFINER RPC (audit-logged), mirroring
-- 20260604130000_admin_company_verification. Direct writes revoked.
-- ============================================================================

begin;

create table if not exists public.market_rate_averages (
  id             uuid primary key default gen_random_uuid(),
  profession_id  uuid not null references public.professions(id) on delete cascade,
  country        char(2) not null
                   check (country in ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE')),
  avg_rate_eur   numeric not null check (avg_rate_eur > 0),
  basis          text not null default 'monthly_eur'
                   check (basis in ('monthly_eur')),
  source_note    text,
  source_status  text not null default 'needs_source'
                   check (source_status in ('needs_source','sourced','reviewed')),
  entered_by     uuid not null references public.profiles(id),
  entered_at     timestamptz not null default now(),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profession_id, country)
);
create index if not exists market_rate_averages_lookup_idx
  on public.market_rate_averages (profession_id, country) where is_active;

-- ── RLS: readable by any authenticated session (non-personal market data —
--    the thermometer renders it to workers); writes admin-RPC-only. ─────────
alter table public.market_rate_averages enable row level security;

drop policy if exists market_rate_averages_select on public.market_rate_averages;
create policy market_rate_averages_select on public.market_rate_averages
  for select to authenticated using (is_active);

grant select on public.market_rate_averages to authenticated;
revoke insert, update, delete on public.market_rate_averages from authenticated;

-- ── Gated write RPC (the ONLY write path) ───────────────────────────────────
create or replace function public.admin_set_market_rate_average(
  p_profession_id uuid,
  p_country       text,
  p_avg_rate_eur  numeric,
  p_source_note   text,
  p_source_status text default 'needs_source'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin() then
    return 'not_admin';
  end if;
  if p_country is null or p_country not in
       ('LT','LV','EE','NL','DE','DK','NO','SE','PL','BE') then
    return 'invalid_country';
  end if;
  if p_avg_rate_eur is null or p_avg_rate_eur <= 0 then
    return 'invalid_rate';
  end if;
  if p_source_status not in ('needs_source','sourced','reviewed') then
    return 'invalid_source_status';
  end if;
  if not exists (select 1 from public.professions pr
                  where pr.id = p_profession_id and pr.is_active) then
    return 'unknown_profession';
  end if;

  insert into public.market_rate_averages
      (profession_id, country, avg_rate_eur, source_note, source_status,
       entered_by, entered_at, is_active, updated_at)
    values (p_profession_id, p_country, p_avg_rate_eur,
            nullif(p_source_note, ''), p_source_status, uid, now(), true, now())
  on conflict (profession_id, country)
  do update
    set avg_rate_eur = excluded.avg_rate_eur,
        source_note = excluded.source_note,
        source_status = excluded.source_status,
        entered_by = excluded.entered_by,
        entered_at = now(),
        is_active = true,
        updated_at = now();

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'admin_set_market_rate_average', 'market_rate_average',
            p_profession_id,
            jsonb_build_object('country', p_country,
              'avg_rate_eur', p_avg_rate_eur,
              'source_status', p_source_status));

  return 'ok';
end;
$$;
revoke all on function public.admin_set_market_rate_average(uuid, text, numeric, text, text) from public;
grant execute on function public.admin_set_market_rate_average(uuid, text, numeric, text, text) to authenticated;

-- ── Position-average aggregate RPC (thermometer component 1) ───────────────
-- Cross-worker salary data is RLS-closed to a worker session, so the
-- project-position average is exposed ONLY as an AGGREGATE (avg + n, never
-- an individual figure) through this definer RPC. Caller gate: their own
-- active assignment on the project, can_manage_project, or admin. Source is
-- the workers' DECLARED salary expectation midpoints
-- ((salary_min_eur+salary_max_eur)/2, monthly EUR) of ACTIVELY assigned
-- workers holding the given profession — the only real per-position pay
-- signal in the platform today (Step-0 inventory). n is returned so the UI
-- can show the mandatory small-sample warning (n<5).
create or replace function public.project_position_salary_avg(
  p_project_id    uuid,
  p_profession_id uuid
) returns table (avg_mid_eur numeric, sample_n int)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not (
    public.is_admin()
    or public.can_manage_project(p_project_id)
    or exists (
      select 1
        from public.project_worker_assignments pwa
        join public.workers w on w.id = pwa.worker_id
       where pwa.project_id = p_project_id
         and pwa.status = 'active'
         and w.profile_id = uid
    )
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select avg((w.salary_min_eur + w.salary_max_eur) / 2.0)::numeric,
         count(*)::int
    from public.project_worker_assignments pwa
    join public.workers w on w.id = pwa.worker_id
    join public.worker_professions wp
      on wp.worker_id = w.id and wp.profession_id = p_profession_id
   where pwa.project_id = p_project_id
     and pwa.status = 'active'
     and w.salary_min_eur is not null
     and w.salary_max_eur is not null
     and w.salary_min_eur > 0
     and w.salary_max_eur > 0;
end;
$$;
revoke all on function public.project_position_salary_avg(uuid, uuid) from public;
grant execute on function public.project_position_salary_avg(uuid, uuid) to authenticated;

commit;

-- ROLLBACK (reverse SQL — new objects only; reversible):
-- drop function if exists public.project_position_salary_avg(uuid, uuid);
-- drop function if exists public.admin_set_market_rate_average(uuid, text, numeric, text, text);
-- drop table if exists public.market_rate_averages;
