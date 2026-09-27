-- ============================================================================
-- ROLLBACK for 20260927053000_worker_self_declared_profession_v1.sql
--
-- REFUSES while any person-authored value exists in the columns this reversal
-- would drop — their own words (`label`) OR the ESCO occupation they picked
-- (`esco_occupation_id`). Both are things a person chose about their own work,
-- and there is nowhere else in the schema either survives.
--
-- Codex P2 on #1879, verified: the check constraint requires `profession_id`
-- OR `label`, so a REGISTRY row may legitimately carry an ESCO pick with no
-- label. A guard that counted only `label` would have read zero and dropped
-- that person's selection silently.
-- Same convention as 20260924150000's rollback: a reversal that would destroy
-- human-entered data stops and says so, instead of succeeding quietly.
--
-- To roll back deliberately, the rows must be dealt with first — by the owner,
-- as a separate, explicit decision.
-- ============================================================================

do $$
declare
  n_label bigint;
  n_esco  bigint;
begin
  select count(*) filter (where label is not null),
         count(*) filter (where esco_occupation_id is not null)
    into n_label, n_esco
    from public.worker_professions;
  if n_label > 0 or n_esco > 0 then
    raise exception
      'ROLLBACK REFUSED: % row(s) carry a self-declared profession and % carry an ESCO occupation the person picked; dropping these columns would delete what those people said about their own work.',
      n_label, n_esco;
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

-- Safe by construction: the guard above proved no row carries a `label`, and
-- the check constraint proved every row without a `label` has a
-- `profession_id` — so no row can violate NOT NULL here.
alter table public.worker_professions
  alter column profession_id set not null;

