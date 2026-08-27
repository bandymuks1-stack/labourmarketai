-- @human-gate-approved
-- ============================================================================
-- OWNER-APPROVED AND APPLIED. Owner ruling 2026-08-27 §1, verbatim:
--   "APPROVED: Apply migration 20260827200000 using the canonical Supabase MCP
--    apply_migration path only. Do NOT use db push."
--
-- APPLIED to production 2026-08-27 via Supabase MCP `apply_migration`
-- (name `relationship_invitations_v1`), recorded in the ledger as version
-- 20260827132137 — the ledger version differs from this filename because the
-- MCP path stamps its own, which is the repo's normal, expected behaviour.
--
-- POST-APPLY VERIFICATION, run against production and recorded here rather
-- than promised (the block at the end of this file is what was executed):
--   registry            student t/training_provider · volunteer t · employee t
--                       collaborator t · freelancer t · consultant t ·
--                       manager f · owner f · viewer f · unemployed f
--   invitations         0 rows total, 0 carrying relationship_slug — so NO
--                       existing invitation changed meaning
--   create_invitation_v1  exactly ONE definition, 10 arguments — the 9-argument
--                       predecessor is gone, so no call is ambiguous
--   engagement_contexts 40 employee + 13 owner active, unchanged
--
-- ROLLBACK READINESS re-checked at apply time and still valid:
-- supabase/rollbacks/20260827200000_relationship_invitations_v1.down.sql
-- restores the 9-argument creator and the two-slug acceptance CASE, and leaves
-- real relationships in place.
--
-- The annotation above lets CI classify this as an intentional, human-reviewed
-- RED change. It is an acknowledgement, NOT an auto-merge pass: the PR stays
-- draft with `needs-human-gate`.
--
-- The `can_view_worker` consequence disclosed below was ruled on separately by
-- the owner the same day and is answered by 20260827210000. Read that file
-- before reading the DISCLOSED CONSEQUENCE section here — it is no longer the
-- final word.
--
-- 20260827200000 — relationship invitations v1 (education pilot P0-C).
--
-- ── PROBLEM (measured on production + a clean local reset, 2026-08-27) ──────
-- `docs/CAPABILITY_INVENTORY.md` §4 blocker 1: "Institution ↔ learner link is
-- MISSING. An institution can now declare what it is, and still cannot connect
-- a student. No invite/join flow exists."
--
-- That is exact, and the reason is one line of SQL. The canonical invitation
-- model (20260712200000, applied + production-verified 20/20) already carries
-- the entire lifecycle — token custody, single-use acceptance, expiry, revoke,
-- token-rotating resend, per-inviter caps, audit, no email enumeration. What it
-- cannot do is produce any relationship other than two hardcoded ones:
--
--     v_slug := case when v_row.invitation_type = 'collaborate_partner'
--                    then 'collaborator' else 'employee' end;
--
-- Meanwhile `relationship_types` has shipped `student` (category 'education')
-- and `volunteer` since 0002, and 20260826182421 already made both writable on
-- the SELF-DECLARED path. So the vocabulary exists, the person can already
-- declare a placement about themselves — and an organization still has no way
-- to establish that relationship WITH them. Production: 53 engagement_contexts
-- rows, every one `employee` or `owner`. Zero placements, zero learners.
--
-- ── WHY NOT `join_as_student` (the cheap fix, deliberately refused) ─────────
-- Adding a 'join_as_student' invitation_type + a third arm on that CASE would
-- close the pilot's ticket and re-commit the exact narrowing ARCHITECTURE.md
-- §6.2 lists as a rejectable failure mode: "hardcoding today's actor/
-- relationship taxonomy as exhaustive". The next relationship — mentor,
-- apprentice, trainee, board member — would need another migration, and the
-- one after that another. PLATFORM_DOCTRINE §10 says the same thing from the
-- other side: a taxonomy is a slug registry, "never a hardcoded enum for
-- anything extensible".
--
-- ── SOLUTION: the relationship becomes DATA, exactly like organization_roles ─
-- `invitations` gains a nullable `relationship_slug` pointing at the registry
-- that already exists. Acceptance uses it when present and falls back to the
-- byte-identical CASE when absent. After this, establishing a NEW kind of
-- relationship by invitation is an UPDATE on `relationship_types` plus a
-- translation — never a migration. That is the same promise 20260827050000
-- made for organization capabilities, kept for person↔organization
-- relationships.
--
-- Two DATA columns on the registry carry the rules:
--   invitable                   — may this relationship be established by
--                                 invitation at all? (owner/manager/viewer/
--                                 unemployed: no. See the seed for why.)
--   requires_organization_role  — which capability must the organization have
--                                 declared first? `student` requires
--                                 `training_provider`, so an organization that
--                                 has never said it provides education cannot
--                                 name anyone its learner. This is what finally
--                                 makes the capability declaration MEAN
--                                 something instead of being a stored fact no
--                                 code reads.
--
-- ── NO NEW invitation_type, NO WIDENED CHECK ───────────────────────────────
-- A learner invitation is `join_organization` + relationship_slug='student'.
-- The person IS joining the organization; the slug names the capacity. So the
-- `invitations_invitation_type_check` and `invitations_context_chk`
-- constraints are UNTOUCHED — org context is already required for that type.
-- The type is internal vocabulary and never reaches a reader (invariant I-8);
-- the screen asks "who are you inviting?" in plain language.
--
-- ── COMPATIBILITY (the whole point) ────────────────────────────────────────
-- `relationship_slug` is NULLABLE and every existing row keeps it NULL, so
-- every invitation created before this migration accepts into exactly the
-- relationship it would have before. No row is updated or deleted. No policy
-- is altered. No grant is widened. The two new registry columns default to
-- `false` / NULL, so a relationship is NOT invitable until deliberately
-- seeded — fail-closed, not fail-open.
--
-- ── DISCLOSED CONSEQUENCE: WHO CAN SEE THE LEARNER (owner decision) ────────
-- This migration creates a NEW KIND of active engagement_contexts row, and one
-- existing security predicate keys on engagement_contexts WITHOUT looking at
-- relationship_slug. `public.can_view_worker(w)` (read back 2026-08-27) ends
-- with, among its branches:
--
--     or exists (
--       select 1 from public.engagement_contexts ec
--       join public.workers x on x.id = w and x.profile_id = ec.profile_id
--       where ec.status = 'active'
--         and public.manages_organization(ec.organization_id))
--
-- CONSEQUENCE, stated plainly: once a learner accepts, the institution's
-- managers can see that learner exactly as they could see an employee. Nothing
-- here changes that predicate — it already treats every active engagement
-- alike — but this migration makes a class of engagement reachable that could
-- not previously exist, so the practical disclosure surface DOES grow.
--
-- MEASURED on a local stack, 2026-08-27, with the link created and rolled back
-- (institution = owner of Dev Construction, learner = Dev Worker):
--     can_view_worker(learner)            -> t   (was f before the link)
--     can_view_worker(unrelated worker)   -> f   (unchanged)
--     select from public.workers          -> 1 row, its own, BEFORE and AFTER
-- i.e. the link grants resolution of ONE named learner and does not open an
-- enumerable directory: `workers` RLS still refuses to list anyone else.
--
-- WHAT IS *NOT* TRUE, and was measured rather than assumed:
--   * it is per-LEARNER, not a directory. The branch is bound to a specific
--     worker's own engagement row, so an institution still cannot browse
--     learners it has no relationship with.
--   * it requires the learner's own ACCEPTANCE. `accept_invitation_v1` runs as
--     the invited person; nobody can create this row on their behalf.
--   * an employer does NOT inherit it. The branch requires
--     manages_organization of the SAME organization.
--
-- WHY IT IS NOT "FIXED" HERE: narrowing can_view_worker by relationship_slug
-- would change an auth-core predicate that every employer flow depends on —
-- a separate, larger, separately-approved change (the envelope classes
-- auth-core edits RED on their own). Widening quietly would be worse than
-- either. So it is DISCLOSED and left to the owner: if a learner should be
-- LESS visible to a school than an employee is to an employer, that is a
-- deliberate product decision and it needs its own slice.
--
-- ── SAFETY CLASS: RED ──────────────────────────────────────────────────────
-- Nothing here is destructive, but the envelope classes these as RED and RED
-- is absolute:
--   * CREATE OR REPLACE ... SECURITY DEFINER (detector g) — two RPCs.
--   * DROP FUNCTION (detector) — see the note at §5. It is a REPLACE of the
--     9-argument create_invitation_v1 by its 10-argument successor, not a
--     removal of capability: Postgres treats an added defaulted parameter as a
--     NEW function, and leaving both would make every 9-positional-arg call
--     ambiguous ("function is not unique"). PostgREST calls by NAME, so an app
--     build that omits the new argument resolves to the default and keeps
--     working — the deploy window is safe in both directions.
-- No table is dropped, no column is dropped, no RLS policy is changed.
--
-- ROLLBACK: supabase/rollbacks/20260827200000_relationship_invitations_v1.down.sql
--   restores the 9-argument creator and the two-slug acceptance CASE. Learner
--   engagements created in the meantime are REAL relationships two people
--   agreed to and are LEFT IN PLACE (same convention as 20260714161000 and
--   20260826182421) — reverting a validation rule must never delete history.
--   After a rollback those rows remain readable and remain endable through the
--   normal end-engagement path.
--
-- POST-APPLY VERIFICATION: see the block at the end of this file.
-- ============================================================================

