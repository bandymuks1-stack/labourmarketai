-- ============================================================================
-- FIXED-CLOCK HASHES of search_public_vacancy_previews_v1, for comparing two
-- databases. Two databases cannot be read at one moment: a row that expires between
-- the two reads changes the total and the page, and looks like a defect. This reads
-- each database at one given time, so only a real difference remains.
--
-- A temporary copy of the function has now() replaced by a parameter. It lives in
-- pg_temp, inside a transaction that ends with ROLLBACK, so nothing stays behind.
-- It writes the catalog while it runs, so it is NOT for production without an owner
-- approved window; there, cut `terms` to a few terms.
--
-- Usage, the same time on both, then compare the two outputs:
--   psql -At -v at="2026-12-01 12:00:00+00" -v slug=some_slug -f scripts/db-proof/search-fixed-clock-hashes.sql > a.txt
-- ============================================================================
set client_encoding = 'UTF8';
begin transaction isolation level repeatable read;
do $$
declare
  v_def text := pg_get_functiondef('public.search_public_vacancy_previews_v1(text,text,integer,integer)'::regprocedure);
begin
  v_def := replace(v_def, 'public.search_public_vacancy_previews_v1(', 'pg_temp.search_at(');
  v_def := replace(v_def, 'p_offset integer DEFAULT 0)', 'p_offset integer DEFAULT 0, p_now timestamptz DEFAULT NULL)');
  v_def := replace(v_def, 'now()', 'p_now');
  if v_def not like '%p_now timestamptz%' or v_def like '%now()%' then
    raise exception 'the function has an unexpected shape';
  end if;
  execute v_def;
end $$;
with terms(t) as (values
    ('a'), ('e'), ('ö'), ('el'), ('er'), ('ter'), ('ing'), ('kock'), ('snickare'),
    ('undersköterska'), ('elektriker'), ('kock helg'), ('zzqx'), ('ELEKTRIKER'), ('  kock  '), ('%'), ('_'), (null)),
  slugs(s) as (values (null::text), (:'slug'), ('no-such-slug')),
  pages(l, o) as (values (20, 0), (20, 20), (20, 1000), (20, 10000000), (50, 0), (500, 0))
select coalesce(t, '(none)') || '|' || coalesce(s, '(none)') || '|' || l || '|' || o || '|' || r.h
from terms, slugs, pages,
  lateral (
    select md5(coalesce(string_agg(f::text, '|'), '')) || '|' || count(*) || '|' || coalesce(max(f.total_count), 0) as h
    from pg_temp.search_at(t, s, l, o, (:'at')::timestamptz) f) r
order by 1;
rollback;
