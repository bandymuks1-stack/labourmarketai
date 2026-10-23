-- ============================================================================
-- 20261023170000 — web_push_subscriptions_v1  (COM-3: push channel)
--
-- @human-gate-approved
--   Acknowledged RED by route, NOT an approval to auto-merge: a new table with
--   RLS, GRANT/REVOKE (authenticated + service_role), one SECURITY DEFINER
--   command, and a CHECK widening on notification_preferences (drop + re-add).
--   Draft + needs-human-gate; applied ONLY through Supabase MCP
--   apply_migration after explicit owner approval — never `supabase db push`.
--
-- ----------------------------------------------------------------------------
-- CANONICAL CHECK (doctrine §2)
-- ----------------------------------------------------------------------------
--   notification_events      the durable notification (bell). REUSED: push is
--                            a third hop of the same event, never a new event.
--   notification_preferences the person's channel choices. REUSED for the
--                            per-person push opt-in: one row
--                            (notification_type '*', channel 'push'). This
--                            needs the channel CHECK widened by one value.
--   NEW: web_push_subscriptions — a browser push subscription is a DELIVERY
--   ADDRESS per device (endpoint + the browser's public key + auth secret),
--   the push analogue of profiles.email. No existing table holds a
--   per-device address; notification_preferences rows are choices, keyed by
--   type, and cannot hold three opaque values per device.
--
-- SHAPE
--   One row per browser subscription; the endpoint is unique across all
--   accounts. A browser endpoint belongs to whoever subscribed last on that
--   browser: register_web_push_subscription_v1 moves it, so an account that
--   signed out of a shared device stops receiving pushes there.
--   §6 minimalism: no derived columns, no copies of names or copy.
--
-- AUTHORITY
--   authenticated: SELECT and DELETE of OWN rows (RLS); INSERT/UPDATE only via
--                  the SECURITY DEFINER command (revoked on the table).
--   service_role : SELECT (find a recipient's devices) and DELETE (a push
--                  service answered 404/410: the subscription is gone).
--   anon         : nothing.
--
-- GDPR: the person's own rows, deleted with the account (ON DELETE CASCADE),
-- registered in the erasure registry so erasure v3 does not refuse the new
-- reference (privacy-erasure-registry-coverage guard).
--
-- ROLLBACK: supabase/rollbacks/20261023170000_web_push_subscriptions_v1.down.sql
-- ============================================================================

-- 1. The opt-in lives with the existing preferences: widen the channel CHECK
--    by one value (drop + re-add idiom; every existing row stays valid).
alter table public.notification_preferences
  drop constraint if exists notification_preferences_channel_check;
alter table public.notification_preferences
  add constraint notification_preferences_channel_check
  check (channel in ('in_app', 'email', 'push'));

-- 2. Per-device delivery addresses.
create table if not exists public.web_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique
              check (char_length(endpoint) between 20 and 2048 and endpoint ~ '^https://'),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth        text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at  timestamptz not null default now()
);

create index if not exists web_push_subscriptions_profile_idx
  on public.web_push_subscriptions (profile_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists web_push_subscriptions_select_own on public.web_push_subscriptions;
create policy web_push_subscriptions_select_own
  on public.web_push_subscriptions for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists web_push_subscriptions_delete_own on public.web_push_subscriptions;
create policy web_push_subscriptions_delete_own
  on public.web_push_subscriptions for delete
  to authenticated
  using (profile_id = auth.uid());

revoke all on public.web_push_subscriptions from anon;
revoke all on public.web_push_subscriptions from authenticated;
grant select, delete on public.web_push_subscriptions to authenticated;
grant select, delete on public.web_push_subscriptions to service_role;

comment on table public.web_push_subscriptions is
  'COM-3 push channel: one browser push subscription (delivery address) per device. Own rows only; written through register_web_push_subscription_v1; service_role reads to deliver and deletes subscriptions a push service reports gone.';

-- 3. Register (or move) this browser's subscription to the caller.
create or replace function public.register_web_push_subscription_v1(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;
  insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set profile_id = excluded.profile_id,
         p256dh     = excluded.p256dh,
         auth       = excluded.auth,
         created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.register_web_push_subscription_v1(text, text, text) from public;
revoke all on function public.register_web_push_subscription_v1(text, text, text) from anon;
grant execute on function public.register_web_push_subscription_v1(text, text, text) to authenticated;

comment on function public.register_web_push_subscription_v1(text, text, text) is
  'COM-3 push: store this browser''s push subscription for auth.uid(). An endpoint already held by another account moves to the caller (the browser now belongs to whoever subscribed last). Shape is enforced by the table CHECKs; the app also allowlists push-service hosts before calling.';

-- 4. GDPR erasure v3 registry: the person's own rows, deleted with the account.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'web_push_subscriptions', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a)/(b): the person''s own device subscriptions; deleted with the account',
   'delivery addresses only; no domain state')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────

-- ROLLBACK
--   supabase/rollbacks/20261023170000_web_push_subscriptions_v1.down.sql:
--   refuses while any 'push' preference row exists; otherwise
--   delete the registry row (web_push_subscriptions.profile_id);
--   drop function if exists public.register_web_push_subscription_v1(text, text, text);
--   drop table if exists public.web_push_subscriptions;   -- device addresses only
--   restore check (channel in ('in_app', 'email')).
