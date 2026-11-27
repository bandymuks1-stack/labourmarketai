-- Prelude for the chat-participant-revocation proof: Supabase roles, auth.uid()
-- and the reduced external tables the real chat migrations reference.
-- conversations / conversation_participants / conversation_messages are NOT
-- stubbed: the real migrations (0021, 20260612170000, 20261006100100) create
-- and harden them.
-- ===========================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  active_role text
);
grant select on public.profiles to authenticated;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text,
  entity text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- is_admin(): the real one reads the caller's role (0024); reduced to the
-- same signal. Nobody in this proof is an admin.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active_role = 'admin');
$$;
grant execute on function public.is_admin() to authenticated, anon;

-- Supabase Storage, reduced to what 20260712130000 (attachments) touches:
-- buckets, objects (RLS on) and storage.foldername().
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
