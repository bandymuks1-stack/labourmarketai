-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- @human-gate-approved
-- Prepared under the owner's core-network A–E programme command (2026-07-12):
-- migration prepared FULLY but NOT applied — production apply happens ONLY
-- via Supabase MCP apply_migration after the owner reviews the final gate
-- report of the A–E PR. Never `db push`.
--
-- 20260712200000 — canonical invitations v1 (core-network area B).
--
-- PROBLEM: inviting a person or company today is two parallel email-keyed
-- link tables (company_worker_invitations / agency_worker_invitations) with
-- NO token, NO expiry enforcement, NO revoke/resend, NO email delivery, and
-- acceptance that creates only the LEGACY link — not the canonical
-- organizations + engagement_contexts membership.
--
-- SOLUTION: ONE typed invitation model whose acceptance terminates in the
-- CANONICAL relationship:
--   join_organization / join_as_employee / join_team → employee engagement
--   collaborate_partner                              → collaboration engagement
--   join_project                                     → project_worker_assignments
--   join_platform / invite_company                   → account only (no link)
--
-- Security model:
--   * the raw invite token is NEVER stored — only sha256(token) hex
--     (token_hash unique); possession of the emailed link is the capability;
--   * single-use acceptance; declined/revoked/expired tokens are dead;
--   * resend ROTATES the token (the old link stops working);
--   * expiry enforced server-side (default 14 days);
--   * per-inviter caps: 100 open, 30 created / 24h (abuse guard);
--   * no email enumeration: nothing returns whether an address has an
--     account; in-app acceptance matches ONLY the caller's own JWT email;
--   * table writes are RPC-only (no INSERT/UPDATE policies); SELECT is
--     inviter-or-admin; every state change appends an audit_logs row;
--   * grants: authenticated only — never anon.
--
-- Additive only. Rollback:
--   supabase/rollbacks/20260712200000_canonical_invitations_v1.down.sql
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────
create table if not exists public.invitations (
  id                     uuid primary key default gen_random_uuid(),
  token_hash             text not null unique check (char_length(token_hash) = 64),
  invitation_type        text not null check (invitation_type in (
                           'join_platform','join_organization','join_team',
                           'join_as_employee','collaborate_partner',
                           'join_project','invite_company')),
  organization_id        uuid references public.organizations(id) on delete cascade,
  project_id             uuid references public.projects(id) on delete cascade,
  invited_email          text not null
                           check (invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                                  and char_length(invited_email) <= 254),
  invited_name           text check (invited_name is null or char_length(invited_name) <= 120),
  proposed_role          text check (proposed_role is null or char_length(proposed_role) <= 80),
  personal_message       text check (personal_message is null or char_length(personal_message) <= 500),
  locale                 char(2),
  inviter_profile_id     uuid not null references public.profiles(id) on delete cascade,
  status                 text not null default 'pending' check (status in
                           ('pending','accepted','declined','expired','revoked')),
  delivery_status        text not null default 'not_sent' check (delivery_status in
                           ('not_sent','sent','delivery_failed')),
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default now() + interval '14 days',
  last_sent_at           timestamptz,
  resend_count           int not null default 0 check (resend_count between 0 and 10),
  accepted_at            timestamptz,
  declined_at            timestamptz,
  revoked_at             timestamptz,
  accepted_by_profile_id uuid references public.profiles(id),
  -- context integrity: org-scoped types carry an org; project type a project
  constraint invitations_context_chk check (
    (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
       and organization_id is not null)
    or (invitation_type = 'join_project' and project_id is not null)
    or (invitation_type in ('join_platform','invite_company'))
  )
);

create index if not exists invitations_inviter_idx
  on public.invitations (inviter_profile_id, created_at desc);
create index if not exists invitations_invited_email_pending_idx
  on public.invitations (lower(invited_email))
  where status = 'pending';

-- ── 2. RLS: inviter-or-admin read; RPC-only writes ───────────────────
alter table public.invitations enable row level security;

drop policy if exists invitations_select on public.invitations;
create policy invitations_select
  on public.invitations for select
  using (inviter_profile_id = auth.uid() or public.is_admin());
-- No INSERT/UPDATE/DELETE policies: every write goes through the
-- SECURITY DEFINER RPCs below.

grant select on public.invitations to authenticated;

