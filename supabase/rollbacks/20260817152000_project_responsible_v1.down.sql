-- ROLLBACK for 20260817152000_project_responsible_v1.sql
-- Drops the NEW RPC and the ONE new column.
--
-- REFUSES while any project names a responsible person: clearing a real
-- accountability decision is an owner data decision, never a rollback.

begin;

drop function if exists public.set_project_responsible_v1(text, text);

do $$
declare
  n bigint;
begin
  select count(*) into n from public.projects where responsible_profile_id is not null;
  if n > 0 then
    raise exception
      'project responsible rollback refused: % project(s) name a responsible person — forward-fix instead',
      n;
  end if;
end $$;

alter table public.projects drop column if exists responsible_profile_id;

commit;
