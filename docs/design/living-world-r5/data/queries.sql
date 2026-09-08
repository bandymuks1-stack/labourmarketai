-- Living Opportunity World R5 — the exact read-only queries behind
-- data/world-snapshot.json. Run against production with a READ-ONLY role.
-- No DDL, no writes, no migrations. Re-run before reusing the snapshot:
-- every count here goes stale within hours.

-- 1. Country truth + the two honesty constraints (classification, geocoding).
select
  count(*)                                                   as total_rows,
  count(*) filter (where is_active)                          as active,
  count(*) filter (where lat is not null and lng is not null) as geocoded,
  count(*) filter (where profession_slug is not null)        as classified,
  count(distinct country)                                    as countries,
  count(distinct region)                                     as regions,
  count(distinct city)                                       as cities,
  count(distinct employer_name)                              as employers,
  max(published_at)                                          as newest_published,
  max(last_seen_at)                                          as inventory_last_seen
from public.public_vacancies;

-- 2. Supplier + categorization version split. Anything not on
--    vacancy-arbetsformedlingen-v2 is excluded from profession figures:
--    pre-v2 slugs are known-polluted.
select country, provider_key, categorization_origin, transform_version, count(*) as n
from public.public_vacancies
group by 1, 2, 3, 4
order by n desc;

-- 3. City selection evidence — volume, chain breadth and profession evenness.
--    evenness = Shannon entropy over profession shares / ln(distinct professions).
with v as (
  select city, profession_slug, count(*) n
  from public.public_vacancies
  where is_active
    and transform_version = 'vacancy-arbetsformedlingen-v2'
    and profession_slug is not null
    and city is not null
  group by 1, 2
), t as (select city, sum(n) tot from v group by 1)
select v.city, t.tot as classified,
  count(*) filter (where v.n >= 20) as professions_ge20,
  count(*) filter (where v.n >= 50) as professions_ge50,
  round((-sum((v.n::numeric / t.tot) * ln(v.n::numeric / t.tot)) / ln(count(*)::numeric))::numeric, 3) as evenness
from v join t using (city)
where t.tot >= 250
group by v.city, t.tot
order by professions_ge20 desc, evenness desc;

-- 4. Region + city rollup for the chosen flagship geography.
select
  (select count(*) from public.public_vacancies where is_active and country = 'SE')                        as se_active,
  (select count(*) from public.public_vacancies where is_active and region = 'Västra Götalands län')       as vg_active,
  (select count(distinct city) from public.public_vacancies where is_active and region = 'Västra Götalands län') as vg_cities,
  (select count(*) from public.public_vacancies where is_active and city = 'Göteborg')                     as gbg_active,
  (select count(distinct employer_name) from public.public_vacancies where is_active and city = 'Göteborg') as gbg_employers,
  (select count(*) from public.public_vacancies where is_active and city = 'Göteborg' and profession_slug is not null) as gbg_classified,
  (select count(*) from public.public_vacancies where is_active and published_at > now() - interval '7 days') as published_last_7d;

-- 5. The chain: every profession link the flagship camera passes through,
--    counted inside ONE city so the story stays geographically coherent.
select profession_slug, count(*) as n, count(distinct employer_name) as employers
from public.public_vacancies
where is_active and country = 'SE' and city = 'Göteborg' and profession_slug is not null
group by 1
order by n desc;

-- 6. National profession scale (used only for the macro beat and the
--    second-domain contrast).
select profession_slug, count(*) as n, count(distinct city) as cities, count(distinct employer_name) as employers
from public.public_vacancies
where is_active and transform_version = 'vacancy-arbetsformedlingen-v2' and profession_slug is not null
group by 1
order by n desc;

-- 7. The canonical skill sets the ONE match engine computes fit over
--    (lib/market/fit.ts operates on skills.slug).
select p.slug as profession, string_agg(s.slug, ', ' order by s.slug) as skills, count(*) as n
from public.professions p
join public.profession_skills ps on ps.profession_id = p.id
join public.skills s on s.id = ps.skill_id
group by 1
order by 1;
