-- TIMESHEETS PROOF SEED — workers + journal facts for August 2026.
-- Builds on workflow-engine-v1.seed.sql actors (O1/O2, OWNER1/ADMIN1/MGR1/
-- MEMBER1/ENGREQ/OUT2/NOONE). Fixed uuids so the shell probes address them.

insert into public.workers (id, profile_id, display_name) values
  ('aaaa0001-0000-4000-8000-00000000000a', 'a5000000-0000-4000-8000-00000000000a', 'Engaged Worker'),   -- W1 = ENGREQ
  ('aaaa0002-0000-4000-8000-00000000000a', 'a4000000-0000-4000-8000-00000000000a', 'Member Worker'),    -- W2 = MEMBER1
  ('aaaa0003-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-00000000000a', 'Orphan Worker'),    -- W3 = NOONE (no org)
  ('aaaa0004-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-00000000000a', 'Wrong-org Worker')  -- W4 = OUT2 (O2 only)
on conflict do nothing;

insert into public.projects (id, title) values
  ('bbbb0001-0000-4000-8000-00000000000b', 'Hall renovation')
on conflict do nothing;

-- Journal entries of W1 (fixed created days; the derivation must place E1 on
-- its work_date metric day, not its created day).
insert into public.journal_entries (id, worker_id, project_id, original_text, created_at) values
  ('e0000001-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', 'bbbb0001-0000-4000-8000-00000000000b', 'Poured concrete', '2026-08-05T10:00:00Z'),
  ('e0000002-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Cleanup',            '2026-08-10T18:00:00Z'),
  ('e0000003-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Full site day',      '2026-08-12T18:00:00Z'),
  ('e0000004-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Deleted entry',      '2026-08-13T18:00:00Z'),
  ('e0000005-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Original (corrected)','2026-08-14T18:00:00Z'),
  ('e0000006-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Correction',         '2026-08-15T18:00:00Z'),
  ('e0000007-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Personal work',      '2026-08-16T18:00:00Z'),
  ('e0000008-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Rejected item host', '2026-08-17T18:00:00Z'),
  ('e0000009-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'Other org work',     '2026-08-18T18:00:00Z'),
  ('e0000010-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, 'July work',          '2026-07-10T18:00:00Z')
on conflict do nothing;

update public.journal_entries
   set deleted_at = '2026-08-13T19:00:00Z'
 where id = 'e0000004-0000-4000-8000-00000000000e';
update public.journal_entries
   set correction_of = 'e0000005-0000-4000-8000-00000000000e'
 where id = 'e0000006-0000-4000-8000-00000000000e';

-- E1 carries an explicit work_date: worked 2026-08-03, typed 2026-08-05.
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text) values
  ('e0000001-0000-4000-8000-00000000000e', 'work_date', '2026-08-03')
on conflict do nothing;

-- Work items (the ONLY hours truth the timesheet derives from).
insert into public.journal_entry_work_items
  (id, journal_entry_id, worker_id, organization_id, work_type_key, title, hours_numeric, unit, status) values
  -- counted: 8 h (on the work_date day 2026-08-03, with project title)
  ('c0000001-0000-4000-8000-00000000000c', 'e0000001-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', 'concrete_works', 'Poured concrete', 8, 'hours', 'confirmed'),
  -- counted: 90 min = 1.5 h
  ('c0000002-0000-4000-8000-00000000000c', 'e0000002-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Cleanup', 90, 'minutes', 'suggested'),
  -- counted separately: 1 day unit (never multiplied into hours)
  ('c0000003-0000-4000-8000-00000000000c', 'e0000003-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Full site day', 1, 'days', 'confirmed'),
  -- EXCLUDED: parent entry deleted
  ('c0000004-0000-4000-8000-00000000000c', 'e0000004-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Deleted host', 5, 'hours', 'confirmed'),
  -- EXCLUDED: original replaced by a live correction …
  ('c0000005-0000-4000-8000-00000000000c', 'e0000005-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Original hours', 4, 'hours', 'confirmed'),
  -- … counted: the correction's own 2 h
  ('c0000006-0000-4000-8000-00000000000c', 'e0000006-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Corrected hours', 2, 'hours', 'confirmed'),
  -- EXCLUDED: personal (no org)
  ('c0000007-0000-4000-8000-00000000000c', 'e0000007-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', null, null, 'Personal work', 3, 'hours', 'confirmed'),
  -- EXCLUDED: reviewer-rejected item
  ('c0000008-0000-4000-8000-00000000000c', 'e0000008-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'Rejected item', 6, 'hours', 'rejected'),
  -- EXCLUDED from an O1 timesheet: belongs to O2
  ('c0000009-0000-4000-8000-00000000000c', 'e0000009-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '02000000-0000-4000-8000-000000000002', null, 'Other org work', 7, 'hours', 'confirmed'),
  -- EXCLUDED: outside the August period
  ('c0000010-0000-4000-8000-00000000000c', 'e0000010-0000-4000-8000-00000000000e', 'aaaa0001-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', null, 'July work', 9, 'hours', 'confirmed')
on conflict do nothing;
