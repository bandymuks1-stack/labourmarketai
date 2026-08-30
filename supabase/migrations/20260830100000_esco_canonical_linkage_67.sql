-- ESCO canonical linkage: the 67 EXACT / HIGH_CONFIDENCE rows of the owner-
-- reviewed mapping dry run (docs/taxonomy/esco-mapping-dryrun-2026-08-30.json;
-- review pack docs/taxonomy/esco-apply-review-2026-08-30.md). 31 skills +
-- 36 professions. AMBIGUOUS / NO_MATCH / curated-suggestion rows are NOT here.
--
-- RULES (binding, mirrored by lib/guards/esco-linkage-migration.test.ts):
--   * UPDATE only — no DDL, no inserts, no deletes, no RLS change.
--   * Writes ONLY where the current esco_uri IS NULL (rule: never overwrite).
--   * Every URI is asserted to exist in its OWN namespace corpus table
--     (skills -> esco_skills, professions -> esco_occupations) at apply time.
--   * The URI tail is never parsed; the two-hop join stays the only join.
--   * No UNIQUE constraint is added to skills/professions.esco_uri —
--     many-to-one is legitimate (forklift-operation + forklift-operator both
--     link ESCO "operate forklift").
--   * A missing source row or a conflicting pre-existing value ABORTS the
--     whole migration (transactional — nothing partial can land).
--   * Idempotent: a re-run where every row already carries exactly these
--     values writes 0 rows and succeeds.

do $$
declare
  r record;
  written integer := 0;
  wrote integer;
