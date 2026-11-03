-- Public vacancy LOCATION for signed-out visitors — country + city only.
--
-- OWNER DECISION 2026-11-03 (verbatim): "Patvirtinu, kad viešuose darbo
-- skelbimuose neprisijungusiems lankytojams būtų rodoma šalis ir miestas, kai
-- šie duomenys žinomi ir teisėtai viešinami. Duomenų bazės pakeitimą parengti
-- atskiru PR su migracija, prieigos teisių patikra, privatumo įvertinimu ir
-- rollback planu. Prieš taikant produkcijoje pateikti atskiram patvirtinimui."
--
-- This NARROWLY relaxes one part of the 2026-08-24 anonymous boundary
-- (20260824120000_public_vacancy_anon_boundary_v2.sql): country and city
-- become visible. Everything else that rule withholds stays withheld — the
-- publisher's free-text title, employer name and identifiers, region/county,
-- street address, postal code, coordinates, contact data, description,
-- application URL and the named source attribution.
--
-- SHAPE: ONE new read-only function, additive. The existing anonymous
-- functions (search_public_vacancy_previews_v1, get_public_vacancy_preview_v1,
-- list_public_vacancy_sitemap_v1, count_public_vacancies_v1) are NOT touched,
-- so their bodies, signatures and ACLs are exactly as applied today and the
-- rollback is a single DROP. The caller passes the ids it already received
-- from those functions (one board page, or one detail id) and gets back
-- (id, country, city) for the subset whose location is lawfully public.
--
-- "LAWFULLY PUBLIC", made a code fact (all four must hold for a row):
--   1. the ad is live: is_active AND not expired — the same live-row filter
--      as every sibling public function, so a withdrawn ad never answers;
--   2. its source is on an explicit allow-list of providers whose licence
--      permits republication AND whose own public ad shows the location:
--        * arbetsformedlingen — JobTech open data, CC0; Platsbanken publishes
--          the municipality on every public ad;
--        * nav — Arbeidsplassen.no terms permit republication; the public ad
--          shows the municipality.
--      A new provider answers NOTHING until it is added here by a reviewed
--      migration (fail-closed). Partner / platform-authored ads are not on
--      the list;
--   3. city is the source's MUNICIPALITY field (both parsers map
--      workplace_address.municipality / workLocations.municipal to `city`) —
--      a controlled administrative name, never the street address or the
--      county/region (`region` is not selected);
--   4. a city value is returned only when it looks like a place name: 2–60
--      characters, no digits (no postal code, house number or address line),
--      no '@' and no URL. Anything else returns NULL city, country still
--      shown. Country is the ISO-3166 alpha-2 code the importer stores.
--
-- NO PROBE ORACLE: the function never searches by location. It answers only
-- for ids, at most 50 per call (one board page), and only for live,
-- allow-listed ads — exactly the rows a visitor could open one by one.
--
-- Class: RED (SECURITY DEFINER + GRANT). Reversible:
-- supabase/rollbacks/20261103130000_public_vacancy_locations_v1.down.sql.

create or replace function public.public_vacancy_locations_v1(
  p_ids uuid[]
) returns table (
  id uuid,
  country text,
  city text
) language sql security definer set search_path = public stable as $$
  select
    v.id,
    upper(v.country) as country,
    case
      when v.city is not null
       and char_length(btrim(v.city)) between 2 and 60
       and btrim(v.city) !~ '[0-9@]'
       and btrim(v.city) !~* '(https?:|www\.)'
      then btrim(v.city)
    end as city
  from public.public_vacancies v
  where v.id = any (
      -- At most one board page per call; NULL / empty arrays answer nothing.
      (coalesce(p_ids, '{}'::uuid[]))[1:50]
    )
    and v.is_active
    and (v.expires_at is null or v.expires_at > now())
    and v.provider_key in ('arbetsformedlingen', 'nav')
    and v.country ~ '^[A-Za-z]{2}$';
$$;

comment on function public.public_vacancy_locations_v1(uuid[]) is
  'Country + municipality of live, allow-listed public vacancies for anonymous callers (owner 2026-11-03). No title, employer, region, address, coordinates or attribution. Max 50 ids.';

-- REVOKE FROM PUBLIC FIRST — a bare grant leaves the default PUBLIC EXECUTE in
-- place, the idiom behind the 2026-07-22 P0. Then the same two roles as the
-- sibling public functions: anon (the board, the job page, crawlers) and
-- authenticated (a signed-in member reads the same public card).
revoke execute on function public.public_vacancy_locations_v1(uuid[]) from public;
grant execute on function public.public_vacancy_locations_v1(uuid[]) to anon, authenticated;
