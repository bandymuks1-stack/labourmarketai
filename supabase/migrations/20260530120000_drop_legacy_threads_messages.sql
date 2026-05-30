-- 20260530120000 — Drop legacy messaging tables (threads + messages).
--
-- WHY: messaging converged to the canonical conversations +
-- conversation_participants + conversation_messages model (migration 0021).
-- All app code uses conversation_messages; the original threads/messages
-- chain (migration 0001) is unused. Both tables are EMPTY on prod.
--
-- SAFETY (PLATFORM_DOCTRINE §16.3): asserts 0 rows before dropping; reversible
-- (faithful recreate in the ROLLBACK block below). Migration 0001 is NOT edited
-- (frozen, §16.1). After this applies, regenerate lib/supabase/types.ts via
-- `pnpm db:types` to remove the dead threads/messages/can_access_thread types.
--
-- Application to prod is owner-gated (committed, not auto-run).

-- Refuse to drop if anything wrote to these tables since this was authored.
do $$
begin
  if (select count(*) from public.messages) > 0
     or (select count(*) from public.threads) > 0 then
    raise exception 'Refusing to drop: legacy threads/messages are not empty';
  end if;
end $$;

drop function if exists public.can_access_thread(uuid);   -- used only by legacy message RLS
drop table    if exists public.messages cascade;          -- 0 rows; drops its 4 RLS policies
drop table    if exists public.threads  cascade;          -- 0 rows; drops its 4 RLS policies + FK to matches

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — copy-paste to restore the exact pre-drop state).
-- Faithful to migration 0001 as captured from live prod (pg_get_functiondef
-- + pg_policies + information_schema). can_access_match() and is_admin() are
-- unaffected by this migration and still exist.
-- ─────────────────────────────────────────────────────────────────────────
--
-- create table public.threads (
--   id         uuid primary key default gen_random_uuid(),
--   match_id   uuid references public.matches(id) on delete cascade,
--   status     text,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
-- create table public.messages (
--   id         uuid primary key default gen_random_uuid(),
--   thread_id  uuid references public.threads(id)  on delete cascade,
--   sender_id  uuid references public.profiles(id) on delete set null,
--   body       text,
--   sent_at    timestamptz not null default now(),
--   read_at    timestamptz,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
--
-- create or replace function public.can_access_thread(t uuid)
--   returns boolean language sql stable security definer set search_path to 'public'
-- as $function$
--   select exists (
--     select 1 from public.threads th
--     where th.id = t and public.can_access_match(th.match_id)
--   )
-- $function$;
--
-- alter table public.threads  enable row level security;
-- alter table public.messages enable row level security;
--
-- create policy threads_select  on public.threads  for select to public using ((can_access_match(match_id) or is_admin()));
-- create policy threads_insert  on public.threads  for insert to public with check ((can_access_match(match_id) or is_admin()));
-- create policy threads_update  on public.threads  for update to public using ((can_access_match(match_id) or is_admin())) with check ((can_access_match(match_id) or is_admin()));
-- create policy threads_delete  on public.threads  for delete to public using (is_admin());
-- create policy messages_select on public.messages for select to public using ((can_access_thread(thread_id) or is_admin()));
-- create policy messages_insert on public.messages for insert to public with check (((sender_id = auth.uid()) and can_access_thread(thread_id)));
-- create policy messages_update on public.messages for update to public using ((can_access_thread(thread_id) or is_admin())) with check ((can_access_thread(thread_id) or is_admin()));
-- create policy messages_delete on public.messages for delete to public using (is_admin());
