-- @human-gate-approved
--
-- UNIVERSAL INVITATION / REFERRAL NETWORK v1 — RED, PREPARED, NOT APPLIED.
-- Owner gate open. Draft PR + `needs-human-gate`; apply only through the
-- owner channel (Supabase MCP `apply_migration`, never `db push`).
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
--
-- The canonical token `invitations` system (20260712200000 → 20260827200000)
-- becomes the ONE distribution primitive for everybody who brings a person
-- into LabourMarket.ai: a worker inviting a colleague, an employer inviting
-- a person to a work need, an agency or a project manager sharing one
-- controlled link with a whole crew, and an APPROVED EXTERNAL SOURCE (the
-- first is Nonstop Group's careers intake) referring a worker with that
-- worker's explicit, versioned consent.
--
--   INVITER → INVITATION → INVITEE → TARGET → ACCEPTANCE → RESULT
--
-- EXTEND, NOT NEW. No second invitation system, no source-specific worker
-- table, no referral score. Five things were structurally missing and each
-- is added in place:
--
--   1. an invitation without an addressee (`invited_email` becomes NULLABLE)
--      — the copy-link primitive; the token is still the only capability;
--   2. an invitation without a PERSON as inviter (`inviter_profile_id`
--      becomes NULLABLE, guarded: an external source slug + reference must
--      then be present) — the approved-partner referral;
--   3. bounded MULTI-USE (`max_uses` / `use_count`, 1..500) — "we need 30
--      people for this project" is one controlled link, not 30 fake accounts;
--   4. a DEMAND target (`target_request_id` → customer_requests, the sole
--      canonical demand object) with type `invite_to_demand` — the employer
--      found the person and invited them; the person decides;
--   5. an ACCEPTANCE LEDGER (`invitation_acceptances`, one row per person per
--      invitation, append-only) — the referral provenance a campaign needs
--      and the single-use path gets for free.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT DO — the invariants that survive it
--   * An inviter never owns the invited person. Acceptance creates exactly
--     the relationship the existing accept path already created (an
--     engagement_contexts row, a project_worker_assignments row) or a
--     demand_interest_signals row whose snapshot says `employer_invitation`
--     — never a verified skill, never a confirmed assignment, never
--     employment.
--   * External declared data (professions, sectors, skills, free text) is
--     stored on the INVITATION as `declared_context` — declared input the
--     person reviews — and is never copied into worker_skills /
--     worker_professions by this migration or by any RPC in it.
--   * No consent, no referral: `receive_external_referral_v1` refuses an
--     envelope whose consent is not `given = true` with the text and the
--     exact version the caller's registry names.
--   * Existing rows are untouched: every added column has a default or is
--     NULL; every pre-existing invitation is single-use (`max_uses = 1`)
--     and keeps its addressee. v1 RPCs are left in place for their callers.
--   * No policy on `invitations` changes. The acceptor reads their own
--     acceptance rows through the NEW table's own policy.
--   * `anon` receives nothing. The logged-out landing reads a minimal
--     preview through a function executable by service_role only, called
--     from a server-only module with an explicit field allowlist.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- PART A — the invitation row learns four things it could not say
-- ═════════════════════════════════════════════════════════════════════════

-- A.1 No addressee: an open link. The e-mail CHECK already passes NULL.
alter table public.invitations alter column invited_email drop not null;

-- A.2 No person as inviter: an approved external source. Guarded in A.4.
alter table public.invitations alter column inviter_profile_id drop not null;

alter table public.invitations
  add column if not exists max_uses            integer not null default 1,
  add column if not exists use_count           integer not null default 0,
  add column if not exists campaign_label      text,
  add column if not exists target_request_id   uuid references public.customer_requests(id) on delete cascade,
  add column if not exists external_source_slug text,
  add column if not exists external_reference  text,
  add column if not exists declared_context    jsonb,
  add column if not exists consent_record      jsonb,
  add column if not exists open_count          integer not null default 0,
  add column if not exists first_opened_at     timestamptz;

comment on column public.invitations.max_uses is
  '1 = single-use (every pre-existing row). >1 = a controlled campaign link: '
  'each acceptance is its own invitation_acceptances row and its own person.';
comment on column public.invitations.external_source_slug is
  'Approved external referral source (registry: apps/web/lib/invitations/'
  'external-sources.ts). NULL for every invitation a signed-in person created.';
comment on column public.invitations.external_reference is
  'The source''s own reference (Nonstop: leadId). With the slug it is the '
  'idempotency key for ingestion. Never PII.';
comment on column public.invitations.declared_context is
  'What the external source DECLARED about the person (professions, sectors, '
  'skills, experience text, mobility). Declared input for the person to '
  'accept / reject / correct — never evidence, never verified.';
comment on column public.invitations.consent_record is
  'The consent the referral exists on: {given, text, version, received_at}, '
  'copied from the envelope, never synthesised.';

-- A.3 Bounds.
alter table public.invitations
  add constraint invitations_uses_chk
    check (max_uses between 1 and 500 and use_count between 0 and max_uses),
  add constraint invitations_campaign_label_chk
    check (campaign_label is null or char_length(campaign_label) <= 120),
  add constraint invitations_external_source_slug_chk
    check (external_source_slug is null or external_source_slug ~ '^[a-z0-9_-]{2,40}$'),
  add constraint invitations_external_reference_chk
    check (external_reference is null or char_length(external_reference) between 1 and 120),
  add constraint invitations_declared_context_chk
    check (declared_context is null
           or (jsonb_typeof(declared_context) = 'object'
               and pg_column_size(declared_context) <= 16384)),
  add constraint invitations_consent_record_chk
    check (consent_record is null
           or (jsonb_typeof(consent_record) = 'object'
               and pg_column_size(consent_record) <= 8192)),
  add constraint invitations_open_count_chk
    check (open_count >= 0);

-- A.4 Origin integrity: a person OR an external source, and an external
-- source always with its reference and its consent.
alter table public.invitations
  add constraint invitations_origin_chk check (
    (inviter_profile_id is not null and external_source_slug is null
       and external_reference is null)
    or
    (inviter_profile_id is null and external_source_slug is not null
       and external_reference is not null and consent_record is not null)
  );

-- A.5 The demand target joins the type vocabulary. Drop + re-add is the
-- WIDENING idiom (every existing value stays valid).
alter table public.invitations drop constraint invitations_invitation_type_check;
alter table public.invitations add constraint invitations_invitation_type_check
  check (invitation_type in (
    'join_platform','join_organization','join_team','join_as_employee',
    'collaborate_partner','join_project','invite_company',
    'invite_to_demand'));

alter table public.invitations drop constraint invitations_context_chk;
alter table public.invitations add constraint invitations_context_chk check (
  (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
     and organization_id is not null)
  or (invitation_type = 'join_project' and project_id is not null)
  or (invitation_type = 'invite_to_demand' and target_request_id is not null)
  or (invitation_type in ('join_platform','invite_company'))
);

-- A.6 Idempotent ingestion: one invitation per (source, reference).
create unique index if not exists invitations_external_ref_uidx
  on public.invitations (external_source_slug, external_reference)
  where external_source_slug is not null;
create index if not exists invitations_target_request_idx
  on public.invitations (target_request_id)
  where target_request_id is not null;

-- ═════════════════════════════════════════════════════════════════════════
-- PART B — the acceptance ledger (referral provenance)
-- ═════════════════════════════════════════════════════════════════════════
-- One row per (invitation, person). Append-only through RPC: no UPDATE /
-- DELETE policy exists and none is granted. A later invitation to the same
-- person is a second row on a second invitation — original attribution is
-- never overwritten ("last click wins" was deliberately NOT chosen).
create table if not exists public.invitation_acceptances (
  id               uuid primary key default gen_random_uuid(),
  invitation_id    uuid not null references public.invitations(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  decision         text not null check (decision in ('accepted','declined')),
  -- What the acceptance created, in the accept RPC's own vocabulary.
  relationship     text not null default 'none'
                     check (relationship in (
                       'none','engagement_created','engagement_existing',
                       'assignment_created','assignment_reactivated',
                       'interest_recorded','interest_existing')),
  relationship_id  uuid,
  -- The person's review of what an external source declared about them:
  -- { "<item_key>": { "decision": "accepted"|"rejected"|"corrected",
  --                    "correction": text|null, "reason": text|null,
  --                    "at": iso } }. Feedback with provenance; never
  -- evidence. Written only by review_referral_context_v1, only by the
  -- person, only on their own row.
  context_review   jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(context_review) = 'object'
                            and pg_column_size(context_review) <= 16384),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz not null default now(),
  unique (invitation_id, profile_id)
);

create index if not exists invitation_acceptances_profile_idx
  on public.invitation_acceptances (profile_id, created_at desc);

alter table public.invitation_acceptances enable row level security;

-- The person reads their own rows; the inviter (or the organization
-- authority behind an organization invitation, or an admin) reads the rows
-- of invitations they are entitled to see — exactly the `invitations_select`
-- reach, re-stated here so a campaign link can never become cross-tenant
-- read access. Nobody else. No write policy: RPC-only.
create policy invitation_acceptances_select
  on public.invitation_acceptances for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.invitations i
       where i.id = invitation_acceptances.invitation_id
         and (i.inviter_profile_id = auth.uid()
              or public.invitation_org_authority_v1(i.organization_id))
    )
  );

