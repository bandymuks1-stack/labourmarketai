-- 20260530140000 — membership + review on engagement_contexts; verified proof.
--
-- THE KEYSTONE. Makes verified Work Proof real on the CANONICAL model. Today the
-- chain breaks at the last link: journal entries pin to org-less engagements, no
-- worker is connected to an org in a way that gives a manager review authority,
-- and even when review_journal_entry(approved) runs it only records a
-- confirmation — it never turns a declared skill into a VERIFIED one. So prod has
-- 0 verified proofs.
--
-- This migration (additive + reversible) closes it on engagement_contexts —
-- never on the legacy company_workers/agency_workers tables (untouched here,
-- retired in a later slice):
--   1. engagement_contexts gains operations_role + journal_review_enabled.
--   2. Hash-chained SECURITY DEFINER RPCs (no raw cross-profile INSERT; every
--      engagement write computes hash_self via the same digest the existing
--      owner/employee provisioning uses):
--        add_org_member            — owner brings a worker into the org (employee)
--        grant_org_manager         — owner grants a manager engagement + ops role
--        set_engagement_journal_review — owner/manager opens a worker's journal
--   3. review_journal_entry + reviewable_journal_entry_ids reroute their
--      "review enabled" gate from the legacy link tables to the entry's own
--      engagement_contexts.journal_review_enabled (authority was already
--      canonical via manages_organization()).
--   4. confirm_entry_and_verify_skills — the proof RPC: a manager approves an
--      entry AND confirms which declared skills it proves, flipping those
--      worker_skills to verified (source='manager_confirmed', confidence_bin
--      'green'). This is the moment a claim becomes proof.
--
-- RLS: NO policy widened. engagement_contexts SELECT already allows
-- manages_organization(); worker_skills/engagement_contexts writes stay own-only
-- so every privileged write flows through these SECURITY DEFINER RPCs.
-- Default-closed preserved.
--
-- HASH CHAIN: engagement_contexts currently uses a per-row content hash
-- (hash_self = sha256(profile:slug:org), hash_prev null) — these RPCs follow that
-- exact convention so the audit hash stays populated and no write bypasses it. A
-- true linked prev-chain is a separate hardening (tracked in TASKS.md), not
-- silently changed here.
--
-- RED (schema + RLS-adjacent + confirm logic on the proof spine) → committed,
-- queued for the gate, NOT applied. Apply via MCP apply_migration after approval.
-- Never db push. Reversible (ROLLBACK block at the bottom).

begin;

-- ── 1. additive columns ──────────────────────────────────────────────────
alter table public.engagement_contexts
  add column if not exists operations_role text;
alter table public.engagement_contexts
  add column if not exists journal_review_enabled boolean not null default false;

-- ── 2a. add_org_member — owner brings a worker into the org (canonical) ───
create or replace function public.add_org_member(p_org_id uuid, p_worker_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_profile uuid;
  v_owner uuid;
  v_existing uuid;
  v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or v_owner = uid or public.manages_organization(p_org_id)) then
    return 'not_authorized';
  end if;

  select profile_id into v_profile from public.workers where id = p_worker_id;
  if v_profile is null then return 'worker_not_found'; end if;

  select id into v_existing from public.engagement_contexts
   where profile_id = v_profile and organization_id = p_org_id
     and relationship_slug = 'employee' and status = 'active' limit 1;
  if v_existing is not null then return 'already_member'; end if;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values
    (v_profile, p_org_id, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'add_org_member', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'worker_id', p_worker_id,
      'profile_id', v_profile, 'relationship_slug', 'employee', 'result', 'added'));
  return 'added';
end $$;

-- ── 2b. grant_org_manager — owner grants a manager engagement + ops role ──
create or replace function public.grant_org_manager(
  p_org_id uuid, p_profile_id uuid, p_operations_role text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_existing uuid;
  v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_operations_role is not null
     and p_operations_role not in ('foreman','project_manager','site_manager','hr','company_admin') then
    return 'invalid_operations_role';
  end if;

  -- Granting a manager is an OWNER action only (no manager self-escalation).
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or v_owner = uid) then return 'not_owner'; end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    return 'profile_not_found';
  end if;

  select id into v_existing from public.engagement_contexts
   where profile_id = p_profile_id and organization_id = p_org_id
     and relationship_slug = 'manager' and status = 'active' limit 1;
  if v_existing is not null then
    update public.engagement_contexts
       set operations_role = coalesce(p_operations_role, operations_role), updated_at = now()
     where id = v_existing;
    return 'already_manager';
  end if;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary, operations_role, hash_self)
  values
    (p_profile_id, p_org_id, 'manager', 'active', false, p_operations_role,
     encode(extensions.digest(p_profile_id::text || ':manager:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'grant_org_manager', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'profile_id', p_profile_id,
      'relationship_slug', 'manager', 'operations_role', p_operations_role, 'result', 'granted'));
  return 'granted';
end $$;

-- ── 2c. set_engagement_journal_review — open a worker's journal to review ──
create or replace function public.set_engagement_journal_review(
  p_engagement_id uuid, p_enabled boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select organization_id, relationship_slug into v_org, v_slug
    from public.engagement_contexts where id = p_engagement_id;
  if not found then return 'engagement_not_found'; end if;
  if v_org is null then return 'engagement_not_org_scoped'; end if;
  if v_slug <> 'employee' then return 'not_a_member_engagement'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then
    return 'not_authorized';
  end if;

  update public.engagement_contexts
     set journal_review_enabled = p_enabled, updated_at = now()
   where id = p_engagement_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_engagement_journal_review', 'engagement_contexts', p_engagement_id,
    jsonb_build_object('organization_id', v_org, 'enabled', p_enabled));
  return case when p_enabled then 'enabled' else 'disabled' end;
end $$;

-- ── 3. reroute review_journal_entry off the legacy tables ─────────────────
-- (authority already canonical; only the "enabled" gate moves to the entry's
--  own engagement_contexts.journal_review_enabled. Behaviour otherwise identical.)
create or replace function public.review_journal_entry(
  p_entry_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_action text; v_enabled boolean;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then return 'invalid_decision'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false)
    into v_org, v_worker, v_enabled
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  if v_org is null then return 'entry_not_org_scoped'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  if not v_enabled then return 'review_not_enabled'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager') limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  v_action := case p_decision when 'approved' then 'confirm'
                              when 'rejected' then 'reject'
                              else 'request_changes' end;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (p_entry_id, uid, v_eng, v_role,
    jsonb_build_object('action', v_action, 'decision', p_decision,
      'note', nullif(btrim(coalesce(p_note,'')), '')));

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'review_journal_entry', 'journal_entries', p_entry_id,
    jsonb_build_object('decision', p_decision, 'organization_id', v_org, 'worker_id', v_worker));
  return p_decision;
