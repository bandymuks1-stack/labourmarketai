-- ============================================================================
-- ROLLBACK for 20260819094500_worker_saved_public_vacancies_v1.sql
--
-- NOT authorised against production by the forward migration's approval. Applying
-- this is its own decision.
--
-- ── THE ONE DESTRUCTIVE STEP, STATED PLAINLY ───────────────────────────────
--
-- Restoring `request_id NOT NULL` is impossible while any row holds a saved
-- PUBLIC VACANCY, because those rows have a null request_id by construction.
-- So this rollback DELETES the vacancy-sourced saves. That is real user data —
-- private bookmarks a worker made — and it cannot be recovered afterwards.
--
-- It is therefore GUARDED, not assumed: the delete runs only if the operator
-- has explicitly acknowledged it, and the NOT NULL restore ASSERTS the table is
-- clean rather than failing halfway. Demand-sourced saves are never touched.
--
-- To roll back WITHOUT losing anything, run steps 1-3 only: dropping the CHECK
-- and the column leaves the table exactly as v1 shaped it for demand rows,
-- while `request_id` stays nullable. That is a valid, non-destructive resting
-- state — the constraint is looser than v1, and nothing reads it.
-- ============================================================================

begin;

-- 1. Write path first: stop new vacancy saves before touching the shape.
drop function if exists public.unsave_worker_public_vacancy_v1(uuid);
drop function if exists public.save_worker_public_vacancy_v1(uuid, text);

-- 2. Indexes and the exactly-one-source CHECK.
drop index if exists public.worker_saved_opportunities_vacancy_idx;
drop index if exists public.worker_saved_opportunities_worker_vacancy_key;
alter table public.worker_saved_opportunities
  drop constraint if exists worker_saved_opportunities_exactly_one_source;

-- 3. The column. Vacancy-sourced rows lose their source here — see the header.
alter table public.worker_saved_opportunities
  drop column if exists public_vacancy_id;

-- 4. OPTIONAL and DESTRUCTIVE — restore request_id NOT NULL.
--    Uncomment BOTH statements together, and only after accepting that the
--    delete discards workers' private saves permanently.
--
-- delete from public.worker_saved_opportunities where request_id is null;
-- do $$
-- begin
--   if exists (select 1 from public.worker_saved_opportunities where request_id is null) then
--     raise exception 'refusing to restore NOT NULL: % rows still have a null request_id',
--       (select count(*) from public.worker_saved_opportunities where request_id is null);
--   end if;
--   alter table public.worker_saved_opportunities alter column request_id set not null;
-- end $$;

commit;
