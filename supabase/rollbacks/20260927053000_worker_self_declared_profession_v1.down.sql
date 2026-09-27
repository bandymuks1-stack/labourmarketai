-- ============================================================================
-- ROLLBACK for 20260927053000_worker_self_declared_profession_v1.sql
--
-- REFUSES while any self-declared profession exists. The columns below hold
-- what people wrote about their own work in their own words; dropping them
-- would delete that, and there is nowhere else in the schema it survives.
-- Same convention as 20260924150000's rollback: a reversal that would destroy
-- human-entered data stops and says so, instead of succeeding quietly.
--
-- To roll back deliberately, the rows must be dealt with first — by the owner,
-- as a separate, explicit decision.
-- ============================================================================

do $$
declare
  n bigint;
begin
  select count(*) into n from public.worker_professions where label is not null;
  if n > 0 then
    raise exception
      'ROLLBACK REFUSED: % self-declared profession row(s) exist; dropping worker_professions.label would delete what those people wrote about their own work.', n;
  end if;
end $$;

drop index if exists public.worker_professions_one_label;
drop index if exists public.worker_professions_esco_occupation_idx;

alter table public.worker_professions
  drop constraint if exists worker_professions_names_something;
alter table public.worker_professions
  drop constraint if exists worker_professions_label_len;

-- `normalized_label` is generated FROM `label`, so it goes first.
alter table public.worker_professions drop column if exists normalized_label;
alter table public.worker_professions drop column if exists label;
alter table public.worker_professions drop column if exists esco_occupation_id;

-- Safe by construction: the guard above proved there is no row without a
-- `label`, and the check constraint proved every row without a `label` has a
-- `profession_id` — so no row can violate NOT NULL here.
alter table public.worker_professions
  alter column profession_id set not null;

