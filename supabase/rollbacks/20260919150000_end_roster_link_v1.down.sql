-- DOWN for 20260919150000_end_roster_link_v1
-- The migration created ONE function and changed no table, policy, grant or
-- row. Dropping it restores the prior state; links already ended through it
-- stay ended — they are real, audited decisions by the worker or the owner.

begin;

drop function if exists public.end_roster_link_v1(text, uuid, uuid, text);

commit;
