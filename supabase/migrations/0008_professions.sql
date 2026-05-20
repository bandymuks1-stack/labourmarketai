-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 0008_professions.sql — Profession as first-class entity (Step 1 of 5)
--
-- Introduces `professions` (master list, i18n-aware, sector-tagged) and
-- `worker_professions` (N:N with `is_primary` flag; partial unique index
-- enforces "exactly one primary per worker"). Seeded with 15 construction
-- professions (LT + EN required, other locales nullable until DI runs the
-- translation pass).
--
-- Also extends `public.complete_onboarding` with an optional
-- `p_profession_id` parameter so worker onboarding atomically inserts the
-- primary `worker_professions` row. The old 4-arg signature is dropped —
-- this is the only function-shape change in this migration; the new
-- signature is backward-compatible (5th param has DEFAULT NULL, so 4-arg
-- callers from before this migration still work via positional defaults).
--
-- IMPORTANT: this migration changes the signature of `complete_onboarding`.
-- DI MUST run this migration BEFORE deploying the Vercel build that
-- carries the new client code (the new code always passes the 5th param
-- by name; PostgREST resolves by argument-name match, so the old function
-- would 404 on the new call shape). See PR description for ordering.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. professions ──────────────────────────────────────────────────────
create table if not exists public.professions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_lt     text not null,
  name_en     text not null,
  name_nl     text,
  name_de     text,
  name_pl     text,
  name_ru     text,
  sector      text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists professions_sector_idx
  on public.professions (sector) where is_active;

alter table public.professions enable row level security;

-- read: any signed-in user (used to populate the onboarding dropdown).
drop policy if exists professions_select on public.professions;
create policy professions_select on public.professions for select
  using (auth.uid() is not null);

-- write: admin only (admin uses Supabase Studio for now; admin UI is M2).
drop policy if exists professions_write_admin on public.professions;
create policy professions_write_admin on public.professions for all
  using (public.is_admin()) with check (public.is_admin());

-- ── 2. worker_professions ──────────────────────────────────────────────
create table if not exists public.worker_professions (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.workers(id) on delete cascade,
  profession_id uuid not null references public.professions(id) on delete restrict,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (worker_id, profession_id)
);

create index if not exists worker_professions_worker_idx
  on public.worker_professions (worker_id);

-- "exactly one primary per worker" — partial unique index.
create unique index if not exists worker_professions_one_primary
  on public.worker_professions (worker_id)
  where is_primary;

alter table public.worker_professions enable row level security;

-- SELECT: owner, employer (browse candidates), or admin.
drop policy if exists worker_professions_select on public.worker_professions;
create policy worker_professions_select on public.worker_professions for select
  using (
    public.owns_worker(worker_id)
    or public.is_employer()
    or public.is_admin()
  );

