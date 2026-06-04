-- 20260604130000_admin_company_verification.sql
--
-- Admin review action for the company-profile-request flow shipped in
-- 20260604120000. Users can request a company profile (draft →
-- pending_verification); this adds the ADMIN-ONLY write that moves a company
-- to verified / unverified / pending_verification with a note.
--
-- What this adds (ADDITIVE ONLY — one SECURITY DEFINER function, nothing else):
--   public.admin_set_company_verification(p_company_id, p_status, p_note)
--     - admin-only (public.is_admin() — the same DB admin signal the
--       20260604120000 trigger enforces; a non-admin gets 'not_admin' and no
--       write happens);
--     - p_status restricted to 'verified' | 'unverified' | 'pending_verification'
--       (it deliberately cannot set 'draft' — only the owner's own setup RPC
--       produces a draft);
--     - records the transition in public.audit_logs (no fake history);
--     - returns a plain text outcome ('ok' | 'not_admin' | 'invalid_status'
--       | 'not_found').
--
-- It does NOT grant any direct table privilege on public.companies to
-- `authenticated` (the only direct grant there remains SELECT, from 0023).
-- It does NOT modify the 20260604120000 verification guard trigger — that
-- defense-in-depth stays exactly as shipped (a non-admin still cannot reach
-- 'verified' on any path; an admin's promotion passes the trigger because
-- is_admin() is true for them).
--
-- Reversibility (PLATFORM_DOCTRINE §16):
--   ROLLBACK (run manually only if reverting):
--     drop function if exists public.admin_set_company_verification(uuid, text, text);
--   The companies table, save_company_setup, and the trigger are untouched.
--
-- Application status: committed; owner applies to prod via Supabase MCP
-- apply_migration after approval. Until applied, the admin action surfaces an
-- honest "feature not available yet" state (undefined_function 42883 is caught
-- in the lib layer) — no crash, no fake success.

create or replace function public.admin_set_company_verification(
  p_company_id uuid,
  p_status     text,
  p_note       text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  cleaned_note text := nullif(trim(coalesce(p_note, '')), '');
  v_status     text := lower(trim(coalesce(p_status, '')));
  v_prev       text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Admin-only. Mirrors the DB admin signal the company verification trigger
  -- enforces. A non-admin never mutates the row.
  if not public.is_admin() then
    return 'not_admin';
  end if;

  if v_status not in ('verified', 'unverified', 'pending_verification') then
    return 'invalid_status';
  end if;

  select verification_status into v_prev
    from public.companies
   where id = p_company_id;
  if v_prev is null then
    return 'not_found';
  end if;

  update public.companies
     set verification_status = v_status,
         verification_note   = cleaned_note,
         updated_at          = now()
   where id = p_company_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'admin_set_company_verification',
    'companies',
    p_company_id,
    jsonb_build_object('from', v_prev, 'to', v_status, 'note', cleaned_note)
  );

  return 'ok';
end $$;

revoke all on function public.admin_set_company_verification(uuid, text, text) from public;
grant execute on function public.admin_set_company_verification(uuid, text, text) to authenticated;
