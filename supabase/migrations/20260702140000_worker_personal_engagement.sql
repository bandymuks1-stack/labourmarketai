-- @human-gate-approved
-- 20260702140000 — Provision a personal 'employee' engagement for every
-- worker (P0 activation blocker F-W1, full-project audit 2026-07-02).
--
-- Problem: the journal composer requires an active engagement context, but
-- complete_onboarding (0006) creates only the workers row. The 0013
-- backfill covered pre-0013 workers once; every worker onboarded since
-- gets "no active work context" on the PRIMARY Journal tab and can never
-- write a journal entry — the journal → skills → CV loop is closed to
-- exactly the first-session persona.
--
-- Fix, mirroring the 0013 backfill row shape exactly:
--   (a) AFTER INSERT trigger on public.workers provisioning a personal
--       primary 'employee' engagement (idempotent; primary only when the
--       profile has no other primary engagement). Trigger-on-workers covers
--       every current and future path that creates a worker
--       (complete_onboarding, add_role, universal-worker trigger).
--   (b) One-time idempotent backfill for existing workers missing an
--       'employee' engagement (same WHERE NOT EXISTS as 0013).
--
-- RLS is unchanged: engagement_contexts stays owner/managed-org/admin
-- scoped; the new rows belong to the worker's own profile_id.
--
-- NOT applied to production by the automated session. Owner applies after
-- review (supabase db push / MCP apply_migration).

create or replace function public.ensure_worker_personal_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null then
    return new;
  end if;

  insert into public.engagement_contexts
    (profile_id, relationship_slug, is_primary, status, country_code, hash_self)
  select
    new.profile_id,
    'employee',
    not exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = new.profile_id and ec.is_primary
    ),
    'active',
    (select code from public.countries c where c.code = new.current_location_country),
    encode(extensions.digest(new.profile_id::text || ':employee:primary', 'sha256'), 'hex')
  where not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = new.profile_id and ec.relationship_slug = 'employee'
  );

  return new;
end;
$$;

drop trigger if exists on_worker_personal_engagement on public.workers;
create trigger on_worker_personal_engagement
  after insert on public.workers
  for each row execute function public.ensure_worker_personal_engagement();

-- (b) backfill: post-0013 workers who never received their personal
-- engagement. Identical shape + idempotency guard as the 0013 backfill.
insert into public.engagement_contexts
  (profile_id, relationship_slug, is_primary, status, country_code, hash_self)
select w.profile_id, 'employee',
       not exists (
         select 1 from public.engagement_contexts ec
          where ec.profile_id = w.profile_id and ec.is_primary
       ),
       'active',
       (select code from public.countries c where c.code = w.current_location_country),
       encode(extensions.digest(w.profile_id::text || ':employee:primary', 'sha256'), 'hex')
from public.workers w
where w.profile_id is not null
  and not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = w.profile_id and ec.relationship_slug = 'employee'
  );

-- ROLLBACK (down):
--   drop trigger if exists on_worker_personal_engagement on public.workers;
--   drop function if exists public.ensure_worker_personal_engagement();
--   -- Backfilled/trigger-created rows are identifiable by
--   -- relationship_slug='employee' and organization_id is null; removing
--   -- them would re-close the journal for those workers, so the down file
--   -- intentionally leaves the data in place.
