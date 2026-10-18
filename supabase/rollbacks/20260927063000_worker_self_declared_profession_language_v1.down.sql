-- ============================================================================
-- ROLLBACK for 20260927063000_worker_self_declared_profession_language_v1.sql
--
-- REFUSES while any row records a source language. That value came from a real
-- person's session — it is the one thing that cannot be recovered afterwards,
-- because the rule this change exists to honour is that the language is NEVER
-- re-derived from the text. Dropping the column would destroy it silently and
-- leave the words behind with no honest way to say what they were written in.
--
-- To roll back deliberately, the recorded languages must be dealt with first —
-- by the owner, as a separate, explicit decision.
-- ============================================================================

do $$
declare
  n bigint;
begin
  select count(*) into n
    from public.worker_professions
    where original_language is not null;
  if n > 0 then
    raise exception
      'ROLLBACK REFUSED: % row(s) record the language a person wrote their profession in; it is never re-derived from the text, so dropping this column would lose it for good.', n;
  end if;
end $$;

alter table public.worker_professions
  drop constraint if exists worker_professions_language_needs_label;
alter table public.worker_professions
  drop constraint if exists worker_professions_original_language_chk;
alter table public.worker_professions
  drop column if exists original_language;
