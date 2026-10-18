-- @human-gate-approved
-- ============================================================================
-- 20260918070000_roster_link_subject_consent_guard_v1
-- RED — owner gate. Subject consent on a roster link cannot be written by
-- anyone but the subject.
--
-- Finding (2026-09-17, first real human walk, recorded in #1770): the
-- `organization_people_manager_update` policy's WITH CHECK constrains WHO the
-- linked profile may be (an active engagement or membership) but not the
-- link_state / link_method the manager writes. A second manager of the same
-- organization can therefore UPDATE a `link_proposed` row straight to
-- (`linked`, `worker_confirmed`) — the value that means "the person said
-- 'Taip, tai aš'". The app never does this (its only manager writes are
-- `link_proposed`/`manager_offer` and `unlinked`/null), so the exposure is a
-- direct PostgREST write by an authenticated manager. Rolled-back probe on
-- production: outsider 0, non-manager subject own-row-only, retarget 42501 —
-- the subject policy is sound; only the manager branch is too wide.
--
-- Why a trigger and not a tighter policy: a policy WITH CHECK sees only the
-- NEW row. A manager editing `display_name` or `relationship_kind` on a row
-- that is ALREADY `worker_confirmed` must keep passing, and a policy cannot
-- tell that no-op from a forged confirmation. The trigger compares OLD to
-- NEW and refuses exactly the TRANSITION into `worker_confirmed` by anyone
-- who is not the linked subject. The designed `manager_link` exception
-- (manager links a profile that already has an active relationship, migration
-- 20260907114500) is untouched — that value still says a manager did it.
--
-- Scope: ONE table, ONE trigger, ONE function. No policy is dropped or
-- widened. No grant changes. Reversible: the DOWN block drops both.
-- ============================================================================

create or replace function public.organization_people_guard_subject_consent()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Only the transition INTO a subject-confirmed link is guarded. Any other
  -- change to a row already carrying `worker_confirmed` (name, relationship,
  -- withdrawal to `unlinked`) is somebody else's authority and passes here.
  if new.link_state = 'linked'
     and new.link_method = 'worker_confirmed'
     and (old.link_state is distinct from 'linked'
          or old.link_method is distinct from 'worker_confirmed'
          or old.linked_profile_id is distinct from new.linked_profile_id)
  then
    -- The subject, and only the subject, may say "yes, that is me".
    -- service_role has no grant on this table (see the evidence import
    -- migration), so auth.uid() is the whole story.
    if new.linked_profile_id is null or auth.uid() is distinct from new.linked_profile_id then
      raise exception 'roster link confirmation is the subject''s alone'
        using errcode = '42501';
    end if;
    -- The confirmation names the confirmer, never a manager.
    new.linked_by := new.linked_profile_id;
    new.linked_at := coalesce(new.linked_at, now());
  end if;
  return new;
end;
$$;

comment on function public.organization_people_guard_subject_consent() is
  'RED packet 2026-09-18: refuses any writer but the linked subject from turning a roster row into (linked, worker_confirmed). Compares OLD to NEW; no policy can.';

drop trigger if exists organization_people_subject_consent_guard on public.organization_people;
create trigger organization_people_subject_consent_guard
  before update on public.organization_people
  for each row
  execute function public.organization_people_guard_subject_consent();

-- ---------------------------------------------------------------------------
-- ROLLBACK (run manually; not executed by this migration)
-- ---------------------------------------------------------------------------
-- drop trigger if exists organization_people_subject_consent_guard on public.organization_people;
-- drop function if exists public.organization_people_guard_subject_consent();
