-- ============================================================================
-- 20260930090000 — every write an authorized assistant performs leaves a receipt.
--
-- RED by rule (new SECURITY DEFINER function + GRANT). NOT APPLIED. Needs the
-- owner's explicit approval; apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- WHY. The owner's write-safety rule (2026-09-30): every write must leave an
-- audit trail of actor, time, operation, object, source and confirmation
-- reference. Writes through /api/mcp (ChatGPT and any MCP client) already
-- run as the person under RLS and through the product's own RPCs, but
-- nothing recorded that they came THROUGH AN ASSISTANT, nor which one-time
-- confirmation authorized them. `audit_logs` is the canonical audit table;
-- its INSERT policy is admin-only, so a caller cannot write to it directly.
--
-- WHAT. One function, nothing else:
--   record_external_action_receipt_v1(capability, entity_id, confirmation_ref,
--   outcome) → audit_logs row
--     actor_id    = auth.uid()            (never a client value)
--     action      = 'external_capability'
--     entity      = the capability id     (validated shape)
--     entity_id   = the object written    (nullable)
--     payload     = { transport:'mcp', capability, confirmation_ref, outcome }
--     occurred_at = now()                 (database clock)
-- The confirmation_ref is a 16-hex digest of the one-time token computed by
-- the app — the token itself never reaches the database.
--
-- WHAT IT DOES NOT DO. No table, column, policy or existing function changes.
-- audit_logs SELECT stays admin-only. A caller can only write receipts naming
-- THEMSELVES as the actor; a receipt is the actor's own account of a call it
-- made, bounded in shape and size, never evidence about anyone else.
--
-- ROLLBACK: supabase/rollbacks/20260930090000_external_action_receipts_v1.down.sql
-- ============================================================================

create or replace function public.record_external_action_receipt_v1(
  p_capability       text,
  p_entity_id        uuid,
  p_confirmation_ref text,
  p_outcome          text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_capability is null or p_capability !~ '^[a-z_]+(\.[a-z_]+)+$' or length(p_capability) > 80 then
    raise exception 'Invalid capability id' using errcode = '22023';
  end if;
  if p_confirmation_ref is not null and p_confirmation_ref !~ '^[0-9a-f]{16}$' then
    raise exception 'Invalid confirmation reference' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome !~ '^[a-z_]{1,40}$' then
    raise exception 'Invalid outcome' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (
    uid,
    'external_capability',
    p_capability,
    p_entity_id,
    jsonb_build_object(
      'transport', 'mcp',
      'capability', p_capability,
      'confirmation_ref', p_confirmation_ref,
      'outcome', p_outcome
    ),
    now()
  )
  returning id into rid;
  return rid;
end;
$function$;

revoke all on function public.record_external_action_receipt_v1(text, uuid, text, text) from public, anon;
grant execute on function public.record_external_action_receipt_v1(text, uuid, text, text) to authenticated;
