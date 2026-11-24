-- Rollback of 20261020171000_conversation_last_activity_v1.
-- Drops the trigger and its function. The one-time backfill set each thread's
-- updated_at to its real last-message time; it is deliberately not reverted
-- (the old values were the creation times the defect left behind).
drop trigger if exists conversation_messages_touch_conversation_v1 on public.conversation_messages;
drop function if exists public.conversation_touch_on_message_v1();
