-- @human-gate-approved  (owner-approved 2026-10-12 in chat; APPLIED)
-- service_role_notification_reads_v1 — the exact reads the server-side
-- notification and intake code already performs, granted to service_role
-- (production audit 2026-10-12).
--
-- WHY. In production service_role holds almost no table privilege (least
-- privilege). Every one of the reads below was written against the
-- service-role client and has answered 42501 in production since it shipped,
-- SILENTLY:
--   * workflow_* — approvers never got "step pending", requesters never got
--     "decided", delegates never got "delegated" (lib/notifications/event-emitters.ts);
--   * document_acknowledgements / worker_documents / org_documents — no
--     "please acknowledge", "acknowledged" or "document expiring" notification;
--   * profiles(email, locale) — every notification e-mail would resolve to
--     no_recipient_email the moment a mail provider is configured
--     (lib/notifications/email-dispatch.ts);
--   * company_need_public_intakes(status) UPDATE — claiming a public intake
--     never marked it converted, so it could be claimed again, and the
--     operator could not change an intake's status;
--   * waitlist SELECT — the operator's waitlist section showed needs_admin_read.
--
-- WHAT. Column-scoped where a person's data is involved (profiles: email and
-- locale only; intakes: status only). No RLS policy, no anon/authenticated
-- grant, no SECURITY DEFINER. service_role is server-only by construction.
--
-- -- ROLLBACK
-- supabase/rollbacks/20261012120000_service_role_notification_reads_v1.down.sql

begin;

grant select on public.workflow_instances to service_role;
grant select on public.workflow_instance_steps to service_role;
grant select on public.workflow_instance_approvers to service_role;
grant select on public.workflow_version_steps to service_role;
grant select on public.document_acknowledgements to service_role;
grant select on public.worker_documents to service_role;
grant select on public.org_documents to service_role;
grant select (id, email, locale) on public.profiles to service_role;
grant update (status) on public.company_need_public_intakes to service_role;
grant select on public.waitlist to service_role;

commit;
