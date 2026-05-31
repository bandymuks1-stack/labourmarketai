-- 20260531132710_tasks_and_assignments.sql
-- Slice 5 — project/task foundation. PROPOSAL / owner-gated — DO NOT auto-apply.
--
-- RED / needs-human-gate (see docs/handoffs/TASK-SLICE-5-PROJECT-TASK-GATE.md).
-- Apply MANUALLY via Supabase MCP only after the owner confirms the decisions in
-- the gate doc. Additive + reversible. No destructive drops. No RLS loosening:
-- access is scoped to the org's managers (manages_organization) and the assigned
-- worker only — never anon, never `using (true)`.
--
-- Membership model (decision #1): a worker is assignable if they hold an active
-- `employee` engagement_context of the task's organization (no new membership
-- table). Assignment identity (decision #2): workers.id.

-- ── tasks ────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  title           text not null check (char_length(title) between 1 and 200),
  description     text,
  status          text not null default 'open'
                    check (status in ('open','in_progress','done','cancelled')),
  due_date        date,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tasks_org_idx on public.tasks (organization_id, status);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- ── task_assignments ──────────────────────────────────────────────────────
create table if not exists public.task_assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  status      text not null default 'assigned'
                check (status in ('assigned','accepted','in_progress','done','declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (task_id, worker_id)
);
create index if not exists task_assignments_worker_idx
  on public.task_assignments (worker_id);

-- ── journal link (additive, nullable) ─────────────────────────────────────
alter table public.journal_entries
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;

-- tasks: org managers full access; an assigned worker may read their tasks.
drop policy if exists tasks_manage on public.tasks;
create policy tasks_manage on public.tasks for all
  using (public.manages_organization(organization_id) or public.is_admin())
  with check (public.manages_organization(organization_id) or public.is_admin());

drop policy if exists tasks_assignee_select on public.tasks;
create policy tasks_assignee_select on public.tasks for select
  using (exists (
    select 1 from public.task_assignments ta
    join public.workers w on w.id = ta.worker_id
    where ta.task_id = tasks.id and w.profile_id = auth.uid()
  ));

-- task_assignments: org managers full; the assigned worker reads own + may
-- advance their own assignment status (accept / in_progress / done / decline).
drop policy if exists task_assignments_manage on public.task_assignments;
create policy task_assignments_manage on public.task_assignments for all
  using (
    public.is_admin()
    or exists (select 1 from public.tasks t
               where t.id = task_id and public.manages_organization(t.organization_id))
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.tasks t
               where t.id = task_id and public.manages_organization(t.organization_id))
  );

drop policy if exists task_assignments_worker_select on public.task_assignments;
create policy task_assignments_worker_select on public.task_assignments for select
  using (exists (
    select 1 from public.workers w
    where w.id = worker_id and w.profile_id = auth.uid()
  ));

drop policy if exists task_assignments_worker_update on public.task_assignments;
create policy task_assignments_worker_update on public.task_assignments for update
  using (exists (
    select 1 from public.workers w
    where w.id = worker_id and w.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workers w
    where w.id = worker_id and w.profile_id = auth.uid()
  ));

-- ── grants (RLS still gates every row) ────────────────────────────────────
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_assignments to authenticated;

-- ── ROLLBACK (manual) ───────────────────────────────────────────────────────
-- alter table public.journal_entries drop column if exists task_id;
-- drop table if exists public.task_assignments;
-- drop table if exists public.tasks;
