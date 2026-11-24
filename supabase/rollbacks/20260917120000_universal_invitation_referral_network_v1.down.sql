-- Rollback for 20260917120000_universal_invitation_referral_network_v1.sql
-- Removes the seven RPCs, the acceptance ledger, the notification type and
-- the invitation columns this migration added. Every step that would lose
-- data asserts the data is not there first; a rollback that finds real
-- referrals stops and reports rather than deleting them.

begin;

-- ── Part H/G/F/E/D: functions ─────────────────────────────────────────────
drop function if exists public.review_referral_context_v1(uuid, text, text, text, text);
drop function if exists public.mark_external_referral_delivery_v1(uuid, text);
drop function if exists public.receive_external_referral_v1(
  text, text, text, text, text, text, jsonb, jsonb, text, integer);
drop function if exists public.get_invitation_public_preview_v1(text);
drop function if exists public.get_invitation_preview_v2(text);
drop function if exists public.decline_invitation_v2(text);
drop function if exists public.accept_invitation_by_id_v2(uuid);
drop function if exists public.accept_invitation_v2(text);
drop function if exists public.accept_invitation_apply_v2(uuid, uuid);
drop function if exists public.create_invitation_v2(
  text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer);

-- ── Part C: notification CHECKs back to v7 (20260914140000) ──────────────
do $$
begin
  if exists (select 1 from public.notification_events
              where event_type = 'invitation_accepted' or entity_type = 'invitation') then
    raise exception 'rollback refused: notification_events holds invitation rows';
  end if;
end $$;

alter table public.notification_events
  drop constraint notification_events_type_check;
alter table public.notification_events
  add constraint notification_events_type_check check (event_type in (
    'booking_proposed',
    'booking_accepted',
    'booking_declined',
    'booking_withdrawn',
    'absence_requested',
    'absence_approved',
    'absence_rejected',
    'engagement_created',
    'engagement_ended',
    'workflow_step_pending',
    'workflow_decided',
    'workflow_delegated',
    'workflow_escalated',
    'document_ack_assigned',
    'document_ack_completed',
    'document_expiring',
    'work_task_assigned',
    'demand_interest_expressed',
    'demand_interest_reviewed',
    'weekly_digest',
    'saved_search_match'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;
alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance',
    'worker_document',
    'org_document',
    'document_acknowledgement',
    'work_task',
    'demand_interest_signal',
    'demand_interest_response',
    'weekly_digest',
    'saved_search'
  ));

-- ── Part B: the acceptance ledger ────────────────────────────────────────
do $$
begin
  if (select count(*) from public.invitation_acceptances) > 0 then
    raise exception 'rollback refused: invitation_acceptances holds % rows',
      (select count(*) from public.invitation_acceptances);
  end if;
end $$;
drop table if exists public.invitation_acceptances;

-- ── Part A: the invitation columns and constraints ───────────────────────
do $$
begin
  if exists (select 1 from public.invitations
              where invitation_type = 'invite_to_demand'
                 or external_source_slug is not null
                 or max_uses > 1
                 or invited_email is null
                 or inviter_profile_id is null) then
    raise exception 'rollback refused: invitations holds rows only this migration could create';
  end if;
end $$;

alter table public.invitations drop constraint if exists invitations_origin_chk;
alter table public.invitations drop constraint if exists invitations_uses_chk;
alter table public.invitations drop constraint if exists invitations_campaign_label_chk;
alter table public.invitations drop constraint if exists invitations_external_source_slug_chk;
alter table public.invitations drop constraint if exists invitations_external_reference_chk;
alter table public.invitations drop constraint if exists invitations_declared_context_chk;
alter table public.invitations drop constraint if exists invitations_consent_record_chk;
alter table public.invitations drop constraint if exists invitations_open_count_chk;

alter table public.invitations drop constraint invitations_invitation_type_check;
alter table public.invitations add constraint invitations_invitation_type_check
  check (invitation_type in (
    'join_platform','join_organization','join_team','join_as_employee',
    'collaborate_partner','join_project','invite_company'));

alter table public.invitations drop constraint invitations_context_chk;
alter table public.invitations add constraint invitations_context_chk check (
  (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
     and organization_id is not null)
  or (invitation_type = 'join_project' and project_id is not null)
  or (invitation_type in ('join_platform','invite_company'))
);

drop index if exists public.invitations_external_ref_uidx;
drop index if exists public.invitations_target_request_idx;

alter table public.invitations
  drop column if exists max_uses,
  drop column if exists use_count,
  drop column if exists campaign_label,
  drop column if exists target_request_id,
  drop column if exists external_source_slug,
  drop column if exists external_reference,
  drop column if exists declared_context,
  drop column if exists consent_record,
  drop column if exists open_count,
  drop column if exists first_opened_at;

alter table public.invitations alter column invited_email set not null;
alter table public.invitations alter column inviter_profile_id set not null;

commit;
