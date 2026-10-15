-- Non-FK columns, intra-table FKs, production CHECKs and guard triggers that
-- the erasure logic depends on (copied from production DDL 2026-10-15).

create table public.waitlist (id uuid primary key default gen_random_uuid(), email text not null);
create table public.company_need_public_intakes (id uuid primary key default gen_random_uuid(), contact_name text, contact_email text, contact_phone text);
create table public.worker_display_name_backfill_20260805 (profile_id uuid not null, display_name_before text);

alter table public.leads add column email text;
alter table public.customer_requests add column payload jsonb not null default '{}'::jsonb, add column status text not null default 'draft',
  add column organization_id uuid, add column agency_client_id uuid, add column notes text, add column created_at timestamptz not null default now();
alter table public.customer_request_attachments add column request_id uuid not null references public.customer_requests(id) on delete cascade,
  add column storage_path text not null, add column file_name text not null;
alter table public.booking_requests add column request_id uuid not null references public.customer_requests(id) on delete cascade,
  add column status text not null default 'proposed', add column readiness_snapshot jsonb not null default '{}'::jsonb;
alter table public.company_worker_engagements add column subject_key uuid not null default gen_random_uuid(),
  add column source_booking_id uuid not null references public.booking_requests(id) on delete restrict,
  add column status text not null default 'active';
alter table public.invitations add column status text not null default 'pending', add column invited_email text, add column invited_name text,
  add column personal_message text, add column external_source_slug text, add column external_reference text,
  add column consent_record jsonb, add column declared_context jsonb,
  add column target_request_id uuid references public.customer_requests(id) on delete cascade;
alter table public.invitations add constraint invitations_origin_chk check ((((inviter_profile_id IS NOT NULL) AND (external_source_slug IS NULL) AND (external_reference IS NULL)) OR ((inviter_profile_id IS NULL) AND (external_source_slug IS NOT NULL) AND (external_reference IS NOT NULL) AND (consent_record IS NOT NULL))));
alter table public.invitation_acceptances add column invitation_id uuid references public.invitations(id) on delete cascade;
alter table public.team_demand_offers add column request_id uuid references public.customer_requests(id) on delete cascade;
alter table public.agency_candidate_offers add column request_id uuid;
alter table public.commercial_handoffs add column request_id uuid;

alter table public.engagement_contexts add column organization_id uuid, add column status text not null default 'active',
  add column description text, add column ended_note text;
alter table public.journal_entries add column engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict,
  add column correction_of uuid references public.journal_entries(id), add column superseded_by uuid references public.journal_entries(id),
  add column original_text text not null default 'x';
alter table public.journal_entry_confirmations add column entry_id uuid not null references public.journal_entries(id) on delete cascade,
  add column confirmer_engagement_context_id uuid not null references public.engagement_contexts(id);
alter table public.journal_entry_review_submissions add column entry_id uuid references public.journal_entries(id),
  add column resubmission_of_entry_id uuid references public.journal_entries(id);
alter table public.work_hour_allocations add column journal_entry_id uuid references public.journal_entries(id) on delete set null;
alter table public.journal_entry_work_items add column journal_entry_id uuid references public.journal_entries(id) on delete cascade;
alter table public.journal_entry_skills add column journal_entry_id uuid references public.journal_entries(id) on delete cascade;
alter table public.journal_entry_photos add column entry_id uuid references public.journal_entries(id) on delete cascade, add column storage_path text;

alter table public.asset_assignments add column project_id uuid;
alter table public.asset_assignments add constraint asset_assignments_target check (((project_id IS NOT NULL) OR (worker_id IS NOT NULL)));
alter table public.worker_absences add column note text;
alter table public.performance_reviews add column worker_input text, add column manager_input text, add column manager_input_at timestamptz;
alter table public.performance_reviews add constraint performance_reviews_manager_input_stamp check ((((manager_input IS NULL) = (manager_input_at IS NULL)) AND ((manager_input IS NULL) = (manager_input_by IS NULL))));
alter table public.usage_cost_events add column session_id text, add column workspace_id text, add column metadata jsonb not null default '{}'::jsonb;
alter table public.ai_runs add column output_excerpt text, add column request_context text;
alter table public.audit_logs add column entity_id uuid, add column payload jsonb, add column updated_at timestamptz not null default now();

alter table public.conversation_participants add column conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.conversation_messages add column conversation_id uuid references public.conversations(id) on delete cascade,
  add column body text not null default '', add column translated_text text, add column original_language text,
  add column target_language text, add column translation_status text not null default 'unavailable';
alter table public.conversation_message_attachments add column conversation_id uuid references public.conversations(id) on delete cascade,
  add column message_id uuid references public.conversation_messages(id) on delete cascade;

alter table public.agency_worker_invitations add column invited_email text not null default 'x@x', add column status text not null default 'pending';
alter table public.company_worker_invitations add column invited_email text not null default 'x@x', add column status text not null default 'pending';
alter table public.agency_client_connections add column invited_email text not null default 'x@x', add column status text not null default 'pending';

alter table public.organization_people add column display_name text not null default 'n', add column normalized_name text not null default 'n',
  add column link_state text not null default 'unlinked', add column link_method text, add column linked_at timestamptz,
  add column source_note text, add column external_ref text;
alter table public.organization_people add constraint organization_people_link_pair check ((((linked_worker_id IS NULL) = (linked_profile_id IS NULL)) AND ((link_state = 'unlinked'::text) = (linked_worker_id IS NULL))));
alter table public.notification_events add column entity_id uuid not null default gen_random_uuid(), add column metadata jsonb not null default '{}'::jsonb;
alter table public.pilot_events add column session_id text not null default 's', add column metadata jsonb not null default '{}'::jsonb;

