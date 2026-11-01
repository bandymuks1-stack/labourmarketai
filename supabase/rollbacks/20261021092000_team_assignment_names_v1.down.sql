-- ROLLBACK for 20261021092000_team_assignment_names_v1.sql
-- The function is new (no earlier definition exists in the chain), so the
-- previous state is "absent": drop it. No data is touched. The app falls back
-- to its RLS read of `organizations` on 42883 / PGRST202, exactly as before.

begin;

drop function if exists public.list_team_assignment_names_v1(uuid[]);

commit;
