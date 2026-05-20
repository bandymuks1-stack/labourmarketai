-- ════════════════════════════════════════════════════════════════════════
-- 0003_multi_role.sql — Slice 6: multi-role per user + customer role
--
-- One person can hold several work identities (worker + customer, manager
-- + customer, agency + admin, …). The single-role check on profiles.role
-- forced an artificial choice and would block adoption.
--
-- After this migration:
--   • `profiles.role` is GONE; replaced by `profiles.active_role` (which
--     UI a user currently sees) — old single-role policies/helpers now
--     read this column and keep working unchanged.
--   • `profile_roles` is the catalogue of every role the user holds
--     (role + role-specific JSONB + is_active flag).
--   • `customer` is a valid role (PV §7, ADR 0007).
--   • `profiles.onboarded_at` records first-onboarding completion.
--
-- Idempotent throughout: IF NOT EXISTS / DROP IF EXISTS / OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. profiles.active_role (replaces profiles.role) ────────────────────
alter table public.profiles add column if not exists active_role text;

-- backfill from the old `role` column if it still exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role'
  ) then
    update public.profiles set active_role = role
     where active_role is null and role is not null;
  end if;
end $$;

-- the old check constraint references `role`; drop it first so we can
-- drop the column
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop column if exists role;

-- new check now includes customer (ADR 0007)
alter table public.profiles drop constraint if exists profiles_active_role_check;
alter table public.profiles
  add constraint profiles_active_role_check
  check (active_role is null
         or active_role in ('worker','company','agency','customer','admin'));

-- ── 2. onboarded_at (replaces the boolean `onboarded` for finer state) ──
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- ── 3. profile_roles (catalogue of roles per user) ──────────────────────
create table if not exists public.profile_roles (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null
              check (role in ('worker','company','agency','customer','admin')),
  added_at    timestamptz not null default now(),
  is_active   boolean not null default true,
  role_data   jsonb not null default '{}'::jsonb,
  unique (profile_id, role)
);

create index if not exists profile_roles_profile_id_idx
  on public.profile_roles (profile_id);

alter table public.profile_roles enable row level security;

drop policy if exists profile_roles_select on public.profile_roles;
create policy profile_roles_select on public.profile_roles for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_roles_insert on public.profile_roles;
create policy profile_roles_insert on public.profile_roles for insert
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_roles_update on public.profile_roles;
create policy profile_roles_update on public.profile_roles for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_roles_delete on public.profile_roles;
create policy profile_roles_delete on public.profile_roles for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ── 4. update RLS helpers to read `active_role` ─────────────────────────
-- Existing policies on workers/companies/agencies/etc. call these helpers
-- — replacing the column reference is all that's needed.
create or replace function public.profile_role()
returns text language sql stable security definer set search_path = public as $$
  select active_role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active_role = 'admin'
  )
$$;

create or replace function public.is_employer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select active_role from public.profiles where id = auth.uid())
      in ('company','agency'),
    false)
$$;

-- ── 5. handle_new_user — also creates the initial profile_roles row ─────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := nullif(new.raw_user_meta_data->>'role', '');
  loc text := coalesce(nullif(new.raw_user_meta_data->>'locale',''), 'lt');
begin
  insert into public.profiles (id, email, active_role, locale)
  values (new.id, new.email, r, loc)
  on conflict (id) do nothing;

  if r is not null then
    insert into public.profile_roles (profile_id, role)
    values (new.id, r)
    on conflict (profile_id, role) do nothing;
  end if;

  return new;
end $$;
