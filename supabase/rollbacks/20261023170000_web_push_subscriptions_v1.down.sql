-- ============================================================================
-- ROLLBACK for 20261023170000_web_push_subscriptions_v1 (COM-3 push channel)
--
-- Guarded: refuses while any push subscription or any 'push' preference row
-- exists. Those are people's own choices and device addresses; a rollback
-- must not silently erase them. Switch the channel off first
-- (WEB_PUSH_ENABLED unset), let people turn push off or clear the rows in a
-- separate, reviewed step, then re-run.
-- ============================================================================

do $$
declare v_subs bigint := 0; v_prefs bigint := 0;
begin
  if to_regclass('public.web_push_subscriptions') is not null then
    execute 'select count(*) from public.web_push_subscriptions' into v_subs;
  end if;
  select count(*) into v_prefs from public.notification_preferences where channel = 'push';
  if v_subs > 0 or v_prefs > 0 then
    raise exception 'web_push_subscriptions rollback refused: % subscriptions and % push preference rows exist', v_subs, v_prefs;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'web_push_subscriptions' and column_name = 'profile_id';
  end if;
end $$;

drop function if exists public.register_web_push_subscription_v1(text, text, text);
drop table if exists public.web_push_subscriptions;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_channel_check;
alter table public.notification_preferences
  add constraint notification_preferences_channel_check
  check (channel in ('in_app', 'email'));