begin
  for r in
    select * from (values
    ('skill', 'bookkeeping', 'http://data.europa.eu/esco/skill/ecc18804-a466-40d9-98b4-fba5cd67dd4b'),
    ('skill', 'bricklaying', 'http://data.europa.eu/esco/skill/13e1c0a2-b90d-46f4-be51-11730360b38d'),
    ('skill', 'bulldozer-operator', 'http://data.europa.eu/esco/skill/597d6a3a-0283-4945-8001-4719d210433d'),
    ('skill', 'cargo-transport', 'http://data.europa.eu/esco/skill/932c9ed1-3197-4b13-a558-bf147313fe88'),
    ('skill', 'carpentry', 'http://data.europa.eu/esco/skill/19858dd3-a5fe-4855-b644-6ecfefd1c384'),
    ('skill', 'concrete-finishing', 'http://data.europa.eu/esco/skill/2d28964f-0a2d-4aa2-bc2d-c73f7a4442d6'),
    ('skill', 'concrete-pouring', 'http://data.europa.eu/esco/skill/46994031-5490-4a02-9937-c61f6e2d4fc9'),
    ('skill', 'customer-service', 'http://data.europa.eu/esco/skill/15a33d76-4640-438d-ae64-fdc0c1d3eebc'),
    ('skill', 'demolition', 'http://data.europa.eu/esco/skill/a68d4de0-99a3-4c26-b84a-040e706e4714'),
    ('skill', 'drainage', 'http://data.europa.eu/esco/skill/f7626ae8-eecf-41f4-bc4f-de9e57ed30a6'),
    ('skill', 'excavator-operator', 'http://data.europa.eu/esco/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de'),
    ('skill', 'first-aid', 'http://data.europa.eu/esco/skill/f7464f30-662b-4177-85a0-3df9693e9e58'),
    ('skill', 'forklift-operation', 'http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da'),
    ('skill', 'forklift-operator', 'http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da'),
    ('skill', 'grader-operator', 'http://data.europa.eu/esco/skill/7692b391-9dab-4523-9b8d-93971c48502a'),
    ('skill', 'graphic-design', 'http://data.europa.eu/esco/skill/7fb699d9-182a-430e-b7a0-6d8ed05c284b'),
    ('skill', 'grouting', 'http://data.europa.eu/esco/skill/5bfdfb74-91dd-408b-a013-670d6961efc1'),
    ('skill', 'gutter-install', 'http://data.europa.eu/esco/skill/1f1f1090-b9ab-4373-b44e-ca3d0e3f86af'),
    ('skill', 'hairdressing', 'http://data.europa.eu/esco/skill/d2c5d356-43d9-4118-827c-6801e32a452a'),
    ('skill', 'lighting-install', 'http://data.europa.eu/esco/skill/6f8d750e-aba4-459c-b4d7-220bddff9f58'),
    ('skill', 'loader-operator', 'http://data.europa.eu/esco/skill/621c6430-46ba-4793-a1b8-a2d30cb816ba'),
    ('skill', 'mobile-crane', 'http://data.europa.eu/esco/skill/9fe699e9-3490-4f3d-a50d-9f9d31c98698'),
    ('skill', 'office-software', 'http://data.europa.eu/esco/skill/cf310cff-0d28-4dbc-9dbb-cc500a3196c2'),
    ('skill', 'personnel-admin', 'http://data.europa.eu/esco/skill/88b406d0-72e2-4087-be19-d5992d259473'),
    ('skill', 'plastering', 'http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1'),
    ('skill', 'programming', 'http://data.europa.eu/esco/skill/b105ec9b-0857-41d6-8d07-a83e58b73d90'),
    ('skill', 'surveying', 'http://data.europa.eu/esco/skill/1cca610d-2afc-44a7-97fc-f2262fb5fc75'),
    ('skill', 'tower-crane', 'http://data.europa.eu/esco/skill/b6426791-8bca-4241-b7a8-716f1f21cec5'),
    ('skill', 'ventilation', 'http://data.europa.eu/esco/skill/539edd73-5c9b-4498-96f2-68a9cd2e6073'),
    ('skill', 'wallpapering', 'http://data.europa.eu/esco/skill/3816bddd-0765-48d6-b972-0f9aa7296a46'),
    ('skill', 'warehouse-operations', 'http://data.europa.eu/esco/skill/089ddb19-1c7a-43ff-ba64-070f7ce4787a'),
    ('profession', 'auto_mechanic', 'http://data.europa.eu/esco/occupation/4ad4024e-d1d3-4dea-b6d1-2c7948111dce'),
    ('profession', 'baker', 'http://data.europa.eu/esco/occupation/1aadb308-432a-4d01-b54b-b4f7f76dd419'),
    ('profession', 'barber', 'http://data.europa.eu/esco/occupation/4e0c14d6-b170-40f1-bcdc-703c0b92109b'),
    ('profession', 'barista', 'http://data.europa.eu/esco/occupation/bf7d8b16-4e2c-48ef-b44e-dc25b2d0ab61'),
    ('profession', 'builder', 'http://data.europa.eu/esco/occupation/59cc9783-7289-4e1d-b80b-93c1776f49cc'),
    ('profession', 'call_centre_agent', 'http://data.europa.eu/esco/occupation/0ededdc2-050a-4ec3-8e70-6295105fcd19'),
    ('profession', 'caregiver', 'http://data.europa.eu/esco/occupation/d5954a2b-a525-45b7-b6d9-b62efafc6c78'),
    ('profession', 'carpenter', 'http://data.europa.eu/esco/occupation/2a22ff9e-de3b-408d-b312-5034896cc4f4'),
    ('profession', 'concrete_worker', 'http://data.europa.eu/esco/occupation/a9068f84-cecd-4cbb-9acb-e20c714435ec'),
    ('profession', 'cook', 'http://data.europa.eu/esco/occupation/90f75f67-495d-49fa-ab57-2f320e251d7e'),
    ('profession', 'customer_service_specialist', 'http://data.europa.eu/esco/occupation/9c9752b7-3e3b-4a08-8553-b63a013f8072'),
    ('profession', 'electrician', 'http://data.europa.eu/esco/occupation/4910419f-b4af-4f59-b544-9dbebc8a74f0'),
    ('profession', 'farm_worker', 'http://data.europa.eu/esco/occupation/c9191f7f-28b5-4df8-991d-804c53009b83'),
    ('profession', 'furniture_assembler', 'http://data.europa.eu/esco/occupation/d7f3d76b-23e8-447e-93d5-da13ff9bc102'),
    ('profession', 'hairdresser', 'http://data.europa.eu/esco/occupation/099c6bb0-22d3-4c5d-8bf5-70910af381ef'),
    ('profession', 'handyman', 'http://data.europa.eu/esco/occupation/f4a25243-b06a-42a9-9c69-246853df63ad'),
    ('profession', 'kitchen_helper', 'http://data.europa.eu/esco/occupation/f756fdab-7726-4c48-bfcc-94ff8810fc08'),
    ('profession', 'laundry_worker', 'http://data.europa.eu/esco/occupation/0da51178-e386-4534-ae71-15ba789ad756'),
    ('profession', 'mason', 'http://data.europa.eu/esco/occupation/05f321f8-055b-407d-bf19-e0ddabda56b7'),
    ('profession', 'merchandiser', 'http://data.europa.eu/esco/occupation/f1fcad3b-fdf0-444a-81b0-e50e96f8966a'),
    ('profession', 'nail_technician', 'http://data.europa.eu/esco/occupation/bced9b86-d4e7-42f8-bb47-acb2001b9bd0'),
    ('profession', 'office_administrator', 'http://data.europa.eu/esco/occupation/6e6839b6-099c-4802-906e-7f2c8203ee69'),
    ('profession', 'plumber', 'http://data.europa.eu/esco/occupation/ed3cf43d-c2c1-4c46-82fc-1375e27e0290'),
    ('profession', 'production_worker', 'http://data.europa.eu/esco/occupation/af2f3615-63ab-44dc-957d-c9660410d336'),
    ('profession', 'receptionist', 'http://data.europa.eu/esco/occupation/f7b04542-d8c7-42db-8475-e63b507cce82'),
    ('profession', 'roofer', 'http://data.europa.eu/esco/occupation/b4c6d1b0-929e-48be-9f67-47bd8c30658b'),
    ('profession', 'sales_assistant', 'http://data.europa.eu/esco/occupation/9ba74e8a-c40c-4228-9998-eb3c7a5c11df'),
    ('profession', 'site_engineer', 'http://data.europa.eu/esco/occupation/2a914d26-42aa-46b5-acf3-097d51ba4617'),
    ('profession', 'site_manager', 'http://data.europa.eu/esco/occupation/faed05c0-c1d1-4e34-b575-0dea96459e56'),
    ('profession', 'software_developer', 'http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1'),
    ('profession', 'teacher', 'http://data.europa.eu/esco/occupation/c593ded7-2e97-44a5-a5f3-f6115ff98233'),
    ('profession', 'tiler', 'http://data.europa.eu/esco/occupation/02447817-ea01-4d8b-b09c-8bc128e447e6'),
    ('profession', 'translator', 'http://data.europa.eu/esco/occupation/1a07bd7d-2e1d-4930-a84a-1a442b8f2a44'),
    ('profession', 'waiter', 'http://data.europa.eu/esco/occupation/d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471'),
    ('profession', 'warehouse_worker', 'http://data.europa.eu/esco/occupation/bea705fe-06ac-4147-b8e0-6e8ac1208d8f'),
    ('profession', 'welder', 'http://data.europa.eu/esco/occupation/7aedaa07-3884-4c5b-88f9-80997b2aa54b')
    ) as plan(t, slug, uri)
  loop
    if r.t = 'skill' then
      if not exists (select 1 from public.skills s where s.slug = r.slug) then
        raise exception 'esco-linkage-67: skills row "%" does not exist', r.slug;
      end if;
      if not exists (select 1 from public.esco_skills es where es.esco_uri = r.uri) then
        raise exception 'esco-linkage-67: % is not in the esco_skills corpus', r.uri;
      end if;
      if exists (
        select 1 from public.skills s
        where s.slug = r.slug and s.esco_uri is not null and s.esco_uri <> r.uri
      ) then
        raise exception 'esco-linkage-67: skills."%" already carries a DIFFERENT esco_uri — refusing to overwrite', r.slug;
      end if;
      update public.skills
         set esco_uri = r.uri, updated_at = now()
       where slug = r.slug and esco_uri is null;
      get diagnostics wrote = row_count;
      written := written + wrote;
    else
      if not exists (select 1 from public.professions p where p.slug = r.slug) then
        raise exception 'esco-linkage-67: professions row "%" does not exist', r.slug;
      end if;
      if not exists (select 1 from public.esco_occupations eo where eo.esco_uri = r.uri) then
        raise exception 'esco-linkage-67: % is not in the esco_occupations corpus', r.uri;
      end if;
      if exists (
        select 1 from public.professions p
        where p.slug = r.slug and p.esco_uri is not null and p.esco_uri <> r.uri
      ) then
        raise exception 'esco-linkage-67: professions."%" already carries a DIFFERENT esco_uri — refusing to overwrite', r.slug;
      end if;
      update public.professions
         set esco_uri = r.uri, updated_at = now()
       where slug = r.slug and esco_uri is null;
      get diagnostics wrote = row_count;
      written := written + wrote;
    end if;
  end loop;
  raise notice 'esco-linkage-67: wrote % of 67 rows (rows already holding these exact values are skipped idempotently)', written;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (mechanical, by exact slug+uri list — run verbatim to undo):