-- ── 3. create_invitation_v1 ──────────────────────────────────────────
create or replace function public.create_invitation_v1(
  p_token_hash      text,
  p_invitation_type text,
  p_invited_email   text,
  p_invited_name    text default null,
  p_organization_id uuid default null,
  p_project_id      uuid default null,
  p_proposed_role   text default null,
  p_personal_message text default null,
  p_locale          text default null
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
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  if v_email is null
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_email) > 254 then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;

  -- Context + sender permission, server-side.
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
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h.
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

  -- One live invitation per (inviter, email, type, context).
  if exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v1', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text) from public;
grant execute on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text) to authenticated;

-- ── 4. revoke_invitation_v1 ──────────────────────────────────────────
create or replace function public.revoke_invitation_v1(
  p_invitation_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select inviter_profile_id, status into v_inviter, v_status
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid and not public.is_admin() then return 'not_authorized'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  update public.invitations
     set status = 'revoked', revoked_at = now()
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'revoke_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'revoked'));
  return 'revoked';
end $$;

revoke all on function public.revoke_invitation_v1(uuid) from public;
grant execute on function public.revoke_invitation_v1(uuid) to authenticated;

-- ── 5. resend_invitation_v1 — ROTATES the token ──────────────────────
create or replace function public.resend_invitation_v1(
  p_invitation_id uuid,
  p_new_token_hash text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
  v_resends int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;
  select inviter_profile_id, status, resend_count
    into v_inviter, v_status, v_resends
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid then return 'not_authorized'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_resends >= 10 then return 'resend_limit'; end if;

  update public.invitations
     set token_hash = p_new_token_hash,
         expires_at = now() + interval '14 days',
         last_sent_at = null,
         delivery_status = 'not_sent',
         resend_count = resend_count + 1
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'resend_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'token_rotated', 'resend_count', v_resends + 1));
  return 'ok';
end $$;

revoke all on function public.resend_invitation_v1(uuid, text) from public;
grant execute on function public.resend_invitation_v1(uuid, text) to authenticated;

-- ── 6. mark_invitation_delivery_v1 — truthful delivery state only ────
-- Called AFTER the provider returned a real accepted/failed result. The
-- app layer never writes 'sent' without a provider acknowledgement.
create or replace function public.mark_invitation_delivery_v1(
  p_invitation_id uuid,
  p_outcome text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_outcome not in ('sent','delivery_failed') then return 'invalid_outcome'; end if;
  select inviter_profile_id into v_inviter
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter <> uid then return 'not_authorized'; end if;

  update public.invitations
     set delivery_status = p_outcome,
         last_sent_at = case when p_outcome = 'sent' then now() else last_sent_at end
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.mark_invitation_delivery_v1(uuid, text) from public;
grant execute on function public.mark_invitation_delivery_v1(uuid, text) to authenticated;

-- ── 7. get_invitation_preview_v1 — token-gated, authenticated-only ───
create or replace function public.get_invitation_preview_v1(
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

  return jsonb_build_object(
    'outcome', 'ok',
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'invited_email', v_row.invited_email,
    'invited_name', v_row.invited_name,
    'proposed_role', v_row.proposed_role,
    'personal_message', v_row.personal_message,
    'expires_at', v_row.expires_at,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', v_inviter_name
  );
end $$;

revoke all on function public.get_invitation_preview_v1(text) from public;
grant execute on function public.get_invitation_preview_v1(text) to authenticated;

-- ── 8. accept_invitation_v1 — single-use; creates the CANONICAL link ─
create or replace function public.accept_invitation_v1(
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
  if v_row.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_row.status in ('revoked','declined') then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- Canonical relationship per type.
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    v_slug := case when v_row.invitation_type = 'collaborate_partner'
                   then 'collaboration' else 'employee' end;
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
      -- Not consumed: the person can create a worker profile and accept.
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
  end if;

  update public.invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by_profile_id = uid
   where id = v_row.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'accept_invitation_v1', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'relationship', v_relationship, 'relationship_id', v_new,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'invitation_type', v_row.invitation_type,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id
  );
end $$;

revoke all on function public.accept_invitation_v1(text) from public;
grant execute on function public.accept_invitation_v1(text) to authenticated;

-- ── 9. accept_invitation_by_id_v1 — in-app path, own-JWT-email only ──
create or replace function public.accept_invitation_by_id_v1(
  p_invitation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_token_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_token_row from public.invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- The in-app path exists ONLY for invitations addressed to the caller's
  -- own verified email — never a way to probe or consume someone else's.
  if v_email = '' or lower(v_token_row.invited_email) <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Delegate the full lifecycle + relationship creation to the token
  -- variant's logic by re-running its body against this row.
  if v_token_row.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_token_row.status in ('revoked','declined') then
    return jsonb_build_object('outcome', v_token_row.status);
  end if;
  if v_token_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_token_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- Same canonical-relationship block as accept_invitation_v1.
  declare
    v_worker uuid;
    v_existing uuid;
    v_new uuid;
    v_slug text;
    v_relationship text := 'none';
  begin
    if v_token_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
      v_slug := case when v_token_row.invitation_type = 'collaborate_partner'
                     then 'collaboration' else 'employee' end;
      select id into v_existing from public.engagement_contexts
       where profile_id = uid and organization_id = v_token_row.organization_id
         and relationship_slug = v_slug and status = 'active' limit 1;
      if v_existing is null then
        insert into public.engagement_contexts
          (profile_id, organization_id, relationship_slug, status, is_primary,
           title, hash_self)
        values
          (uid, v_token_row.organization_id, v_slug, 'active', false,
           v_token_row.proposed_role,
           encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_token_row.organization_id::text, 'sha256'), 'hex'))
        returning id into v_new;
        v_relationship = 'engagement_created';
      else
        v_new := v_existing;
        v_relationship = 'engagement_existing';
      end if;
    elsif v_token_row.invitation_type = 'join_project' then
      select id into v_worker from public.workers where profile_id = uid limit 1;
      if v_worker is null then
        return jsonb_build_object('outcome', 'no_worker_profile');
      end if;
      select id into v_existing from public.project_worker_assignments
       where project_id = v_token_row.project_id and worker_id = v_worker limit 1;
      if v_existing is null then
        insert into public.project_worker_assignments (project_id, worker_id, status)
        values (v_token_row.project_id, v_worker, 'active')
        returning id into v_new;
        v_relationship = 'assignment_created';
      else
        update public.project_worker_assignments
           set status = 'active', ended_at = null
         where id = v_existing;
        v_new := v_existing;
        v_relationship = 'assignment_reactivated';
      end if;
    end if;

    update public.invitations
       set status = 'accepted',
           accepted_at = now(),
           accepted_by_profile_id = uid
     where id = v_token_row.id;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'accept_invitation_by_id_v1', 'invitations', v_token_row.id,
      jsonb_build_object('invitation_type', v_token_row.invitation_type,
        'relationship', v_relationship, 'relationship_id', v_new));

    return jsonb_build_object(
      'outcome', 'accepted',
      'relationship', v_relationship,
      'invitation_type', v_token_row.invitation_type,
      'organization_id', v_token_row.organization_id,
      'project_id', v_token_row.project_id
    );
  end;
end $$;

revoke all on function public.accept_invitation_by_id_v1(uuid) from public;
grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;

-- ── 10. decline_invitation_v1 ────────────────────────────────────────
create or replace function public.decline_invitation_v1(
  p_token text
) returns text
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
  if not found then return 'not_found'; end if;
  if v_row.status <> 'pending' then return v_row.status; end if;

  update public.invitations
     set status = 'declined', declined_at = now()
   where id = v_row.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'decline_invitation_v1', 'invitations', v_row.id,
    jsonb_build_object('result', 'declined'));
  return 'declined';
end $$;

revoke all on function public.decline_invitation_v1(text) from public;
grant execute on function public.decline_invitation_v1(text) to authenticated;

-- ── 11. list_invitations_for_me_v1 — own-JWT-email inbox, bounded ────
create or replace function public.list_invitations_for_me_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_email = '' then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', i.id,
        'invitation_type', i.invitation_type,
        'personal_message', i.personal_message,
        'proposed_role', i.proposed_role,
        'created_at', i.created_at,
        'expires_at', i.expires_at,
        'organization_name', (select coalesce(o.display_name, o.legal_name)
                                from public.organizations o
                               where o.id = i.organization_id),
        'project_title', (select p.title from public.projects p
                           where p.id = i.project_id),
        'inviter_name', (select pr.full_name from public.profiles pr
                          where pr.id = i.inviter_profile_id)
      ) as item
      from public.invitations i
      where lower(i.invited_email) = v_email
        and i.status = 'pending'
        and i.expires_at > now()
      order by i.created_at desc
      limit 50
    ) sub;
  return jsonb_build_object('items', v_items);
end $$;

revoke all on function public.list_invitations_for_me_v1() from public;
grant execute on function public.list_invitations_for_me_v1() to authenticated;

-- ROLLBACK: supabase/rollbacks/20260712200000_canonical_invitations_v1.down.sql
