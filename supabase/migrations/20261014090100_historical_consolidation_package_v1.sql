-- @human-gate-approved
--
-- SAFETY CLASS: RED (production data write: project marker + ledger rows +
-- audit_logs). Draft PR + needs-human-gate; apply ONLY via Supabase MCP
-- apply_migration after explicit owner approval (owner decision 2026-10-14:
-- "leidžiama logiškai konsoliduoti istorinius projektus … pagal visų turimų
-- duomenų visumą").
--
-- 20261014090100 — consolidation package v1 for ONE organization's imported
-- history (organization 19f47e78…, 180 imported project rows).
--
-- WHAT IT DOES: for every active imported project row it writes ONE ledger
-- row (historical_consolidation_decisions) — merged / canonical /
-- kept_separate, with the original text, normalized name, mismatch types,
-- signals, certainty, conflicts and rule version — and marks each MERGED row
-- `record_state = duplicate, canonical_project_id = …` (the existing marker),
-- with an audit_logs row each. NOTHING ELSE: no record, hour, person, work
-- object or source is written, moved or deleted.
--
-- THE GROUPS (verified read-only 2026-10-13/14; counts asserted below):
--   W22.073      40 rows → canonical a10fbefd  (single object code; w22:073 = W22.073)   unambiguous
--   W22.067      40 rows → canonical ebbf2afc  (single object code; w22:067 = W22.067)   unambiguous
--   Travers 19   13 rows → canonical 0df4dae5  (same address; work text mixed into name)  unambiguous
--   Borneolaan 48 2 rows → canonical 828bb94e  (same address; spacing only)              unambiguous
--   Wijkplaats 4  2 rows → canonical ce0b6fe3  (same address; one 2023 day vs 2024-25)    probable
--   Melkpad 49    2 rows → canonical ff22c6a7  (same address; 2022 vs 2025)               probable
--   Hoofdgracht 43 2 rows → canonical e193ce8f (43/45 inside 43's period, 2 shared people) probable
--   2e Nieuwstraat 2 rows → canonical 12fdd2bc ("niewstraat": same person within 14 d)   probable
-- KEPT SEPARATE with the conflict recorded: Travers 19 vs W22.073 (W22.073
-- co-occurs with several addresses — an order code, not one building);
-- rows naming two or more codes (hours are never split); similar names with
-- different numbers/streets/people (Sarphatipark/140, Vivaldi/54/56,
-- Havenweg/Nieuwe Havenweg, Kantoor/Kantoorwerk/Office, Baas/Bass).
--
-- SAFETY ASSERTIONS (the whole transaction aborts on any mismatch):
--   * before == after: record count, sum(hours), distinct people, md5 of the
--     ordered record fingerprints, project row count, work object count;
--   * every group has exactly the verified number of rows;
--   * 180 active imported rows before; 95 merged after.
-- IDEMPOTENT: a second run with the same rule version does nothing. An
-- environment without this organization (CI / clean db reset) skips.
-- UNDO: revert_historical_consolidation_v1 per decision, or the rollback file
-- for the whole package.
-- ROLLBACK: supabase/rollbacks/20261014090100_historical_consolidation_package_v1.down.sql

begin;

do $pkg$
declare
  v_org  constant uuid := '19f47e78-7bd1-4120-9937-603dba769f8a';
  v_rule constant text := 'historical-consolidation/v1 2026-10-14';
  b_records bigint; b_hours numeric; b_people bigint; b_fp text; b_projects bigint; b_objects bigint;
  a_records bigint; a_hours numeric; a_people bigint; a_fp text; a_projects bigint; a_objects bigint;
  n int;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    raise notice 'historical consolidation package v1: organization absent — skipped';
    return;
  end if;
  if exists (select 1 from public.historical_consolidation_decisions where organization_id = v_org and rule_version = v_rule) then
    raise notice 'historical consolidation package v1: already applied — nothing to do';
    return;
  end if;

  -- ── checksums BEFORE ──────────────────────────────────────────────────
  select count(*), coalesce(sum(hours), 0), count(distinct organization_person_id),
         md5(string_agg(coalesce(record_fingerprint, id::text), ',' order by id))
    into b_records, b_hours, b_people, b_fp
    from public.organization_evidence_records where organization_id = v_org;
  select count(*) into b_projects from public.projects where organization_id = v_org;
  select count(*) into b_objects from public.work_objects where organization_id = v_org;

  -- ── every active imported row, with what the rule reads ───────────────
  create temp table hc on commit drop as
  with base as (
    select p.id, p.created_at,
           coalesce(nullif(string_agg(o.name, ' | ' order by o.name), ''), p.title, '') as original_text
      from public.projects p
      left join public.work_objects o on o.project_id = p.id
     where p.organization_id = v_org and p.historical_key is not null and p.record_state = 'active'
     group by p.id, p.created_at, p.title
  )
  select b.id, b.original_text,
         array(select distinct 'W22.' || m[1] from regexp_matches(b.original_text, '[Ww]22[.:](\d{3})', 'g') m) as codes,
         (select count(*) from public.organization_evidence_records r join public.work_objects o on o.id = r.work_object_id where o.project_id = b.id) as records,
         (select min(coalesce(r.activity_date, r.period_start)) from public.organization_evidence_records r join public.work_objects o on o.id = r.work_object_id where o.project_id = b.id) as first_day,
         (select max(coalesce(r.activity_date, r.period_end)) from public.organization_evidence_records r join public.work_objects o on o.id = r.work_object_id where o.project_id = b.id) as last_day,
         null::uuid as canonical_id,
         null::text as grp,
         'none'::text as certainty,
         '[]'::jsonb as conflicts,
         '{}'::text[] as types,
         null::text as normalized
    from base b;

  select count(*) into n from hc;
  if n <> 180 then raise exception 'consolidation package v1: expected 180 active imported rows, found %', n; end if;

  -- ── groups ────────────────────────────────────────────────────────────
  update hc set grp = 'W22.073', canonical_id = 'a10fbefd-a02e-4717-9e74-b176616571ea', certainty = 'unambiguous'
   where cardinality(codes) = 1 and codes[1] = 'W22.073';
  get diagnostics n = row_count; if n <> 40 then raise exception 'W22.073 group: expected 40 rows, found %', n; end if;

  update hc set grp = 'W22.067', canonical_id = 'ebbf2afc-f6ec-45b3-9949-df1db53b4bd0', certainty = 'unambiguous'
   where cardinality(codes) = 1 and codes[1] = 'W22.067';
  get diagnostics n = row_count; if n <> 40 then raise exception 'W22.067 group: expected 40 rows, found %', n; end if;

  update hc set grp = 'travers 19', canonical_id = '0df4dae5-6afa-4788-a5e8-f88da333ac88', certainty = 'unambiguous'
   where cardinality(codes) = 0 and original_text ~* '(^|[^0-9])travers 19([^0-9]|$)';
  get diagnostics n = row_count; if n <> 13 then raise exception 'Travers 19 group: expected 13 rows, found %', n; end if;

  update hc set grp = v.grp, canonical_id = v.canonical_id, certainty = v.certainty
    from (values
      ('828bb94e-3c23-499e-8220-9c9a0c02ffd8'::uuid, 'borneolaan 48',  '828bb94e-3c23-499e-8220-9c9a0c02ffd8'::uuid, 'unambiguous'),
      ('5710799c-d37d-4b2f-a78e-cd499d37554b',       'borneolaan 48',  '828bb94e-3c23-499e-8220-9c9a0c02ffd8',       'unambiguous'),
      ('ce0b6fe3-89d9-4c98-8be7-cf724ceecaf2',       'wijkplaats 4',   'ce0b6fe3-89d9-4c98-8be7-cf724ceecaf2',       'probable'),
      ('d1446175-a3bc-41bb-a900-b4511f2a2662',       'wijkplaats 4',   'ce0b6fe3-89d9-4c98-8be7-cf724ceecaf2',       'probable'),
      ('ff22c6a7-5e9d-4cb2-9f9b-a6358a741d89',       'melkpad 49',     'ff22c6a7-5e9d-4cb2-9f9b-a6358a741d89',       'probable'),
      ('191f4ba1-45d6-4b30-b090-e6682026dc35',       'melkpad 49',     'ff22c6a7-5e9d-4cb2-9f9b-a6358a741d89',       'probable'),
      ('e193ce8f-dca4-4b68-b8e6-c9ad9433b2e8',       'hoofdgracht 43', 'e193ce8f-dca4-4b68-b8e6-c9ad9433b2e8',       'probable'),
      ('25acef61-768d-43cc-99dd-a9b605ef3d09',       'hoofdgracht 43', 'e193ce8f-dca4-4b68-b8e6-c9ad9433b2e8',       'probable'),
      ('12fdd2bc-5d55-4713-980b-f2eed7c7aead',       '2e nieuwstraat', '12fdd2bc-5d55-4713-980b-f2eed7c7aead',       'probable'),
      ('8bd2566b-9fce-40d9-bf4b-d6727e1ac185',       '2e nieuwstraat', '12fdd2bc-5d55-4713-980b-f2eed7c7aead',       'probable')
    ) as v(id, grp, canonical_id, certainty)
   where hc.id = v.id and hc.grp is null;
  get diagnostics n = row_count; if n <> 10 then raise exception 'address pairs: expected 10 rows, found %', n; end if;

  -- Every named canonical must itself be in its own group.
  select count(*) into n from hc where grp is not null and id = canonical_id;
  if n <> 8 then raise exception 'expected 8 canonical rows, found %', n; end if;

  -- ── normalized name, mismatch types, conflicts ────────────────────────
  update hc set normalized = coalesce(grp, lower(regexp_replace(btrim(original_text), '\s+', ' ', 'g')));

  update hc set types = array_remove(array[
      case when grp is not null then 'object_split_into_projects' end,
      case when original_text ~ '[Ww]22:\d{3}' then 'code_spelling_variant' end,
      case when id in ('5710799c-d37d-4b2f-a78e-cd499d37554b'::uuid, 'd1446175-a3bc-41bb-a900-b4511f2a2662', '191f4ba1-45d6-4b30-b090-e6682026dc35', '8bd2566b-9fce-40d9-bf4b-d6727e1ac185') then 'address_spelling_variant' end,
      case when (cardinality(codes) = 1 and original_text !~ '^W22[.:]\d{3}( \(\d+\)| \(adresas nerastas žodyne\))?$')
             or (grp = 'travers 19' and original_text !~* '^travers 19$') then 'name_mixed_with_work_description' end,
      case when cardinality(codes) > 1 or original_text ~ '\d+\s*/\s*\d+' then 'multiple_objects_in_row' end,
      case when id in ('d1446175-a3bc-41bb-a900-b4511f2a2662'::uuid, '191f4ba1-45d6-4b30-b090-e6682026dc35') then 'period_mismatch' end,
      case when cardinality(codes) = 0 and original_text !~ '\d' then 'no_house_number' end
    ]::text[], null);

  -- Travers 19 and W22.073: the code names several addresses → an order
  -- code, not one building. Both kept as their own canonical; recorded.
  update hc set types = array_append(types, 'conflicting_project_data'),
                conflicts = jsonb_build_array(jsonb_build_object(
                  'with', case when id = '0df4dae5-6afa-4788-a5e8-f88da333ac88' then 'a10fbefd-a02e-4717-9e74-b176616571ea' else '0df4dae5-6afa-4788-a5e8-f88da333ac88' end,
                  'kind', 'code_spans_several_addresses',
                  'note', 'W22.073 rows also name Travers 19, Hoofdgracht 45/60, Roopkort 36, Uytenbosch 36, Vlissingen; kept as separate projects'))
   where id in ('0df4dae5-6afa-4788-a5e8-f88da333ac88', 'a10fbefd-a02e-4717-9e74-b176616571ea');

  -- Similar-but-different: possibly the same object, not merged.
  update hc set types = array_append(types, 'possible_same_object'),
                conflicts = conflicts || jsonb_build_array(jsonb_build_object('with', v.other, 'kind', v.kind))
    from (values
      ('d3e8d919-5c5e-4089-ba6d-96f22d566abd'::uuid, '0a6171f5-61f7-433d-a3db-4efb9349def4'::uuid, 'number_missing_on_one_side'),
      ('0a6171f5-61f7-433d-a3db-4efb9349def4',       'd3e8d919-5c5e-4089-ba6d-96f22d566abd',       'number_missing_on_one_side'),
      ('98bdec11-a517-447f-8487-e02359ad37d0',       '1d851bc5-cb07-475d-afe8-66412eb38891',       'different_house_numbers'),
      ('1d851bc5-cb07-475d-afe8-66412eb38891',       '98bdec11-a517-447f-8487-e02359ad37d0',       'different_house_numbers'),
      ('85e15ed9-2cbf-4a1c-9f4f-f6b48d13dfd8',       '98bdec11-a517-447f-8487-e02359ad37d0',       'number_missing_on_one_side'),
      ('5e568b76-cb01-44c9-833d-fbd40140eaf0',       'f949da30-ec38-45b4-878f-8050f0b5f8d9',       'different_street_names'),
      ('f949da30-ec38-45b4-878f-8050f0b5f8d9',       '5e568b76-cb01-44c9-833d-fbd40140eaf0',       'different_street_names'),
      ('0b1f5038-5e68-4a19-ac0d-fcb0a78976e3',       '71932290-55e6-498d-8174-6e193a574392',       'office_not_a_site'),
      ('961f21fe-a005-4715-a769-f6989067335b',       '0b1f5038-5e68-4a19-ac0d-fcb0a78976e3',       'work_type_not_a_site'),
      ('71932290-55e6-498d-8174-6e193a574392',       '0b1f5038-5e68-4a19-ac0d-fcb0a78976e3',       'office_not_a_site'),
      ('f263f368-0419-49cd-8aa5-be0c1a8b8fa8',       '34e626b8-42cc-4c1c-81f9-5256ed8d9295',       'spelling_variant_different_dates'),
      ('34e626b8-42cc-4c1c-81f9-5256ed8d9295',       'f263f368-0419-49cd-8aa5-be0c1a8b8fa8',       'spelling_variant_different_dates')
    ) as v(id, other, kind)
   where hc.id = v.id;

  -- ── the ledger: one row per imported row ──────────────────────────────
  insert into public.historical_consolidation_decisions
    (organization_id, project_id, canonical_project_id, original_text, normalized_name, mismatch_types,
     signals, certainty, conflicts, decision, rule_version, decided_by)
  select v_org, hc.id,
         case when hc.canonical_id is not null and hc.canonical_id <> hc.id then hc.canonical_id end,
         left(hc.original_text, 4000), left(hc.normalized, 400), hc.types,
         jsonb_strip_nulls(jsonb_build_object(
           'object_codes', to_jsonb(hc.codes),
           'group', hc.grp,
           'records', hc.records,
           'first_day', hc.first_day,
           'last_day', hc.last_day,
           'canonical_first_day', c.first_day,
           'canonical_last_day', c.last_day,
           'shared_people_with_canonical', case when hc.canonical_id is not null and hc.canonical_id <> hc.id then (
               select count(distinct r1.organization_person_id)
                 from public.organization_evidence_records r1 join public.work_objects o1 on o1.id = r1.work_object_id
                where o1.project_id = hc.id
                  and r1.organization_person_id in (
                    select r2.organization_person_id from public.organization_evidence_records r2
                      join public.work_objects o2 on o2.id = r2.work_object_id where o2.project_id = hc.canonical_id)) end)),
         case when hc.grp is null then 'none' else hc.certainty end,
         hc.conflicts,
         case when hc.grp is null then 'kept_separate' when hc.canonical_id = hc.id then 'canonical' else 'merged' end,
         v_rule, null
    from hc left join hc c on c.id = hc.canonical_id;

  -- ── the marker on merged rows, audited ────────────────────────────────
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  select null, 'historical_consolidation_package_v1', 'project', hc.id,
         jsonb_build_object('before', jsonb_build_object('record_state', 'active'),
                            'after', jsonb_build_object('record_state', 'duplicate', 'canonical_project_id', hc.canonical_id),
                            'rule_version', v_rule, 'group', hc.grp, 'certainty', hc.certainty),
         now()
    from hc where hc.grp is not null and hc.canonical_id <> hc.id;

  update public.projects p
     set record_state = 'duplicate', canonical_project_id = hc.canonical_id, updated_at = now()
    from hc
   where p.id = hc.id and hc.grp is not null and hc.canonical_id <> hc.id and p.record_state = 'active';
  get diagnostics n = row_count; if n <> 95 then raise exception 'expected 95 merged rows, marked %', n; end if;

  -- ── checksums AFTER — identical or nothing is committed ───────────────
  select count(*), coalesce(sum(hours), 0), count(distinct organization_person_id),
         md5(string_agg(coalesce(record_fingerprint, id::text), ',' order by id))
    into a_records, a_hours, a_people, a_fp
    from public.organization_evidence_records where organization_id = v_org;
  select count(*) into a_projects from public.projects where organization_id = v_org;
  select count(*) into a_objects from public.work_objects where organization_id = v_org;
  if (a_records, a_hours, a_people, a_fp, a_projects, a_objects)
     is distinct from (b_records, b_hours, b_people, b_fp, b_projects, b_objects) then
    raise exception 'consolidation package v1: checksum changed (records %/% hours %/% people %/% fp %/% projects %/% objects %/%)',
      b_records, a_records, b_hours, a_hours, b_people, a_people, b_fp, a_fp, b_projects, a_projects, b_objects, a_objects;
  end if;
  raise notice 'consolidation package v1: % rows, 95 merged; records % hours % people % fp % unchanged',
    180, a_records, a_hours, a_people, a_fp;
end
$pkg$;

commit;
