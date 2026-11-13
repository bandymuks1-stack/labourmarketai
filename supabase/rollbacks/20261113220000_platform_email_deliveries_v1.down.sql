-- Rollback for 20261113220000_platform_email_deliveries_v1.
--
-- Removes ONLY what that migration added. The delivery record holds no
-- personal data and no business fact: dropping it loses the send history
-- (which e-mail events were sent / failed), nothing else. The two intake
-- columns hold who last changed a status and when; `status` itself is kept.
--
-- To keep the history, export these first:
--   select count(*) from public.platform_email_deliveries_v1;
--   select count(*) from public.company_need_public_intakes where status_changed_at is not null;

--
-- The three column-scoped SELECT grants and the EXECUTE grant are revoked too. If
-- any of them had been granted to service_role by another change before this migration was
-- applied, re-grant it after the rollback (check information_schema.column_privileges
-- BEFORE applying the migration and keep the output with the apply record).

begin;

revoke execute on function public.email_is_verified_v1(uuid, text) from service_role;
revoke select (organization_id, status) on public.customer_requests from service_role;
revoke select (full_name) on public.profiles from service_role;
revoke select (id, legal_name, display_name, country, owner_profile_id, legacy_company_id, organization_type)
  on public.organizations from service_role;

revoke update (status_changed_at, status_changed_by) on public.company_need_public_intakes from service_role;
alter table public.company_need_public_intakes drop column if exists status_changed_by;
alter table public.company_need_public_intakes drop column if exists status_changed_at;

revoke all on table public.platform_email_deliveries_v1 from service_role;
drop table if exists public.platform_email_deliveries_v1;

commit;
