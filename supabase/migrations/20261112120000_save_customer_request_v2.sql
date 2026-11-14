-- 20261112120000 - save_customer_request_v2: a buyer request records WHAT it is
-- and the language it was written in (Swedish employer audit 2026-11-11, CL-3).
--
-- WHY. The buyer form's RPC (0028 save_customer_request) predates the `kind`
-- and `original_language` columns, so every buyer request is stored with both
-- NULL: indistinguishable from legacy rows, and no reader can tell its
-- language. v2 is the SAME function (copied byte-for-byte from 0028) with one
-- more parameter:
--   * kind = 'buyer_request' once the request is SUBMITTED (inserted as
--     submitted, or a NULL-kind draft moved to submitted) - the kind the 20260530150000 CHECK already allows
--     for this form, and the one the worker board's allow-list already reads
--     (`cr.kind is null or cr.kind in ('company_request','buyer_request')`).
--     NOT 'customer_request': that kind is the help-panel and privacy intakes
--     (20260705260000 / 20260706150000), which the worker board excludes - a
--     buyer need stored as it would vanish from the board;
--   * original_language = the app's UI language when it is one of the app's
--     locales, else NULL (unknown is never guessed).
-- DRAFTS KEEP kind NULL, exactly as today: 20260530150000 holds ONE draft
-- per (profile, kind) (`customer_requests_one_draft_per_kind`), and the buyer
-- form keeps several drafts, so a kinded draft would collide with the next.
-- A NULL-kind draft takes 'buyer_request' when it is submitted through this
-- form; a row that already has a kind keeps it, and a language is written on
-- INSERT only (an existing row's language is never guessed).
-- v1 is left untouched; the app calls v2 and falls back to v1 until this is
-- applied, so nothing breaks in either order.
--
-- BEFORE APPLY: compare the production definition of save_customer_request
-- (pg_get_functiondef) with 0028; v2 copies 0028.
-- GATE: RED (new SECURITY DEFINER + EXECUTE grant). Owner approval; apply via
-- Supabase MCP apply_migration only. PG16 proof: scripts/db-proof/save-customer-request-v2.sh
-- ROLLBACK: supabase/rollbacks/20261112120000_save_customer_request_v2.down.sql
-- @human-gate-approved

begin;

create or replace function public.save_customer_request_v2(
  p_request_id           uuid,
  p_title                text,
  p_need_summary         text default null,
  p_country              text default null,
  p_location             text default null,
  p_role_or_work_type    text default null,
  p_team_size            integer default null,
  p_start_period         text default null,
  p_duration             text default null,
  p_language_requirement text default null,
  p_notes                text default null,
  p_status               text default 'draft',
  p_original_language    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  resolved_id      uuid;
  cleaned_title    text := nullif(trim(coalesce(p_title, '')), '');
  cleaned_status   text := lower(trim(coalesce(p_status, 'draft')));
  customer_uuid    uuid;
  current_status   text;
  -- The UI language the request was written in, from the app's own locale
  -- set; anything else is stored as unknown (NULL), never guessed.
  v_language       text := case
    when lower(btrim(coalesce(p_original_language, ''))) in
         ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','fi')
      then lower(btrim(p_original_language))
    else null
  end;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_title is null or char_length(cleaned_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if cleaned_status not in ('draft','submitted','in_review','needs_followup','approved','closed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- Owner cannot self-promote to admin-only statuses.
  if cleaned_status in ('in_review','needs_followup','approved','closed') then
    if not public.is_admin() then
      cleaned_status := 'submitted';
    end if;
  end if;

  -- Resolve customer_id (optional FK).
  select id into customer_uuid
    from public.customers
   where profile_id = uid
   limit 1;

  if p_request_id is null then
    insert into public.customer_requests (
      profile_id, customer_id, title, need_summary, country, location,
      role_or_work_type, team_size, start_period, duration,
      language_requirement, notes, status, kind, original_language
    ) values (
      uid, customer_uuid, cleaned_title,
      nullif(trim(coalesce(p_need_summary, '')), ''),
      nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      nullif(trim(coalesce(p_role_or_work_type, '')), ''),
      p_team_size,
      nullif(trim(coalesce(p_start_period, '')), ''),
      nullif(trim(coalesce(p_duration, '')), ''),
      nullif(trim(coalesce(p_language_requirement, '')), ''),
      nullif(trim(coalesce(p_notes, '')), ''),
      cleaned_status,
      case when cleaned_status = 'draft' then null else 'buyer_request' end,
      v_language
    )
    returning id into resolved_id;
    return resolved_id;
  end if;

  -- Update path: must own the row.
  select status into current_status
    from public.customer_requests
   where id = p_request_id and profile_id = uid;
  if current_status is null then
    -- Either does not exist OR not owned by caller — admin can use a
    -- separate admin-only path; this RPC is owner-only updates.
    raise exception 'Request not found or not owned' using errcode = '42501';
  end if;

  -- Never let a non-admin owner demote out of submitted back to draft.
  if not public.is_admin() then
    if current_status = 'submitted' and cleaned_status = 'draft' then
      cleaned_status := 'submitted';
    end if;
  end if;

  update public.customer_requests set
    title                = cleaned_title,
    need_summary         = nullif(trim(coalesce(p_need_summary, '')), ''),
    country              = nullif(trim(coalesce(p_country, '')), ''),
    location             = nullif(trim(coalesce(p_location, '')), ''),
    role_or_work_type    = nullif(trim(coalesce(p_role_or_work_type, '')), ''),
    team_size            = p_team_size,
    start_period         = nullif(trim(coalesce(p_start_period, '')), ''),
    duration             = nullif(trim(coalesce(p_duration, '')), ''),
    language_requirement = nullif(trim(coalesce(p_language_requirement, '')), ''),
    notes                = nullif(trim(coalesce(p_notes, '')), ''),
    status               = cleaned_status,
    kind                 = case
                             when kind is null and cleaned_status <> 'draft' then 'buyer_request'
                             else kind
                           end,
    updated_at           = now()
   where id = p_request_id
     and (profile_id = uid or public.is_admin())
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.save_customer_request_v2(uuid, text, text, text, text, text, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_customer_request_v2(uuid, text, text, text, text, text, integer, text, text, text, text, text, text) to authenticated;

commit;
