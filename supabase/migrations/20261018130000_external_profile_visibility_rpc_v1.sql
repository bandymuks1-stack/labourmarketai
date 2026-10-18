-- 20261018130000_external_profile_visibility_rpc_v1
-- @human-gate-approved
--
-- RED (needs-human-gate): SECURITY DEFINER function + GRANT. Apply ONLY via Supabase MCP
-- `apply_migration` after the owner's explicit approval. Never `db push`.
--
-- WHY: the worker profile's external-profile section renders a visibility toggle that calls
-- `set_external_profile_visibility_v1` (lib/worker/external-profiles-actions.ts). The function was
-- defined only in the never-applied draft 20260713210000_multi_source_talent_v1.sql; the applied
-- 20260914210000_external_profiles_v1.sql created the table with its `visibility` column and CHECK
-- ('private','employers') plus save/disconnect, but not this function. The toggle therefore can
-- never save. This migration adds exactly that function, unchanged in substance from the draft.
--
-- SCOPE / SAFETY:
-- - Writes only `visibility` + `updated_at` on the caller's OWN, still-connected rows
--   (worker_external_profiles.worker_id -> workers.profile_id = auth.uid()).
-- - No employer read path is created: the table's RLS stays owner/admin-only, so 'employers' is a
--   saved preference that nobody else can read yet (the UI already says employer viewing is not on).
-- - No table, column, policy or data change. PUBLIC and anon cannot execute it.
-- Rollback: supabase/rollbacks/20261018130000_external_profile_visibility_rpc_v1.down.sql

create or replace function public.set_external_profile_visibility_v1(
  p_profile_id uuid,
  p_visibility text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('private', 'employers') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;

  update public.worker_external_profiles ep
     set visibility = p_visibility,
         updated_at = now()
    from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid
     and ep.disconnected_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'External profile not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.set_external_profile_visibility_v1(uuid, text) from public;
revoke all on function public.set_external_profile_visibility_v1(uuid, text) from anon;
grant execute on function public.set_external_profile_visibility_v1(uuid, text) to authenticated;
