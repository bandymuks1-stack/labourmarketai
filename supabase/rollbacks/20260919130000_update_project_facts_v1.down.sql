-- DOWN for 20260919130000_update_project_facts_v1
-- The migration created ONE function and changed no table, policy, grant or
-- row. Dropping the function restores the prior state exactly; rows already
-- updated through it keep their (audited) values — they are real facts a
-- manager wrote, not migration artefacts.

begin;

drop function if exists public.update_project_facts_v1(uuid, text, text, text, date, date);

commit;
