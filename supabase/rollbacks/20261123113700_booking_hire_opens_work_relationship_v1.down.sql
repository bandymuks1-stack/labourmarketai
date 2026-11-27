-- Rollback for 20261123113700_booking_hire_opens_work_relationship_v1.
-- REFUSES once any hire has opened or reused a relationship: those are work
-- relationships people now record their days against (business records);
-- forward-fix instead. Otherwise drops the two triggers and their functions. No existing function, policy or grant was changed.
-- Apply via Supabase MCP apply_migration.

begin;

-- Serialize the history check with every hire INSERT/status UPDATE before
-- deciding that the triggers have never been used. A concurrent hire commits
-- first; the following READ COMMITTED check then refuses this rollback.
lock table public.company_worker_engagements in access exclusive mode;

do $$
begin
  if exists (select 1 from public.audit_logs
              where action in ('booking_hire_relationship_opened', 'booking_hire_relationship_reused')) then
    raise exception 'hires already opened work relationships - forward-fix, do not roll back';
  end if;
end $$;

drop trigger if exists booking_hire_closes_relationship on public.company_worker_engagements;
drop trigger if exists booking_hire_opens_relationship on public.company_worker_engagements;
drop function if exists public.booking_hire_close_relationship_v1();
drop function if exists public.booking_hire_open_relationship_v1();

commit;
