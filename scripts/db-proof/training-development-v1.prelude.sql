-- ============================================================================
-- TRAINING / DEVELOPMENT REVIEWS / MANAGEMENT DECISIONS v1 — PROOF HARNESS
-- PRELUDE (supplement).
--
-- Runs AFTER
--   scripts/db-proof/document-file-layer.prelude.sql   (profiles / workers /
--     organizations / projects / company_memberships / document_types /
--     worker_documents / storage stubs / auth.uid() + is_admin() GUC stubs)
--   scripts/db-proof/agreements-v1.prelude.sql         (engagement_contexts,
--     membership_actor_role_v1, belongs_to_organization — verbatim copies)
--
-- and adds ONLY what the three REAL migrations additionally assert or read,
-- copied from the real repo objects rather than re-invented, so that
--   supabase/migrations/20260817130000_workflow_engine_v1.sql
--   supabase/migrations/20260817140000_document_file_layer_v1.sql
--   supabase/migrations/20260817230000_training_certification_v1.sql
--   supabase/migrations/20260817231000_performance_reviews_v1.sql
--   supabase/migrations/20260817232000_management_decisions_v1.sql
-- and their paired rollbacks can all be executed VERBATIM.
--
--   * has_org_demand_access          -> 20260806200000_org_demand_spine_v2.sql
--   * skills                         -> 0001_initial_schema.sql
--   * companies + organizations.legacy_company_id + projects.company_id
--                                    -> 0001_initial_schema / 0013_work_journal_m1
--   * journal_entries (columns the evidence check reads)
--                                    -> 0013_work_journal_m1.sql
--   * work_tasks (columns the decision task link reads)
--                                    -> 20260711210000_work_tasks_v1.sql
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

-- ── has_org_demand_access, verbatim from 20260806200000 ─────────────────────
create or replace function public.has_org_demand_access(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.has_org_demand_access(uuid) from public;
revoke all on function public.has_org_demand_access(uuid) from anon;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

-- ── profiles.email — the address-based commands resolve through it ──────────
alter table public.profiles add column if not exists email text;

-- ── companies / org legacy pointer / project company pointer ────────────────
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid()
);
alter table public.organizations add column if not exists legacy_company_id uuid
  references public.companies(id);
alter table public.projects add column if not exists company_id uuid
  references public.companies(id);
grant select on public.companies to authenticated;

-- ── skills master list (0001) ───────────────────────────────────────────────
create table if not exists public.skills (
  id       uuid primary key default gen_random_uuid(),
  slug     text unique,
  category text
);
grant select on public.skills to authenticated;

-- ── journal_entries — only the columns the evidence relevance check reads ───
create table if not exists public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.journal_entries to authenticated;

-- ── work_tasks — real 20260711210000 shape for the columns read here ────────
create table if not exists public.work_tasks (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references public.projects(id) on delete cascade,
  title               text not null,
  status              text not null default 'todo',
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  created_by          uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now()
);
alter table public.work_tasks enable row level security;
drop policy if exists wt_select on public.work_tasks;
create policy wt_select on public.work_tasks
  for select to authenticated
  using (created_by = auth.uid() or assignee_profile_id = auth.uid() or public.is_admin());
grant select on public.work_tasks to authenticated;
