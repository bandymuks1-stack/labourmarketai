-- Seed for the M3 compute-wiring proof.
--
-- The JOURNAL half is the timesheet-task-attribution seed unchanged (worker
-- W1, org A, entries E1..E7 covering every attribution case) — because the
-- decisive claim is that the new body leaves that half's arithmetic alone.
-- On top of it:
--   * W2 — a control worker with journal entries and ZERO allocations, whose
--     'lines' output must stay byte-identical across the two bodies;
--   * W3 — a cap worker: 520 allocations + 1 journal entry, proving the
--     500-line cap applies ACROSS both sources;
--   * allocations AL1..AL8 for W1 covering: plain, object/project titles,
--     journal-linked (the dedupe case), superseded, corrected, rejected,
--     cross-tenant, and the cross-org OBJECT title defence.

-- TWO organizations. Org A owns the timesheet under test; org B exists only
-- so the cross-organization cases can be proven closed.
insert into public.organizations (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.projects (id, organization_id, title) values
  ('99999999-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kabelių trasa'),
  ('99999999-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Kito kliento objektas');
-- An org-A object, so the SECOND org spine (object -> org) is exercised too.
insert into public.work_objects (id, organization_id, name) values
  ('0b1e0000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Spine object');
insert into public.engagement_contexts (id, organization_id) values
  ('ecec1111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001'),
  ('ecec2222-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workers (id) values
  ('aaaa1111-0000-0000-0000-000000000001'),
  ('aaaa2222-0000-0000-0000-000000000002'),
  ('aaaa3333-0000-0000-0000-000000000003');
insert into public.profiles (id) values
  ('bbbb1111-0000-4000-8000-000000000001');

insert into public.work_tasks (id, title, project_id, object_id) values
  -- Org A via the PROJECT spine.
  ('7a5c0000-0000-0000-0000-000000000001','Install cable run, floor 3','99999999-0000-0000-0000-000000000001',null),
  ('7a5c0000-0000-0000-0000-000000000002','Second task','99999999-0000-0000-0000-000000000001',null),
  -- Org A via the OBJECT spine, with no project at all.
  ('7a5c0000-0000-0000-0000-000000000003','Third task',null,'0b1e0000-0000-0000-0000-000000000001'),
  -- Org B. A worker could legitimately be its assignee; its title must NEVER
  -- reach org A's timesheet.
  ('7a5c0000-0000-0000-0000-000000000004','ORG B SECRET TASK TITLE','99999999-0000-0000-0000-000000000002',null),
  -- No organization at all: belongs to nobody, claimable by nobody.
  ('7a5c0000-0000-0000-0000-000000000005','Orphan personal task',null,null);

-- E1  exactly ONE live link            -> attributed (and later: DEDUPED away
--     by allocation AL3, which references it)
-- E2  TWO live links                   -> NOT attributed, hours unchanged
-- E3  ZERO links                       -> not attributed
-- E4  one link, WITHDRAWN              -> treated as zero
-- E5  one live link + BOTH rule A and rule B metrics -> fragments win,
--     conflict reported, and the single attribution still applies
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, project_id)
values
 ('e0000001-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Vienas darbas','99999999-0000-0000-0000-000000000001'),
 ('e0000002-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Du darbai',null),
 ('e0000003-0000-0000-0000-000000000003','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Be uzduoties',null),
 ('e0000004-0000-0000-0000-000000000004','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Atsietas',null),
 ('e0000005-0000-0000-0000-000000000005','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Fragmentai ir kiekis',null),
 ('e0000006-0000-0000-0000-000000000006','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Kito org uzduotis',null),
 ('e0000007-0000-0000-0000-000000000007','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Nieciukui priklausanti uzduotis',null);

-- Work day for every W1 entry, inside the queried period.
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, source)
select id, 'work_date', '2026-08-10', 'worker_input'
  from public.journal_entries
 where worker_id = 'aaaa1111-0000-0000-0000-000000000001';

-- E1..E4, E6, E7: a single entry-level duration of 8 hours each (rule B).
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, source)
select id, 'quantity', 8, 'hours', 'worker_input'
  from public.journal_entries
 where id in ('e0000001-0000-0000-0000-000000000001','e0000002-0000-0000-0000-000000000002',
              'e0000003-0000-0000-0000-000000000003','e0000004-0000-0000-0000-000000000004',
              'e0000006-0000-0000-0000-000000000006','e0000007-0000-0000-0000-000000000007');

-- E5: TWO fragment durations (2h + 3h) AND an entry-level 9h that must be
-- ignored and reported as a conflict (rule A wins).
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, value_text, unit_slug, source) values
 ('e0000005-0000-0000-0000-000000000005','fragment_time', 2, '1', 'hours', 'worker_input'),
 ('e0000005-0000-0000-0000-000000000005','fragment_time', 3, '2', 'hours', 'worker_input');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, source) values
 ('e0000005-0000-0000-0000-000000000005','quantity', 9, 'hours', 'worker_input');

-- Links.
insert into public.journal_entry_tasks (entry_id, task_id) values
 ('e0000001-0000-0000-0000-000000000001','7a5c0000-0000-0000-0000-000000000001'),
 ('e0000002-0000-0000-0000-000000000002','7a5c0000-0000-0000-0000-000000000001'),
 ('e0000002-0000-0000-0000-000000000002','7a5c0000-0000-0000-0000-000000000002'),
 ('e0000005-0000-0000-0000-000000000005','7a5c0000-0000-0000-0000-000000000003');
