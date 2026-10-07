-- Minimal harness for the ai_runs retention-classes proof. Creates ONLY what
-- the REAL migrations need to run verbatim: roles, an auth.uid() shim, a
-- profiles table (FK target) and an is_admin() stub. ai_runs itself and the
-- applied retention function come from the real migration files.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create table if not exists public.profiles (id uuid primary key);
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
