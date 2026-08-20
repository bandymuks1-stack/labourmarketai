-- Seed: one worker, one org, one period, five entries covering every
-- attribution case plus the rule-A/rule-B selection the migration must not
-- disturb.

-- TWO organizations. Org A owns the timesheet under test; org B exists only
-- so the cross-organization disclosure case can be proven closed.
insert into public.organizations (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.projects (id, organization_id, title) values
  ('99999999-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kabelių trasa'),
  ('99999999-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Kito kliento objektas');
-- An org-A object, so the SECOND org spine (object -> org) is exercised too.
insert into public.work_objects (id, organization_id) values
  ('0b1e0000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.engagement_contexts (id, organization_id)
  values ('ecec1111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.workers (id) values ('aaaa1111-0000-0000-0000-000000000001');

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

-- E1  exactly ONE live link            -> attributed
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

-- Work day for every entry, inside the queried period.
insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, source)
select id, 'work_date', '2026-08-10', 'worker_input' from public.journal_entries;

-- E1..E4: a single entry-level duration of 8 hours each (rule B).
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

-- E6  ONE live link, but to a task owned by ORG B -> must NOT be attributed
--     on org A's timesheet, and org B's task title must not appear anywhere.
--     The hours must still count in full: the worker did work those hours.
-- E7  ONE live link to a task with NO organization spine at all -> the same.
insert into public.journal_entry_tasks (entry_id, task_id) values
 ('e0000006-0000-0000-0000-000000000006','7a5c0000-0000-0000-0000-000000000004'),
 ('e0000007-0000-0000-0000-000000000007','7a5c0000-0000-0000-0000-000000000005');