-- Nulls ONLY rows that still hold exactly the value this migration wrote, so a
-- later deliberate re-curation is never destroyed by a rollback.
--
-- update public.skills s set esco_uri = null, updated_at = now()
-- from (values
--   ('bookkeeping', 'http://data.europa.eu/esco/skill/ecc18804-a466-40d9-98b4-fba5cd67dd4b'),
--   ('bricklaying', 'http://data.europa.eu/esco/skill/13e1c0a2-b90d-46f4-be51-11730360b38d'),
--   ('bulldozer-operator', 'http://data.europa.eu/esco/skill/597d6a3a-0283-4945-8001-4719d210433d'),
--   ('cargo-transport', 'http://data.europa.eu/esco/skill/932c9ed1-3197-4b13-a558-bf147313fe88'),
--   ('carpentry', 'http://data.europa.eu/esco/skill/19858dd3-a5fe-4855-b644-6ecfefd1c384'),
--   ('concrete-finishing', 'http://data.europa.eu/esco/skill/2d28964f-0a2d-4aa2-bc2d-c73f7a4442d6'),
--   ('concrete-pouring', 'http://data.europa.eu/esco/skill/46994031-5490-4a02-9937-c61f6e2d4fc9'),
--   ('customer-service', 'http://data.europa.eu/esco/skill/15a33d76-4640-438d-ae64-fdc0c1d3eebc'),
--   ('demolition', 'http://data.europa.eu/esco/skill/a68d4de0-99a3-4c26-b84a-040e706e4714'),
--   ('drainage', 'http://data.europa.eu/esco/skill/f7626ae8-eecf-41f4-bc4f-de9e57ed30a6'),
--   ('excavator-operator', 'http://data.europa.eu/esco/skill/978a76ca-0d14-43b5-a69d-1996dfeb22de'),
--   ('first-aid', 'http://data.europa.eu/esco/skill/f7464f30-662b-4177-85a0-3df9693e9e58'),
--   ('forklift-operation', 'http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da'),
--   ('forklift-operator', 'http://data.europa.eu/esco/skill/28cb374e-6261-4133-8371-f9a5470145da'),
--   ('grader-operator', 'http://data.europa.eu/esco/skill/7692b391-9dab-4523-9b8d-93971c48502a'),
--   ('graphic-design', 'http://data.europa.eu/esco/skill/7fb699d9-182a-430e-b7a0-6d8ed05c284b'),
--   ('grouting', 'http://data.europa.eu/esco/skill/5bfdfb74-91dd-408b-a013-670d6961efc1'),
--   ('gutter-install', 'http://data.europa.eu/esco/skill/1f1f1090-b9ab-4373-b44e-ca3d0e3f86af'),
--   ('hairdressing', 'http://data.europa.eu/esco/skill/d2c5d356-43d9-4118-827c-6801e32a452a'),
--   ('lighting-install', 'http://data.europa.eu/esco/skill/6f8d750e-aba4-459c-b4d7-220bddff9f58'),
--   ('loader-operator', 'http://data.europa.eu/esco/skill/621c6430-46ba-4793-a1b8-a2d30cb816ba'),
--   ('mobile-crane', 'http://data.europa.eu/esco/skill/9fe699e9-3490-4f3d-a50d-9f9d31c98698'),
--   ('office-software', 'http://data.europa.eu/esco/skill/cf310cff-0d28-4dbc-9dbb-cc500a3196c2'),
--   ('personnel-admin', 'http://data.europa.eu/esco/skill/88b406d0-72e2-4087-be19-d5992d259473'),
--   ('plastering', 'http://data.europa.eu/esco/skill/20f56226-24ed-495f-8bf5-0b2aa6413ba1'),
--   ('programming', 'http://data.europa.eu/esco/skill/b105ec9b-0857-41d6-8d07-a83e58b73d90'),
--   ('surveying', 'http://data.europa.eu/esco/skill/1cca610d-2afc-44a7-97fc-f2262fb5fc75'),
--   ('tower-crane', 'http://data.europa.eu/esco/skill/b6426791-8bca-4241-b7a8-716f1f21cec5'),
--   ('ventilation', 'http://data.europa.eu/esco/skill/539edd73-5c9b-4498-96f2-68a9cd2e6073'),
--   ('wallpapering', 'http://data.europa.eu/esco/skill/3816bddd-0765-48d6-b972-0f9aa7296a46'),
--   ('warehouse-operations', 'http://data.europa.eu/esco/skill/089ddb19-1c7a-43ff-ba64-070f7ce4787a')
-- ) as w(slug, uri)
-- where s.slug = w.slug and s.esco_uri = w.uri;
--
-- update public.professions p set esco_uri = null, updated_at = now()
-- from (values
--   ('auto_mechanic', 'http://data.europa.eu/esco/occupation/4ad4024e-d1d3-4dea-b6d1-2c7948111dce'),
--   ('baker', 'http://data.europa.eu/esco/occupation/1aadb308-432a-4d01-b54b-b4f7f76dd419'),
--   ('barber', 'http://data.europa.eu/esco/occupation/4e0c14d6-b170-40f1-bcdc-703c0b92109b'),
--   ('barista', 'http://data.europa.eu/esco/occupation/bf7d8b16-4e2c-48ef-b44e-dc25b2d0ab61'),
--   ('builder', 'http://data.europa.eu/esco/occupation/59cc9783-7289-4e1d-b80b-93c1776f49cc'),
--   ('call_centre_agent', 'http://data.europa.eu/esco/occupation/0ededdc2-050a-4ec3-8e70-6295105fcd19'),
--   ('caregiver', 'http://data.europa.eu/esco/occupation/d5954a2b-a525-45b7-b6d9-b62efafc6c78'),
--   ('carpenter', 'http://data.europa.eu/esco/occupation/2a22ff9e-de3b-408d-b312-5034896cc4f4'),
--   ('concrete_worker', 'http://data.europa.eu/esco/occupation/a9068f84-cecd-4cbb-9acb-e20c714435ec'),
--   ('cook', 'http://data.europa.eu/esco/occupation/90f75f67-495d-49fa-ab57-2f320e251d7e'),
--   ('customer_service_specialist', 'http://data.europa.eu/esco/occupation/9c9752b7-3e3b-4a08-8553-b63a013f8072'),
--   ('electrician', 'http://data.europa.eu/esco/occupation/4910419f-b4af-4f59-b544-9dbebc8a74f0'),
--   ('farm_worker', 'http://data.europa.eu/esco/occupation/c9191f7f-28b5-4df8-991d-804c53009b83'),
--   ('furniture_assembler', 'http://data.europa.eu/esco/occupation/d7f3d76b-23e8-447e-93d5-da13ff9bc102'),
--   ('hairdresser', 'http://data.europa.eu/esco/occupation/099c6bb0-22d3-4c5d-8bf5-70910af381ef'),
--   ('handyman', 'http://data.europa.eu/esco/occupation/f4a25243-b06a-42a9-9c69-246853df63ad'),
--   ('kitchen_helper', 'http://data.europa.eu/esco/occupation/f756fdab-7726-4c48-bfcc-94ff8810fc08'),
--   ('laundry_worker', 'http://data.europa.eu/esco/occupation/0da51178-e386-4534-ae71-15ba789ad756'),
--   ('mason', 'http://data.europa.eu/esco/occupation/05f321f8-055b-407d-bf19-e0ddabda56b7'),
--   ('merchandiser', 'http://data.europa.eu/esco/occupation/f1fcad3b-fdf0-444a-81b0-e50e96f8966a'),
--   ('nail_technician', 'http://data.europa.eu/esco/occupation/bced9b86-d4e7-42f8-bb47-acb2001b9bd0'),
--   ('office_administrator', 'http://data.europa.eu/esco/occupation/6e6839b6-099c-4802-906e-7f2c8203ee69'),
--   ('plumber', 'http://data.europa.eu/esco/occupation/ed3cf43d-c2c1-4c46-82fc-1375e27e0290'),
--   ('production_worker', 'http://data.europa.eu/esco/occupation/af2f3615-63ab-44dc-957d-c9660410d336'),
--   ('receptionist', 'http://data.europa.eu/esco/occupation/f7b04542-d8c7-42db-8475-e63b507cce82'),
--   ('roofer', 'http://data.europa.eu/esco/occupation/b4c6d1b0-929e-48be-9f67-47bd8c30658b'),
--   ('sales_assistant', 'http://data.europa.eu/esco/occupation/9ba74e8a-c40c-4228-9998-eb3c7a5c11df'),
--   ('site_engineer', 'http://data.europa.eu/esco/occupation/2a914d26-42aa-46b5-acf3-097d51ba4617'),
--   ('site_manager', 'http://data.europa.eu/esco/occupation/faed05c0-c1d1-4e34-b575-0dea96459e56'),
--   ('software_developer', 'http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1'),
--   ('teacher', 'http://data.europa.eu/esco/occupation/c593ded7-2e97-44a5-a5f3-f6115ff98233'),
--   ('tiler', 'http://data.europa.eu/esco/occupation/02447817-ea01-4d8b-b09c-8bc128e447e6'),
--   ('translator', 'http://data.europa.eu/esco/occupation/1a07bd7d-2e1d-4930-a84a-1a442b8f2a44'),
--   ('waiter', 'http://data.europa.eu/esco/occupation/d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471'),
--   ('warehouse_worker', 'http://data.europa.eu/esco/occupation/bea705fe-06ac-4147-b8e0-6e8ac1208d8f'),
--   ('welder', 'http://data.europa.eu/esco/occupation/7aedaa07-3884-4c5b-88f9-80997b2aa54b')
-- ) as w(slug, uri)
-- where p.slug = w.slug and p.esco_uri = w.uri;
