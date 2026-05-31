-- 20260601091000 — Project / object / client context (DRAFT — needs-human-gate)
-- =====================================================================
-- RED slice 4. Builds the missing project/object/client layer on top of the
-- existing `public.projects` table (0001; organization_id added in
-- 20260530120100). Today there is no client link, no project membership, no
-- worker↔project assignment, and journal entries cannot be tied to a project.
--
-- DO NOT APPLY automatically. Prepared for human review + explicit owner /
-- Chat-Claude approval, then applied via Supabase MCP `apply_migration`
-- (never `supabase db push`). Additive + reversible. No app code depends on
-- these objects yet — the product keeps honestly saying the project/client
-- layer is "being prepared" until this is approved and wired.
--
-- Access model: everything is scoped through the PARENT PROJECT. A caller who
-- can reach the project (owns_company OR manages_organization OR admin) can
-- manage its clients/members/assignments. A worker can read the projects they
-- are assigned to (via project_worker_assignments) and their own assignment
-- rows. NO public/anon read anywhere.
-- =====================================================================

-- Shared predicate: can the caller manage this project?
create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and (
         public.owns_company(p.company_id)
         or public.manages_organization(p.organization_id)
         or public.is_admin()
       )
  );
$$;
revoke all on function public.can_manage_project(uuid) from public;
grant execute on function public.can_manage_project(uuid) to authenticated;

-- ── 1. project_clients — the customer/client a project is delivered for ──
-- Free-text client record owned by the company. NOT an external customer
-- identity/auth — there is no client login in this slice.
create table if not exists public.project_clients (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,
  contact_name    text,
  contact_email   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_project_clients_project on public.project_clients(project_id);

-- ── 2. project_members — internal people coordinating a project ──────────
create table if not exists public.project_members (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member'
                    check (role in ('owner','manager','member','viewer')),
  created_at      timestamptz not null default now(),
  unique (project_id, profile_id)
);
create index if not exists idx_project_members_project on public.project_members(project_id);
create index if not exists idx_project_members_profile on public.project_members(profile_id);

-- ── 3. project_worker_assignments — workers placed on a project ──────────
create table if not exists public.project_worker_assignments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  worker_id       uuid not null references public.workers(id) on delete cascade,
  status          text not null default 'active'
                    check (status in ('active','ended')),
  assigned_at     timestamptz not null default now(),
  ended_at        timestamptz,
  unique (project_id, worker_id)
);
create index if not exists idx_pwa_project on public.project_worker_assignments(project_id);
create index if not exists idx_pwa_worker on public.project_worker_assignments(worker_id);

-- ── 4. journal_entries.project_id — optional link to a project ───────────
alter table public.journal_entries
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists idx_journal_entries_project
  on public.journal_entries(project_id) where project_id is not null;

-- updated_at maintenance (shared trigger fn from 0001).
drop trigger if exists trg_project_clients_updated_at on public.project_clients;
create trigger trg_project_clients_updated_at
  before update on public.project_clients
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.project_clients enable row level security;
alter table public.project_members enable row level security;
alter table public.project_worker_assignments enable row level security;

-- project_clients: managers of the parent project only (no worker/client read).
drop policy if exists project_clients_select on public.project_clients;
create policy project_clients_select on public.project_clients for select
  using (public.can_manage_project(project_id));
drop policy if exists project_clients_write on public.project_clients;
create policy project_clients_write on public.project_clients for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- project_members: project managers manage rows; a member may read their own.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select
  using (profile_id = auth.uid() or public.can_manage_project(project_id));
drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- project_worker_assignments: managers manage; the assigned worker reads own.
drop policy if exists pwa_select on public.project_worker_assignments;
create policy pwa_select on public.project_worker_assignments for select
  using (public.owns_worker(worker_id) or public.can_manage_project(project_id));
drop policy if exists pwa_write on public.project_worker_assignments;
create policy pwa_write on public.project_worker_assignments for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- Explicit grants — Supabase has NO default table grants (project rule).
grant select, insert, update, delete on public.project_clients to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.project_worker_assignments to authenticated;

-- ── Rollback (manual, if ever needed) ─────────────────────────────────
--   alter table public.journal_entries drop column if exists project_id;
--   drop table if exists public.project_worker_assignments;  -- assert 0 rows
--   drop table if exists public.project_members;             -- assert 0 rows
--   drop table if exists public.project_clients;             -- assert 0 rows
--   drop function if exists public.can_manage_project(uuid);
