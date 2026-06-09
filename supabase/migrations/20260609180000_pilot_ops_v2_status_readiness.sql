-- ─────────────────────────────────────────────────────────────────────────
-- Pilot Operations v2 — operational status + readiness/document checklist
-- (slice pilot-ops-v2-status-docs)
--
-- WHY: Pilot Operations v1 (PR #280) shows assigned workers + derived readiness
-- but a manager cannot yet (1) classify a project-worker with an explicit
-- operational status, nor (2) track which documents/readiness items are
-- needed / received / checked. This adds those two layers as NEW, additive,
-- RLS-enabled primitives. No existing table, policy, or grant is changed.
--
-- WHAT THIS ADDS (additive + reversible; no RLS loosening; no broad grant):
--   1. project_worker_operational_statuses — one current status per
--      (project, worker). RLS: the manager who can_manage_project, the worker
--      themselves (read), or admin. Writes are RPC-only.
--   2. project_worker_readiness_items — per (project, worker, item_key)
--      checklist. Same RLS shape. Writes are RPC-only.
--   3. SECURITY DEFINER, owner-scoped RPCs (gated by can_manage_project AND an
--      ACTIVE F4 assignment, or admin) to upsert a status / a checklist item.
--      Direct insert/update/delete on both tables is REVOKEd from authenticated
--      so the ONLY write path is the gated RPCs (mirrors the F4 pattern).
--   4. Explicit grant SELECT + EXECUTE to `authenticated` only. No anon/PUBLIC.
--
-- HONESTY: `ready` / `checked` are MANAGER-SET operational states, never a
-- system verification, legal compliance, or document approval. The status
-- CHECK constraints bound the allowed values; nothing here fabricates state.
--
-- ROLLBACK (reversible):
--   drop function if exists public.set_worker_operational_status(text,text,text,text);
--   drop function if exists public.upsert_worker_readiness_item(text,text,text,text,text,text);
--   drop table if exists public.project_worker_readiness_items;
--   drop table if exists public.project_worker_operational_statuses;
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Operational status (one current status per project-worker pair) ────────
create table if not exists public.project_worker_operational_statuses (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  status      text not null check (status in (
                'candidate','contacted','interested','documents_needed',
                'ready','assigned','unavailable','rejected')),
  note        text,
  updated_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, worker_id)
);
create index if not exists pwos_project_idx
  on public.project_worker_operational_statuses (project_id);

alter table public.project_worker_operational_statuses enable row level security;

-- SELECT: the managing manager, the worker themselves, or admin.
drop policy if exists pwos_select on public.project_worker_operational_statuses;
create policy pwos_select on public.project_worker_operational_statuses
  for select to authenticated
  using (
    public.can_manage_project(project_id)
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );
-- No insert/update/delete policy: writes go ONLY through the gated RPC below
-- (direct writes are REVOKEd from authenticated further down).

-- 2. Readiness / document checklist (per project-worker-item) ───────────────
create table if not exists public.project_worker_readiness_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  item_key    text not null,
  label       text not null,
  status      text not null default 'needed' check (status in (
                'not_required','needed','missing','received','checked',
                'rejected','expired')),
  note        text,
  updated_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, worker_id, item_key)
);
create index if not exists pwri_project_idx
  on public.project_worker_readiness_items (project_id);

alter table public.project_worker_readiness_items enable row level security;

drop policy if exists pwri_select on public.project_worker_readiness_items;
create policy pwri_select on public.project_worker_readiness_items
  for select to authenticated
  using (
    public.can_manage_project(project_id)
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- 3. Gated write RPCs (SECURITY DEFINER) ────────────────────────────────────
-- A status/checklist write requires the caller to manage the project AND the
-- worker to have an ACTIVE assignment on it (the F4 link), or admin. This keeps
-- the "no broad manager-to-any-worker" rule: a manager cannot classify a worker
-- who is not assigned to their project.
create or replace function public.set_worker_operational_status(
  p_project_id        text,
  p_worker_profile_id text,
  p_status            text,
  p_note              text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  pid    uuid := nullif(p_project_id, '')::uuid;
  w_pid  uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id   uuid;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null or coalesce(p_status, '') = '' then
    raise exception 'Project, worker and status are required' using errcode = '22023';
  end if;
  if p_status not in ('candidate','contacted','interested','documents_needed',
                      'ready','assigned','unavailable','rejected') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (public.can_manage_project(pid) and exists (
        select 1 from public.project_worker_assignments pwa
         where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to set status for this project worker'
      using errcode = '42501';
  end if;

  insert into public.project_worker_operational_statuses
      (project_id, worker_id, status, note, updated_by, updated_at)
    values (pid, w_id, p_status, nullif(p_note, ''), uid, now())
  on conflict (project_id, worker_id) do update
    set status = excluded.status, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now()
  returning id into row_id;
  return row_id;
end;
$$;
revoke all on function public.set_worker_operational_status(text, text, text, text) from public;
grant execute on function public.set_worker_operational_status(text, text, text, text) to authenticated;

create or replace function public.upsert_worker_readiness_item(
  p_project_id        text,
  p_worker_profile_id text,
  p_item_key          text,
  p_label             text,
  p_status            text,
  p_note              text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  pid    uuid := nullif(p_project_id, '')::uuid;
  w_pid  uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id   uuid;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null
     or coalesce(p_item_key, '') = '' or coalesce(p_label, '') = '' then
    raise exception 'Project, worker, item and label are required' using errcode = '22023';
  end if;
  if coalesce(p_status, 'needed') not in
       ('not_required','needed','missing','received','checked','rejected','expired') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (public.can_manage_project(pid) and exists (
        select 1 from public.project_worker_assignments pwa
         where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to set readiness for this project worker'
      using errcode = '42501';
  end if;

  insert into public.project_worker_readiness_items
      (project_id, worker_id, item_key, label, status, note, updated_by, updated_at)
    values (pid, w_id, p_item_key, p_label,
            coalesce(nullif(p_status, ''), 'needed'), nullif(p_note, ''), uid, now())
  on conflict (project_id, worker_id, item_key) do update
    set label = excluded.label, status = excluded.status, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now()
  returning id into row_id;
  return row_id;
end;
$$;
revoke all on function public.upsert_worker_readiness_item(text, text, text, text, text, text) from public;
grant execute on function public.upsert_worker_readiness_item(text, text, text, text, text, text) to authenticated;

-- 4. Grants — SELECT only to authenticated; writes are RPC-only ─────────────
grant select on public.project_worker_operational_statuses to authenticated;
grant select on public.project_worker_readiness_items to authenticated;
revoke insert, update, delete on public.project_worker_operational_statuses from authenticated;
revoke insert, update, delete on public.project_worker_readiness_items from authenticated;
