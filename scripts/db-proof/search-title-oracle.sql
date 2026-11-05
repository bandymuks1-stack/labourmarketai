-- ============================================================================
-- TITLE SEARCH ORACLE: search_public_vacancy_previews_v1 (v6) against its own rule, written out
-- again as a plain read of the source table, and against what v5 finds, on one snapshot.
--
-- Read-only: one REPEATABLE READ, READ ONLY transaction that ends with ROLLBACK.
-- For each term: the exact total, no title returned, and every ad v5 finds that v6 does not.
-- A term of more than three characters must lose none. A shorter one may lose only ads where it
-- sits inside a word, which is the owner's order for `ok`; the line shows how many. A term with
-- nothing searchable in it finds nothing.
-- Prints one line per term and raises on any difference.
--
-- This is the heavy form: every term scans the source. Local and throw-away databases only.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/db-proof/search-title-oracle.sql
-- ============================================================================
set client_encoding = 'UTF8';
begin transaction isolation level repeatable read read only;
do $$
declare
  v_terms text[] := array['a', 'e', 'ö', 'el', 'ok', 'it', 'vd', 'ter', 'ing', 'kock', 'lager', 'lärare', 'snickare', 'undersköterska', 'byggarbetare', 'kock helg', 'zzqx', 'ELEKTRIKER', '  kock  ', '%', '_', '-', 'it-tekniker', 'c++', 'larare', 'underskoterska', 'schweisser', 'schweißer'];
  v_term text;
  v_folded text;
  v_like text;
  v_today text;
  v_oracle bigint;
  v_total bigint;
  v_rows bigint;
  v_title bigint;
  v_found_today bigint;
  v_lost bigint;
  v_lost_word bigint;
  v_cases int := 0;
  v_diffs int := 0;
begin
  foreach v_term in array v_terms loop
    v_folded := btrim(regexp_replace(regexp_replace(normalize(replace(lower(btrim(v_term)), 'ß', 'ss'), NFD), '[\u0300-\u036f]', '', 'g'), '[^[:alnum:]+#]+', ' ', 'g'));
    v_like := case when length(v_folded) <= 3 then '% ' || v_folded || '%' else '%' || v_folded || '%' end;
    v_today := '%' || lower(replace(replace(btrim(v_term), '%', '\%'), '_', '\_')) || '%';
    select count(*) filter (where v_folded <> '' and x.t like v_like),
           count(*) filter (where x.o like v_today),
           count(*) filter (where x.o like v_today and not (v_folded <> '' and x.t like v_like)),
           count(*) filter (where x.o like v_today and v_folded <> '' and not (x.t like v_like) and x.t like '% ' || v_folded || '%')
      into v_oracle, v_found_today, v_lost, v_lost_word
    from (
      select ' ' || btrim(regexp_replace(regexp_replace(normalize(replace(lower(coalesce(v.title_raw, '') || ' ' || coalesce(v.occupation_raw, '')), 'ß', 'ss'), NFD), '[\u0300-\u036f]', '', 'g'), '[^[:alnum:]+#]+', ' ', 'g')) || ' ' as t,
             lower(v.occupation_raw) collate "C" as o
      from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
      offset 0) x;
    select coalesce(max(f.total_count), 0), count(*), count(f.title_raw)
      into v_total, v_rows, v_title
    from public.search_public_vacancy_previews_v1(v_term, null, 50, 0) f;
    v_cases := v_cases + 1;
    if v_total is distinct from v_oracle or v_title <> 0 or v_rows > 50
       or v_lost_word > 0 or (v_lost > 0 and length(v_folded) > 3) then
      v_diffs := v_diffs + 1;
      raise warning 'DIFF term=% oracle=% total=% rows=% titles=% lost=% lost_word=%', v_term, v_oracle, v_total, v_rows, v_title, v_lost, v_lost_word;
    end if;
    raise notice 'term=% v5=% v6=% v5_only=%', v_term, v_found_today, v_total, v_lost;
  end loop;
  raise notice 'ORACLE cases=% diffs=%', v_cases, v_diffs;
  if v_diffs > 0 then
    raise exception 'title search differs from its rule in % of % cases', v_diffs, v_cases;
  end if;
end $$;
rollback;
