-- ===========================================================================
-- PROOF HARNESS for 20261003150500_journal_counterparty_review_authority_v1
-- (EVID-2 redesign: confirmation authority derives from the work relationship).
--
-- NOT an invented schema. Helper functions, RLS policies, the confirmation
-- CHECK/trigger, grants and the five functions the migration replaces are the
-- PRODUCTION state read via pg_get_functiondef / pg_policies / pg_constraint /
-- information_schema on 2026-10-03 (the five functions below are the prior
-- bodies, identical to the rollback file; the proof checks them against
-- production's own hashes). Only dependency tables are reduced to the columns
-- the code touches.
-- ===========================================================================
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, active_role text);
create table public.profile_roles (profile_id uuid references public.profiles(id), role text);
create table public.organizations (id uuid primary key);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id));
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  status text, relationship_slug text,
  journal_review_enabled boolean not null default false);
create table public.company_memberships (profile_id uuid, organization_id uuid, status text, role text);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text,
  entity_id uuid, payload jsonb, occurred_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.skills (id uuid primary key default gen_random_uuid(), slug text, is_active boolean default true);
create table public.worker_skills (worker_id uuid not null references public.workers(id), skill_id uuid not null references public.skills(id),
  verified boolean not null default false, verified_by uuid, verified_at timestamptz, source text default 'self_declared',
  confidence_bin text, updated_at timestamptz default now(), primary key (worker_id, skill_id));
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  engagement_context_id uuid not null references public.engagement_contexts(id),
  entry_type_slug text not null default 'freeform', profession_id uuid,
  original_text text not null, original_language char(2) not null default 'lt',
  hash_prev text, hash_self text not null, visibility_scope text not null default 'closed',
  superseded_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, correction_of uuid, project_id uuid);
-- production columns/constraints of journal_entry_confirmations (pg_constraint / information_schema)
create table public.journal_entry_confirmations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  confirmer_id uuid not null references public.profiles(id),
  confirmer_engagement_context_id uuid not null references public.engagement_contexts(id),
  confirmer_role text not null,
  confirmation_scope jsonb not null,
  created_at timestamptz not null default now(),
  constraint journal_entry_confirmations_confirmer_role_check
    check (confirmer_role = any (array['manager','owner','external_manager'])));
-- learning tables (reduced to the columns apply_learning_auto_confirmation touches)
create table public.learning_signals (id uuid primary key default gen_random_uuid(), confidence_score int);
create table public.learning_policy_settings (id uuid primary key default gen_random_uuid(), organization_id uuid, policy_kind text,
  enabled boolean, scope jsonb, rule jsonb, enabled_by uuid);
create table public.learning_review_queue (id uuid primary key default gen_random_uuid(), subject_worker_id uuid, subject_skill_id uuid,
  organization_id uuid, journal_entry_id uuid, signal_id uuid, status text, suggestion_kind text, reviewed_by uuid,
  reviewed_at timestamptz, review_note text, updated_at timestamptz, produced_confirmation_id uuid, policy_id uuid);

