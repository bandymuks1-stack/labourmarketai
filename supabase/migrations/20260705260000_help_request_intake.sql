-- 20260705260000_help_request_intake.sql
--
-- CR train WAGON 10 (areas 18+19): typed internal help requests from the
-- company workspace — recruiter / accounting / legal / document check /
-- demand-filling help — as rows on the EXISTING canonical intake table
-- customer_requests (0028 + 20260530150000). NO new table, NO new queue
-- system: one NEW-name SECURITY DEFINER RPC that INSERTs a typed row.
--
-- Why a new RPC instead of submit_demand_request:
--   1. submit_demand_request hardcodes status='submitted', and BOTH open
--      demand projections (list_open_demand_for_agencies 20260611150000,
--      list_open_demand_for_workers 20260614120000) project every
--      status='submitted' row — a help request must NEVER appear on the
--      agency/worker demand boards. This RPC inserts status='in_review'
--      (valid per the 0028 CHECK), which is operator-queue-visible
--      (INTAKE_REQUEST_STATUSES) and excluded from both projections.
--      The 20260705150000 transition guard fires BEFORE UPDATE OF status
--      only, so a typed INSERT at 'in_review' is legal by design.
--   2. The owner-side transition matrix (20260705150000) forbids the owner
--      moving submitted→in_review, so a post-submit self-transition is not
--      possible — the typed insert is the smallest honest path.
--
-- INTERNAL ONLY — BY CONSTRUCTION: inserting this row sends NOTHING
-- anywhere. No email, no SMS, no push, no Telegram, no webhook, no outbound
-- call. It is an operator-visible record on the existing admin intake
-- queue; a human reviews it. No specialist is assigned by this migration
-- and nothing claims one is.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO new table, NO new RLS policy, NO change to any existing policy,
--     grant, constraint, trigger or RPC (new-name function only —
--     rollback-chain rule: nothing to restore verbatim);
--   - NO payment/checkout of any kind;
--   - NO assignment/notification machinery.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + GRANT are
-- RED-class). Prod apply stays manual via Supabase MCP — never db push.
-- Until applied, the app degrades honestly: the submit action sees 42883
-- (undefined function) and shows the truthful "not available yet" state.
--
-- ROLLBACK: supabase/rollbacks/20260705260000_help_request_intake.down.sql
-- (drops ONLY the one NEW function; feature rows are ordinary
-- customer_requests rows identifiable by payload->>'help_type' and are
-- deliberately kept as audit history).

begin;

create or replace function public.submit_help_request_v1(
  p_help_type         text,
  p_note              text default null,
  p_demand_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_title text;
  v_open  integer;
  v_id    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Closed help-type set (mirrors HELP_REQUEST_TYPES in
  -- apps/web/lib/help/help-request-model.ts — guard-pinned).
  v_title := case p_help_type
    when 'recruiter'      then 'Pagalbos užklausa: rekruterio pagalba'
    when 'accounting'     then 'Pagalbos užklausa: buhalterijos pagalba'
    when 'legal'          then 'Pagalbos užklausa: teisinė pagalba'
    when 'documents'      then 'Pagalbos užklausa: dokumentų patikra'
    when 'demand_filling' then 'Pagalbos užklausa: poreikio pildymas'
    else null
  end;
  if v_title is null then
    raise exception 'invalid_help_type' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  -- Optional demand context must belong to the caller (id-only pointer).
  if p_demand_request_id is not null and not exists (
    select 1 from public.customer_requests cr
     where cr.id = p_demand_request_id and cr.profile_id = uid
  ) then
    raise exception 'demand_not_owned' using errcode = '42501';
  end if;

  -- Abuse cap: at most 10 OPEN help requests per profile.
  select count(*) into v_open
    from public.customer_requests
   where profile_id = uid
     and status = 'in_review'
     and payload ? 'help_type';
  if v_open >= 10 then
    raise exception 'too_many_open' using errcode = '22023';
  end if;

  insert into public.customer_requests
    (profile_id, kind, title, need_summary, payload, original_language, status)
  values (
    uid,
    'customer_request',
    v_title,
    v_note,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'company_help_panel',
      'help_type', p_help_type,
      'demand_request_id', p_demand_request_id
    )),
    'lt',
    'in_review'
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function
  public.submit_help_request_v1(text, text, uuid) from public;
grant execute on function
  public.submit_help_request_v1(text, text, uuid) to authenticated;

commit;
