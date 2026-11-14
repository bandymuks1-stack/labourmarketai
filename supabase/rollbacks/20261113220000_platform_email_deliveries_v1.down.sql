-- Rollback for 20261113220000_platform_email_deliveries_v1.
--
-- REMOVES ONLY WHAT THAT MIGRATION CREATED, AND ONLY WHILE IT IS EMPTY.
--
-- 1. It REFUSES while there is anything to lose: a delivery record, or an
--    intake row that carries who/when. Those rows are the send history and
--    the operator audit trail; undoing the schema must never silently delete
--    them. To roll back a database that has them, export them first and empty
--    the table / null the two columns in a separate, owner-approved step.
--
-- 2. It revokes ONLY privileges on objects this migration created: the
--    delivery table and the two new intake columns. Nobody could have held
--    those before, so removing them restores the earlier state exactly.
--
-- 3. It does NOT touch the four grants the migration made on objects that
--    existed before it (three column-scoped SELECTs and one EXECUTE). The
--    rollback cannot know whether service_role already held one of them from
--    an earlier change, and revoking a grant this migration did not create
--    would break whatever relied on it (independent review, 2026-11-14).
--    They are column-scoped reads for a server-only role and are harmless
--    once the code is gone. To remove them as well, compare with the
--    privilege snapshot taken BEFORE the apply (query in the migration
--    header) and run, for each one that the snapshot shows was ABSENT:
--
--      revoke execute on function public.email_is_verified_v1(uuid, text) from service_role;
--      revoke select (organization_id, status) on public.customer_requests from service_role;
--      revoke select (full_name) on public.profiles from service_role;
--      revoke select (id, legal_name, display_name, country, owner_profile_id, legacy_company_id, organization_type)
--        on public.organizations from service_role;
--
-- Safe to run twice: every step tolerates an object that is already gone.

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.platform_email_deliveries_v1') is not null then
    if exists (select 1 from public.platform_email_deliveries_v1) then
      raise exception 'rollback refused: platform_email_deliveries_v1 contains delivery records';
    end if;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'company_need_public_intakes'
       and column_name = 'status_changed_at'
  ) then
    if exists (
      select 1 from public.company_need_public_intakes
       where status_changed_at is not null or status_changed_by is not null
    ) then
      raise exception 'rollback refused: company_need_public_intakes holds status-change records (who/when)';
    end if;
    revoke update (status_changed_at, status_changed_by) on public.company_need_public_intakes from service_role;
  end if;
end
$$;

alter table public.company_need_public_intakes drop column if exists status_changed_by;
alter table public.company_need_public_intakes drop column if exists status_changed_at;

drop table if exists public.platform_email_deliveries_v1;

commit;