-- helpers: VERBATIM from production
create or replace function public.owns_worker(w uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin') $$;
create or replace function public.manages_organization(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.engagement_contexts ec where ec.profile_id = auth.uid() and ec.organization_id = org
       and ec.status = 'active' and ec.relationship_slug in ('manager','owner','external_manager'))
  or exists (select 1 from public.company_memberships m where m.profile_id = auth.uid() and m.organization_id = org
       and m.status = 'active' and m.role in ('owner','admin','manager','external_manager')) $$;

-- the five functions replaced by the migration: PRIOR production bodies
CREATE OR REPLACE FUNCTION public.journal_entry_confirmations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_superseded uuid;
  v_deleted    timestamptz;
begin
  -- LOCK STRENGTH (rev12, Codex P1): FOR UPDATE, not FOR KEY SHARE. The two
  -- staleness paths take DIFFERENT locks: the supersedes take an explicit
  -- FOR UPDATE, but journal_entry_soft_delete (0018) is a bare
  -- `update ... set deleted_at, updated_at` touching no key column, so it
  -- takes only FOR NO KEY UPDATE. FOR KEY SHARE conflicts with the former but
  -- NOT the latter, so a confirmation racing a SOFT DELETE could pass this
  -- guard and commit - leaving an append-only confirmation attached to a
  -- deleted entry. FOR UPDATE conflicts with both.
  select superseded_by, deleted_at
    into v_superseded, v_deleted
    from public.journal_entries
   where id = new.entry_id
   for update;
  if not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if v_deleted is not null then
    raise exception 'entry_deleted' using errcode = '42P10';
  end if;
  if v_superseded is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;
  return new;
end $function$;

-- 2a. review_journal_entry --------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_journal_entry(p_entry_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_action text; v_enabled boolean;
  v_superseded uuid; v_deleted timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then return 'invalid_decision'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at
    into v_org, v_worker, v_enabled, v_superseded, v_deleted
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  -- Stale-confirmation refusal (owner-hold v4 items 2/3): a superseded or
  -- deleted entry can no longer be confirmed. The BEFORE INSERT guard
  -- trigger on journal_entry_confirmations is the hard serialization point;
  -- this check returns the clean status in the common (non-racing) case.
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;
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
end $function$;

-- 2b. confirm_entry_and_verify_skills ---------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_entry_and_verify_skills(p_entry_id uuid, p_skill_ids uuid[], p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_enabled boolean; v_n int;
  v_superseded uuid; v_deleted timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_skill_ids is null or array_length(p_skill_ids, 1) is null then return 'no_skills'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at
    into v_org, v_worker, v_enabled, v_superseded, v_deleted
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  -- Stale-confirmation refusal (owner-hold v4 items 2/3): a superseded or
  -- deleted entry can no longer be confirmed. The BEFORE INSERT guard
  -- trigger on journal_entry_confirmations is the hard serialization point;
  -- this check returns the clean status in the common (non-racing) case.
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;
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
end $function$;

-- 2c. apply_learning_auto_confirmation --------------------------------------
CREATE OR REPLACE FUNCTION public.apply_learning_auto_confirmation(p_review_item_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid          uuid := auth.uid();
  v_worker     uuid; v_skill uuid; v_org uuid; v_entry uuid; v_signal uuid; v_status text; v_kind text;
  v_policy_id  uuid; v_enabled boolean; v_scope jsonb; v_rule jsonb; v_enabled_by uuid;
  v_min_conf   int;  v_sig_score int;
  v_eorg       uuid; v_eworker uuid; v_review_enabled boolean;
  v_eng        uuid; v_role text; v_conf_id uuid; v_n int;
  v_je_superseded uuid; v_je_deleted timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  -- Load the review item UNDER A ROW LOCK (rev14, Codex P1). An unlocked read
  -- here could observe 'pending', a concurrent manager rejection (which DOES
  -- lock, via set_learning_review_item_status) could commit, and this path
  -- would then produce a real confirmation and overwrite the committed
  -- rejection with 'auto_actioned' - replacing a human decision with a
  -- verification. Both writers must take the same lock for either to
  -- serialize; the terminal update at the end is additionally conditional on
  -- the row still being pending.
  select subject_worker_id, subject_skill_id, organization_id, journal_entry_id,
         signal_id, status, suggestion_kind
    into v_worker, v_skill, v_org, v_entry, v_signal, v_status, v_kind
  from public.learning_review_queue where id = p_review_item_id
  for update;
  if not found then return 'item_not_found'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_kind <> 'confirm_skill' then return 'unsupported_kind'; end if;
  if v_entry is null or v_skill is null then return 'item_incomplete'; end if;

  -- Live authority of the CALLER over the item's org (no stored-flag trust).
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;

  -- Policy must exist for this org and be ENABLED.
  select id, enabled, scope, rule, enabled_by
    into v_policy_id, v_enabled, v_scope, v_rule, v_enabled_by
  from public.learning_policy_settings
  where organization_id = v_org and policy_kind = 'auto_confirm_journal_skill';
  if not found or v_enabled is not true then return 'policy_disabled'; end if;

  -- Scope check. Empty/missing scope confirms NOTHING.
  if not (
       coalesce((v_scope->>'all_org_workers')::boolean, false)
       or (v_scope ? 'worker_ids' and (v_scope->'worker_ids') ? v_worker::text)
     ) then
    return 'out_of_scope';
  end if;

  -- Threshold check. Missing min_confidence => nothing passes.
  v_min_conf := nullif(v_rule->>'min_confidence', '')::int;
  if v_min_conf is null then return 'threshold_not_met'; end if;
  select confidence_score into v_sig_score from public.learning_signals where id = v_signal;
  if v_sig_score is null or v_sig_score < v_min_conf then return 'threshold_not_met'; end if;

  -- Re-derive org/worker and the journal_review_enabled gate from the SOURCE
  -- entry (same gate the manual spine uses).
  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at
    into v_eorg, v_eworker, v_review_enabled, v_je_superseded, v_je_deleted
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = v_entry;
  if not found then return 'entry_not_found'; end if;
  -- Stale source entry (owner-hold v5 P2-1): close the queue item with an
  -- honest TERMINAL outcome instead of leaving a permanently failing action.
  -- Audit fields are set; history preserved; the guard trigger below remains
  -- the race-proof final guard.
  if v_je_deleted is not null or v_je_superseded is not null then
    update public.learning_review_queue
       set status = 'superseded', reviewed_by = uid, reviewed_at = now(),
           review_note = case when v_je_deleted is not null
                              then 'stale: entry_deleted'
                              else 'stale: entry_superseded' end,
           updated_at = now()
     where id = p_review_item_id and status = 'pending';
    return case when v_je_deleted is not null
                then 'entry_deleted' else 'entry_superseded' end;
  end if;
  if v_eorg is distinct from v_org then return 'org_mismatch'; end if;
  if v_eworker is distinct from v_worker then return 'worker_mismatch'; end if;
  if not v_review_enabled then return 'review_not_enabled'; end if;

  -- The skill must actually belong to this worker.
  if not exists (select 1 from public.worker_skills ws
                  where ws.worker_id = v_worker and ws.skill_id = v_skill) then
    return 'skill_not_owned';
  end if;

  -- The caller must have an ACTIVE reviewer engagement in this org.
  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager')
  limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  -- 1) REAL confirmation (append-only). action='auto_confirm' makes it honest;
  --    the policy + enabling manager + rule + source signal are recorded.
  begin
    insert into public.journal_entry_confirmations
      (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
    values (v_entry, uid, v_eng, v_role,
      jsonb_build_object(
        'action','auto_confirm', 'decision','approved',
        'skills_confirmed', to_jsonb(array[v_skill]),
        'policy_id', v_policy_id, 'policy_enabled_by', v_enabled_by,
        'rule', v_rule, 'source_signal_id', v_signal,
        'review_item_id', p_review_item_id))
    returning id into v_conf_id;
  exception when others then
    -- Race after the pre-check: the guard trigger refused a now-stale entry.
    -- Transition the queue item to the same honest terminal state.
    if sqlerrm like '%entry_superseded%' or sqlerrm like '%entry_deleted%' then
      update public.learning_review_queue
         set status = 'superseded', reviewed_by = uid, reviewed_at = now(),
             review_note = case when sqlerrm like '%entry_deleted%'
                                then 'stale (race): entry_deleted'
                                else 'stale (race): entry_superseded' end,
             updated_at = now()
       where id = p_review_item_id and status = 'pending';
      return case when sqlerrm like '%entry_deleted%'
                  then 'entry_deleted' else 'entry_superseded' end;
    end if;
    raise;
  end;

  -- 2) THE PROOF - same write as the manual path.
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = v_skill
     and (verified is distinct from true);
  get diagnostics v_n = row_count;

  -- 3) Audit (real event, attributes both the live confirmer and the policy).
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'auto_confirm_via_learning_policy', 'journal_entries', v_entry,
    jsonb_build_object('organization_id', v_org, 'worker_id', v_worker, 'skill_id', v_skill,
      'policy_id', v_policy_id, 'policy_enabled_by', v_enabled_by,
      'review_item_id', p_review_item_id, 'skills_newly_verified', v_n));

  -- 4) Close the queue item - CONDITIONALLY (rev14, Codex P1). Belt and braces
  --    with the FOR UPDATE above: this can never overwrite a decision that
  --    another transaction already recorded.
  update public.learning_review_queue
     set status = 'auto_actioned', reviewed_by = uid, reviewed_at = now(),
         produced_confirmation_id = v_conf_id, policy_id = v_policy_id, updated_at = now()
   where id = p_review_item_id
     and status = 'pending';
  if not found then return 'not_pending'; end if;

  return 'auto_confirmed:' || v_n::text;
