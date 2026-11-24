-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply via Supabase MCP apply_migration by the lead session after review.
-- Never `db push`.
--
-- 20260817122000 — contact-disclosure org-bound authority v1 (security train
-- A, Fix C).
--
-- PROBLEM (full-reality-audit-2026-08-17: "contact-disclosure authority
-- person-bound not org-bound"). A contact-disclosure request row carries an
-- `organization_id` (the org the worker is consenting to disclose to — the
-- worker-facing UI shows the ORGANIZATION name via
-- list_my_contact_disclosure_requests_v1), yet employer-side authority is
-- bound to the single profile that clicked "request":
--
--   contact_disclosure_requests_select   owner_id = auth.uid() OR subject
--                                        worker OR is_admin()
--   withdraw_contact_disclosure_request_v1   owner_id = auth.uid() ONLY
--
-- Consequence: when the requesting manager leaves the org, no remaining org
-- manager can see the open request or withdraw it; it dangles until expiry
-- while the org it was made FOR has no authority over it.
--
-- THE CHANGE. Reuse the org-demand authority spine that already governs the
-- underlying demand rows (customer_requests_select uses
-- has_org_demand_access(organization_id) — active company_memberships with a
-- managing role):
--
--   1. contact_disclosure_requests_select gains
--      `or public.has_org_demand_access(organization_id)`.
--   2. withdraw_contact_disclosure_request_v1 allows owner OR org demand
--      authority. Body otherwise byte-identical to the live definition
--      (captured from production pg_get_functiondef on 2026-08-17).
--
-- INTENTIONALLY NOT CHANGED (documented, not "fixed"):
--   * respond_contact_disclosure_request_v1 stays bound to the SUBJECT
--     WORKER — only the person whose contact data is at stake may accept or
--     decline. Person-bound by design; org authority must never reach it.
--   * propose_contact_disclosure_request_v1 requires demand ownership
--     (customer_requests.profile_id = caller) AND org authority at creation.
--     The demand-ownership binding is a data-model fact of customer_requests,
--     already org-visible via has_org_demand_access; unchanged here.
--   * The disclosure GRANT itself (grant/has/withdraw_employer_data_disclosure)
--     is already keyed on recipient_organization_id — org-bound today.
--
-- PRIVACY NOTE. The widened SELECT reveals request status/fields/note to
-- managers of the org the request was filed FOR — the same org whose name the
-- worker saw when consenting. It reveals nothing about the worker beyond what
-- the request row already carries, and the subject-worker and other-org
-- callers gain nothing.
--
-- COMPATIBILITY. Strictly widening on the employer side; worker-side listing
-- RPC and respond flow untouched.
--
-- @human-gate-approved — policy correction + org-authority extension of one
-- existing SECURITY DEFINER RPC (no new functions, no writes beyond the
-- existing status transition). Pre-approved by owner mandate 2026-08-17
-- (autonomous functional completion train V2, §4 migration authority);
-- production apply stays with the lead session via Supabase MCP.
--
-- ROLLBACK: supabase/rollbacks/20260817122000_contact_disclosure_org_authority_v1.down.sql
-- ============================================================================

begin;

-- ── 1. Org-aware SELECT policy ─────────────────────────────────────────────
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
    or public.has_org_demand_access(organization_id)
  );

-- ── 2. withdraw: owner OR org demand authority ─────────────────────────────
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
  -- NULL-safe by construction (the P0 secdef lesson: never a bare <> in a
  -- SECURITY DEFINER gate). Owner keeps authority; managers of the org the
  -- request was filed for gain it (has_org_demand_access is false for NULL).
  if v_row.owner_id is distinct from v_uid
     and not public.has_org_demand_access(v_row.organization_id) then
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

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/): restores the exact
-- live 2026-08-17 policy and function definitions. See the .down.sql file.
-- ════════════════════════════════════════════════════════════════════════════
