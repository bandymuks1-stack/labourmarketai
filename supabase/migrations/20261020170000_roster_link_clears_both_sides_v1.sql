-- ============================================================================
-- roster_link_clears_both_sides_v1 — a roster link is either whole or gone
-- (audit 2026-10-20, CRITICAL: GDPR erasure fails for anyone with a roster link).
--
-- organization_people_link_pairing requires linked_worker_id and
-- linked_profile_id to be null TOGETHER, and link_state = 'unlinked' exactly
-- when they are. Two writers clear one side at a time:
--   · the erasure executor (20261019140000) runs its registry rows one column
--     at a time — `set linked_profile_id = null`, then `linked_worker_id`;
--   · the FKs ON DELETE SET NULL (profiles / workers) clear one column each.
-- The first update breaks the pairing CHECK (23514) — and, while the row is
-- still linked + worker_confirmed, the subject-consent guard raises 42501 —
-- so the whole all-or-nothing erasure rolls back and the request is recorded
-- as failed. Every person who confirmed their historical roster row could not
-- be erased.
--
-- Change: ONE BEFORE UPDATE trigger, named to fire FIRST (triggers fire in
-- name order): when an update clears either side of a link, it clears both,
-- sets link_state 'unlinked' and empties link_method / linked_at / linked_by.
-- The roster row itself (the organization's record of the person, D9) stays;
-- only the link to the account is severed. Not SECURITY DEFINER; no policy,
-- grant or data changes. A link is never CREATED by this trigger.
--
-- Rollback: supabase/rollbacks/20261020170000_roster_link_clears_both_sides_v1.down.sql
-- ============================================================================

create or replace function public.organization_people_clear_both_link_sides_v1()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if (old.linked_profile_id is not null or old.linked_worker_id is not null)
     and (new.linked_profile_id is null or new.linked_worker_id is null) then
    new.linked_profile_id := null;
    new.linked_worker_id := null;
    new.link_state := 'unlinked';
    new.link_method := null;
    new.linked_at := null;
    new.linked_by := null;
  end if;
  return new;
end;
$function$;

revoke all on function public.organization_people_clear_both_link_sides_v1() from public, anon, authenticated;

drop trigger if exists organization_people_0_clear_both_link_sides_v1 on public.organization_people;
create trigger organization_people_0_clear_both_link_sides_v1
  before update of linked_profile_id, linked_worker_id on public.organization_people
  for each row execute function public.organization_people_clear_both_link_sides_v1();
