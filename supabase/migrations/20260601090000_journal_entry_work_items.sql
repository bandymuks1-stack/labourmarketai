-- 20260601090000 — Journal entry work items (DRAFT — needs-human-gate)
-- =====================================================================
-- RED slice 3. Durable storage for the per-work-item recognition that today
-- is computed-only at display time (lib/structuring/recognize-entry.ts).
--
-- DO NOT APPLY automatically. This migration is prepared for human review and
-- explicit owner / Chat-Claude approval, then applied via Supabase MCP
-- `apply_migration` (never `supabase db push`). It is additive + reversible.
--
-- What it stores: one row per recognized/confirmed work item belonging to a
-- journal entry — the work type, the evidence phrase it was matched on, the
-- hours (only when explicit), an honest certainty band, the provenance source,
-- and the reviewer's decision/status. This lets recognition survive beyond a
-- single render and lets a reviewer confirm/correct individual items.
--
-- Scope guarantees (mirrors journal_entries RLS, migration 0013):
--   - a worker reads/writes ONLY their own rows (owns_worker);
--   - a company owner / reviewer reads + decides rows for entries in an
--     organization they manage (manages_organization via the parent entry's
--     engagement_context);
--   - admin full access; NO public/anon read.
-- =====================================================================

create table if not exists public.journal_entry_work_items (
  id                uuid primary key default gen_random_uuid(),
  journal_entry_id  uuid not null references public.journal_entries(id) on delete cascade,
  worker_id         uuid not null references public.workers(id) on delete cascade,
  -- Company scope, denormalised from the parent entry's engagement context so
  -- RLS + reporting can filter by organization without a join at read time.
  organization_id   uuid references public.organizations(id) on delete set null,
  -- Stable work-type key (maps to the skill/activity taxonomy in JSON; never a
  -- DB enum — taxonomy names live in messages/*, PLATFORM_DOCTRINE §2).
  work_type_key     text,
  title             text not null,
  evidence_phrase   text,
  hours_numeric     numeric(6,2),
  unit              text check (unit is null or unit in ('hours','minutes','days')),
  certainty         text not null default 'unclear'
                      check (certainty in ('clear','partial','unclear')),
  source            text not null default 'computed'
                      check (source in ('computed','reviewer_confirmed','worker_corrected')),
  status            text not null default 'suggested'
                      check (status in ('suggested','confirmed','rejected','needs_clarification')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_journal_entry_work_items_entry
  on public.journal_entry_work_items(journal_entry_id);
create index if not exists idx_journal_entry_work_items_worker
  on public.journal_entry_work_items(worker_id, created_at desc);
create index if not exists idx_journal_entry_work_items_org
  on public.journal_entry_work_items(organization_id)
  where organization_id is not null;

-- updated_at maintenance (reuses the shared trigger fn from 0001).
drop trigger if exists trg_journal_entry_work_items_updated_at
  on public.journal_entry_work_items;
create trigger trg_journal_entry_work_items_updated_at
  before update on public.journal_entry_work_items
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.journal_entry_work_items enable row level security;

-- Helper predicate: does the caller manage the org behind this work item's
-- parent journal entry? (Same chain journal_entries_select uses.)
--   exists (entry → engagement_context → manages_organization)
drop policy if exists journal_entry_work_items_select on public.journal_entry_work_items;
create policy journal_entry_work_items_select on public.journal_entry_work_items for select
  using (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_work_items.journal_entry_id
         and public.manages_organization(ec.organization_id)
    )
  );

-- INSERT: the worker themselves (their own entry's items) or admin. Reviewers
-- do not create items; they decide on existing ones (UPDATE).
drop policy if exists journal_entry_work_items_insert on public.journal_entry_work_items;
create policy journal_entry_work_items_insert on public.journal_entry_work_items for insert
  with check (
    public.owns_worker(worker_id)
    or public.is_admin()
  );

-- UPDATE: the worker may correct their own items; a managing reviewer may set
-- the decision/status on items for entries in their organization; admin.
drop policy if exists journal_entry_work_items_update on public.journal_entry_work_items;
create policy journal_entry_work_items_update on public.journal_entry_work_items for update
  using (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_work_items.journal_entry_id
         and public.manages_organization(ec.organization_id)
    )
  )
  with check (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_work_items.journal_entry_id
         and public.manages_organization(ec.organization_id)
    )
  );

-- DELETE: owner of the worker row or admin only (reviewers never hard-delete).
drop policy if exists journal_entry_work_items_delete on public.journal_entry_work_items;
create policy journal_entry_work_items_delete on public.journal_entry_work_items for delete
  using (public.owns_worker(worker_id) or public.is_admin());

-- Explicit grants — Supabase has NO default table grants (project rule).
grant select, insert, update, delete on public.journal_entry_work_items to authenticated;

-- ── Rollback (manual, if ever needed) ─────────────────────────────────
--   drop trigger if exists trg_journal_entry_work_items_updated_at
--     on public.journal_entry_work_items;
--   drop table if exists public.journal_entry_work_items;   -- assert 0 rows first
