-- Rollback for 20260817122000_contact_disclosure_org_authority_v1.sql
-- Restores the exact live 2026-08-17 (pre-migration) policy and function
-- definitions captured from production before the change.
-- Manual apply via Supabase MCP only.

begin;

-- ── Policy: back to owner / subject-worker / admin ─────────────────────────
drop policy if exists contact_disclosure_requests_select on public.contact_disclosure_requests;
create policy contact_disclosure_requests_select on public.contact_disclosure_requests
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.workers w
       where w.id = contact_disclosure_requests.worker_id
         and w.profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- ── withdraw: original owner-only body ─────────────────────────────────────
create or replace function public.withdraw_contact_disclosure_request_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.contact_disclosure_requests%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_row from public.contact_disclosure_requests
   where id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.owner_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if v_row.status <> 'created' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'status', v_row.status);
  end if;

  update public.contact_disclosure_requests
     set status = 'withdrawn', responded_at = now(), updated_at = now()
   where id = v_row.id;
  perform public.contact_disclosure_log_change(
    v_row.id, v_uid, 'withdrawn', 'created', 'withdrawn',
    'withdraw_contact_disclosure_request_v1');
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;


-- Re-state grants for every REDEFINED SECURITY DEFINER function above:
-- `create or replace` preserves live grants in production, but a fresh local
-- reset replays this file into default privileges (PUBLIC EXECUTE). The
-- secdef-local-reset-reproducibility guard requires file-local revokes.
revoke all on function public.withdraw_contact_disclosure_request_v1(uuid) from public;
revoke all on function public.withdraw_contact_disclosure_request_v1(uuid) from anon;
grant execute on function public.withdraw_contact_disclosure_request_v1(uuid) to authenticated;

commit;
