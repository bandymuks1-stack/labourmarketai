-- ROLLBACK for 20260806090000_company_memberships_v1 (M-P0-4)
--
-- Memberships v1 is DERIVED truth: every backfilled row's source
-- (organizations.owner_profile_id, active manager/external_manager
-- engagement_contexts) remains intact, so dropping the table loses no
-- original data. Rows created AFTER apply by the slice-2 RPCs (invites,
-- role changes) WOULD be lost — the loud gate below closes the silent
-- window the moment such rows exist.

do $$
declare
  non_backfill int;
begin
  if to_regclass('public.company_memberships') is null then
    raise notice 'company_memberships already absent — nothing to roll back';
    return;
  end if;
  select count(*) into non_backfill
    from public.company_memberships
   where source is null or source not like 'backfill:%';
  if non_backfill > 0 then
    raise exception
      'ROLLBACK WINDOW CLOSED: % membership row(s) were created after apply '
      '(non-backfill). Dropping the table would destroy real governance '
      'decisions. Export/reconcile them first.', non_backfill;
  end if;
end $$;

drop trigger if exists protect_last_owner on public.company_memberships;
drop function if exists public.company_memberships_protect_last_owner();
drop table if exists public.company_memberships;
