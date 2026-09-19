-- @human-gate-approved
-- ============================================================================
-- 20260919210000_relationship_journal_reviewable_v1
-- RED — owner gate (INSTITUTION loop, EVIDENCE → COMPETENCY; found in the
-- 2026-09-19 full-vision trace). PREPARED, NOT APPLIED. The annotation above
-- acknowledges the class; it is not approval.
--
-- FINDING (traced on production 2026-09-19): a learner (engagement_contexts
-- relationship_slug = 'student', provisioned by the accepted learner
-- invitation) can record practice in the journal (archetypes
-- apprenticeship_training / supervised_practice), and the training provider
-- holds reviewer authority (manages_organization + owner/manager engagement).
-- But `review_journal_entry` requires `journal_review_enabled` on the entry's
-- engagement, and the ONLY writer of that flag — `set_engagement_journal_
-- review` — refuses every slug but 'employee':
--     if v_slug <> 'employee' then return 'not_a_member_engagement';
-- So a learner's entry always answers `review_not_enabled`. The institution
-- can invite, enrol and read demand, and can never confirm a single day of a
-- learner's practice. The loop INSTITUTION → … → EVIDENCE → COMPETENCY breaks
-- at exactly that predicate. Production today: 1 student engagement.
--
-- WHY NOT `in ('employee','student')`: 20260827210000 (learner visibility,
-- least privilege) already ruled that a hard-coded relationship taxonomy in a
-- predicate is the defect (ARCHITECTURE §6.2) — the next education
-- relationship (apprentice, trainee, mentee) would need a migration again.
-- The rule becomes DATA, exactly like `invitable` and
-- `grants_worker_visibility`: `relationship_types.journal_reviewable`.
--
-- MINIMUM CHANGE:
--   1. `relationship_types.journal_reviewable boolean not null default false`
--      — fail-closed: a relationship nobody ruled on cannot be opened to
--      review. Seeded TRUE for exactly `employee` (what is possible today —
--      ARCHITECTURE §7 review question B: nothing that works stops working)
--      and `student` (the approved intent). Everything else stays FALSE.
--   2. `set_engagement_journal_review` reads that column instead of the
--      literal. Body otherwise identical to the production definition
--      (restated in full, SECURITY DEFINER + pinned search_path, because
--      CREATE OR REPLACE drops SET config that is not restated).
--
-- CONSENT MODEL PRESERVED: the learner accepted the student relationship
-- personally (relationship invitation, 20260827200000); the provider's
-- reviewer authority is the same `manages_organization` ladder every
-- employer confirmation uses; the learner's entries in OTHER contexts are
-- untouched (review is per engagement context). `grants_worker_visibility`
-- for `student` stays FALSE — this opens the provider's review of the
-- learner's OWN practice entries in the provider's context, not the
-- learner's profile to employers.
--
-- RPL / FORMAL RECOGNITION (ARCH-2) UNTOUCHED: a confirmed practice entry is
-- evidence with source 'manager_confirmed', exactly like an employer's — it
-- asserts no qualification, no equivalence, no licence.
--
-- HOSTILE CONTRACT (run on the live function, rolled back, before apply):
--   provider manager on a 'student' engagement in their org → 'enabled'
--   provider manager on a 'student' engagement in ANOTHER org → 'not_authorized'
--   provider manager on a 'volunteer' / 'viewer' engagement → 'not_a_member_engagement'
--   the learner themselves on their own engagement → 'not_authorized'
--   'employee' → byte-identical to today
-- BLAST RADIUS: one new column with a default (no row rewrite semantics
-- beyond the default), two seed UPDATEs on a 10-row table, one function
-- redefinition. DOWN restores the function verbatim and drops the column.
-- ============================================================================

begin;

alter table public.relationship_types
  add column if not exists journal_reviewable boolean not null default false;

comment on column public.relationship_types.journal_reviewable is
  'May an organization manager open a journal review on an engagement of this relationship '
  '(set_engagement_journal_review)? The rule is DATA, not a predicate literal — fail-closed '
  'default; seeded true for employee (pre-existing behaviour) and student (institution loop, '
  '2026-09-19). Deciding it for a new relationship is an UPDATE, never a migration.';

update public.relationship_types
   set journal_reviewable = true
 where slug in ('employee', 'student');

create or replace function public.set_engagement_journal_review(p_engagement_id uuid, p_enabled boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org uuid; v_slug text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id, relationship_slug into v_org, v_slug from public.engagement_contexts where id = p_engagement_id;
  if not found then return 'engagement_not_found'; end if;
  if v_org is null then return 'engagement_not_org_scoped'; end if;
  -- The rule is data (relationship_types.journal_reviewable), not a literal.
  if not exists (select 1 from public.relationship_types rt
                  where rt.slug = v_slug and rt.journal_reviewable) then
    return 'not_a_member_engagement';
  end if;
  if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
  update public.engagement_contexts set journal_review_enabled = p_enabled, updated_at = now() where id = p_engagement_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_engagement_journal_review', 'engagement_contexts', p_engagement_id, jsonb_build_object('organization_id', v_org, 'enabled', p_enabled, 'relationship_slug', v_slug));
  return case when p_enabled then 'enabled' else 'disabled' end;
end $$;

-- Anon closure (20260722160000) cannot reach a function created after it:
-- state the grants explicitly, as every later SECURITY DEFINER does.
revoke all on function public.set_engagement_journal_review(uuid, boolean) from public, anon;
grant execute on function public.set_engagement_journal_review(uuid, boolean) to authenticated;

commit;