-- INSERT / UPDATE / DELETE: owner or admin (employers don't write).
drop policy if exists worker_professions_write on public.worker_professions;
create policy worker_professions_write on public.worker_professions for all
  using (public.owns_worker(worker_id) or public.is_admin())
  with check (public.owns_worker(worker_id) or public.is_admin());

-- updated_at triggers for both new tables.
drop trigger if exists set_updated_at on public.professions;
create trigger set_updated_at before update on public.professions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.worker_professions;
create trigger set_updated_at before update on public.worker_professions
  for each row execute function public.set_updated_at();

-- ── 3. seed: 15 construction professions ───────────────────────────────
insert into public.professions (slug, name_lt, name_en, sector) values
  ('carpenter',                 'Stalius',                          'Carpenter',                 'construction'),
  ('electrician',               'Elektrikas',                       'Electrician',               'construction'),
  ('plumber',                   'Santechnikas',                     'Plumber',                   'construction'),
  ('mason',                     'Mūrininkas',                       'Mason',                     'construction'),
  ('painter',                   'Dažytojas',                        'Painter',                   'construction'),
  ('welder',                    'Suvirintojas',                     'Welder',                    'construction'),
  ('general_laborer',           'Bendrasis darbininkas',            'General laborer',           'construction'),
  ('foreman',                   'Brigadininkas',                    'Foreman',                   'construction'),
  ('concrete_worker',           'Betonuotojas',                     'Concrete worker',           'construction'),
  ('roofer',                    'Stogdengys',                       'Roofer',                    'construction'),
  ('tiler',                     'Plytelių klojėjas',                'Tiler',                     'construction'),
  ('drywaller',                 'Gipso kartono montuotojas',        'Drywaller',                 'construction'),
  ('crane_operator',            'Kranininkas',                      'Crane operator',            'construction'),
  ('heavy_equipment_operator',  'Sunkios technikos operatorius',    'Heavy equipment operator',  'construction'),
  ('site_engineer',             'Aikštelės inžinierius',            'Site engineer',             'construction')
on conflict (slug) do update
  set name_lt   = excluded.name_lt,
      name_en   = excluded.name_en,
      sector    = excluded.sector,
      is_active = true,
      updated_at = now();

-- ── 4. complete_onboarding — extended signature (Variant 1) ────────────
-- The old (text,text,text,jsonb) function is dropped; the new function
-- adds `p_profession_id uuid default null` so existing 4-arg callers stay
-- compatible (positional default).
drop function if exists public.complete_onboarding(text, text, text, jsonb);

create or replace function public.complete_onboarding(
  p_role          text,
  p_display_name  text,
  p_country       text,
  p_role_data     jsonb,
  p_profession_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  wid             uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role is null
     or p_role not in ('worker','company','agency','customer') then
    raise exception 'Invalid onboarding role: %', p_role
      using errcode = '22023';
  end if;

  -- 1. profiles core fields.
  update public.profiles
     set full_name    = nullif(trim(coalesce(p_display_name, '')), ''),
         country      = nullif(trim(coalesce(p_country, '')), ''),
         active_role  = p_role,
         onboarded_at = coalesce(onboarded_at, now()),
         onboarded    = true
   where id = uid;

  -- 2. profile_roles catalogue (idempotent: re-submit replaces role_data).
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, p_role, true, coalesce(p_role_data, '{}'::jsonb))
  on conflict (profile_id, role) do update
     set is_active = true,
         role_data = excluded.role_data;

  -- 3. role-specific entity row.
  if p_role = 'worker' then
    insert into public.workers (
      profile_id,
      display_name,
      current_location_country
    )
    values (
      uid,
      nullif(trim(coalesce(p_display_name, '')), ''),
      nullif(trim(coalesce(p_country, '')), '')
    )
    on conflict (profile_id) do nothing;

    -- 3a. primary profession (Step 1 of M1 C-scope). Only on worker role;
    --     idempotent on the (worker_id, profession_id) pair; if a primary
    --     already exists, the new pair is recorded as non-primary so the
    --     partial unique index isn't violated on re-submit with a
    --     different profession.
    if p_profession_id is not null then
      select id into wid from public.workers where profile_id = uid;
      if wid is not null then
        insert into public.worker_professions (
          worker_id,
          profession_id,
          is_primary
        )
        values (
          wid,
          p_profession_id,
          not exists (
            select 1 from public.worker_professions
             where worker_id = wid and is_primary
          )
        )
        on conflict (worker_id, profession_id) do nothing;
      end if;
    end if;

  elsif p_role = 'company' then
    if not exists (
      select 1 from public.companies where profile_id = uid
    ) then
      insert into public.companies (
        profile_id, legal_name, display_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_country, '')), '')
      );
    end if;

  elsif p_role = 'agency' then
    if not exists (
      select 1 from public.agencies where profile_id = uid
    ) then
      insert into public.agencies (
        profile_id, legal_name, country
      )
      values (
        uid,
        nullif(trim(coalesce(p_role_data->>'name', '')), ''),
        nullif(trim(coalesce(p_country, '')), '')
      );
    end if;
  end if;
end $$;

revoke all on function public.complete_onboarding(text, text, text, jsonb, uuid)
  from public;
grant execute
  on function public.complete_onboarding(text, text, text, jsonb, uuid)
  to authenticated;