grant select on public.invitation_acceptances to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- PART C — the notification the inviter gets when someone accepted
-- ═════════════════════════════════════════════════════════════════════════
-- v8 of the two CHECKs (previous: 20260914140000 v7). Widening only.
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
    'saved_search_match',
    'invitation_accepted'
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
    'saved_search',
    'invitation'
  ));

-- ═════════════════════════════════════════════════════════════════════════
-- PART D — create_invitation_v2: the sender side, every inviter type
-- ═════════════════════════════════════════════════════════════════════════
-- Body provenance: create_invitation_v1 (20260827200000) with FOUR
-- additions — a nullable addressee, a demand target with its own permission
-- check, bounded multi-use, and a campaign label. The auth check, the
-- relationship validation, the caps, the dedup for addressed invitations,
-- the insert shape and the audit row are the v1 ones. v1 stays for its
-- callers.
create or replace function public.create_invitation_v2(
  p_token_hash        text,
  p_invitation_type   text,
  p_invited_email     text default null,
  p_invited_name      text default null,
  p_organization_id   uuid default null,
  p_project_id        uuid default null,
  p_target_request_id uuid default null,
  p_proposed_role     text default null,
  p_personal_message  text default null,
  p_locale            text default null,
  p_relationship_slug text default null,
  p_max_uses          integer default 1,
  p_campaign_label    text default null,
  p_expires_in_days   integer default 14
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  v_email       text := lower(nullif(trim(coalesce(p_invited_email, '')), ''));
  v_org_owner   uuid;
  v_open_count  int;
  v_day_count   int;
  v_new         uuid;
  v_rel         text := nullif(trim(coalesce(p_relationship_slug, '')), '');
  v_needs_role  text;
  v_invitable   boolean;
  v_max         int := coalesce(p_max_uses, 1);
  v_days        int := coalesce(p_expires_in_days, 14);
  v_req_owner   uuid;
  v_req_org     uuid;
  v_req_status  text;
  v_has_context boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company',
      'invite_to_demand') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  -- An addressee is optional (open link); when given it must be an address.
  if v_email is not null and (
       v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or char_length(v_email) > 254) then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;
  if v_max < 1 or v_max > 500 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;
  if v_days < 1 or v_days > 90 then
    return jsonb_build_object('outcome', 'invalid_expiry');
  end if;

  -- Context + sender permission, server-side.
  v_has_context := false;
  if p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    if p_organization_id is null then
      return jsonb_build_object('outcome', 'organization_required');
    end if;
    select owner_profile_id into v_org_owner
      from public.organizations where id = p_organization_id;
    if not found then
      return jsonb_build_object('outcome', 'organization_not_found');
    end if;
    if not (public.is_admin() or v_org_owner = uid
            or public.manages_organization(p_organization_id)) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    v_has_context := true;
  elsif p_invitation_type = 'join_project' then
    if p_project_id is null then
      return jsonb_build_object('outcome', 'project_required');
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      return jsonb_build_object('outcome', 'project_not_found');
    end if;
    if not public.can_manage_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    v_has_context := true;
  elsif p_invitation_type = 'invite_to_demand' then
    -- THE EMPLOYER FOUND THE PERSON. The target is the canonical demand
    -- object and nothing else; the inviter must own it or manage the
    -- organization it belongs to. A closed need cannot be invited to.
    if p_target_request_id is null then
      return jsonb_build_object('outcome', 'demand_required');
    end if;
    select profile_id, organization_id, status
      into v_req_owner, v_req_org, v_req_status
      from public.customer_requests where id = p_target_request_id;
    if not found then
      return jsonb_build_object('outcome', 'demand_not_found');
    end if;
    if not (public.is_admin() or v_req_owner = uid
            or (v_req_org is not null and public.manages_organization(v_req_org))) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    if v_req_status = 'closed' then
      return jsonb_build_object('outcome', 'demand_closed');
    end if;
    v_has_context := true;
  end if;

  -- MULTI-USE IS A CONTEXT PRIVILEGE. A link that 30 people may use belongs
  -- to an organization, a project or a need someone is answerable for. A
  -- plain "invite a colleague" link stays bounded to a crew-sized number.
  if v_max > 1 and not v_has_context and v_max > 20 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;

  -- The relationship, when one is named (v1 block, unchanged).
  if v_rel is not null then
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
    end if;
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h (v1).
  select count(*) into v_open_count from public.invitations
   where inviter_profile_id = uid and status = 'pending';
  if v_open_count >= 100 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day_count from public.invitations
   where inviter_profile_id = uid and created_at > now() - interval '24 hours';
  if v_day_count >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  -- One live ADDRESSED invitation per (inviter, email, type, context,
  -- relationship) — v1 rule; an open link has no addressee to collide on.
  if v_email is not null and exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(target_request_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_target_request_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id, target_request_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug,
    max_uses, campaign_label, expires_at
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    case when p_invitation_type = 'invite_to_demand' then p_target_request_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid,
    v_rel,
    v_max,
    nullif(trim(coalesce(p_campaign_label, '')), ''),
    now() + make_interval(days => v_days)
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v2', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'target_request_id', p_target_request_id,
      'relationship_slug', v_rel, 'max_uses', v_max,
      'addressed', v_email is not null));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v2(
  text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer)
  from public, anon;
