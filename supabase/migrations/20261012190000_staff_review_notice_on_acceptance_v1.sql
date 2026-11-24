-- @human-gate-approved  (RED: SECURITY DEFINER function + grant + new columns; owner approval required BEFORE apply)
-- staff_review_notice_on_acceptance_v1 — the auditable acceptance fact behind
-- "work review switches on for an employee who accepted knowingly".
--
-- OWNER DECISION 1 (2026-10-12, refined the same evening): finish the automatic
-- work-review feature; tell the worker clearly on the addressed-signup, network
-- list and chat accept paths; keep an AUDITABLE acceptance fact, organization
-- isolation and the manager's manual switch-off; only switch the automation on
-- after every path is proven.
--
-- WHY A MIGRATION. #2317/#2320 ran a heuristic on the manager's dashboard
-- ("context untouched since creation", "accepted after a date"). Neither is a
-- fact: nothing recorded that THIS person saw THIS sentence, and a manager's
-- manual choice was inferred from `updated_at`. The app now shows the sentence
-- on every accept surface and passes its version only when it was on screen
-- (apps/web/lib/operations/auto-review-model.ts). This migration gives that
-- statement a place to live and ONE party-gated door that writes it.
--
-- WHAT.
--   1. Three nullable columns on public.invitation_acceptances:
--        review_notice_version  text         which sentence was shown
--        review_notice_surface  text         where (closed set, mirrors the app)
--        review_notice_at       timestamptz  when it was recorded
--      Readable exactly like the row already is (the person, the inviter, the
--      organization authority, admins — invitation_acceptances_select is
--      unchanged). No client can write them: authenticated holds SELECT only on
--      this table, and that grant is unchanged.
--   2. public.record_staff_review_notice_v1(p_invitation_id, p_notice_version,
--      p_surface, p_enable_review) — SECURITY DEFINER, authenticated only. In
--      the CALLER's session it:
--        - finds the caller's OWN `accepted` acceptance row for the invitation
--          (FOR UPDATE; nobody can stamp another person's acceptance);
--        - refuses a second stamp (single-use) and an acceptance older than
--          15 minutes (the sentence must accompany the accept; no retrofit);
--        - re-checks the invitation is a staff invitation (join_organization /
--          join_team / join_as_employee, relationship slug NULL or employee) of
--          an organization, and that the relationship the acceptance points at
--          is that SAME organization's ACTIVE `employee` engagement of the
--          caller — organization isolation in SQL, not in the app;
--        - stamps the three columns and writes an audit_logs row
--          (action staff_review_notice_accepted, actor = the person);
--        - ONLY when p_enable_review is true AND the acceptance CREATED the
--          relationship (relationship = 'engagement_created') AND no manager has
--          ever chosen for that engagement (no `set_engagement_journal_review`
--          audit row — on OR off), switches review on and audits it as
--          automatic (action auto_enable_engagement_journal_review). A manual
--          choice, before or after, always wins: this runs once per acceptance
--          and never again, and the manager's existing door is untouched.
--
-- NOT CHANGED: set_engagement_journal_review, every accept RPC, every policy,
-- every table grant. No service_role use. No data is rewritten: existing
-- acceptance rows keep NULLs (never "saw the sentence").
--
-- APP SWITCH: apps/web passes p_enable_review = STAFF_REVIEW_AUTO_ENABLE (false)
-- until every surface is proven to record the fact in production.
--
-- ROLLBACK: supabase/rollbacks/20261012190000_staff_review_notice_on_acceptance_v1.down.sql
-- (drops the function; drops the columns only while no acceptance carries a stamp).

begin;

alter table public.invitation_acceptances
  add column if not exists review_notice_version text
    check (review_notice_version is null or review_notice_version ~ '^staff-review-notice-v[0-9]{1,3}$'),
  add column if not exists review_notice_surface text
    check (review_notice_surface is null
           or review_notice_surface in ('invite_page','addressed_signup','onboarding','network','conversation')),
  add column if not exists review_notice_at timestamptz;

create or replace function public.record_staff_review_notice_v1(
  p_invitation_id  uuid,
  p_notice_version text,
  p_surface        text,
  p_enable_review  boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_acc     public.invitation_acceptances%rowtype;
  v_inv     public.invitations%rowtype;
  v_ctx     public.engagement_contexts%rowtype;
  v_outcome text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_invitation_id is null
     or p_notice_version is null or p_notice_version !~ '^staff-review-notice-v[0-9]{1,3}$'
     or p_surface is null
     or p_surface not in ('invite_page','addressed_signup','onboarding','network','conversation') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  -- The caller's OWN accepted acceptance only.
  select a.* into v_acc from public.invitation_acceptances a
   where a.invitation_id = p_invitation_id
     and a.profile_id = uid
     and a.decision = 'accepted'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_acc.review_notice_version is not null then
    return jsonb_build_object('outcome', 'already_recorded');
  end if;
  -- The sentence accompanies the accept; it is never stamped on afterwards.
  if v_acc.decided_at < now() - interval '15 minutes' then
    return jsonb_build_object('outcome', 'too_late');
  end if;

  select i.* into v_inv from public.invitations i where i.id = p_invitation_id;
  if not found
     or v_inv.organization_id is null
     or v_inv.invitation_type not in ('join_organization','join_team','join_as_employee')
     or coalesce(v_inv.relationship_slug, 'employee') <> 'employee' then
    return jsonb_build_object('outcome', 'not_applicable');
  end if;

  -- Organization isolation: the relationship is THIS organization's active
  -- employee engagement of the caller, or nothing happens.
  select ec.* into v_ctx from public.engagement_contexts ec
   where ec.id = v_acc.relationship_id
     and ec.profile_id = uid
     and ec.organization_id = v_inv.organization_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_applicable');
  end if;

  update public.invitation_acceptances
     set review_notice_version = p_notice_version,
         review_notice_surface = p_surface,
         review_notice_at = now()
   where id = v_acc.id;

  v_outcome := 'recorded';
  if coalesce(p_enable_review, false) then
    if v_ctx.journal_review_enabled then
      v_outcome := 'already_on';
    elsif v_acc.relationship is distinct from 'engagement_created'
       or exists (select 1 from public.audit_logs l
                   where l.entity = 'engagement_contexts'
                     and l.entity_id = v_ctx.id
                     and l.action = 'set_engagement_journal_review')
       or not exists (select 1 from public.relationship_types rt
                       where rt.slug = 'employee' and rt.journal_reviewable) then
      -- A relationship that existed before this acceptance, or one a manager
      -- already chose for (on OR off), is never switched by the automation.
      v_outcome := 'manual_choice_kept';
    else
      update public.engagement_contexts
         set journal_review_enabled = true, updated_at = now()
       where id = v_ctx.id;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'auto_enable_engagement_journal_review', 'engagement_contexts', v_ctx.id,
              jsonb_build_object('organization_id', v_inv.organization_id,
                                 'enabled', true,
                                 'relationship_slug', 'employee',
                                 'basis', 'employee_acceptance_with_notice',
                                 'invitation_id', p_invitation_id,
                                 'notice_version', p_notice_version));
      v_outcome := 'review_enabled';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'staff_review_notice_accepted', 'invitation_acceptances', v_acc.id,
          jsonb_build_object('invitation_id', p_invitation_id,
                             'organization_id', v_inv.organization_id,
                             'engagement_context_id', v_ctx.id,
                             'notice_version', p_notice_version,
                             'surface', p_surface,
                             'enable_requested', coalesce(p_enable_review, false),
                             'outcome', v_outcome));

  return jsonb_build_object('outcome', v_outcome);
end;
$$;

revoke all on function public.record_staff_review_notice_v1(uuid, text, text, boolean) from public;
revoke all on function public.record_staff_review_notice_v1(uuid, text, text, boolean) from anon;
grant execute on function public.record_staff_review_notice_v1(uuid, text, text, boolean) to authenticated;

commit;
