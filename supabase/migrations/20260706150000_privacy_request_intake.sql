-- 20260706150000_privacy_request_intake.sql
--
-- Privacy self-service v1 (quality-train PR G): typed privacy requests —
-- data-export request / account-deletion request — as rows on the EXISTING
-- canonical intake table customer_requests (0028 + 20260530150000), the
-- exact pattern of submit_help_request_v1 (20260705260000). NO new table,
-- NO new queue: one NEW-name SECURITY DEFINER RPC that INSERTs a typed row
-- at status='in_review' (operator-queue visible; excluded from both open
-- demand projections, which project status='submitted' only).
--
-- INTERNAL ONLY — BY CONSTRUCTION: inserting this row sends NOTHING
-- anywhere (no email, no SMS, no webhook). A human operator reviews the
-- request on the existing admin intake queue. Nothing in this migration
-- deletes ANY data — an account-deletion request is a REQUEST row; the
-- actual deletion stays a manual, owner-reviewed step.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO new table, NO new/changed RLS policy, grant, constraint, trigger
--     or existing RPC (new-name function only);
--   - NO destructive statement of any kind;
--   - NO automated fulfilment or notification machinery.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + GRANT
-- are RED-class). Owner approved 2026-07-06 (direct review: exact twin of
-- approved 20260705260000 help-request RPC; SECURITY DEFINER +
-- search_path=public + auth guard + closed type set + revoke/grant tail
-- verified). Prod apply stays manual via Supabase MCP — never
-- db push. Until applied, the app degrades honestly: the submit action
-- sees 42883 (undefined function) and shows the truthful "not available
-- yet" state; the self-service JSON export works WITHOUT this migration
-- (RLS-scoped own-data reads only).
--
-- ROLLBACK: supabase/rollbacks/20260706150000_privacy_request_intake.down.sql
-- (drops ONLY the one NEW function; request rows are ordinary
-- customer_requests rows identifiable by payload->>'privacy_request_type'
-- and are deliberately kept as audit history).

begin;

create or replace function public.submit_privacy_request_v1(
  p_request_type text,
  p_note         text default null
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

  -- Closed request-type set (mirrors PRIVACY_REQUEST_TYPES in
  -- apps/web/lib/privacy/privacy-request-model.ts — guard-pinned).
  v_title := case p_request_type
    when 'data_export'      then 'Privatumo užklausa: duomenų kopija'
    when 'account_deletion' then 'Privatumo užklausa: paskyros šalinimas'
    else null
  end;
  if v_title is null then
    raise exception 'invalid_privacy_request_type' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  -- Abuse cap: at most 3 OPEN privacy requests per profile.
  select count(*) into v_open
    from public.customer_requests
   where profile_id = uid
     and status = 'in_review'
     and payload ? 'privacy_request_type';
  if v_open >= 3 then
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
      'source', 'privacy_self_service',
      'privacy_request_type', p_request_type
    )),
    'lt',
    'in_review'
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function
  public.submit_privacy_request_v1(text, text) from public;
grant execute on function
  public.submit_privacy_request_v1(text, text) to authenticated;

commit;
