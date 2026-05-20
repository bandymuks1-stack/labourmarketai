-- 0005_waitlist.sql
-- Public landing-page waitlist for company / agency interest while M1 only
-- ships worker functionality. Anonymous visitors can INSERT their email;
-- only service_role can read or modify rows. RLS enabled per project
-- convention (see 0001).
--
-- Idempotent: safe to re-run.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text not null default 'landing_company_modal',
  locale     text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists waitlist_insert_anon on public.waitlist;
create policy waitlist_insert_anon
  on public.waitlist
  for insert
  to anon
  with check (true);

-- No SELECT / UPDATE / DELETE policies for anon or authenticated — those
-- operations are intentionally restricted to service_role (which bypasses
-- RLS) so the waitlist remains opaque to the public.

grant insert on public.waitlist to anon;
