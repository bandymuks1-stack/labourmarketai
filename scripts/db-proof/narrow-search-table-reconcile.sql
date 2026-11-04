-- ============================================================================
-- NARROW SEARCH TABLE RECONCILE: public_vacancy_search against public_vacancies.
-- Read-only: one REPEATABLE READ, READ ONLY transaction that ends with ROLLBACK.
-- Prints one line of counts and raises if the copy differs from its source.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/db-proof/narrow-search-table-reconcile.sql
-- ============================================================================
begin transaction isolation level repeatable read read only;
do $$
declare
  v_source bigint;
  v_copy bigint;
  v_missing bigint;
  v_extra bigint;
  v_changed bigint;
begin
  select count(*) into v_source from public.public_vacancies where is_active;
  select count(*) into v_copy from public.public_vacancy_search;
  select count(*) into v_missing from public.public_vacancies v
    where v.is_active and not exists (select 1 from public.public_vacancy_search s where s.id = v.id);
  select count(*) into v_extra from public.public_vacancy_search s
    where not exists (select 1 from public.public_vacancies v where v.id = s.id and v.is_active);
  select count(*) into v_changed from public.public_vacancy_search s
    join public.public_vacancies v on v.id = s.id
    where v.occupation_raw is distinct from s.occupation_raw
       or v.expires_at is distinct from s.expires_at
       or v.published_at is distinct from s.published_at;
  raise notice 'RECONCILE source=% copy=% missing=% extra=% changed=%', v_source, v_copy, v_missing, v_extra, v_changed;
  if v_source <> v_copy or v_missing + v_extra + v_changed > 0 then
    raise exception 'public_vacancy_search differs from public_vacancies';
  end if;
end $$;
rollback;
