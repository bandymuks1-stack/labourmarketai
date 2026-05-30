-- 0034 — Manager review → evidence result (additive).
--
-- WHY: the work-journal review chain (0013) lets an org manager confirm/reject
-- a worker's entry, but it is gated ONLY by `manages_organization` and offers
-- no "request changes" outcome. The employment->journal bridge (0030/0032/0033)
-- now lets an owner connect an engagement_context and turn `journal_review_enabled`
-- ON for a specific worker relationship. This migration makes that flag the REAL
-- gate for review: a manager/admin may record an evidence result for an entry
-- ONLY when the worker's employment relationship to that org has review enabled.
-- It also adds the third decision (request changes) and persists every decision
-- as an append-only evidence row in the existing journal_entry_confirmations
-- table (whose SELECT RLS already exposes the result to the worker, the org
-- manager, and admin — migration 0013).
--
-- WHAT (additive — two functions; no schema/table/RLS/grant change to any table;
-- the only grant changes are EXECUTE on the two new functions):
--   public.review_journal_entry(p_entry_id, p_decision, p_note) -> text
--   public.reviewable_journal_entry_ids() -> setof uuid
--
-- review_journal_entry decisions (p_decision):
--   'approved' | 'rejected' | 'changes_requested'  (else -> 'invalid_decision')
-- and text outcomes (no exceptions for expected states):
--   <decision>               — the evidence row was written (approved/rejected/
--                              changes_requested returned verbatim on success).
--   'invalid_decision'       — p_decision not one of the three.
--   'entry_not_found'        — no such journal entry.
--   'entry_not_org_scoped'   — the entry's engagement has no organization.
--   'not_authorized'         — caller is neither admin nor a manager of the org.
--   'review_not_enabled'     — the worker's employment relationship to the org
--                              does NOT have journal_review_enabled = true. THIS
--                              is the core gate: no review result is ever
--                              recorded for a relationship review is off for.
--   'no_reviewer_engagement' — the caller has no active manager/owner engagement
--                              in the org to anchor the append-only evidence row
--                              (a pure platform admin with no org engagement).
--
-- reviewable_journal_entry_ids() returns the entry ids the caller may review
-- right now: in an org they manage (or any org if admin), where the worker's
-- employment relationship has journal_review_enabled = true, and the entry has
-- no evidence row yet (pending). The inbox intersects this gated set with its
-- own RLS-scoped read so it shows ONLY real reviewable entries.
--
-- SAFETY / honesty rules:
--   - Reviewer scope re-validated inside the function: is_admin() OR
--     manages_organization(org) — the same manager relationship the 0013 review
--     RLS uses. A worker can never review their own entry.
--   - journal_review_enabled gate is mandatory for the write: review is never
--     recorded from a label or an org link alone.
--   - Append-only: writes ONE journal_entry_confirmations row carrying the
--     decision; never updates/deletes an entry, never verifies skills here,
--     never creates fake workers/entries/orgs. No approve/reject of anything
--     except recording the manager's own decision as evidence.
--   - Every write also appends one row to the existing append-only
--     public.audit_logs (migration 0001) with the real actor.
--   - No RLS change, no table grant change, no DROP/RENAME/backfill, no fake
--     data, no email/outbound, no payment/marketplace. The only grant changes
--     are EXECUTE on the two new functions (revoke from public, grant to
--     authenticated).
--
-- Application status: file ships in this PR. Application to prod is OWNER-GATED
-- (CLAUDE.md: agents never apply production migrations). App wrappers degrade
-- gracefully via 42883 (function missing) until applied; until a relationship
-- has review enabled the reviewable set is honestly empty (no mock data).

-- ── review_journal_entry: the gated evidence write ──────────────────────
create or replace function public.review_journal_entry(
  p_entry_id uuid,
  p_decision text,
  p_note     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_org     uuid;
  v_worker  uuid;
  v_eng     uuid;
  v_role    text;
  v_action  text;
  v_enabled boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_decision not in ('approved','rejected','changes_requested') then
    return 'invalid_decision';
  end if;

  select ec.organization_id, je.worker_id
    into v_org, v_worker
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then
    return 'entry_not_found';
  end if;
  if v_org is null then
    return 'entry_not_org_scoped';
  end if;

  -- Reviewer scope: admin OR a manager of the entry's org (same relationship
  -- the 0013 review RLS uses). A worker can never review their own entry.
  if not (public.is_admin() or public.manages_organization(v_org)) then
    return 'not_authorized';
  end if;

  -- CORE GATE: the worker's employment relationship to this org must have
  -- journal review enabled (migration 0030/0033). Never review from a label.
  select exists (
    select 1
    from public.company_workers cw
    join public.organizations o on o.id = v_org and o.legacy_company_id = cw.company_id
    where cw.worker_id = v_worker and cw.journal_review_enabled is true
    union all
    select 1
    from public.agency_workers aw
    join public.organizations o on o.id = v_org and o.legacy_agency_id = aw.agency_id
    where aw.worker_id = v_worker and aw.journal_review_enabled is true
  ) into v_enabled;
  if not v_enabled then
    return 'review_not_enabled';
  end if;

  -- The append-only evidence row needs a confirmer engagement. Resolve the
  -- caller's active manager/owner engagement in the org.
  select ec.id, ec.relationship_slug
    into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid
    and ec.organization_id = v_org
    and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager')
  limit 1;
  if v_eng is null then
    return 'no_reviewer_engagement';
  end if;

  v_action := case p_decision
    when 'approved'           then 'confirm'
    when 'rejected'           then 'reject'
    when 'changes_requested'  then 'request_changes'
  end;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role,
     confirmation_scope)
  values
    (p_entry_id, uid, v_eng, v_role,
     jsonb_build_object(
       'action', v_action,
       'decision', p_decision,
       'note', nullif(btrim(coalesce(p_note, '')), '')));

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'review_journal_entry', 'journal_entries', p_entry_id,
    jsonb_build_object(
      'decision', p_decision, 'organization_id', v_org, 'worker_id', v_worker));

  return p_decision;
end $$;

revoke all on function
  public.review_journal_entry(uuid, text, text) from public;
grant execute on function
  public.review_journal_entry(uuid, text, text) to authenticated;

-- ── reviewable_journal_entry_ids: the gated pending set ─────────────────
create or replace function public.reviewable_journal_entry_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    join public.organizations o on o.id = ec.organization_id
    where (public.is_admin() or public.manages_organization(ec.organization_id))
      and exists (
        select 1
        from public.company_workers cw
        where cw.company_id = o.legacy_company_id
          and cw.worker_id = je.worker_id
          and cw.journal_review_enabled is true
        union all
        select 1
        from public.agency_workers aw
        where aw.agency_id = o.legacy_agency_id
          and aw.worker_id = je.worker_id
          and aw.journal_review_enabled is true
      )
      and not exists (
        select 1 from public.journal_entry_confirmations c
        where c.entry_id = je.id
      );
end $$;

revoke all on function
  public.reviewable_journal_entry_ids() from public;
grant execute on function
  public.reviewable_journal_entry_ids() to authenticated;
