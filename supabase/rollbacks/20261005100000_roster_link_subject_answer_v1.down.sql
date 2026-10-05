-- ROLLBACK of 20261005100000_roster_link_subject_answer_v1.
-- Drops the subject's refuse / withdraw door. Rows already answered stay answered
-- (the function only ever wrote link_state = 'unlinked').
begin;
drop function if exists public.respond_to_roster_link_v1(uuid, text);
commit;
