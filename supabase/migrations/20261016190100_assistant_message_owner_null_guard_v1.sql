-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER
-- replace; draft + needs-human-gate; NOT applied; owner applies via MCP.)
--
-- 20261016190100_assistant_message_owner_null_guard_v1 — NULL-SAFE OWNER
-- CHECK IN append_assistant_message (audit 2026-10-16, SEC-11 latent).
--
-- The live definition (read from production with pg_get_functiondef on
-- 2026-10-16) checks:
--     if v_owner is null or v_owner <> auth.uid() then raise ...
-- When auth.uid() is NULL (no JWT: a definer caller, a future service grant,
-- a cron session) the predicate `v_owner <> NULL` is NULL, `or` of (false,
-- NULL) is NULL, and the IF does NOT raise — the function FAILS OPEN and
-- appends to any conversation. This is the exact shape of the 2026-07-22 P0
-- (20260722120000_secdef_anon_authz_bypass_fix_v1) and of the rule in
-- 20260824100938_null_safe_owner_guards_v2. It is unreachable today because
-- EXECUTE is granted to `authenticated` only (JWT always present), which is
-- why this is a latent, not an exploited, defect — fixed before anything
-- changes that.
--
-- The whole body is restated (a `create or replace` re-defaults every
-- property it omits — SECURITY DEFINER, search_path, defaults; see
-- 20260906194911's lesson). Only the guard line changes.
--
-- ROLLBACK: supabase/rollbacks/20261016190100_assistant_message_owner_null_guard_v1.down.sql
-- (re-creates the production body verbatim, including the weaker guard).

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
  -- NULL-SAFE: an absent caller identity is a refusal, never a pass.
  if v_owner is null or auth.uid() is null or v_owner is distinct from auth.uid() then
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

-- Grants are unchanged by CREATE OR REPLACE on an existing function (the ACL
-- is preserved); restated for the clean-reset path.
revoke all on function public.append_assistant_message(uuid, text, text, text, character, text, text, jsonb, text) from public, anon;
grant execute on function public.append_assistant_message(uuid, text, text, text, character, text, text, jsonb, text) to authenticated;