begin;

-- ── 1. The registry gains the two rules, as DATA ────────────────────────────
alter table public.relationship_types
  add column if not exists invitable boolean not null default false;

alter table public.relationship_types
  add column if not exists requires_organization_role text
    references public.organization_role_types(slug);

comment on column public.relationship_types.invitable is
  'May an organization establish this relationship by INVITATION? Fail-closed: '
  'false by default. Adding a new invitable relationship is an UPDATE here, '
  'never a migration (PLATFORM_DOCTRINE §10, ARCHITECTURE §6.2).';

comment on column public.relationship_types.requires_organization_role is
  'The organization capability (organization_role_types.slug) that must be '
  'declared before this relationship may be offered. NULL = no capability '
  'required. This is what makes a declared capability consequential.';

-- ── 2. Seed the rules ───────────────────────────────────────────────────────
-- INVITABLE — a relationship one party may offer and the other may accept.
--   student / volunteer  the education pilot's whole point; both already exist
--                        in the registry and on the self-declared write path.
--   employee / collaborator / freelancer / consultant
--                        already reachable today through the hardcoded CASE;
--                        naming them here changes nothing and keeps the two
--                        paths from disagreeing about what is offerable.
-- NOT INVITABLE, deliberately:
--   owner        ownership is a transfer, not an invitation. Separate decision,
--                separate consequences.
--   manager      administrative AUTHORITY over other people's records. It is
--                granted through the membership/authority path that already
--                exists and audits it; routing it through a mailed token would
--                be a privilege-escalation surface, not a convenience.
--   viewer       not a relationship to an organization in this model.
--   unemployed   a STATUS a person holds, which nobody may assign to them.
update public.relationship_types
   set invitable = true
 where slug in ('student', 'volunteer', 'employee',
                'collaborator', 'freelancer', 'consultant');

