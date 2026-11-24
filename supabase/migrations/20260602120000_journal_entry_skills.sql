-- Journal Entry ↔ Skill links v1 (durable evidence-support relation).
--
-- The worker can mark which of THEIR declared skills a work-journal entry
-- supports. This is an EVIDENCE-SUPPORT link the worker asserts themselves — it
-- is NOT verification, confirmation, or certification (those remain the separate
-- manager-confirm flow: confirm_entry_and_verify_skills →
-- worker_skills.source='manager_confirmed'). This table makes "which entries
-- support skill X / which skills does entry Y support" a durable, queryable
-- relation instead of a loose provenance assumption.
--
-- Additive, owner-scoped, RLS mirrors journal_entry_work_items. No data
-- backfill. Never applied to prod by an agent — DI applies via Supabase.
--
-- ROLLBACK:
--   drop table if exists public.journal_entry_skills;

create table if not exists public.journal_entry_skills (
  id                uuid primary key default gen_random_uuid(),
  journal_entry_id  uuid not null references public.journal_entries(id) on delete cascade,
  worker_id         uuid not null references public.workers(id) on delete cascade,
  skill_id          uuid not null references public.skills(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (journal_entry_id, skill_id)
);

create index if not exists idx_journal_entry_skills_entry
  on public.journal_entry_skills (journal_entry_id);
create index if not exists idx_journal_entry_skills_skill
  on public.journal_entry_skills (skill_id);
create index if not exists idx_journal_entry_skills_worker
  on public.journal_entry_skills (worker_id, created_at desc);

alter table public.journal_entry_skills enable row level security;

-- SELECT: the worker who owns the row, an admin, or a manager of the
-- organization the parent entry was logged against (read-only evidence view).
drop policy if exists journal_entry_skills_select on public.journal_entry_skills;
create policy journal_entry_skills_select on public.journal_entry_skills for select
  using (
    public.owns_worker(worker_id)
    or public.is_admin()
    or exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_skills.journal_entry_id
         and public.manages_organization(ec.organization_id)
    )
  );

-- INSERT: only the worker who owns BOTH the link and the parent entry (or an
-- admin). The entry must belong to the same worker as the link row.
drop policy if exists journal_entry_skills_insert on public.journal_entry_skills;
create policy journal_entry_skills_insert on public.journal_entry_skills for insert
  with check (
    (
      public.owns_worker(worker_id)
      and exists (
        select 1 from public.journal_entries je
         where je.id = journal_entry_skills.journal_entry_id
           and je.worker_id = journal_entry_skills.worker_id
      )
    )
    or public.is_admin()
  );

-- DELETE: only the owning worker or an admin (so a worker can unlink a skill).
drop policy if exists journal_entry_skills_delete on public.journal_entry_skills;
create policy journal_entry_skills_delete on public.journal_entry_skills for delete
  using (public.owns_worker(worker_id) or public.is_admin());

grant select, insert, delete on public.journal_entry_skills to authenticated;
