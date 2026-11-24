-- @human-gate-approved
-- Wagon 8 — Project Economics (slice: project budget vs actual).
--
-- Additive, default-closed. New `project_budgets` — an approved-baseline budget
-- per project category. Actual costs are NOT stored here: they are derived from
-- the canonical finance ledger (its sole reader, expense + received invoices),
-- so there is NO second cost ledger. Variance is a pure computation over both.
--
-- Currency: EUR only, matching the canonical finance ledger (which is EUR).
-- This is deliberate — no silent currency mixing and no gross/net or tax
-- conversion (doctrine: no invented accounting precision).
--
-- Financials are permission-scoped: SELECT is manager-only (can_manage_project),
-- NEVER workers. RED class (SECURITY DEFINER RPCs + GRANTs); applied under the
-- owner's standing authorization for this train, via Supabase MCP.
-- Rollback: supabase/rollbacks/20260718160000_project_budgets.down.sql

create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null
    check (category in ('labour','materials','equipment','transport','accommodation','subcontractors','overhead','contingency','other','total')),
  planned_amount_cents bigint not null
    check (planned_amount_cents >= 0 and planned_amount_cents <= 100000000000),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'draft' check (status in ('draft','approved')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_budgets_unique_category unique (project_id, category)
);

alter table public.project_budgets enable row level security;

-- Manager-only SELECT (financials are permission-scoped; workers never read
-- project money). Writes are RPC-only (no direct write policy → default-deny).
drop policy if exists project_budgets_select on public.project_budgets;
create policy project_budgets_select on public.project_budgets
  for select
  using (public.can_manage_project(project_id) or public.is_admin());

grant select on public.project_budgets to authenticated;

-- ── Manager-gated write RPCs (SECURITY DEFINER, pinned search_path) ──────────

-- Upsert a budget line (one per project+category). Approving is a separate act.
create or replace function public.set_project_budget_v1(
  p_project_id uuid,
  p_category text,
  p_planned_amount_cents bigint,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'not authorized to manage this project';
  end if;
  if p_category not in ('labour','materials','equipment','transport','accommodation','subcontractors','overhead','contingency','other','total') then
    raise exception 'invalid category';
  end if;
  if p_planned_amount_cents is null or p_planned_amount_cents < 0 or p_planned_amount_cents > 100000000000 then
    raise exception 'invalid amount';
  end if;
  insert into public.project_budgets (project_id, category, planned_amount_cents, note, created_by)
  values (p_project_id, p_category, p_planned_amount_cents, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  on conflict (project_id, category) do update
    set planned_amount_cents = excluded.planned_amount_cents,
        note = excluded.note,
        updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Set the approved/draft state of one budget line.
create or replace function public.set_project_budget_status_v1(
  p_budget_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.project_budgets where id = p_budget_id;
  if v_project is null then
    raise exception 'budget not found';
  end if;
  if not public.can_manage_project(v_project) then
    raise exception 'not authorized to manage this project';
  end if;
  if p_status not in ('draft','approved') then
    raise exception 'invalid status';
  end if;
  update public.project_budgets set status = p_status, updated_at = now() where id = p_budget_id;
end;
$$;

create or replace function public.delete_project_budget_v1(p_budget_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.project_budgets where id = p_budget_id;
  if v_project is null then
    return;
  end if;
  if not public.can_manage_project(v_project) then
    raise exception 'not authorized to manage this project';
  end if;
  delete from public.project_budgets where id = p_budget_id;
end;
$$;

grant execute on function public.set_project_budget_v1(uuid, text, bigint, text) to authenticated;
grant execute on function public.set_project_budget_status_v1(uuid, text) to authenticated;
grant execute on function public.delete_project_budget_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718160000_project_budgets.down.sql
