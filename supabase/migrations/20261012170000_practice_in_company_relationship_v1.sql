-- practice_in_company_relationship_v1 — a separate "practice in a company"
-- relationship that needs no training-provider status.
--
-- OWNER DECISION 2 (2026-10-12): create a separate "practice in a company"
-- relationship, without requiring training-provider status.
--
-- WHY. The only relationship that models a person doing supervised practice is
-- `student`, which `requires_organization_role = 'training_provider'`: only an
-- organization that declared it provides education may invite one. A company
-- that hosts a trainee (practice placement, work experience) is not a training
-- provider, so today it can only call that person an `employee` (a claim about
-- employment that is false) or a `volunteer` (not reviewable, so the practice
-- can never become confirmed evidence). This adds the missing, honest
-- relationship as DATA, exactly the way the registry was designed to grow
-- (relationship_invitations_v1: "adding a new invitable relationship is a row
-- here"). No function, policy, grant or table changes.
--
-- WHAT. One row in `public.relationship_types`:
--   slug                       intern
--   category                   education   (the closest existing category; no new one)
--   invitable                  true        (a company may offer it, a person may accept)
--   requires_organization_role NULL        (NO training-provider status needed)
--   grants_worker_visibility   false       (least privilege, like student/volunteer:
--                                           hosting practice does not open the
--                                           person's whole profile)
--   journal_reviewable         true        (the host can sign off the practice, so it
--                                           can become evidence - the point of it)
--
-- Everything downstream is already data-driven: create_invitation_v1 reads
-- `invitable` / `requires_organization_role`; set_engagement_journal_review reads
-- `journal_reviewable`; the accept path stamps the invitation's relationship_slug.
-- Review is NOT switched on automatically for this relationship: the host opens
-- it through the existing audited manual door.
--
-- IDEMPOTENT: `on conflict (slug) do nothing`. Strictly additive; existing rows
-- and behavior are untouched.
--
-- ROLLBACK: supabase/rollbacks/20261012170000_practice_in_company_relationship_v1.down.sql
-- (guarded: refuses while any engagement or invitation uses the slug).

begin;

insert into public.relationship_types
  (slug, category, is_active, invitable, requires_organization_role, grants_worker_visibility, journal_reviewable)
values
  ('intern', 'education', true, true, null, false, true)
on conflict (slug) do nothing;

commit;