-- REQUIRES A CAPABILITY — currently exactly one, and it is the pilot's point:
-- calling a person your student is a claim about what your organization DOES.
-- An organization that never declared it provides education cannot make it.
update public.relationship_types
   set requires_organization_role = 'training_provider'
 where slug = 'student';

-- ── 3. The invitation carries the intended relationship ─────────────────────
alter table public.invitations
  add column if not exists relationship_slug text
    references public.relationship_types(slug);

comment on column public.invitations.relationship_slug is
  'The relationship acceptance should establish. NULL = the historical '
  'per-type default (employee, or collaborator for collaborate_partner), so '
  'every pre-existing invitation is unaffected.';

-- ── 4. Sender-side validation ───────────────────────────────────────────────
-- REPLACES the 9-argument creator (see the DROP note in the SAFETY CLASS
-- block). Body provenance: this is the current definition with ONE new
-- parameter and ONE new validation block; the auth check, the type/email
-- checks, the context permission, the caps, the dedup, the insert and the
-- audit row are unchanged.
drop function if exists public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text);

create or replace function public.create_invitation_v1(
  p_token_hash      text,
  p_invitation_type text,
  p_invited_email   text,
  p_invited_name    text default null,
  p_organization_id uuid default null,
  p_project_id      uuid default null,
  p_proposed_role   text default null,
  p_personal_message text default null,
  p_locale          text default null,
  p_relationship_slug text default null
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

  -- ── NEW: the relationship, when one is named ──────────────────────────────
  -- Absent → the historical per-type default, and this block is inert.
  if v_rel is not null then
    -- Only an organization-scoped invitation establishes a person↔organization
    -- relationship. A platform or project invitation has no organization for
    -- the relationship to be WITH, so naming one is a caller error.
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    -- Unknown, inactive, or not offerable → refused. Fail-closed: a slug that
    -- nobody deliberately marked invitable is not invitable.
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    -- The capability gate. An organization may only establish a relationship
    -- it has declared it is in the business of: calling someone your student
    -- is a claim about what your organization does.
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
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

  -- One live invitation per (inviter, email, type, context, relationship).
  -- The relationship joins the key: inviting the same person as a learner AND
  -- as an employee are two different offers, and neither should silently
  -- swallow the other.
  if exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug
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
    uid,
    v_rel
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v1', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'relationship_slug', v_rel));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

-- The ACL does not survive a DROP, so the floor is restated rather than
-- assumed. authenticated only — never anon (20260722160000 secdef closure).
revoke all on function public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text, text) to authenticated;

