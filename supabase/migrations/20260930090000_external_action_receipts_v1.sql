-- ============================================================================
-- 20260930090000 — every write an authorized assistant performs leaves a receipt.
--
-- RED by rule (new SECURITY DEFINER function + GRANT). OWNER-APPROVED
-- 2026-09-30 ("#2001 — APPROVED": assistant writes MUST leave an audit trail;
-- the security-definer function is allowed ONLY for this narrow audit write
-- and may never become a general RLS / authorization bypass).
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- WHY. Writes through /api/mcp (ChatGPT and any MCP client) run as the person
-- under RLS and through the product's own RPCs, but nothing recorded that they
-- came THROUGH AN ASSISTANT, in WHICH organization context, on WHICH one-time
-- confirmation, nor whether the canonical object was read back.
-- `audit_logs` is the canonical audit table; its INSERT policy is admin-only.
--
-- WHAT. One function; it can ONLY insert one audit_logs row:
--   record_external_action_receipt_v1(capability, organization_id, entity_id,
--     confirmation_ref, outcome, readback_ok) → audit_logs.id
--   actor_id    = auth.uid()   — the authenticated actor AND the confirmation
--                                actor: the one-time token is bound to this
--                                user, so the person who confirmed is the actor
--   action      = 'external_capability'
--   entity      = capability id (validated shape)        — the operation
--   entity_id   = the affected / canonical object         (nullable)
--   payload     = { channel:'assistant_mcp', capability, organization_id,
--                   confirmation_ref, confirmed_by, outcome, readback_ok }
--   occurred_at = now()        — database clock
--
-- CONTEXT IS NEVER CLAIMED FALSELY. A non-null organization_id is recorded
-- only when the caller belongs to (or owns) that organization, or is a
-- platform admin; otherwise the call is refused. The token itself never
-- reaches the database: confirmation_ref is a 16-hex digest computed by the app.
--
-- WHAT IT DOES NOT DO. No table, column, policy or existing function changes.
-- audit_logs SELECT stays admin-only. It reads nothing back to the caller and
-- decides no authorization — every domain write keeps its own gates.
--
-- ROLLBACK: supabase/rollbacks/20260930090000_external_action_receipts_v1.down.sql
-- ============================================================================

create or replace function public.record_external_action_receipt_v1(
  p_capability       text,
  p_organization_id  uuid,
  p_entity_id        uuid,
  p_confirmation_ref text,
  p_outcome          text,
  p_readback_ok      boolean
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
  if p_organization_id is not null and not (
       public.belongs_to_organization(p_organization_id)
       or exists (select 1 from public.organizations o
                   where o.id = p_organization_id and o.owner_profile_id = uid)
       or public.is_admin()
     ) then
    raise exception 'Not a member of that organization' using errcode = '42501';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (
    uid,
    'external_capability',
    p_capability,
    p_entity_id,
    jsonb_build_object(
      'channel', 'assistant_mcp',
      'capability', p_capability,
      'organization_id', p_organization_id,
      'confirmation_ref', p_confirmation_ref,
      'confirmed_by', uid,
      'outcome', p_outcome,
      'readback_ok', p_readback_ok
    ),
    now()
  )
  returning id into rid;
  return rid;
end;
$function$;

revoke all on function public.record_external_action_receipt_v1(text, uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.record_external_action_receipt_v1(text, uuid, uuid, text, text, boolean) to authenticated;
