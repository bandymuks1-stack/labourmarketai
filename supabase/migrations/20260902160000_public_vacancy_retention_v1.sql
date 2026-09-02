-- ============================================================================
-- 20260902160000 — public_vacancy_retention_v1
--
-- FINAL COMPLETION Train B2 (2026-09-02). OWNER GATE G-4 — RED by policy:
-- this file creates the RETENTION MACHINERY for imported job ads and applies
-- NOTHING by itself. Every run is an explicit, service-role-only call whose
-- default is a DRY RUN. It ships as a DRAFT + needs-human-gate PR; the owner
-- decides (a) whether to apply the migration and (b) whether/when to run it
-- with p_dry_run := false and with p_strip_text := true.
--
-- ----------------------------------------------------------------------------
-- WHY (measured on production, 2026-09-02 — docs/audits/…-db-audit-2026-09-02.md §I)
-- ----------------------------------------------------------------------------
--   public_vacancies: 71,356 rows, 335 MB (162 MB of that is description text,
--   TOAST-compressed). 70,767 rows carry is_active = true; 25,635 of them are
--   PAST their own expires_at. The stream grows ≈ 12 k rows / ≈ 55 MB a week.
--
--   Every READ path already excludes expired ads (Train B1, PR #1420): the
--   product never shows them. What remains is STORAGE and HONEST STATE: an ad
--   whose publisher-stated validity ended should not stay flagged "active"
--   forever, and its full text has no product use after the ad is dead.
--
-- ----------------------------------------------------------------------------
-- WHAT THE FUNCTION DOES (two stages, both opt-in, dry run by default)
-- ----------------------------------------------------------------------------
--   Candidates: is_active = true AND expires_at <= now() - p_grace.
--
--   Stage 1 — DEACTIVATE (reversible): is_active := false. lifecycle is left
--     exactly as the importer set it ('published'), so the fact "the publisher
--     never withdrew it" is preserved and the reversal is mechanical:
--       update public.public_vacancies
--          set is_active = true
--        where is_active = false and lifecycle = 'published'
--          and expires_at <= now() - <same grace>;
--     (rows the importer withdrew carry lifecycle = 'removed' and are untouched)
--
--   Stage 2 — STRIP TEXT (irreversible, p_strip_text := true only):
--     description_raw := null for the SAME candidates. title_raw, ids, dates,
--     hashes, employer, location, compensation, occupation/skills stay. The
--     source stream does not re-serve expired ads, so this is a genuine loss
--     of the ad body — hence a separate flag and a separate owner decision.
--
--   Dry run (default): returns the counts and bytes it WOULD touch; writes
--   nothing. Every invocation, dry or not, is recorded via RAISE LOG.
--
-- ----------------------------------------------------------------------------
-- DRY-RUN NUMBERS (production, 2026-09-02)
-- ----------------------------------------------------------------------------
--   grace 0 days  : 25,635 rows, ≈ 87 MB raw text
--   grace 30 days : 0 rows (the stream is 3½ weeks old; the first ads cross
--                   expires_at + 30 d in the second half of September)
--
-- NOT SCHEDULED. No cron, no trigger. Scheduling is a later, separate decision
-- once the owner has approved one manual run and seen the numbers.
--
-- Least privilege: EXECUTE revoked from public/anon/authenticated; granted to
-- service_role only. SECURITY DEFINER with a pinned search_path so the
-- service-role caller needs no table grant beyond the function.
--
-- ROLLBACK: supabase/rollbacks/20260902160000_public_vacancy_retention_v1.down.sql
--   (drops the function; the stage-1 reversal statement is documented above and
--   in the .down.sql; stage 2 has no reversal — that is why it is opt-in).
-- ============================================================================

create or replace function public.public_vacancy_retention_run_v1(
  p_grace      interval default interval '30 days',
  p_strip_text boolean  default false,
  p_dry_run    boolean  default true
)
returns table (
  candidate_rows       bigint,
  candidate_text_bytes bigint,
  deactivated_rows     bigint,
  text_stripped_rows   bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff       timestamptz := now() - coalesce(p_grace, interval '30 days');
  v_candidates   bigint := 0;
  v_bytes        bigint := 0;
  v_deactivated  bigint := 0;
  v_stripped     bigint := 0;
begin
  select count(*), coalesce(sum(octet_length(description_raw)), 0)
    into v_candidates, v_bytes
    from public.public_vacancies
   where is_active = true
     and expires_at is not null
     and expires_at <= v_cutoff;

  if not p_dry_run then
    -- Stage 2 first (same candidate set), so a strip never touches a row the
    -- deactivation below would have excluded.
    if p_strip_text then
      update public.public_vacancies
         set description_raw = null,
             updated_at = now()
       where is_active = true
         and expires_at is not null
         and expires_at <= v_cutoff
         and description_raw is not null;
      get diagnostics v_stripped = row_count;
    end if;

    update public.public_vacancies
       set is_active = false,
           updated_at = now()
     where is_active = true
       and expires_at is not null
       and expires_at <= v_cutoff;
    get diagnostics v_deactivated = row_count;
  end if;

  raise log 'public_vacancy_retention_run_v1: dry_run=% grace=% strip=% candidates=% bytes=% deactivated=% stripped=%',
    p_dry_run, p_grace, p_strip_text, v_candidates, v_bytes, v_deactivated, v_stripped;

  return query select v_candidates, v_bytes, v_deactivated, v_stripped;
end;
$$;

revoke all on function public.public_vacancy_retention_run_v1(interval, boolean, boolean) from public;
revoke all on function public.public_vacancy_retention_run_v1(interval, boolean, boolean) from anon;
revoke all on function public.public_vacancy_retention_run_v1(interval, boolean, boolean) from authenticated;
grant execute on function public.public_vacancy_retention_run_v1(interval, boolean, boolean) to service_role;

comment on function public.public_vacancy_retention_run_v1(interval, boolean, boolean) is
  'Retention for imported job ads past their own expires_at (+grace). Dry run by default; stage 1 deactivates (reversible), stage 2 (p_strip_text) nulls description_raw (irreversible). Service-role only; never scheduled by this migration. Owner gate G-4 (FINAL COMPLETION register).';

-- ROLLBACK
--   drop function if exists public.public_vacancy_retention_run_v1(interval, boolean, boolean);
--   -- stage-1 reversal (if a non-dry run was executed with grace G):
--   -- update public.public_vacancies set is_active = true
--   --  where is_active = false and lifecycle = 'published' and expires_at <= now() - G;