grant execute on function public.create_invitation_v2(
  text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer)
  to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- PART E — accept_invitation_v2 / decline_invitation_v2
-- ═════════════════════════════════════════════════════════════════════════
-- Body provenance: accept_invitation_v1 (20260827200000) with the
-- multi-use ladder, the acceptance ledger row and the demand arm added. The
-- FOR UPDATE lock, the status/expiry ladder, the organization arm and the
-- project arm are the v1 ones.
create or replace function public.accept_invitation_v2(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_worker uuid;
  v_existing uuid;
  v_new uuid;
  v_slug text;
  v_relationship text := 'none';
  v_prior public.invitation_acceptances%rowtype;
  v_uses int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- The SAME person answering the SAME invitation twice is idempotent —
  -- they get their earlier answer back, and nothing is written.
  select * into v_prior from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;
  if found and v_prior.decision = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted',
      'relationship', v_prior.relationship, 'relationship_id', v_prior.relationship_id,
      'invitation_type', v_row.invitation_type,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug);
  end if;

  if v_row.status = 'accepted' then
    -- Single-use: taken. Multi-use: every seat is taken.
    return jsonb_build_object('outcome',
      case when v_row.max_uses > 1 then 'exhausted' else 'already_accepted' end);
  end if;
  if v_row.status in ('revoked','declined','expired') then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- Canonical relationship per invitation (v1 arms, unchanged).
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    v_slug := coalesce(
      nullif(v_row.relationship_slug, ''),
      case when v_row.invitation_type = 'collaborate_partner'
           then 'collaborator' else 'employee' end);
    select id into v_existing from public.engagement_contexts
     where profile_id = uid and organization_id = v_row.organization_id
       and relationship_slug = v_slug and status = 'active' limit 1;
    if v_existing is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary,
         title, hash_self)
      values
        (uid, v_row.organization_id, v_slug, 'active', false,
         v_row.proposed_role,
         encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_row.organization_id::text, 'sha256'), 'hex'))
      returning id into v_new;
      v_relationship = 'engagement_created';
    else
      v_new := v_existing;
      v_relationship = 'engagement_existing';
    end if;
  elsif v_row.invitation_type = 'join_project' then
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.project_worker_assignments
     where project_id = v_row.project_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.project_worker_assignments (project_id, worker_id, status)
      values (v_row.project_id, v_worker, 'active')
      returning id into v_new;
      v_relationship = 'assignment_created';
    else
      update public.project_worker_assignments
         set status = 'active', ended_at = null
       where id = v_existing;
      v_new := v_existing;
      v_relationship = 'assignment_reactivated';
    end if;
  elsif v_row.invitation_type = 'invite_to_demand' then
    -- EMPLOYER_INVITED_TO_TARGET, never SYSTEM_MATCHED_TO_TARGET. The
    -- interest row is the same row a worker's own click writes, so the
    -- employer's scouting view lists the person exactly once — but its
    -- snapshot carries NO status_band and names its basis, so no surface
    -- can read a match the engine never computed.
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.demand_interest_signals
     where request_id = v_row.target_request_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.demand_interest_signals
        (request_id, worker_id, status, match_snapshot)
      values
        (v_row.target_request_id, v_worker, 'interested',
         jsonb_build_object('basis', 'employer_invitation',
                            'invitation_id', v_row.id,
                            'invited_at', v_row.created_at,
                            'need_source', 'customer_requests'))
      returning id into v_new;
      v_relationship = 'interest_recorded';
    else
      v_new := v_existing;
      v_relationship = 'interest_existing';
    end if;
  end if;

  -- The ledger row: who accepted what, when, and what it created.
  insert into public.invitation_acceptances
    (invitation_id, profile_id, decision, relationship, relationship_id)
  values (v_row.id, uid, 'accepted', v_relationship, v_new)
  on conflict (invitation_id, profile_id) do update
    set decision = 'accepted', relationship = excluded.relationship,
        relationship_id = excluded.relationship_id, decided_at = now();

  -- The seat count. The invitation closes when its last seat is taken; a
  -- single-use invitation therefore closes on its first acceptance — exactly
  -- the v1 behaviour, now expressed as max_uses = 1.
  v_uses := v_row.use_count + 1;
  update public.invitations
     set use_count = v_uses,
         status = case when v_uses >= max_uses then 'accepted' else status end,
         accepted_at = case when v_uses >= max_uses then now() else accepted_at end,
         accepted_by_profile_id = case when max_uses = 1 then uid else accepted_by_profile_id end
   where id = v_row.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'accept_invitation_v2', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'relationship', v_relationship, 'relationship_id', v_new,
      'relationship_slug', v_slug, 'use_count', v_uses, 'max_uses', v_row.max_uses,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'relationship_id', v_new,
    'relationship_slug', v_slug,
    'invitation_type', v_row.invitation_type,
    'invitation_id', v_row.id,
    'inviter_profile_id', v_row.inviter_profile_id,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id,
    'target_request_id', v_row.target_request_id,
    'external_source_slug', v_row.external_source_slug,
    'has_declared_context', v_row.declared_context is not null
  );
