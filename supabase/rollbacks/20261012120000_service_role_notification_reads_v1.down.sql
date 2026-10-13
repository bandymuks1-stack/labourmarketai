-- Rollback for 20261012120000_service_role_notification_reads_v1.sql — removes
-- exactly what it granted. No data is touched.
begin;
revoke select on public.workflow_instances from service_role;
revoke select on public.workflow_instance_steps from service_role;
revoke select on public.workflow_instance_approvers from service_role;
revoke select on public.workflow_version_steps from service_role;
revoke select on public.document_acknowledgements from service_role;
revoke select on public.worker_documents from service_role;
revoke select on public.org_documents from service_role;
revoke select (id, email, locale) on public.profiles from service_role;
revoke update (status) on public.company_need_public_intakes from service_role;
revoke select on public.waitlist from service_role;
commit;
