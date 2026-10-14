-- @human-gate-approved
--
-- SAFETY CLASS: RED (production data write: 165 correcting evidence records +
-- 165 `corrected` events + audit_logs). Draft PR + needs-human-gate; apply
-- ONLY via Supabase MCP apply_migration after the owner's SEPARATE approval of
-- this exact file (owner 2026-10-14: "Produkcijoje taikyti tik po atskiro
-- galutines migracijos patvirtinimo").
--
-- 20261014150000 — HISTORICAL DATE CORRECTION v1 (organization 19f47e78…,
-- source NL_2023_dokumentu_suvestine.xlsx).
--
-- WHY: the weekly timesheet files were copied from a template whose day
-- labels were never updated ("Maandag 27.03" sits in the files of weeks 13,
-- 14, 22, 25, 39, 41, 42 …). The import took the date from the label, so
-- dozens of different weeks piled onto 2023-03-27…04-01, 02-13…02-18 and
-- 01-16…01-20: 240 records on 35 person-days carry more than 16 h.
--
-- WHAT IS CORRECTED: ONLY the 165 records whose true date is unambiguous:
--   * the file's week number (…/41-week-timesheet.xlsx) EQUALS the week cell
--     on the sheet itself (source_fact.source_sheet_week);
--   * the weekday word of the label (Maandag … zaterdag) is stated;
--   * the week lies in the month folder the file sits in (Spalis = October);
--   * after the move the person's ISO-week hours EQUAL that person's weekly
--     total in the source workbook (sheet Darbuotojai_savaite) and no day
--     carries more than 16 h.
--   reconstructed date = the ISO date of (year, file week, weekday).
-- NOT corrected (left exactly as they are, listed in the date register):
--   12 probable (week total does not reconcile), 26 whose date already agrees
--   with their week, 37 unresolved (no sheet week / file and sheet week differ).
-- The earlier figure "242" could not be reproduced: every reading of the
-- register rule gives 240 records / 35 person-days (recorded, not forced).
--
-- HOW — the canonical, INSERT-only correction (doctrine 3.1; the same writer as
-- correctRecord, lib/organization-evidence/record-correction.ts):
--   * the ORIGINAL record is never edited or deleted: its date, source line,
--     derivation and hash stay as imported;
--   * ONE new record per original with `correction_of = original.id`, every
--     column copied, `activity_date` = the reconstructed date, and
--     `derived.workDate` = {value, method 'source_week_reconstruction',
--     confidence 0.95, note naming the original date and the evidence};
--   * its fingerprint and hash chain are computed exactly as buildCorrection
--     does (correctionFingerprint / chainHash, sha256), hash_prev = the
--     original's hash_self;
--   * ONE `corrected` event on the original naming its replacement;
--   * one audit_logs row per correction.
-- An EFFECTIVE reading counts only the leaf, so no hour is counted twice.
-- Hours, person, work object, work text, source line, session and supplier are
-- copied unchanged and asserted equal per pair.
--
-- SAFETY ASSERTIONS (any mismatch aborts the whole transaction):
--   * exactly 165 listed records; each exists in this organization, still has
--     the listed original date, has no correction and no `corrected` /
--     `withdrawn` event, and its own source line re-derives the listed date
--     (file week = sheet week, weekday, ISO date);
--   * the full-row md5 of every EXISTING record is identical before and after
--     (originals untouched);
--   * effective (not corrected) records, hours and people identical before and
--     after;
--   * 165 new records, 165 events; each pair equal in hours, person, object,
--     text, source line and session;
--   * no new record lands on a person-day above 16 h.
-- IDEMPOTENT: a second run finds its events and does nothing. An environment
-- without this organization (CI / clean reset) skips.
-- UNDO: supabase/rollbacks/20261014150000_historical_date_correction_v1.down.sql
-- (removes exactly these 165 corrections and their events while nothing builds
-- on them; the originals become effective again). Roll this back BEFORE the
-- #2358 package rollback, whose record checksum would otherwise differ.

begin;

do $fix$
declare
  v_org    constant uuid := '19f47e78-7bd1-4120-9937-603dba769f8a';
  v_rule   constant text := 'historical-date-reconstruction/v1 2026-10-14';
  v_at_iso constant text := '2026-10-14T15:00:00.000Z';
  v_at     constant timestamptz := '2026-10-14T15:00:00.000Z';
  b_all text; a_all text;
  b_n bigint; b_h numeric; b_p bigint;
  a_n bigint; a_h numeric; a_p bigint;
  n int;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    raise notice 'historical date correction v1: organization absent — skipped';
    return;
  end if;
  if exists (select 1 from public.organization_evidence_events
              where organization_id = v_org and event_type = 'corrected' and note like v_rule || '%') then
    raise notice 'historical date correction v1: already applied — nothing to do';
    return;
  end if;

  -- (record id, original date as imported, reconstructed date) — the reviewed list.
  create temp table dfix (id uuid primary key, orig date not null, recon date not null) on commit drop;
  insert into dfix (id, orig, recon) values
      ('016709b4-f085-4023-8dc8-4e54c6d1341c'::uuid, date '2023-03-30', date '2023-08-10'),
      ('0419bd82-837b-4abf-966f-bbbacb08b761'::uuid, date '2023-03-30', date '2023-05-11'),
      ('0709ee61-f87a-47b2-b4cd-722891451af2'::uuid, date '2023-03-28', date '2023-10-17'),
      ('076deded-fe7b-4e00-a5f7-4c295e0cc7b8'::uuid, date '2023-03-31', date '2023-06-16'),
      ('08bfa796-9d46-4938-9bcc-2c1a7e6d9354'::uuid, date '2023-02-18', date '2023-02-25'),
      ('0f38f8a2-acec-4019-97d6-ebae5dc87291'::uuid, date '2023-03-27', date '2023-10-23'),
      ('1061cb6d-7ffb-451b-807a-42005d744ed4'::uuid, date '2023-04-01', date '2023-04-08'),
      ('1246169d-7e7c-4a53-b185-2e6630d500ca'::uuid, date '2023-03-27', date '2023-05-22'),
      ('12cf76e0-69bf-4564-8bdb-ea97060c362b'::uuid, date '2023-03-31', date '2023-04-21'),
      ('1452dce3-ff15-40f2-857d-64ec79318077'::uuid, date '2023-03-27', date '2023-06-12'),
      ('157f53e0-73ce-4755-85ec-ab92ae68f261'::uuid, date '2023-03-30', date '2023-04-20'),
      ('17a8d535-1b42-42a1-8f63-2997aeef55fc'::uuid, date '2023-04-01', date '2023-07-08'),
      ('1eba61f2-6925-42e6-86d3-1da436b7398f'::uuid, date '2023-03-30', date '2023-07-27'),
      ('1f7485c8-03d5-4dea-81b6-333816d917e6'::uuid, date '2023-03-27', date '2023-07-31'),
      ('1fa15ad5-d856-46c0-8b10-a216186b2dbf'::uuid, date '2023-02-15', date '2023-03-22'),
      ('2240f119-fd34-40ed-8b34-9c0b46216367'::uuid, date '2023-03-28', date '2023-05-09'),
      ('234978ea-7f9a-4e0b-9b57-b44476597023'::uuid, date '2023-04-01', date '2023-04-15'),
      ('235aab17-eb34-460c-8ad8-07b1811cb5aa'::uuid, date '2023-03-29', date '2023-08-16'),
      ('25259a13-b8ad-47a3-ba55-0f5fae2747b0'::uuid, date '2023-03-31', date '2023-08-25'),
      ('29f2c402-c08e-4713-97e8-a86a5e4cd918'::uuid, date '2023-03-28', date '2023-06-13'),
      ('2b6d9261-60b0-4036-ad5d-7bde059b026b'::uuid, date '2023-02-14', date '2023-03-14'),
      ('2bbfe123-af09-4869-a126-c3f4401495f0'::uuid, date '2023-04-01', date '2023-05-13'),
      ('3076445a-13d5-4dd0-bf80-ae2d2f6ae236'::uuid, date '2023-03-29', date '2023-07-12'),
      ('326c4462-4251-4992-b3bd-4778f7c2a7b7'::uuid, date '2023-03-30', date '2023-04-06'),
      ('32c2e8c5-ba50-4142-a6e9-8f821071e99c'::uuid, date '2023-02-15', date '2023-03-08'),
      ('32c70625-58a9-4375-a033-2a5c14666ee8'::uuid, date '2023-04-01', date '2023-10-28'),
      ('349de2eb-4f15-4442-ac11-53cb7f99df1a'::uuid, date '2023-03-29', date '2023-06-07'),
      ('34d4c3d8-6d1a-4d29-ac67-d055943bf69d'::uuid, date '2023-02-13', date '2023-03-06'),
      ('35ca710e-6dc5-4428-b367-ce79f250597e'::uuid, date '2023-03-27', date '2023-07-03'),
      ('37f53f58-6472-4ab8-a87b-e4ed7faa3ee4'::uuid, date '2023-03-28', date '2023-06-06'),
      ('38982b17-87a1-4551-a1cb-f02b5ff85b78'::uuid, date '2023-04-01', date '2023-05-20'),
      ('39eb3990-5111-4456-ba21-6c67db3a9f0f'::uuid, date '2023-02-15', date '2023-03-01'),
      ('3dbba2ce-8245-4be7-ba21-e7487bb3746b'::uuid, date '2023-03-31', date '2023-05-19'),
      ('40482f12-2301-4f0c-ba82-ad766e003b25'::uuid, date '2023-02-14', date '2023-03-07'),
      ('41f2efe0-51c4-4cf1-a03d-f97454513cce'::uuid, date '2023-03-30', date '2023-06-15'),
      ('44825a8b-ceb8-43af-9b68-1aaca07f075e'::uuid, date '2023-04-01', date '2023-07-01'),
      ('463d39dd-74d9-44d4-ac80-40caef4acc69'::uuid, date '2023-03-31', date '2023-04-07'),
      ('47ab3b01-4d47-46c8-9cfe-c539381458b2'::uuid, date '2023-03-31', date '2023-05-05'),
      ('484f89b4-6841-4d36-8bf6-4eb73e14ed29'::uuid, date '2023-03-29', date '2023-08-09'),
      ('497dc313-6b00-4e05-a6f1-d14a46b43b7b'::uuid, date '2023-02-16', date '2023-03-09'),
      ('4d4abdbd-dd5e-405b-a8d6-e7dc5b1b974c'::uuid, date '2023-03-30', date '2023-08-24'),
      ('4f88f8ff-925f-4cbc-8777-0207cf01eb66'::uuid, date '2023-03-31', date '2023-05-12'),
      ('4fee1f6f-1b32-4c34-80e8-5290a47f27f2'::uuid, date '2023-02-13', date '2023-03-13'),
      ('504b0451-66a9-454f-9019-41f6a58f9741'::uuid, date '2023-04-01', date '2023-06-17'),
      ('51c99b7a-342e-43b1-886a-ac59c5a34c84'::uuid, date '2023-03-31', date '2023-06-02'),
      ('5365f110-2c5a-4078-9f5f-fd0f9f9f0bef'::uuid, date '2023-02-16', date '2023-03-16'),
      ('559ffc04-efef-4a5b-87d4-8291519e584d'::uuid, date '2023-03-29', date '2023-10-25'),
      ('56c9a6d4-5c2f-4c29-80e6-66da1054d005'::uuid, date '2023-03-30', date '2023-08-17'),
      ('5973fc4e-8914-4e0f-a537-9df99646cfd0'::uuid, date '2023-03-31', date '2023-07-07'),
      ('5a2fb1de-7485-4669-9381-38efe108cdf4'::uuid, date '2023-03-28', date '2023-07-04'),
      ('5a8e60c2-bdc3-4c11-8cf7-56cbe9e502d4'::uuid, date '2023-04-01', date '2023-04-22'),
      ('5aeb4d7b-42c1-49fd-801c-3d770853ea70'::uuid, date '2023-03-31', date '2023-06-09'),
      ('5ce39438-4440-4910-bec9-5501724b8980'::uuid, date '2023-03-28', date '2023-10-24'),
      ('606940cc-996f-438f-80ce-f0febff8372a'::uuid, date '2023-02-17', date '2023-03-03'),
      ('624a20e9-6b08-4e5b-9094-5d6c24164f24'::uuid, date '2023-03-31', date '2023-09-22'),
      ('62e9516e-ac30-4083-a0c7-271b79198d95'::uuid, date '2023-03-29', date '2023-07-05'),
      ('63488cdd-c1b6-406e-8246-2262401cd702'::uuid, date '2023-03-29', date '2023-04-12'),
      ('63a71cdb-904b-40ec-ba18-30ccfa4905a2'::uuid, date '2023-04-01', date '2023-07-22'),
      ('63d89873-6481-43bd-8f32-6fe0dad6d619'::uuid, date '2023-02-16', date '2023-02-23'),
      ('6447af97-ed70-42d6-93ac-8016c1de76e9'::uuid, date '2023-03-31', date '2023-08-11'),
      ('6495801a-bbbf-4926-aa17-6435f23dd2ab'::uuid, date '2023-03-29', date '2023-06-28'),
      ('65e9b814-ded8-4492-b40c-e7372b4a4952'::uuid, date '2023-04-01', date '2023-07-15'),
      ('667cdf2e-7394-411d-829a-762f6706225e'::uuid, date '2023-03-30', date '2023-06-01'),
      ('69572d28-3701-4e95-a444-7387374f62e6'::uuid, date '2023-03-31', date '2023-10-27'),
      ('699df8f7-0e0e-41f3-b84c-8798dbebdc75'::uuid, date '2023-03-27', date '2023-05-01'),
      ('6c0aec13-b81b-460e-bdfd-a66101c43df6'::uuid, date '2023-02-16', date '2023-03-23'),
      ('6d8cb640-d81b-4ef1-9c61-1845a2be132b'::uuid, date '2023-04-01', date '2023-05-06'),
      ('6ec08f31-5160-433e-a122-576c1566c9ac'::uuid, date '2023-03-31', date '2023-10-13'),
      ('6fbd2822-8c31-414c-95f7-c9483bdfc782'::uuid, date '2023-02-14', date '2023-02-28'),
      ('704262fe-4bf0-47fd-92a5-084125e13eb7'::uuid, date '2023-03-28', date '2023-08-22'),
      ('70d04591-46df-44c8-8566-35d01e97e403'::uuid, date '2023-03-28', date '2023-04-18'),
      ('71d94fdf-4fb5-45b6-9677-4e52178df8d8'::uuid, date '2023-03-29', date '2023-09-27'),
      ('72203c4a-4e76-4218-bb66-d39840fc5761'::uuid, date '2023-03-27', date '2023-04-17'),
      ('73af6d6f-df0c-47e2-927d-d015f23ab896'::uuid, date '2023-02-17', date '2023-03-10'),
      ('78bbbae8-634f-4253-b187-aaf158947549'::uuid, date '2023-03-30', date '2023-10-12'),
      ('78eb2cae-02ae-455b-9425-02b2c7538ffa'::uuid, date '2023-02-18', date '2023-03-25'),
      ('7975568d-6f74-477f-ab50-347ce9d70c20'::uuid, date '2023-03-27', date '2023-07-10'),
      ('79a38da2-dd47-4e31-a456-389394c84e83'::uuid, date '2023-02-13', date '2023-02-27'),
      ('7aa0577c-df15-482b-a452-c94a63e3452c'::uuid, date '2023-04-01', date '2023-10-14'),
      ('7bdd3037-2aac-4a78-9280-b6eecf4baa13'::uuid, date '2023-03-27', date '2023-08-21'),
      ('7ca7138a-9b58-4429-aec0-48591081c1ff'::uuid, date '2023-03-27', date '2023-04-03'),
      ('7cfa3a89-2081-4979-bdcc-49323b489ebe'::uuid, date '2023-03-28', date '2023-05-16'),
      ('82abaf94-1766-46a5-bf2a-8cf294b7756d'::uuid, date '2023-03-28', date '2023-05-02'),
      ('84a86e0f-f82a-4dec-894e-bb639f7a1993'::uuid, date '2023-03-27', date '2023-05-15'),
      ('89b3416c-1ce8-4629-9fed-aec87c838511'::uuid, date '2023-03-28', date '2023-09-26'),
      ('8faafdfc-1198-49ac-ba3b-f7db085ee1ba'::uuid, date '2023-04-01', date '2023-08-26'),
      ('91ebe3d2-d03d-47dd-95fb-51db22109881'::uuid, date '2023-04-01', date '2023-10-21'),
      ('925aaf51-8a1f-4028-9792-191ae314d907'::uuid, date '2023-04-01', date '2023-09-23'),
      ('92a3ba55-e890-4d1c-9f06-7e2174155c80'::uuid, date '2023-02-18', date '2023-03-11'),
      ('955e0721-e44a-438f-a169-eb8928ea3592'::uuid, date '2023-03-31', date '2023-08-18'),
      ('97910c8e-c8cf-4789-aabf-4fbe11dbd3c8'::uuid, date '2023-03-27', date '2023-06-19'),
      ('9988ca91-bcbd-42ed-ae48-f8d6344c044d'::uuid, date '2023-02-17', date '2023-02-24'),
      ('9b8582c4-ce01-4e79-86d5-e795bfed3637'::uuid, date '2023-03-27', date '2023-09-25'),
      ('9bf923a5-a674-48a3-b264-3e1f5945573e'::uuid, date '2023-03-29', date '2023-07-26'),
      ('9de60e0a-e60d-469b-a200-172a34a8a19b'::uuid, date '2023-03-28', date '2023-06-27'),
      ('9e593d3d-e61e-480a-aa9b-7dd10aa25194'::uuid, date '2023-03-31', date '2023-09-08'),
      ('9f22320d-3a93-4a5e-a7ed-a5bb73968b2d'::uuid, date '2023-03-30', date '2023-10-26'),
      ('a0acb7bc-877e-48a3-b63a-b6c9ab658859'::uuid, date '2023-03-30', date '2023-10-19'),
      ('a1606e88-f16d-4090-81f3-38fe2458cf36'::uuid, date '2023-02-17', date '2023-03-24'),
      ('a29aaf1f-bf02-4390-a62b-1b7982bcc9ec'::uuid, date '2023-03-28', date '2023-04-11'),
      ('a5ef5074-16ba-4063-bc51-52bf28d17b37'::uuid, date '2023-03-29', date '2023-10-11'),
      ('a619466d-1512-4c0c-a264-b9b28746b3e1'::uuid, date '2023-03-28', date '2023-08-15'),
      ('a80d41b6-27fb-4092-871e-588b7192a2e8'::uuid, date '2023-03-29', date '2023-05-03'),
      ('aa5265f0-52e0-41d1-91b1-713f33c0970a'::uuid, date '2023-03-29', date '2023-05-17'),
      ('ae03a8f3-11c0-4d44-8465-0864a88342f6'::uuid, date '2023-04-01', date '2023-06-03'),
      ('afc4bc0e-6902-4ad4-8a08-75d047001ff1'::uuid, date '2023-04-01', date '2023-09-09'),
      ('b123d514-7020-4877-8027-9a3203d5fae9'::uuid, date '2023-03-28', date '2023-05-30'),
      ('b2cade17-54c1-43eb-a299-b077cf9b2aa5'::uuid, date '2023-04-01', date '2023-09-30'),
      ('b3059fac-4eb4-4811-abc2-c1546621398f'::uuid, date '2023-03-30', date '2023-07-06'),
      ('b3ca31cc-236f-4874-93c3-78899e06ca79'::uuid, date '2023-03-31', date '2023-10-20'),
      ('b5790230-c3a6-44ad-b617-f0b48517211e'::uuid, date '2023-03-31', date '2023-07-21'),
      ('b63c16a6-8612-448a-8e7b-024c608b43a5'::uuid, date '2023-03-29', date '2023-08-23'),
      ('b66c2228-d4e9-4f3a-b589-702b1715fadc'::uuid, date '2023-02-18', date '2023-03-04'),
      ('b816014d-4fb5-42f5-8bcf-ca2af9ea5361'::uuid, date '2023-03-30', date '2023-06-08'),
      ('bb3dcaac-f6e8-47bf-8b86-c9eafca971be'::uuid, date '2023-03-28', date '2023-04-04'),
      ('c05038bf-e755-4a2f-b6df-7b0cdb8e5f9d'::uuid, date '2023-03-29', date '2023-04-19'),
      ('c1c7024d-5f4c-4011-a35a-dd9ccee9e6b2'::uuid, date '2023-03-29', date '2023-05-31'),
      ('c20b4258-ca59-49c6-a975-1c29b21316a5'::uuid, date '2023-03-27', date '2023-10-16'),
      ('c2b94999-d300-4b22-b0fe-c3e25bc51562'::uuid, date '2023-04-01', date '2023-08-19'),
      ('c5ebbe3a-069e-421b-a323-a48e04e2796f'::uuid, date '2023-02-13', date '2023-02-20'),
      ('c7dc3d5e-4fb4-47a8-9b63-d817706f8755'::uuid, date '2023-03-30', date '2023-06-29'),
      ('c80385dc-7df4-4d35-8d9f-9398c917734a'::uuid, date '2023-02-17', date '2023-03-17'),
      ('c882791f-a12d-43cf-96bb-186d8f1aa96b'::uuid, date '2023-03-30', date '2023-09-07'),
      ('c91c4634-b988-43d8-9ee5-47a60e5b1fb5'::uuid, date '2023-03-31', date '2023-04-14'),
      ('c9baa61d-d658-4610-82da-89045485a4ff'::uuid, date '2023-03-31', date '2023-09-29'),
      ('c9dc07fd-e57b-4265-ad2e-a79bc97e1422'::uuid, date '2023-03-30', date '2023-07-13'),
      ('ca3712a1-40db-4e76-a155-dc217162ae72'::uuid, date '2023-03-30', date '2023-09-28'),
      ('ca884478-f7f3-422f-900b-b0b783d06fe3'::uuid, date '2023-02-16', date '2023-03-02'),
      ('cb571d01-f837-4f2e-84e3-b296c76ff583'::uuid, date '2023-03-29', date '2023-08-02'),
      ('cb764623-722a-49d2-8047-2fc38d4acf6b'::uuid, date '2023-03-28', date '2023-08-08'),
      ('cc61907b-58a8-4631-96c8-966aa5cfcc58'::uuid, date '2023-04-01', date '2023-06-10'),
      ('ce4ccc00-83b0-4d6c-bf4e-5fef3a930823'::uuid, date '2023-03-27', date '2023-05-08'),
      ('cf8aa9ed-7ded-4a4c-8df7-1684de012a1b'::uuid, date '2023-03-30', date '2023-05-04'),
      ('d47b6fc9-645d-41f5-9c15-830e8bf72542'::uuid, date '2023-03-28', date '2023-07-11'),
      ('d590c07f-b1a1-45c0-902a-07e86952e3aa'::uuid, date '2023-03-27', date '2023-07-17'),
      ('d76c4261-ba3a-4769-9f95-38e3e06eda5d'::uuid, date '2023-03-27', date '2023-07-24'),
      ('d770bc7e-d6f0-4116-a6c5-f387d60a941d'::uuid, date '2023-03-29', date '2023-04-05'),
      ('d80fb887-367a-44e1-bb7c-5877685acc0a'::uuid, date '2023-02-13', date '2023-03-20'),
      ('d9d6f491-1972-4ca4-8fd7-d7748bfdfb5d'::uuid, date '2023-03-30', date '2023-08-03'),
      ('dcf11dd9-bab5-47a6-8642-50442dd419c8'::uuid, date '2023-03-30', date '2023-05-18'),
      ('de384437-f57a-4d93-977f-8bd384a91d4d'::uuid, date '2023-03-29', date '2023-07-19'),
      ('dec4c2fd-f758-4f53-84a9-f26149f7e3d1'::uuid, date '2023-03-30', date '2023-09-21'),
      ('e05a1474-641b-4ac3-8510-b7a565b678ec'::uuid, date '2023-02-14', date '2023-02-21'),
      ('e0d70097-cac4-4b98-b372-850d61bb4fb8'::uuid, date '2023-03-30', date '2023-04-13'),
      ('e3070815-76e9-40e9-ae1f-3696707f34a8'::uuid, date '2023-03-31', date '2023-07-14'),
      ('e8525c4a-4e5e-4b80-b66f-f24daceb6869'::uuid, date '2023-03-28', date '2023-06-20'),
      ('e8c3ee1b-3af5-4b3a-86cb-113fec7e174c'::uuid, date '2023-03-28', date '2023-07-18'),
      ('e8c9a60a-0b45-456e-8b36-f4aed848aba6'::uuid, date '2023-03-31', date '2023-06-30'),
      ('e98a09c7-78ec-4cc0-8229-73564ebb98a0'::uuid, date '2023-03-28', date '2023-07-25'),
      ('e9d8b8ca-f498-4e23-9617-69350ee20c47'::uuid, date '2023-03-27', date '2023-10-09'),
      ('eb7fa473-ee9e-48e5-aeeb-e315797d8d2b'::uuid, date '2023-03-28', date '2023-10-10'),
      ('eca8b717-6e1c-4ba6-aff4-3c1e57f11124'::uuid, date '2023-02-15', date '2023-03-15'),
      ('ee301c3b-1e7c-44fd-ab71-f2e92da11e65'::uuid, date '2023-03-29', date '2023-10-18'),
      ('f5b7a3f2-976f-43cb-9b89-d902fca567a4'::uuid, date '2023-03-27', date '2023-05-29'),
      ('f67a368f-f872-4473-827c-01e5fd37fd05'::uuid, date '2023-02-18', date '2023-03-18'),
      ('f6fb477a-3020-4619-b138-e76d863211f8'::uuid, date '2023-04-01', date '2023-08-12'),
      ('f758730a-9f16-4e05-b98d-2ed47c12315a'::uuid, date '2023-02-14', date '2023-03-21'),
      ('f7649446-55cb-428f-8cda-179679ea62e9'::uuid, date '2023-03-27', date '2023-06-05'),
      ('f83779a9-2462-4c5c-830e-62c3fcc792ff'::uuid, date '2023-03-29', date '2023-06-14'),
      ('f85cb844-7a47-4422-96f0-824de8abe8e3'::uuid, date '2023-03-27', date '2023-06-26'),
      ('f8d0f323-608f-40c2-9e7c-c7257fdaf223'::uuid, date '2023-03-31', date '2023-07-28'),
      ('f9bba3fb-ed25-4cd0-bea9-ec7c3712e81c'::uuid, date '2023-02-15', date '2023-02-22'),
      ('fae756ed-10f7-4445-959e-e6d133c26933'::uuid, date '2023-03-30', date '2023-07-20'),
      ('fde34f56-78c9-4501-afb9-317ee03bc955'::uuid, date '2023-03-28', date '2023-08-01'),
      ('ff2848f6-7661-40f1-9478-312b2c87930d'::uuid, date '2023-03-28', date '2023-05-23');
  select count(*) into n from dfix;
  if n <> 165 then raise exception 'date correction v1: expected 165 listed records, found %', n; end if;

  -- ── every listed record, re-checked against its own source line ───────
  create temp table dsrc on commit drop as
  select f.id, f.orig, f.recon, r.activity_date, r.hash_self,
         (regexp_match(r.source_fact->>'source_file', '(\d+)-week'))[1]::int as file_week,
         nullif(r.source_fact->>'source_sheet_week', '')::int as sheet_week,
         nullif(r.source_fact->>'year', '')::int as yr,
         case lower(split_part(btrim(r.source_fact->>'day'), ' ', 1))
           when 'maandag' then 1 when 'dinsdag' then 2 when 'woensdag' then 3 when 'donderdag' then 4
           when 'vrijdag' then 5 when 'zaterdag' then 6 when 'zondag' then 7 end as dow
    from dfix f
    join public.organization_evidence_records r on r.id = f.id and r.organization_id = v_org;
  select count(*) into n from dsrc;
  if n <> 165 then raise exception 'date correction v1: % of 165 listed records found in the organization', n; end if;

  select count(*) into n from dsrc where activity_date is distinct from orig;
  if n <> 0 then raise exception 'date correction v1: % records no longer carry their listed original date', n; end if;

  select count(*) into n from dsrc d
   where d.file_week is null or d.sheet_week is null or d.file_week <> d.sheet_week or d.dow is null or d.yr is null
      or to_date(d.yr || '-' || lpad(d.file_week::text, 2, '0') || '-' || d.dow, 'IYYY-IW-ID') <> d.recon;
  if n <> 0 then raise exception 'date correction v1: % records do not re-derive their listed date from their own source line', n; end if;

  select count(*) into n from public.organization_evidence_records c join dfix f on c.correction_of = f.id;
  if n <> 0 then raise exception 'date correction v1: % listed records are already corrected', n; end if;
  select count(*) into n from public.organization_evidence_events e join dfix f on e.record_id = f.id
   where e.event_type in ('corrected', 'withdrawn');
  if n <> 0 then raise exception 'date correction v1: % listed records carry a corrected/withdrawn event', n; end if;

  -- ── checksums BEFORE ──────────────────────────────────────────────────
  select md5(string_agg(to_jsonb(r)::text, ',' order by r.id)) into b_all
    from public.organization_evidence_records r where r.organization_id = v_org;
  select count(*), coalesce(sum(r.hours), 0), count(distinct r.organization_person_id)
    into b_n, b_h, b_p
    from public.organization_evidence_records r
   where r.organization_id = v_org
     and not exists (select 1 from public.organization_evidence_events e where e.record_id = r.id and e.event_type = 'corrected');

  -- ── the corrections: exactly what buildCorrection writes ───────────────
  create temp table dnew on commit drop as
  select d.id as original_id, d.recon, d.hash_self as prev_hash,
         'was ' || d.orig::text || ' (template day label reused across weeks); file week '
           || d.file_week || ' = sheet week ' || d.sheet_week || '; weekday ' || d.dow
           || '; person week total equals the source workbook' as note,
         null::text as fp, null::text as hash_self
    from dsrc d;
  -- correctionFingerprint(id, {derivedPatch, overrides}) = fingerprintPayload('correction:<id>', …)
  --   = sha256('work-history-source:v1:correction:<id>:' || canonicalJson(…)), keys sorted at every depth.
  update dnew set fp = encode(sha256(convert_to(
    'work-history-source:v1:correction:' || original_id::text || ':'
    || '{"derivedPatch":{"workDate":{"confidence":0.95,"method":"source_week_reconstruction","note":'
    || to_json(note)::text || ',"value":"' || recon::text || '"}},"overrides":{"activityDate":"' || recon::text || '"}}',
    'UTF8')), 'hex');
  -- chainHash(prev, fp, atIso) = sha256('work-history-chain:v1:<prev>:<fp>:<atIso>')
  update dnew set hash_self = encode(sha256(convert_to(
    'work-history-chain:v1:' || coalesce(prev_hash, '') || ':' || fp || ':' || v_at_iso, 'UTF8')), 'hex');

  select count(*) into n from public.organization_evidence_records r join dnew x on r.record_fingerprint = x.fp
   where r.organization_id = v_org;
  if n <> 0 then raise exception 'date correction v1: % fingerprints already exist', n; end if;

  insert into public.organization_evidence_records (
    organization_id, organization_person_id, activity_kind, outcome_kind, context_label, work_object_id,
    education_program_id, education_cohort_id, activity_date, period_start, period_end, hours,
    original_text, original_language, evidence_state, supplied_by_organization_id, supplier_role,
    supplied_by_profile_id, session_id, import_row_id, source_kind, source_filename, source_reference,
    source_fact, confidence, credential_reference, credential_valid_from, credential_valid_until,
    project_id, source_row_index, row_origin,
    derived, imported_by_profile_id, imported_at, record_fingerprint, hash_prev, hash_self, correction_of)
  select r.organization_id, r.organization_person_id, r.activity_kind, r.outcome_kind, r.context_label, r.work_object_id,
         r.education_program_id, r.education_cohort_id, x.recon, r.period_start, r.period_end, r.hours,
         r.original_text, r.original_language, r.evidence_state, r.supplied_by_organization_id, r.supplier_role,
         r.supplied_by_profile_id, r.session_id, r.import_row_id, r.source_kind, r.source_filename, r.source_reference,
         r.source_fact, r.confidence, r.credential_reference, r.credential_valid_from, r.credential_valid_until,
         r.project_id, r.source_row_index, r.row_origin,
         r.derived || jsonb_build_object('workDate', jsonb_build_object(
           'value', x.recon::text, 'method', 'source_week_reconstruction', 'confidence', 0.95, 'note', x.note)),
         null, v_at, x.fp, x.prev_hash, x.hash_self, r.id
    from dnew x join public.organization_evidence_records r on r.id = x.original_id;
  get diagnostics n = row_count; if n <> 165 then raise exception 'date correction v1: inserted % corrections, expected 165', n; end if;

  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_role, actor_organization_id, actor_profile_id, replacement_record_id, note)
  select v_org, c.correction_of, 'corrected', null, null, null, c.id,
         v_rule || ': date ' || f.orig::text || ' -> ' || c.activity_date::text || ' (owner decision 2026-10-14)'
    from public.organization_evidence_records c
    join dfix f on f.id = c.correction_of;
  get diagnostics n = row_count; if n <> 165 then raise exception 'date correction v1: wrote % events, expected 165', n; end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  select null, 'historical_date_correction_v1', 'organization_evidence_record', c.correction_of,
         jsonb_build_object('replacement_record_id', c.id, 'before', jsonb_build_object('activity_date', f.orig),
                            'after', jsonb_build_object('activity_date', c.activity_date), 'rule_version', v_rule),
         now()
    from public.organization_evidence_records c join dfix f on f.id = c.correction_of;

  -- ── checksums AFTER ───────────────────────────────────────────────────
  -- every record that existed before: byte-identical
  select md5(string_agg(to_jsonb(r)::text, ',' order by r.id)) into a_all
    from public.organization_evidence_records r
   where r.organization_id = v_org
     and (r.correction_of is null or r.correction_of not in (select id from dfix));
  if a_all is distinct from b_all then raise exception 'date correction v1: an existing record changed'; end if;

  select count(*), coalesce(sum(r.hours), 0), count(distinct r.organization_person_id)
    into a_n, a_h, a_p
    from public.organization_evidence_records r
   where r.organization_id = v_org
     and not exists (select 1 from public.organization_evidence_events e where e.record_id = r.id and e.event_type = 'corrected');
  if (a_n, a_h, a_p) is distinct from (b_n, b_h, b_p) then
    raise exception 'date correction v1: effective totals changed (records %/% hours %/% people %/%)', b_n, a_n, b_h, a_h, b_p, a_p;
  end if;

  select count(*) into n
    from public.organization_evidence_records c join public.organization_evidence_records o on o.id = c.correction_of
   where c.correction_of in (select id from dfix)
     and (c.hours is distinct from o.hours or c.organization_person_id is distinct from o.organization_person_id
          or c.work_object_id is distinct from o.work_object_id or c.original_text is distinct from o.original_text
          or c.source_fact is distinct from o.source_fact or c.session_id is distinct from o.session_id);
  if n <> 0 then raise exception 'date correction v1: % corrections differ from their original beyond the date', n; end if;

  select count(*) into n from (
    select r.organization_person_id, r.activity_date
      from public.organization_evidence_records r
     where r.organization_id = v_org and r.activity_date is not null
       and not exists (select 1 from public.organization_evidence_events e where e.record_id = r.id and e.event_type = 'corrected')
     group by 1, 2
    having sum(r.hours) > 16 and bool_or(coalesce(r.correction_of in (select id from dfix), false))) x;
  if n <> 0 then raise exception 'date correction v1: % person-days above 16 h include a corrected record', n; end if;

  raise notice 'historical date correction v1: 165 corrected; effective records % hours % people % unchanged', a_n, a_h, a_p;
end
$fix$;

commit;
