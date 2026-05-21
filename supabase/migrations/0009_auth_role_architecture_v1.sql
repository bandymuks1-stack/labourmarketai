-- ════════════════════════════════════════════════════════════════════════
-- 0009_auth_role_architecture_v1.sql — Worker-as-universal-base
--
-- M1 auth/onboarding refactor. Architectural principle #1: EVERY user gets a
-- `workers` row automatically at signup, regardless of which role they pick,
-- enforced at the DB layer (trigger) so it holds for all current and future
-- signup paths (email/password, Google OAuth, future providers).
--
-- ── Schema reconciliation (spec ⇄ actual) ──────────────────────────────────
-- The task spec was written against an idealized schema. This migration is
-- adapted to the ACTUAL schema (see 0001/0003/0006/0007) per the spec's own
-- note: "document the actual structure and adjust". Mapping:
--
--   spec name                     →  actual implementation
--   ----------------------------     -------------------------------------
--   profiles.primary_role         →  profiles.active_role (0003)
--   profiles.additional_roles[]   →  profile_roles junction table (0003)
--   profiles.display_name         →  profiles.full_name (0006 RPC)
--   organizations table           →  companies table (0001)
--   client role                   →  customer role (0003 CHECK / RPCs)
--   user_organizations junction   →  companies.profile_id 1:1 ownership (0001)
--   user_agencies junction        →  agencies.profile_id 1:1 ownership (0001)
--   workers.user_id FK            →  workers.profile_id (unique) FK (0001)
--
-- Consequently this migration does NOT add primary_role/additional_roles
-- columns or user_organizations/user_agencies tables — that model already
-- exists in a different (working) shape and the dashboard depends on it.
-- The only NEW structure is the auto-Worker trigger below.
--
-- Verified existing structures (no change needed, asserted for safety):
--   • public.workers (profile_id uuid unique → profiles.id, on delete cascade,
--     profile_completeness int not null default 0)
--   • public.companies / public.agencies (profile_id → profiles.id ownership)
--
-- SECURITY DEFINER: the trigger writes `workers` during the same transaction
-- as the `profiles` insert (which itself runs inside the SECURITY DEFINER
-- handle_new_user trigger on auth.users). Definer rights bypass RLS; safety
-- is structural (it only ever inserts the row for NEW.id).
--
-- Idempotent: ON CONFLICT (profile_id) DO NOTHING on the worker insert; the
-- backfill is insert-only and skips profiles that already have a worker.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Safety assertions — fail loudly if the assumed schema drifted ───────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workers'
       and column_name = 'profile_id'
  ) then
    raise exception
      'workers.profile_id missing — schema drift; review 0009 mapping';
  end if;
end $$;

-- ── 2. Auto-Worker function ────────────────────────────────────────────────
-- Worker is the universal base profile. profile_completeness defaults to 0
-- from the column default; we only need to supply the FK.
create or replace function public.ensure_worker_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workers (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end $$;

comment on function public.ensure_worker_profile() is
  'M1: guarantees a workers row for every profile (worker = universal base). '
  'Idempotent; fired AFTER INSERT on public.profiles.';

-- ── 3. Trigger AFTER INSERT on profiles ────────────────────────────────────
drop trigger if exists on_profile_created_ensure_worker on public.profiles;
create trigger on_profile_created_ensure_worker
  after insert on public.profiles
  for each row execute function public.ensure_worker_profile();

-- ── 4. Backfill existing profiles ──────────────────────────────────────────
-- So acceptance #4 (every profile has a workers row) holds for rows that
-- existed before this trigger. Insert-only; non-destructive.
insert into public.workers (profile_id)
select p.id
  from public.profiles p
 where not exists (
   select 1 from public.workers w where w.profile_id = p.id
 )
on conflict (profile_id) do nothing;

-- ── Verification (run manually after applying) ─────────────────────────────
-- Note: the spec's check used workers.user_id; the real FK is profile_id:
--   select count(*) from public.profiles
--    where id not in (select profile_id from public.workers);  -- expect 0
