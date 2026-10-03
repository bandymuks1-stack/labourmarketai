-- @human-gate-approved
--
-- SAFETY CLASS: RED (SECURITY DEFINER authorization change on the
-- confirmation write path = auth-core of the trust model). Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. This marker is the risk acknowledgement, not an
-- approval.
--
-- 20261003150000 — EVID-2: SELF_DECLARED != CONFIRMED_BY_AUTHORIZED_OTHER_PARTY
--
-- OWNER DECISION (binding): a person may DECLARE, SUBMIT, ATTACH EVIDENCE to and
-- DESCRIBE their own work, but must not turn their own assertion into
-- independently confirmed work by reviewing it themselves.
--
-- DEFECT (production, read 2026-10-03): `review_journal_entry`,
-- `confirm_entry_and_verify_skills` and `apply_learning_auto_confirmation`
-- authorise on `is_admin() OR manages_organization(org)` and never compare the
-- reviewer with the entry's worker; the direct-INSERT RLS policy
-- `journal_entry_confirmations_insert` has the same gap. Anyone holding a
-- manager/owner engagement can therefore approve - and flip skills to
-- `verified` for - work they logged themselves.
-- Measured: 21 confirmation rows, 5 of them self-authored; 6 verified skills,
-- 2 verified by their own subject.
--
-- FIX (forward-only, same signatures, same ACLs on production, CREATE OR REPLACE
-- only; explicit REVOKEs are no-ops on production):
--   1. journal_entry_confirmations_guard() (BEFORE INSERT trigger = the single
--      choke point for ALL writers, including the RLS direct-INSERT policy and
--      any future function) refuses a row whose confirmer_id is the entry
--      worker's own profile. NULL-safe: a worker without a profile can never
--      match; confirmer_id is NOT NULL.
--   2. review_journal_entry / confirm_entry_and_verify_skills /
--      apply_learning_auto_confirmation return the clean status
--      'self_review_not_allowed' BEFORE inserting anything, after the existing
--      authority check (so an outsider still just gets 'not_authorized').
--   3. reviewable_journal_entry_ids(): the reviewer's own entries are no longer
--      offered to them as cards they could only be refused on. Another
--      authorized reviewer still sees them, INCLUDING entries whose only
--      confirmation is a historical self-confirmation (those stay reviewable so
--      the independent decision can still be recorded).
--
-- NOT TOUCHED: any existing row (confirmations stay append-only and are NOT
-- rewritten; the 5 historical self-confirmations and 2 self-verified
-- worker_skills rows are preserved - they are classified at read time by the
-- app, see lib/journal/review-status.ts isSelfConfirmation), self-declared
-- submission, the independent-confirmation path, grants, policies, tables.
--
-- Rollback: supabase/rollbacks/20261003150000_journal_confirmation_self_review_block_v1.down.sql
-- (restores the exact prior production bodies).

begin;

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
  v_worker     uuid;
begin
  -- LOCK STRENGTH (rev12, Codex P1): FOR UPDATE, not FOR KEY SHARE. The two
  -- staleness paths take DIFFERENT locks: the supersedes take an explicit
  -- FOR UPDATE, but journal_entry_soft_delete (0018) is a bare
  -- `update ... set deleted_at, updated_at` touching no key column, so it
  -- takes only FOR NO KEY UPDATE. FOR KEY SHARE conflicts with the former but
  -- NOT the latter, so a confirmation racing a SOFT DELETE could pass this
  -- guard and commit - leaving an append-only confirmation attached to a
  -- deleted entry. FOR UPDATE conflicts with both.
  select superseded_by, deleted_at, worker_id
    into v_superseded, v_deleted, v_worker
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
  -- EVID-2: SELF_DECLARED != CONFIRMED_BY_AUTHORIZED_OTHER_PARTY. The author of
  -- an entry can never be the confirmer of it, whatever authority they hold.
  if exists (
    select 1 from public.workers w
     where w.id = v_worker
       and w.profile_id is not null
       and coalesce(w.profile_id = new.confirmer_id, false)
  ) then
    raise exception 'self_review_not_allowed' using errcode = '42501';
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
  -- EVID-2: nobody reviews their own entry (the guard trigger is the hard stop).
  if exists (select 1 from public.workers w
              where w.id = v_worker and w.profile_id is not null
                and coalesce(w.profile_id = uid, false)) then
    return 'self_review_not_allowed';
  end if;
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
  -- EVID-2: nobody verifies their own skills through their own entry.
  if exists (select 1 from public.workers w
              where w.id = v_worker and w.profile_id is not null
                and coalesce(w.profile_id = uid, false)) then
    return 'self_review_not_allowed';
  end if;
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
  -- EVID-2: an automatic confirmation is still a confirmation; the caller can
  -- never be the author of the entry being auto-confirmed.
  if exists (select 1 from public.workers w
              where w.id = v_eworker and w.profile_id is not null
                and coalesce(w.profile_id = uid, false)) then
    return 'self_review_not_allowed';
  end if;
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
      -- EVID-2: the caller's own entries are never reviewable BY THE CALLER.
      and not exists (select 1 from public.workers w
                       where w.id = je.worker_id and w.profile_id is not null
                         and coalesce(w.profile_id = auth.uid(), false))
      -- ...and a historical SELF-confirmation does not count as "already reviewed",
      -- so another authorized reviewer can still give the independent decision.
      and not exists (
        select 1 from public.journal_entry_confirmations c
         where c.entry_id = je.id
           and not exists (select 1 from public.workers w2
                            where w2.id = je.worker_id and w2.profile_id is not null
                              and coalesce(w2.profile_id = c.confirmer_id, false)));
end $function$;

-- 4. ACL hygiene (no-op on production, whose ACLs already match) -------------
-- CREATE OR REPLACE preserves the existing ACL, so production keeps exactly
-- {postgres, authenticated} (guard: {postgres}). The explicit revokes make a
-- from-scratch local reset reproduce the same closed ACL instead of inheriting
-- the environment's default EXECUTE grant (secdef-local-reset-reproducibility).
-- Nothing is granted here.
revoke all on function public.review_journal_entry(uuid, text, text) from public;
revoke all on function public.review_journal_entry(uuid, text, text) from anon;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) from public;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[], text) from anon;
revoke all on function public.apply_learning_auto_confirmation(uuid) from public;
revoke all on function public.apply_learning_auto_confirmation(uuid) from anon;
revoke all on function public.reviewable_journal_entry_ids() from public;
revoke all on function public.reviewable_journal_entry_ids() from anon;
revoke all on function public.journal_entry_confirmations_guard() from public;
revoke all on function public.journal_entry_confirmations_guard() from anon;
revoke all on function public.journal_entry_confirmations_guard() from authenticated;

commit;
