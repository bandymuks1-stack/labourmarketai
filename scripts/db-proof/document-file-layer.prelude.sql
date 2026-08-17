-- ============================================================================
-- Document & Evidence Engine v1 — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260817140000_document_file_layer_v1.sql
--   supabase/rollbacks/20260817140000_document_file_layer_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres 15 instance and the
-- authority matrix measured per role.
--
-- Copied from the real repo objects, not re-invented:
--   * document_types / worker_documents / worker_document_events
--       -> 20260610170000_worker_documents_readiness.sql (shape + the
--          UNNAMED inline CHECKs so the auto-generated constraint names
--          `document_types_category_check` and
--          `worker_document_events_event_type_check` match production —
--          the migration drops them BY NAME, verified against prod
--          2026-08-17).
--   * company_memberships (minimum columns the helpers read)
--       -> 20260806090000_company_memberships_v1.sql
--   * is_admin()/auth.uid() are session-GUC stubs (one psql session can act
--     as any actor); stable, called per row, as in prod.
--   * storage.buckets / storage.objects / storage.foldername — the minimum
--     faithful storage shape (foldername = all path segments before the
--     filename, as Supabase defines it); RLS enabled on storage.objects.
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean;
$$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- ── Spine tables (minimum shape the FKs + helpers need) ─────────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null default 'active' check (status in ('invited','active','revoked'))
);
grant select on public.profiles, public.workers, public.organizations,
  public.projects, public.company_memberships to authenticated;

-- ── Document registry: real 20260610170000 shape (unnamed inline checks) ────
create table if not exists public.document_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  category    text not null default 'qualification'
                check (category in ('identity','qualification','posting')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.document_types (slug, category) values
  ('cv', 'qualification'),
  ('id_document', 'identity'),
  ('a1_certificate', 'posting')
on conflict (slug) do nothing;

create table if not exists public.worker_documents (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references public.workers(id) on delete cascade,
  document_type_slug  text not null references public.document_types(slug),
  country             char(2),
  status              text not null default 'missing'
                        check (status in ('missing','ready','blocked')),
  valid_from          date,
  valid_until         date,
  file_path           text,
  note                text,
  updated_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.worker_document_events (
  id                  uuid primary key default gen_random_uuid(),
  worker_document_id  uuid not null references public.worker_documents(id) on delete cascade,
  actor_id            uuid not null references public.profiles(id),
  event_type          text not null
                        check (event_type in ('created','updated','status_changed')),
  before_state        jsonb,
  after_state         jsonb,
  created_at          timestamptz not null default now()
);

alter table public.worker_documents enable row level security;
alter table public.worker_document_events enable row level security;
drop policy if exists worker_documents_select on public.worker_documents;
create policy worker_documents_select on public.worker_documents
  for select to authenticated
  using (
    exists (select 1 from public.workers w
             where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );
grant select on public.document_types to authenticated;
grant select on public.worker_documents to authenticated;
grant select on public.worker_document_events to authenticated;

-- ── Storage shape (faithful minimum) ────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to authenticated, anon, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- Supabase's storage.foldername: every path segment BEFORE the filename.
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;
grant execute on function storage.foldername(text) to authenticated, anon, service_role;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