end $function$;

-- 3. The reviewer is not offered their own entries ---------------------------
CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    where ec.organization_id is not null
      -- Stale rows are no longer reviewable (owner-hold v4 follow-through):
      -- every confirmation path now refuses superseded/deleted entries, so
      -- the shared read set must exclude them or the inbox/queue/counts show
      -- permanently-broken cards.
      and je.superseded_by is null
      and je.deleted_at is null
      and coalesce(ec.journal_review_enabled, false) is true
      and (public.is_admin() or public.manages_organization(ec.organization_id))
      and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id);
end $function$;


-- trigger, RLS policies, grants, ACLs: production
create trigger journal_entry_confirmations_guard before insert on public.journal_entry_confirmations
  for each row execute function journal_entry_confirmations_guard();
alter table public.journal_entry_confirmations enable row level security;
create policy journal_entry_confirmations_insert on public.journal_entry_confirmations for insert to public
  with check ((confirmer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (journal_entries je JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND (je.superseded_by IS NULL) AND (je.deleted_at IS NULL) AND manages_organization(ec.organization_id)))));
create policy journal_entry_confirmations_select on public.journal_entry_confirmations for select to public
  using ((confirmer_id = auth.uid()) OR is_admin() OR (EXISTS ( SELECT 1 FROM journal_entries je
     WHERE ((je.id = journal_entry_confirmations.entry_id) AND owns_worker(je.worker_id)))) OR (EXISTS ( SELECT 1
   FROM (journal_entries je JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND manages_organization(ec.organization_id)))));