-- ── 5. Acceptance honours the named relationship ────────────────────────────
-- Body provenance: the current definition with ONE line changed — the CASE
-- becomes the FALLBACK of a coalesce. Everything else (the FOR UPDATE lock,
-- the status/expiry ladder, the existing-engagement reuse, the project arm,
-- the single-use update and the audit row) is unchanged.
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

  -- Canonical relationship per invitation.
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    -- The relationship the INVITER named, when they named one. The CASE below
    -- is the pre-20260827200000 behaviour and remains the answer for every
    -- invitation that carries no slug — which is every invitation that existed
    -- before this migration.
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
      'relationship_slug', v_slug,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'relationship_slug', v_slug,
    'invitation_type', v_row.invitation_type,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id
  );
end $$;

revoke all on function public.accept_invitation_v1(text) from public, anon;
grant execute on function public.accept_invitation_v1(text) to authenticated;

-- ── 6. accept_invitation_by_id_v1 — the in-app half of the same acceptance ──
-- Same one-line change. This is the path a signed-in learner uses when the
-- invitation is listed for them rather than opened from a mailed link, and it
-- would otherwise still create an `employee` engagement for a learner
-- invitation — the exact false statement this migration exists to prevent.
--
-- BODY PROVENANCE: this is the CURRENT definition verbatim — including the
-- JWT-claim email source, the select-by-id-then-compare shape that keeps the
-- path from becoming an enumeration oracle, and the nested declare block —
-- with ONE line changed (the CASE becomes the fallback of a coalesce) and the
-- resolved slug added to the audit row and the return value.
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
      -- CHANGED 20260827200000: the relationship the inviter named, falling
      -- back to the pre-migration CASE for every invitation without one.
      v_slug := coalesce(
        nullif(v_token_row.relationship_slug, ''),
        case when v_token_row.invitation_type = 'collaborate_partner'
             then 'collaborator' else 'employee' end);
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
        'relationship', v_relationship, 'relationship_id', v_new,
        'relationship_slug', v_slug));

    return jsonb_build_object(
      'outcome', 'accepted',
      'relationship', v_relationship,
      'relationship_slug', v_slug,
      'invitation_type', v_token_row.invitation_type,
      'organization_id', v_token_row.organization_id,
      'project_id', v_token_row.project_id
    );
  end;