-- jsonb columns swept by execute_v2
alter table public.agreement_events add column before_state jsonb, add column after_state jsonb, add column agreement_id uuid references public.agreements(id) on delete cascade;
alter table public.org_document_events add column before_state jsonb, add column after_state jsonb;
alter table public.training_assignment_events add column before_state jsonb, add column after_state jsonb;
alter table public.worker_document_events add column before_state jsonb, add column after_state jsonb;
alter table public.work_task_events add column before_state jsonb, add column after_state jsonb;
alter table public.engagement_lifecycle_events add column metadata jsonb;
alter table public.management_decision_events add column metadata jsonb;
alter table public.performance_review_events add column metadata jsonb;
alter table public.workflow_transitions add column metadata jsonb;
alter table public.booking_request_events add column previous_terms jsonb;
alter table public.evidence_import_events add column payload jsonb;
alter table public.learning_signals add column proposed_outcome jsonb;
alter table public.learning_review_queue add column proposed_action jsonb;
alter table public.workflow_instances add column payload jsonb;
alter table public.timesheets add column lines_snapshot jsonb, add column status text not null default 'draft';
alter table public.organization_evidence_records add column source_fact jsonb, add column derived jsonb;
alter table public.historical_consolidation_decisions add column signals jsonb, add column conflicts jsonb;
alter table public.commitment_override_receipts add column collisions jsonb;
alter table public.document_acknowledgements add column evidence jsonb, add column acknowledged_at timestamptz;
alter table public.document_acknowledgements add constraint document_acknowledgements_stamp_pair check (((acknowledged_at IS NULL) = (acknowledged_by IS NULL)));
alter table public.timesheet_events add column timesheet_id uuid references public.timesheets(id) on delete cascade;
alter table public.contact_disclosure_request_events add column contact_disclosure_request_id uuid references public.contact_disclosure_requests(id) on delete cascade;

-- blockers + amended CHECKs
alter table public.company_memberships add column organization_id uuid, add column role text not null default 'member', add column status text not null default 'active';
alter table public.company_workers add column status text;
alter table public.agency_workers add column status text;
alter table public.billing_subscriptions add column status text not null default 'none';
alter table public.subscriptions add column status text;
alter table public.workflow_instance_approvers add column decision text, add column decided_at timestamptz;
alter table public.workflow_instance_approvers add constraint workflow_instance_approvers_decided_shape check ((((decision IS NULL) AND (decided_by IS NULL) AND (decided_at IS NULL)) OR ((decision IS NOT NULL) AND (decided_by IS NOT NULL) AND (decided_at IS NOT NULL))));
alter table public.onboarding_run_items add column status text not null default 'pending', add column completed_at timestamptz;
alter table public.offboarding_run_items add column status text not null default 'pending', add column completed_at timestamptz;
alter table public.organization_claims add column state text not null default 'pending', add column decided_at timestamptz, add column verification_method text, add column verification_evidence_ref text;
alter table public.work_counterparty_links add column revoked_at timestamptz;
alter table public.work_counterparty_links add constraint work_counterparty_links_revocation_shape check (((revoked_at IS NULL) = (revoked_by IS NULL)));
alter table public.privacy_consent_events add column purpose text not null default 'p';
alter table public.personal_data_disclosures add column metadata jsonb;

-- guard triggers (production bodies, simplified to their refusal)
create function public.t_append_only() returns trigger language plpgsql as $$
begin raise exception '% is append-only: % not allowed', tg_table_name, tg_op; end; $$;
create function public.privacy_ledger_block_mutation() returns trigger language plpgsql as $$
begin raise exception 'privacy ledger is append-only: % on % is not allowed', tg_op, tg_table_name; end; $$;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
create function public.company_memberships_protect_last_owner() returns trigger language plpgsql as $$
declare losing_owner boolean;
begin
  losing_owner := old.role = 'owner' and old.status = 'active' and (tg_op = 'DELETE' or new.status <> 'active' or new.role <> 'owner');
  if losing_owner and not exists (select 1 from public.company_memberships m where m.organization_id = old.organization_id
      and m.role = 'owner' and m.status = 'active' and m.id <> old.id) then
    raise exception 'last_owner_membership';
  end if;
  return coalesce(new, old);
end; $$;

create trigger privacy_consent_events_append_only before update or delete on public.privacy_consent_events for each row execute function public.privacy_ledger_block_mutation();
create trigger personal_data_disclosures_append_only before update or delete on public.personal_data_disclosures for each row execute function public.t_append_only();
create trigger timesheet_events_append_only before update or delete on public.timesheet_events for each row execute function public.t_append_only();
create trigger agreement_events_append_only before update or delete on public.agreement_events for each row execute function public.t_append_only();
create trigger workflow_transitions_append_only before update or delete on public.workflow_transitions for each row execute function public.t_append_only();
create trigger contact_disclosure_request_events_append_only before update or delete on public.contact_disclosure_request_events for each row execute function public.t_append_only();
create trigger usage_cost_events_no_mutation before update or delete on public.usage_cost_events for each row execute function public.t_append_only();
create trigger work_counterparty_links_append_only before update or delete on public.work_counterparty_links for each row execute function public.t_append_only();
create trigger timesheets_frozen before update on public.timesheets for each row execute function public.t_append_only();
create trigger workflow_approvers_fill_once before update on public.workflow_instance_approvers for each row execute function public.t_append_only();
create trigger set_updated_at before update on public.audit_logs for each row execute function public.set_updated_at();
create trigger protect_last_owner before update or delete on public.company_memberships for each row execute function public.company_memberships_protect_last_owner();