alter table public.journal_entries enable row level security;
create policy journal_entries_select on public.journal_entries for select
  using (owns_worker(worker_id) OR is_admin() OR (EXISTS ( SELECT 1 FROM engagement_contexts ec
      WHERE ((ec.id = journal_entries.engagement_context_id) AND manages_organization(ec.organization_id)))));
grant select, insert on public.journal_entry_confirmations to authenticated;
grant select on public.journal_entries, public.engagement_contexts, public.workers, public.profiles,
  public.company_memberships, public.organizations to authenticated;
-- production ACLs: postgres + authenticated EXECUTE only (no PUBLIC); guard fn postgres only
revoke all on function public.review_journal_entry(uuid,text,text), public.confirm_entry_and_verify_skills(uuid,uuid[],text),
  public.apply_learning_auto_confirmation(uuid), public.reviewable_journal_entry_ids(),
  public.journal_entry_confirmations_guard() from public, anon;
grant execute on function public.review_journal_entry(uuid,text,text), public.confirm_entry_and_verify_skills(uuid,uuid[],text),
  public.apply_learning_auto_confirmation(uuid), public.reviewable_journal_entry_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Dependency tables used by the counterparty slice (reduced to touched columns)
-- ---------------------------------------------------------------------------
create table public.projects (id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id), company_id uuid);
create table public.project_worker_assignments (id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id), worker_id uuid not null references public.workers(id),
  status text not null default 'active' check (status in ('active','ended')),
  assigned_at timestamptz not null default now(), ended_at timestamptz,
  unique (project_id, worker_id));
grant select on public.projects, public.project_worker_assignments to authenticated;
