-- ROLLBACK of 20261003150500_journal_counterparty_review_authority_v1.
-- Restores the exact prior production bodies of the three replaced functions
-- (read from pg_get_functiondef on 2026-10-03; md5 of normalised prosrc
-- re-checked against production on 2026-10-04) and drops everything the
-- forward migration created. SAFETY: the two new tables are dropped ONLY when
-- they hold zero rows - a counterparty acceptance or submission is legal
-- proof and is never discarded by a rollback. If rows exist this script
-- aborts and leaves the schema in place. No row of any pre-existing table is
-- touched in either direction.

begin;

do $$ begin
  if (select count(*) from public.work_counterparty_links) > 0
     or (select count(*) from public.journal_entry_review_submissions) > 0 then
    raise exception 'rollback_refused: counterparty links/submissions exist (legal proof); not dropping';
  end if;
  if exists (select 1 from public.journal_entry_confirmations
              where confirmation_scope #>> '{authority,basis}' = 'counterparty') then
    raise exception 'rollback_refused: counterparty confirmations exist';
  end if;
end $$;

-- 1. The single choke point -------------------------------------------------
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



drop function if exists public.list_counterparty_review_queue_v1();
drop function if exists public.submit_journal_entry_for_review_v1(uuid, uuid);
drop function if exists public.revoke_work_counterparty_link_v1(uuid);
drop function if exists public.register_work_counterparty_link_v1(uuid, uuid, text);
drop function if exists public.journal_entry_review_authority_v1(uuid, uuid);
drop table if exists public.journal_entry_review_submissions;
drop table if exists public.work_counterparty_links;
drop function if exists public.work_counterparty_link_valid_v1(uuid);
drop function if exists public.work_counterparty_append_only_v1();
drop function if exists public.profile_is_member_of_organization_v1(uuid, uuid);
drop function if exists public.profiles_co_manage_organization_v1(uuid, uuid);
drop function if exists public.profiles_share_organization_v1(uuid, uuid);
drop function if exists public.profile_manages_organization_v1(uuid, uuid);

commit;