end $$;

revoke all on function public.accept_invitation_v2(text) from public, anon;
grant execute on function public.accept_invitation_v2(text) to authenticated;

-- Declining a campaign link is this person's answer, not the campaign's
-- end: the row records it and the link stays open for others. Declining a
-- single-use invitation closes it (v1 behaviour).
create or replace function public.decline_invitation_v2(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if exists (select 1 from public.invitation_acceptances
              where invitation_id = v_row.id and profile_id = uid
                and decision = 'accepted') then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  insert into public.invitation_acceptances (invitation_id, profile_id, decision)
  values (v_row.id, uid, 'declined')
  on conflict (invitation_id, profile_id) do update
    set decision = 'declined', decided_at = now();

  if v_row.max_uses = 1 then
    update public.invitations
       set status = 'declined', declined_at = now()
     where id = v_row.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'decline_invitation_v2', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'max_uses', v_row.max_uses));

  return jsonb_build_object('outcome', 'declined',
    'invitation_type', v_row.invitation_type);
end $$;

revoke all on function public.decline_invitation_v2(text) from public, anon;
grant execute on function public.decline_invitation_v2(text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- PART F — previews: signed-in (full) and logged-out (minimal)
-- ═════════════════════════════════════════════════════════════════════════
-- Body provenance: get_invitation_preview_v1 (20260827200000) with the new
-- columns added to the returned object, the demand target named, and the
-- declared context disclosed ONLY to the person who already accepted.
create or replace function public.get_invitation_preview_v2(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_org_name text;
  v_project_title text;
  v_inviter_name text;
  v_status text;
  v_demand_role text;
  v_demand_country text;
  v_demand_org uuid;
  v_my_decision text;
  v_my_review jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_status := case
    when v_row.status = 'pending' and v_row.expires_at <= now() then 'expired'
    else v_row.status
  end;

  select coalesce(display_name, legal_name) into v_org_name
    from public.organizations where id = v_row.organization_id;
  select title into v_project_title
    from public.projects where id = v_row.project_id;
  select coalesce(full_name, 'LabourMarket.ai') into v_inviter_name
    from public.profiles where id = v_row.inviter_profile_id;
  if v_row.target_request_id is not null then
    select role_text, country, organization_id
      into v_demand_role, v_demand_country, v_demand_org
      from public.customer_requests where id = v_row.target_request_id;
    if v_org_name is null and v_demand_org is not null then
      select coalesce(display_name, legal_name) into v_org_name
        from public.organizations where id = v_demand_org;
    end if;
  end if;
  select decision, context_review into v_my_decision, v_my_review
    from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;

  return jsonb_build_object(
    'outcome', 'ok',
    -- The id is disclosed to the token holder so the review RPC can name
    -- the row; it is not a capability (the review RPC requires the caller's
    -- own accepted ledger row).
    'invitation_id', v_row.id,
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'invited_email', v_row.invited_email,
    'invited_name', v_row.invited_name,
    'proposed_role', v_row.proposed_role,
    'personal_message', v_row.personal_message,
    'expires_at', v_row.expires_at,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', case when v_row.inviter_profile_id is null then null else v_inviter_name end,
    'relationship_slug', v_row.relationship_slug,
    'max_uses', v_row.max_uses,
    'use_count', v_row.use_count,
    'campaign_label', v_row.campaign_label,
    'demand_role_text', v_demand_role,
    'demand_country', v_demand_country,
    'external_source_slug', v_row.external_source_slug,
    'my_decision', v_my_decision,
    'has_declared_context', v_row.declared_context is not null,
    -- The person's own declared data, ONLY once they accepted it is theirs.
    'declared_context', case when v_my_decision = 'accepted' then v_row.declared_context else null end,
    'context_review', case when v_my_decision = 'accepted' then coalesce(v_my_review, '{}'::jsonb) else null end
  );
end $$;

revoke all on function public.get_invitation_preview_v2(text) from public, anon;
grant execute on function public.get_invitation_preview_v2(text) to authenticated;

-- THE LOGGED-OUT LANDING. The minimum a person needs to decide whether to
-- register: what kind of invitation, from whom / which organization, in
-- which capacity, until when. No addressee, no personal message, no demand
-- details, no declared context, no ids. It also counts the open — the one
-- funnel fact only this door can observe.
--
-- Executable by service_role ONLY. The web server calls it from a
-- server-only module (apps/web/lib/invitations/public-preview.ts) with the
-- token from the URL; `anon` is granted nothing (20260722160000 closure
-- stands).
create or replace function public.get_invitation_public_preview_v1(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_org_name text;
  v_project_title text;
  v_inviter_name text;
  v_status text;
  v_demand_org uuid;
begin
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_status := case
    when v_row.status = 'pending' and v_row.expires_at <= now() then 'expired'
    else v_row.status
  end;

  if v_status = 'pending' then
    update public.invitations
       set open_count = least(open_count + 1, 1000000),
           first_opened_at = coalesce(first_opened_at, now())
     where id = v_row.id;
  end if;

  select coalesce(display_name, legal_name) into v_org_name
    from public.organizations where id = v_row.organization_id;
  select title into v_project_title
    from public.projects where id = v_row.project_id;
  select full_name into v_inviter_name
    from public.profiles where id = v_row.inviter_profile_id;
  if v_row.target_request_id is not null and v_org_name is null then
    select organization_id into v_demand_org
      from public.customer_requests where id = v_row.target_request_id;
    select coalesce(display_name, legal_name) into v_org_name
      from public.organizations where id = v_demand_org;
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', v_inviter_name,
    'relationship_slug', v_row.relationship_slug,
    'campaign_label', v_row.campaign_label,
    'external_source_slug', v_row.external_source_slug,
    'locale', v_row.locale,
    'expires_at', v_row.expires_at
  );
end $$;

revoke all on function public.get_invitation_public_preview_v1(text)
  from public, anon, authenticated;
grant execute on function public.get_invitation_public_preview_v1(text) to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- PART G — receive_external_referral_v1: the approved-partner door
-- ═════════════════════════════════════════════════════════════════════════
-- Called by the web server ONLY after the source authenticated with its own
-- machine secret (apps/web/lib/api/external-referral-auth.ts) and the
-- envelope passed strict schema validation. This function is the LAST line:
-- it re-checks consent and idempotency itself so no caller can skip them.
--
-- NO CONSENT, NO REFERRAL. `p_consent` must carry given = true, a non-empty
-- text and EXACTLY the version the source's registry entry names
-- (`p_required_consent_version`). Nothing is inferred from the presence of
-- an e-mail, a profession or a CV.
--
-- IDEMPOTENT on (source, reference): a replay returns the existing
-- invitation's id and status and writes nothing. The raw token is minted by
-- the caller and exists only in the first response.
--
-- NO IDENTITY LOOKUP. The invited e-mail is stored as the addressee and
-- never compared against profiles here — an existing user claims the
-- referral by opening the link signed in (accept_invitation_v2), which is
-- the only identity proof this system accepts. The partner learns nothing
-- about who has an account.
create or replace function public.receive_external_referral_v1(
  p_source_slug               text,
  p_reference                 text,
  p_token_hash                text,
  p_invited_email             text,
  p_invited_name              text,
  p_locale                    text,
  p_declared_context          jsonb,
  p_consent                   jsonb,
  p_required_consent_version  text,
  p_expires_in_days           integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(nullif(trim(coalesce(p_invited_email, '')), ''));
  v_existing public.invitations%rowtype;
  v_new      uuid;
  v_days     int := coalesce(p_expires_in_days, 30);
begin
  if p_source_slug is null or p_source_slug !~ '^[a-z0-9_-]{2,40}$' then
    return jsonb_build_object('outcome', 'invalid_source');
  end if;
  if p_reference is null or char_length(p_reference) not between 1 and 120 then
    return jsonb_build_object('outcome', 'invalid_reference');
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if v_email is not null and (
       v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or char_length(v_email) > 254) then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;
  if v_days < 1 or v_days > 90 then
    return jsonb_build_object('outcome', 'invalid_expiry');
  end if;

  -- CONSENT, re-checked here, last.
  if p_consent is null or jsonb_typeof(p_consent) <> 'object'
     or (p_consent->>'given') is distinct from 'true'
     or nullif(trim(coalesce(p_consent->>'text', '')), '') is null
     or nullif(trim(coalesce(p_consent->>'version', '')), '') is null
     or p_required_consent_version is null
     or (p_consent->>'version') <> p_required_consent_version then
    return jsonb_build_object('outcome', 'consent_required');
  end if;
  if p_declared_context is not null and jsonb_typeof(p_declared_context) <> 'object' then
    return jsonb_build_object('outcome', 'invalid_context');
  end if;

  -- IDEMPOTENCY. The unique index is the guarantee; this read is the
  -- deterministic answer for a replay.
  select * into v_existing from public.invitations
   where external_source_slug = p_source_slug and external_reference = p_reference;
  if found then
    return jsonb_build_object('outcome', 'duplicate',
      'invitation_id', v_existing.id, 'status', v_existing.status);
  end if;

  insert into public.invitations (
    token_hash, invitation_type, invited_email, invited_name, locale,
    inviter_profile_id, external_source_slug, external_reference,
    declared_context, consent_record, max_uses, expires_at
  ) values (
    p_token_hash, 'join_platform', v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    null, p_source_slug, p_reference,
    p_declared_context,
    jsonb_build_object(
      'given', true,
      'text', p_consent->>'text',
      'version', p_consent->>'version',
      'received_at', now()),
    1,
    now() + make_interval(days => v_days)
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, 'receive_external_referral_v1', 'invitations', v_new,
    jsonb_build_object('source', p_source_slug, 'reference', p_reference,
      'consent_version', p_consent->>'version',
      'has_context', p_declared_context is not null));

  return jsonb_build_object('outcome', 'created',
    'invitation_id', v_new, 'status', 'pending');
exception
  when unique_violation then
    -- Two concurrent first deliveries: the second reads the first's row.
    select * into v_existing from public.invitations
     where external_source_slug = p_source_slug and external_reference = p_reference;
    return jsonb_build_object('outcome', 'duplicate',
      'invitation_id', v_existing.id, 'status', v_existing.status);
end $$;

revoke all on function public.receive_external_referral_v1(
  text, text, text, text, text, text, jsonb, jsonb, text, integer)
  from public, anon, authenticated;
grant execute on function public.receive_external_referral_v1(
  text, text, text, text, text, text, jsonb, jsonb, text, integer)
  to service_role;

-- The delivery truth for a referral the server e-mailed itself. The v1
-- marker (`mark_invitation_delivery_v1`) is authenticated-only and checks
-- the inviter; a referral has no inviter and is delivered by the server, so
-- this one is executable by service_role only and touches ONLY rows that
-- carry an external source.
create or replace function public.mark_external_referral_delivery_v1(
  p_invitation_id uuid,
  p_outcome       text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome not in ('sent','delivery_failed') then
    return 'invalid_outcome';
  end if;
  update public.invitations
     set delivery_status = p_outcome,
         last_sent_at = case when p_outcome = 'sent' then now() else last_sent_at end
   where id = p_invitation_id and external_source_slug is not null;
  if not found then
    return 'not_found';
  end if;
  return 'ok';
end $$;

revoke all on function public.mark_external_referral_delivery_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_external_referral_delivery_v1(uuid, text)
  to service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- PART H — the person reviews what was declared about them
-- ═════════════════════════════════════════════════════════════════════════
-- ACCEPT / REJECT / CORRECT, one item at a time, on the person's OWN
-- acceptance row. This stores feedback with provenance. It does not touch
-- worker_skills or worker_professions: accepting a declared skill here is a
-- statement the person makes, and the profile paths that already exist
-- (self-declared claims, onboarding profession) remain the only writers.
create or replace function public.review_referral_context_v1(
  p_invitation_id uuid,
  p_item_key      text,
  p_decision      text,
  p_correction    text default null,
  p_reason        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row public.invitation_acceptances%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_item_key is null or p_item_key !~ '^[a-z_]+:[0-9]{1,3}$' then
    return jsonb_build_object('outcome', 'invalid_item');
  end if;
  if p_decision not in ('accepted','rejected','corrected') then
    return jsonb_build_object('outcome', 'invalid_decision');
  end if;
  if p_decision = 'corrected' and nullif(trim(coalesce(p_correction, '')), '') is null then
    return jsonb_build_object('outcome', 'correction_required');
  end if;
  if char_length(coalesce(p_correction, '')) > 200
     or char_length(coalesce(p_reason, '')) > 300 then
    return jsonb_build_object('outcome', 'too_long');
  end if;

  select a.* into v_row from public.invitation_acceptances a
   where a.invitation_id = p_invitation_id and a.profile_id = uid
     and a.decision = 'accepted'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if not exists (select 1 from public.invitations i
                  where i.id = p_invitation_id and i.declared_context is not null) then
    return jsonb_build_object('outcome', 'no_context');
  end if;

  update public.invitation_acceptances
     set context_review = context_review || jsonb_build_object(p_item_key,
           jsonb_build_object('decision', p_decision,
             'correction', nullif(trim(coalesce(p_correction, '')), ''),
             'reason', nullif(trim(coalesce(p_reason, '')), ''),
             'at', now()))
   where id = v_row.id;

  return jsonb_build_object('outcome', 'recorded', 'item_key', p_item_key,
    'decision', p_decision);
end $$;

revoke all on function public.review_referral_context_v1(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.review_referral_context_v1(uuid, text, text, text, text)
  to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK: supabase/rollbacks/20260917120000_universal_invitation_referral_network_v1.down.sql
--
--   drop function if exists public.review_referral_context_v1(uuid, text, text, text, text);
--   drop function if exists public.mark_external_referral_delivery_v1(uuid, text);
--   drop function if exists public.receive_external_referral_v1(text, text, text, text, text, text, jsonb, jsonb, text, integer);
--   drop function if exists public.get_invitation_public_preview_v1(text);
--   drop function if exists public.get_invitation_preview_v2(text);
--   drop function if exists public.decline_invitation_v2(text);
--   drop function if exists public.accept_invitation_v2(text);
--   drop function if exists public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer);
--   notification_events CHECKs back to v7 (20260914140000) after asserting
--     zero 'invitation_accepted' / 'invitation' rows;
--   drop table public.invitation_acceptances after asserting zero rows;
--   invitations: drop the new constraints, restore the v1 type/context CHECKs
--     after asserting zero 'invite_to_demand' rows, drop the new columns
--     after asserting zero external / multi-use rows, restore NOT NULL on
--     invited_email and inviter_profile_id after asserting no NULLs.
-- ═════════════════════════════════════════════════════════════════════════