-- E4's link exists but was WITHDRAWN — it must count as no link at all.
insert into public.journal_entry_tasks (entry_id, task_id, unlinked_at, unlink_reason)
 values ('e0000004-0000-0000-0000-000000000004','7a5c0000-0000-0000-0000-000000000001', now(), 'wrong task');
-- E6/E7: live links to an ORG-B task and to an orphan task (tenant defence).
insert into public.journal_entry_tasks (entry_id, task_id) values
 ('e0000006-0000-0000-0000-000000000006','7a5c0000-0000-0000-0000-000000000004'),
 ('e0000007-0000-0000-0000-000000000007','7a5c0000-0000-0000-0000-000000000005');

-- ── W2: the NO-LOSS CONTROL — journal only, ZERO allocations ────────────────
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text)
values ('e0000008-0000-0000-0000-000000000008','aaaa2222-0000-0000-0000-000000000002','ecec2222-0000-0000-0000-000000000002','Kontrolinis darbas');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, source)
 values ('e0000008-0000-0000-0000-000000000008','work_date','2026-08-12','worker_input');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, source)
 values ('e0000008-0000-0000-0000-000000000008','quantity', 8, 'hours', 'worker_input');

-- ── Objects the allocations point at ────────────────────────────────────────
insert into public.work_objects (id, organization_id, project_id, name) values
  -- Org A, no project: title falls back to the object name when note is null.
  ('0b1e0000-0000-4000-8000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',null,'Object 01'),
  -- Org A, WITH a project: projectId/projectTitle must travel.
  ('0b1e0000-0000-4000-8000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','Object 05'),
  -- Org B: its NAME must never reach org A's sheet (SECDEF defence).
  ('0b1e0000-0000-4000-8000-00000000000c','bbbbbbbb-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000002','ORG B SECRET OBJECT');

-- ── W1's allocations ────────────────────────────────────────────────────────
-- AL1  plain fact, multi-line note -> title = first line of the note
-- AL2  note NULL -> title = object name; project travels via the object
-- AL3  LINKED to E1 (which carries its own 8h quantity) -> THE DEDUPE CASE:
--      E1's journal line must disappear, AL3's 5h must count exactly once
-- AL4  superseded by AL5 -> excluded
-- AL5  the correction of AL4 (status approved) -> counts
-- AL6  rejected -> excluded
-- AL7  ORG B's allocation for the same worker -> never on org A's sheet
-- AL8  org-A allocation pointing at an ORG-B OBJECT -> hours count, but the
--      foreign object's NAME is withheld (title '', objectTitle null)
insert into public.work_hour_allocations
  (id, organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, note, source, status, journal_entry_id) values
 ('a1100001-0000-4000-8000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-11','0b1e0000-0000-4000-8000-00000000000a',8.00,E'Kabelių tiesimas\nantra eilutė','manual','recorded',null),
 ('a1100002-0000-4000-8000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-11','0b1e0000-0000-4000-8000-00000000000b',2.00,null,'import','submitted',null),
 ('a1100003-0000-4000-8000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-10','0b1e0000-0000-4000-8000-00000000000a',5.00,'Vienas darbas (alokacija)','manual','recorded','e0000001-0000-0000-0000-000000000001'),
 ('a1100004-0000-4000-8000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-13','0b1e0000-0000-4000-8000-00000000000a',6.00,'Klaidingas','manual','recorded',null),
 ('a1100005-0000-4000-8000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-13','0b1e0000-0000-4000-8000-00000000000a',4.00,'Pataisytas','manual','approved',null),
 ('a1100006-0000-4000-8000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-14','0b1e0000-0000-4000-8000-00000000000a',3.00,'Atmestas','manual','rejected',null),
 ('a1100007-0000-4000-8000-000000000007','bbbbbbbb-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-15','0b1e0000-0000-4000-8000-00000000000c',9.00,'Kito nuomotojo valandos','manual','recorded',null),
 ('a1100008-0000-4000-8000-000000000008','aaaaaaaa-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','bbbb1111-0000-4000-8000-000000000001','2026-08-16','0b1e0000-0000-4000-8000-00000000000c',7.00,null,'manual','recorded',null);
-- Close the AL4 -> AL5 supersession (both rows exist, only AL5 counts).
update public.work_hour_allocations
   set superseded_by = 'a1100005-0000-4000-8000-000000000005',
       correction_of = null
 where id = 'a1100004-0000-4000-8000-000000000004';
update public.work_hour_allocations
   set correction_of = 'a1100004-0000-4000-8000-000000000004'
 where id = 'a1100005-0000-4000-8000-000000000005';

-- ── W3: the CAP worker — 520 allocations + 1 journal entry ──────────────────
-- The journal entry lands on 2026-08-01 (the earliest day, so it survives the
-- cap deterministically); the 520 allocations spread over 08-02..08-21
-- (26/day). Combined = 521 candidate lines -> exactly 500 must survive.
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text)
values ('e0000009-0000-0000-0000-000000000009','aaaa3333-0000-0000-0000-000000000003','ecec1111-0000-0000-0000-000000000001','Cap kontrolinis');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, source)
 values ('e0000009-0000-0000-0000-000000000009','work_date','2026-08-01','worker_input');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, source)
 values ('e0000009-0000-0000-0000-000000000009','quantity', 8, 'hours', 'worker_input');
insert into public.work_hour_allocations
  (organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, source)
select 'aaaaaaaa-0000-0000-0000-000000000001',
       'aaaa3333-0000-0000-0000-000000000003',
       'bbbb1111-0000-4000-8000-000000000001',
       date '2026-08-01' + ((g - 1) / 26 + 1),
       '0b1e0000-0000-4000-8000-00000000000a',
       1.00,
       'import'
  from generate_series(1, 520) g;