end $$;

-- ── 4. confirm_entry_and_verify_skills — the verified-proof RPC ────────────
-- Approve an entry AND confirm which declared skills it proves → those
-- worker_skills become verified (manager_confirmed). The moment of truth.
create or replace function public.confirm_entry_and_verify_skills(
  p_entry_id uuid, p_skill_ids uuid[], p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_enabled boolean; v_n int;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_skill_ids is null or array_length(p_skill_ids, 1) is null then return 'no_skills'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false)
    into v_org, v_worker, v_enabled
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  if v_org is null then return 'entry_not_org_scoped'; end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  if not v_enabled then return 'review_not_enabled'; end if;

  -- Every confirmed skill must actually belong to this worker.
  if exists (
    select 1 from unnest(p_skill_ids) sid
    where not exists (select 1 from public.worker_skills ws
                       where ws.worker_id = v_worker and ws.skill_id = sid)
  ) then return 'skill_not_owned'; end if;

  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager') limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  -- 1) record the confirmation (append-only) against the reviewer's engagement
  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (p_entry_id, uid, v_eng, v_role,
    jsonb_build_object('action','confirm','decision','approved',
      'skills_confirmed', to_jsonb(p_skill_ids),
      'note', nullif(btrim(coalesce(p_note,'')), '')));

  -- 2) THE PROOF: flip the confirmed declared skills to verified
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = any(p_skill_ids)
     and (verified is distinct from true);
  get diagnostics v_n = row_count;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'confirm_entry_and_verify_skills', 'journal_entries', p_entry_id,
    jsonb_build_object('organization_id', v_org, 'worker_id', v_worker,
      'skills_confirmed', to_jsonb(p_skill_ids), 'skills_newly_verified', v_n));
  return 'verified:' || v_n::text;
end $$;

-- ── 5. reroute reviewable_journal_entry_ids off the legacy tables ─────────
create or replace function public.reviewable_journal_entry_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    where ec.organization_id is not null
      and coalesce(ec.journal_review_enabled, false) is true
      and (public.is_admin() or public.manages_organization(ec.organization_id))
      and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id);
end $$;

-- ── grants (new RPCs only; replaced functions keep their existing grants) ──
revoke all on function public.add_org_member(uuid, uuid) from public;
revoke all on function public.grant_org_manager(uuid, uuid, text) from public;
revoke all on function public.set_engagement_journal_review(uuid, boolean) from public;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) from public;
grant execute on function public.add_org_member(uuid, uuid) to authenticated;
grant execute on function public.grant_org_manager(uuid, uuid, text) to authenticated;
grant execute on function public.set_engagement_journal_review(uuid, boolean) to authenticated;
grant execute on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual — copy-paste). Restores the legacy-reading review functions
-- and drops the additions. (Verified worker_skills rows are real proof and are
-- intentionally NOT un-verified by this rollback — un-verifying is a data
-- decision, not a schema rollback.)
-- ═══════════════════════════════════════════════════════════════════════════
--   begin;
--   drop function if exists public.confirm_entry_and_verify_skills(uuid, uuid[], text);
--   drop function if exists public.add_org_member(uuid, uuid);
--   drop function if exists public.grant_org_manager(uuid, uuid, text);
--   drop function if exists public.set_engagement_journal_review(uuid, boolean);
--   -- restore review_journal_entry + reviewable_journal_entry_ids to the legacy
--   --   company_workers/agency_workers.journal_review_enabled versions captured
--   --   from prod before this migration (see git history of migration 0034/0033).
--   alter table public.engagement_contexts drop column if exists journal_review_enabled;
--   alter table public.engagement_contexts drop column if exists operations_role;
--   commit;
