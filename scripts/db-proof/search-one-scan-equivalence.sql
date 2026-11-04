-- ============================================================================
-- ONE-SCAN EQUIVALENCE: search_public_vacancy_previews_v1 (v5) against the v4
-- statements (a count, then a page), on the same snapshot, every column compared.
--
-- Read-only: one REPEATABLE READ, READ ONLY transaction that ends with ROLLBACK.
-- Terms: 1, 2, 3 characters, whole words, zero hits, upper case, padding, LIKE
-- metacharacters. Pages: first, second, deep, past the end, limit 50, limit clamp.
-- Prints one line per case and raises if any case differs.
--
-- This is the heavy form: it runs up to 2 x 90 scans. On production run it only
-- in an owner-approved window; there, cut `terms` to a few terms.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/db-proof/search-one-scan-equivalence.sql
-- ============================================================================
set client_encoding = 'UTF8';
begin transaction isolation level repeatable read read only;
do $$
declare
  v_terms text[] := array[
    'a', 'e', 'k', 'ö',
    'el', 'er', 'an',
    'ter', 'ing', 'are',
    'kock', 'snickare', 'undersköterska', 'montör', 'elektriker',
    'zzqx', 'ELEKTRIKER', '  kock  ', '%', '_', 'a%b', '\'];
  v_pages int[][] := array[[20, 0], [20, 20], [20, 1000], [20, 10000000], [50, 0], [500, 0]];
  v_term text;
  v_i int;
  v_limit int;
  v_offset int;
  v_needle text;
  v_pattern text;
  v_total bigint;
  v_old text;
  v_new text;
  v_rows bigint;
  v_cases int := 0;
  v_diffs int := 0;
begin
  foreach v_term in array v_terms loop
    for v_i in 1..array_length(v_pages, 1) loop
      v_limit := v_pages[v_i][1];
      v_offset := v_pages[v_i][2];
      -- The v4 statements, verbatim, with the function's own argument handling.
      v_needle := nullif(replace(replace(btrim(v_term), '%', '\%'), '_', '\_'), '');
      v_pattern := '%' || lower(v_needle) || '%';
      select count(*) into v_total from public.public_vacancies v
        where v.is_active and (v.expires_at is null or v.expires_at > now())
          and lower(v.occupation_raw) collate "C" like v_pattern;
      select md5(coalesce(string_agg(r::text, '|' order by o), '')), count(*) into v_old, v_rows
      from (
        select row(v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
               v.working_time, v.positions,
               case when v.compensation_min is not null or v.compensation_max is not null
                    then v.compensation_currency end,
               v.compensation_min, v.compensation_max, v.source_language,
               null::text, v.published_at, v_total) as r,
               row_number() over (order by hit.published_at desc nulls last, hit.id) as o
        from (
          select h.id, h.published_at
          from public.public_vacancies h
          where h.is_active and (h.expires_at is null or h.expires_at > now())
            and lower(h.occupation_raw) collate "C" like v_pattern
          order by h.published_at desc nulls last, h.id
          limit least(greatest(v_limit, 1), 50) offset v_offset) hit
        join public.public_vacancies v on v.id = hit.id) s;

      select md5(coalesce(string_agg(r::text, '|' order by o), '')) into v_new
      from (
        select row(f.id, f.title_raw, f.profession_slug, f.occupation_raw, f.employment_form,
               f.working_time, f.positions, f.compensation_currency,
               f.compensation_min, f.compensation_max, f.source_language,
               f.attribution_code, f.published_at, f.total_count) as r,
               f.o
        from public.search_public_vacancy_previews_v1(v_term, null, v_limit, v_offset)
          with ordinality as f(id, title_raw, profession_slug, occupation_raw, employment_form,
            working_time, positions, compensation_currency, compensation_min, compensation_max,
            source_language, attribution_code, published_at, total_count, o)) s;

      v_cases := v_cases + 1;
      if v_old is distinct from v_new then
        v_diffs := v_diffs + 1;
        raise warning 'DIFF term=% limit=% offset=% total=% rows=%', v_term, v_limit, v_offset, v_total, v_rows;
      end if;
      if v_offset = 0 and v_limit = 20 then
        raise notice 'term=% total=% rows=% md5=%', v_term, v_total, v_rows, v_new;
      end if;
    end loop;
  end loop;
  raise notice 'EQUIVALENCE cases=% diffs=%', v_cases, v_diffs;
  if v_diffs > 0 then
    raise exception 'one-scan search differs from v4 in % of % cases', v_diffs, v_cases;
  end if;
end $$;
rollback;