end $$;

revoke all on function public.accept_invitation_by_id_v1(uuid) from public, anon;
grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;

-- ── 7. The invited person must SEE what they are agreeing to ────────────────
-- CONSENT, not decoration. Without this the preview screen can say "Dev
-- Construction invites you to join" and nothing more, so a learner would accept
-- an invitation without being told whether they are about to become a STUDENT
-- or an EMPLOYEE of that organization. Those are materially different claims
-- about a person, and one of them is a statement about employment.
--
-- Adding the field is additive: `relationship_slug` is NULL on every existing
-- invitation, so every existing preview returns exactly what it returns today.
-- The renderer resolves the slug through the localized `relationshipTypes`
-- catalogue, so no database word reaches the reader (invariant I-8).
--
-- BODY PROVENANCE: current definition, ONE key added to the returned object.
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
    'inviter_name', v_inviter_name,
    -- NEW 20260827200000. NULL for every pre-existing invitation.
    'relationship_slug', v_row.relationship_slug
  );
end $$;

revoke all on function public.get_invitation_preview_v1(text) from public, anon;
grant execute on function public.get_invitation_preview_v1(text) to authenticated;

-- ── 8. The SAME disclosure on the in-app path ───────────────────────────────
-- `get_invitation_preview_v1` (§7) serves the mailed-link screen. A signed-in
-- person more often accepts from the list of invitations addressed to them,
-- which is served by this function — and it returned no relationship either.
-- Leaving it would mean the disclosure depended on WHICH door the learner came
-- through, and the more common door would be the silent one.
--
-- BODY PROVENANCE: current definition, ONE key added to the built object.
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
        -- NEW 20260827200000. NULL for every pre-existing invitation.
        'relationship_slug', i.relationship_slug,
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

revoke all on function public.list_invitations_for_me_v1() from public, anon;
grant execute on function public.list_invitations_for_me_v1() to authenticated;

commit;

-- ── POST-APPLY VERIFICATION (run as owner, record the output) ───────────────
--   select slug, invitable, requires_organization_role
--     from public.relationship_types order by slug;
--     -- expect: student t training_provider · volunteer t null ·
--     --         employee/collaborator/freelancer/consultant t null ·
--     --         manager/owner/viewer/unemployed f null
--
--   select count(*) from public.invitations where relationship_slug is not null;
--     -- expect 0 at apply: no existing invitation changes meaning
--
--   -- as an organization owner WITHOUT training_provider:
--   select public.create_invitation_v1(repeat('a',64), 'join_organization',
--     'x@example.com', null, '<org>', null, null, null, 'lt', 'student');
--     -- expect {"outcome":"organization_capability_required"}
--
--   -- as an organization owner WITH training_provider:
--   --   → {"outcome":"created", ...}; then accept as the invited user
--   --   → {"outcome":"accepted","relationship_slug":"student", ...}
--   --   → engagement_contexts holds relationship_slug='student', NOT 'employee'
--
--   select public.create_invitation_v1(repeat('b',64), 'join_organization',
--     'y@example.com', null, '<org>', null, null, null, 'lt', 'manager');
--     -- expect {"outcome":"invalid_relationship"}  (authority is not invitable)
--
--   + APPLIED_LEDGER.md row.
