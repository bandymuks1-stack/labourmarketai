-- ROLLBACK of 20261016190100_assistant_message_owner_null_guard_v1
-- Re-creates the production body read on 2026-10-16 verbatim (weaker guard).

create or replace function public.append_assistant_message(
  p_conversation_id uuid,
  p_role text,
  p_kind text,
  p_original_text text,
  p_original_language character,
  p_action_id text default null::text,
  p_action_status text default null::text,
  p_action_result jsonb default null::jsonb,
  p_confirmation_state text default null::text
)
returns assistant_messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_seq integer;
  v_prev text;
  v_hash text;
  v_row public.assistant_messages;
begin
  select owner_id into v_owner from public.assistant_conversations
    where id = p_conversation_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  select coalesce(max(seq),0)+1, (select content_hash from public.assistant_messages
        where conversation_id = p_conversation_id order by seq desc limit 1)
    into v_seq, v_prev
    from public.assistant_messages where conversation_id = p_conversation_id;

  v_hash := encode(extensions.digest(
    coalesce(v_owner::text,'') || '|' || v_seq::text || '|' || p_role || '|' ||
    p_original_text || '|' || coalesce(v_prev,''), 'sha256'), 'hex');

  insert into public.assistant_messages(
    conversation_id, seq, role, kind, original_text, original_language,
    action_id, action_status, action_result, confirmation_state, prev_hash, content_hash)
  values (p_conversation_id, v_seq, p_role, p_kind, p_original_text, p_original_language,
    p_action_id, p_action_status, p_action_result, p_confirmation_state, v_prev, v_hash)
  returning * into v_row;

  update public.assistant_conversations set updated_at = now() where id = p_conversation_id;
  return v_row;
end $function$;
