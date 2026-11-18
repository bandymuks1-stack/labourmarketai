-- ============================================================================
-- TITLE SEARCH CASES: hand-written ads and the answer each search must give, including the
-- misses that started SR-10, the languages, the short terms and every write the copy must follow.
--
-- LOCAL AND THROW-AWAY DATABASES ONLY: it inserts and updates synthetic ads inside a transaction
-- that ends with ROLLBACK. Never run it on production. It needs at least one ad to copy from.
--
-- Each case: a term, the labels that must be found, the labels that must not. Raises on any miss.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/db-proof/search-title-cases.sql
-- ============================================================================
set client_encoding = 'UTF8';
begin;
do $$
declare
  v_template public.public_vacancies;
  c record;
  r record;
  v_label text;
  v_found text[];
  v_top text;
  v_all text[];
  v_fail int := 0;
  v_cases int := 0;
  v_id uuid;
begin
  select * into strict v_template from public.public_vacancies where is_active limit 1;

  -- Only the hand-written ads stay searchable, so a term's first page cannot hide one of them.
  update public.public_vacancies set is_active = false where is_active;

  create temp table case_ads (label text primary key, id uuid not null) on commit drop;
  -- label, title, occupation, description, employer, days old, active, expiry
  for r in
    select * from (values
      ('bygg_title',     'Byggarbetare till projekt',           'Anläggningsarbetare', 'd', 'e', 1, true, null::interval),
      ('larare_upper',   'LÄRARE I MATEMATIK',                  'Pedagog',             'd', 'e', 1, true, null),
      ('forskollarare',  'Förskollärare sökes',                 'Pedagog',             'd', 'e', 1, true, null),
      ('saltkalvis',     'ŠALTKALVIS',                          'Montuotojas',         'd', 'e', 1, true, null),
      ('zolnierz',       'ŻOŁNIERZ REZERWY',                    'Ochrona',             'd', 'e', 1, true, null),
      ('likar',          'ЛІКАР',                               'Медицина',            'd', 'e', 1, true, null),
      ('schweisser_sz',  'Schweißer gesucht',                   'Metall',              'd', 'e', 1, true, null),
      ('schweisser_ss',  'Schweisser gesucht',                  'Metall',              'd', 'e', 1, true, null),
      ('sjafor',         'Sjåfør',                              'Transport',           'd', 'e', 1, true, null),
      ('sykepleier',     'Sykepleier',                          'Helse',               'd', 'e', 1, true, null),
      ('kock_old',       'Kock',                                'Restaurang',          'd', 'e', 90, true, null),
      ('kockbitrade',    'Kockbiträde',                         'Restaurang',          'd', 'e', 1, true, null),
      ('bokhallare',     'Bokhållare',                          'Ekonomi',             'd', 'e', 1, true, null),
      ('ok_word',        'OK Stockholm söker personal',         'Butik',               'd', 'e', 1, true, null),
      ('it_hyphen',      'IT-tekniker',                         'Tekniker',            'd', 'e', 1, true, null),
      ('it_quoted',      'Konsult "IT" (support)',              'Support',             'd', 'e', 1, true, null),
      ('fritids',        'Fritidsledare',                       'Fritid',              'd', 'e', 1, true, null),
      ('el_hyphen',      'El-montör',                           'Montör',              'd', 'e', 1, true, null),
      ('elektriker',     'Elektriker',                          'Installation',        'd', 'e', 1, true, null),
      ('hotell',         'Hotell receptionist',                 'Personal',            'd', 'e', 1, true, null),
      ('occ_only',       'Jobb',                                'Byggsnickare',        'd', 'e', 1, true, null),
      ('occ_hyphen',     'Tjänst',                              'Lager-medarbetare',   'd', 'e', 1, true, null),
      ('cpp',            'C++ utvecklare',                      'Programmerare',       'd', 'e', 1, true, null),
      ('csharp',         'C# utvecklare',                       'Programmerare',       'd', 'e', 1, true, null),
      ('slash',          'Kock / Servitör',                     'Restaurang',          'd', 'e', 1, true, null),
      ('long_title',     repeat('Långtitel ', 29) || 'slutord', 'Annat',             'd', 'e', 1, true, null),
      ('hidden_fields',  'Vanligt jobb',                        'Vanligt',             'hemligbeskrivning', 'hemligarbetsgivare', 1, true, null),
      ('expired',        'Utgångenyrke',                        'Utgånget',            'd', 'e', 1, true, interval '-1 day'),
      ('withdrawn',      'Tillbakadragenyrke',                  'Tillbakadraget',      'd', 'e', 1, false, null),
      ('future_expiry',  'Giltigyrke',                          'Giltigt',             'd', 'e', 1, true, interval '30 days')
    ) as t(label, title, occ, descr, employer, age, active, expiry)
  loop
    v_id := gen_random_uuid();
    v_template.id := v_id;
    v_template.external_id := 'case-' || r.label;
    v_template.title_raw := r.title;
    v_template.occupation_raw := r.occ;
    v_template.description_raw := r.descr;
    v_template.employer_name := r.employer;
    v_template.published_at := now() - make_interval(days => r.age);
    v_template.is_active := r.active;
    v_template.expires_at := case when r.expiry is null then null else now() + r.expiry end;
    v_template.profession_slug := case when r.label in ('kock_old', 'kockbitrade', 'slash') then 'case-cook' else 'case-other' end;
    insert into public.public_vacancies values (v_template.*);
    insert into case_ads values (r.label, v_id);
  end loop;

  for c in
    select * from (values
      ('byggarbetare',    array['bygg_title'],                 array[]::text[]),
      ('Byggarbetare',    array['bygg_title'],                 array[]::text[]),
      ('lärare',          array['larare_upper','forskollarare'], array[]::text[]),
      ('LÄRARE',          array['larare_upper','forskollarare'], array[]::text[]),
      ('larare',          array['larare_upper','forskollarare'], array[]::text[]),
      ('schweisser',      array['schweisser_sz','schweisser_ss'], array[]::text[]),
      ('schweißer',       array['schweisser_sz','schweisser_ss'], array[]::text[]),
      ('SCHWEISSER',      array['schweisser_sz','schweisser_ss'], array[]::text[]),
      ('sjafor',          array['sjafor'],                     array[]::text[]),
      ('sjåfør',          array['sjafor'],                     array[]::text[]),
      ('zolnierz',        array['zolnierz'],                   array[]::text[]),
      ('saltkalvis',      array['saltkalvis'],                 array[]::text[]),
      ('šaltkalvis',      array['saltkalvis'],                 array[]::text[]),
      ('ŠALTKALVIS',      array['saltkalvis'],                 array[]::text[]),
      ('żołnierz',        array['zolnierz'],                   array[]::text[]),
      ('лікар',           array['likar'],                      array[]::text[]),
      ('sykepleier',      array['sykepleier'],                 array[]::text[]),
      -- Short terms keep v5's recall (owner 2026-11-09): inside a word too, so `ok` finds Bokhållare and
      -- "sökes". Kock has no "ok" in it (k-o-c-k), so v5 never found it for `ok` and v6 does not either.
      ('ok',              array['ok_word','bokhallare','forskollarare'], array['kock_old','kockbitrade']),
      ('it',              array['it_hyphen','it_quoted','fritids'], array[]::text[]),
      ('el',              array['el_hyphen','elektriker','hotell'], array[]::text[]),
      ('e',               array['el_hyphen','elektriker','hotell','fritids'], array[]::text[]),
      ('vd',              array[]::text[],                     array['kock_old']),
      ('kock',            array['kock_old','kockbitrade','slash'], array['ok_word']),
      ('snickare',        array['occ_only'],                   array[]::text[]),
      ('it tekniker',     array['it_hyphen'],                  array[]::text[]),
      ('it-tekniker',     array['it_hyphen'],                  array[]::text[]),
      ('kock servitör',   array['slash'],                      array[]::text[]),
      ('kock / servitör', array['slash'],                      array[]::text[]),
      ('c++',             array['cpp'],                        array['csharp']),
      -- A symbol finds what v5 finds: the occupation that holds it, not a title (owner 2026-11-09).
      ('-',               array['occ_hyphen'],                 array['it_hyphen','el_hyphen']),
      ('c#',              array['csharp'],                     array['cpp']),
      ('slutord',         array['long_title'],                 array[]::text[]),
      ('hemligbeskrivning', array[]::text[],                   array['hidden_fields']),
      ('hemligarbetsgivare', array[]::text[],                  array['hidden_fields']),
      ('utgångenyrke',    array[]::text[],                     array['expired']),
      ('tillbakadragenyrke', array[]::text[],                  array['withdrawn']),
      ('giltigyrke',      array['future_expiry'],              array[]::text[]),
      ('zzqxzzqx',        array[]::text[],                     array['kock_old'])
    ) as t(term, must, must_not)
  loop
    v_cases := v_cases + 1;
    select array_agg(a.label) into v_found
    from case_ads a
    where a.id in (
      select f.id from public.search_public_vacancy_previews_v1(c.term, null, 50, 0) f
      union all
      select f.id from public.search_public_vacancy_previews_v1(c.term, null, 50, 50) f
    );
    v_found := coalesce(v_found, '{}');
    if not (v_found @> c.must) or v_found && c.must_not then
      v_fail := v_fail + 1;
      raise warning 'MISS term=% found=% must=% must_not=%', c.term, v_found, c.must, c.must_not;
    end if;
  end loop;

  -- A symbol no ad's occupation holds: nothing found, never everything (v5's predicate, escaped).
  foreach v_label in array array['%', '_', '\', '  .  ', '()'] loop
    v_cases := v_cases + 1;
    if exists (select 1 from public.search_public_vacancy_previews_v1(v_label, null, 20, 0)) then
      v_fail := v_fail + 1;
      raise warning 'SYMBOL-ONLY term=% found rows', v_label;
    end if;
  end loop;

  -- A whole word comes before a newer ad that only contains it.
  v_cases := v_cases + 1;
  select a.label into v_top
  from public.search_public_vacancy_previews_v1('kock', 'case-cook', 1, 0) f
  join case_ads a on a.id = f.id;
  if v_top not in ('kock_old', 'slash') then
    v_fail := v_fail + 1;
    raise warning 'ORDER whole word not first, top=%', v_top;
  end if;
  select array_agg(a.label order by f.ord) into v_all
  from public.search_public_vacancy_previews_v1('kock', 'case-cook', 50, 0) with ordinality f(id, t, p, o, e, w, n, cc, mi, ma, sl, ac, pa, tc, ord)
  join case_ads a on a.id = f.id;
  v_cases := v_cases + 1;
  if v_all[3] is distinct from 'kockbitrade' then
    v_fail := v_fail + 1;
    raise warning 'ORDER %', v_all;
  end if;

  -- A short term: the whole word comes first, the ads that only contain it follow (owner 2026-11-09).
  v_cases := v_cases + 1;
  select a.label into v_top
  from public.search_public_vacancy_previews_v1('ok', null, 1, 0) f
  join case_ads a on a.id = f.id;
  if v_top is distinct from 'ok_word' then
    v_fail := v_fail + 1;
    raise warning 'ORDER short term: whole word not first, top=%', v_top;
  end if;

  -- The profession filter narrows, and the same word means the same thing under it.
  v_cases := v_cases + 1;
  -- No cook ad here has "ok" in its title or occupation, so `ok` under the cook filter finds none (as v5).
  if (select count(*) from public.search_public_vacancy_previews_v1('ok', 'case-cook', 20, 0)) <> 0 then
    v_fail := v_fail + 1; raise warning 'PROFESSION ok found a cook ad that holds no ok';
  end if;
  -- `ok` inside a word under a profession: Bokhållare's own filter finds it, as v5 does.
  v_cases := v_cases + 1;
  if not exists (select 1 from public.search_public_vacancy_previews_v1('ok', 'case-other', 50, 0) f join case_ads a on a.id = f.id where a.label = 'bokhallare') then
    v_fail := v_fail + 1; raise warning 'PROFESSION ok must find Bokhallare inside a word';
  end if;
  v_cases := v_cases + 1;
  if (select max(f.total_count) from public.search_public_vacancy_previews_v1('kock', 'case-cook', 1, 0) f) <> 3 then
    v_fail := v_fail + 1; raise warning 'PROFESSION kock total';
  end if;

  -- A title is never returned, on any branch.
  v_cases := v_cases + 1;
  if exists (select 1 from public.search_public_vacancy_previews_v1('byggarbetare', null, 50, 0) f where f.title_raw is not null or f.attribution_code is not null)
     or exists (select 1 from public.search_public_vacancy_previews_v1('kock', 'case-cook', 50, 0) f where f.title_raw is not null or f.attribution_code is not null)
     or exists (select 1 from public.search_public_vacancy_previews_v1(null, 'case-cook', 50, 0) f where f.title_raw is not null or f.attribution_code is not null)
     or exists (select 1 from public.search_public_vacancy_previews_v1(null, null, 50, 0) f where f.title_raw is not null or f.attribution_code is not null) then
    v_fail := v_fail + 1; raise warning 'TITLE returned';
  end if;

  -- The copy follows every write that changes what a search can see.
  select id into v_id from case_ads where label = 'sykepleier';
  update public.public_vacancies set title_raw = 'Ombytttitel' where id = v_id;
  v_cases := v_cases + 2;
  if not exists (select 1 from public.search_public_vacancy_previews_v1('ombytttitel', null, 5, 0) f where f.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC title update';
  end if;
  if exists (select 1 from public.search_public_vacancy_previews_v1('sykepleier', null, 5, 0) f where f.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC old title still found';
  end if;

  update public.public_vacancies set expires_at = now() - interval '1 hour' where id = v_id;
  v_cases := v_cases + 1;
  if exists (select 1 from public.search_public_vacancy_previews_v1('ombytttitel', null, 5, 0) f where f.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC expired still found';
  end if;

  update public.public_vacancies set expires_at = now() + interval '1 day' where id = v_id;
  v_cases := v_cases + 1;
  if not exists (select 1 from public.search_public_vacancy_previews_v1('ombytttitel', null, 5, 0) f where f.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC extended not found';
  end if;

  update public.public_vacancies set is_active = false where id = v_id;
  v_cases := v_cases + 1;
  if exists (select 1 from public.public_vacancy_search s where s.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC withdrawn still in the copy';
  end if;

  update public.public_vacancies set title_raw = 'Tyst ändring' where id = v_id;
  update public.public_vacancies set is_active = true where id = v_id;
  v_cases := v_cases + 1;
  if not exists (select 1 from public.search_public_vacancy_previews_v1('tyst ändring', null, 5, 0) f where f.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC reactivated without its current title';
  end if;

  -- A touch that changes nothing a search can see writes nothing to the copy.
  v_cases := v_cases + 1;
  declare
    v_before xid;
    v_after xid;
  begin
    select s.xmin into v_before from public.public_vacancy_search s where s.id = v_id;
    update public.public_vacancies set last_seen_at = now(), content_hash = md5(coalesce(content_hash, '')) where id = v_id;
    select s.xmin into v_after from public.public_vacancy_search s where s.id = v_id;
    if v_before::text <> v_after::text or (select s.ctid from public.public_vacancy_search s where s.id = v_id) is null then
      v_fail := v_fail + 1; raise warning 'SYNC touch rewrote the copy';
    end if;
  end;

  delete from public.public_vacancies where id = v_id;
  v_cases := v_cases + 1;
  if exists (select 1 from public.public_vacancy_search s where s.id = v_id) then
    v_fail := v_fail + 1; raise warning 'SYNC deleted still in the copy';
  end if;

  raise notice 'CASES total=% failed=%', v_cases, v_fail;
  if v_fail > 0 then
    raise exception 'title search failed % of % cases', v_fail, v_cases;
  end if;
end $$;
rollback;
