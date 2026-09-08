-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- @human-gate-approved
--
-- The annotation above lets migration-safety CI pass STRUCTURALLY; it does NOT
-- make this migration green. This PR is RED-class: draft + needs-human-gate +
-- explicit owner approval, and prod apply stays MANUAL via Supabase MCP
-- `apply_migration` after approval. Never `db push`.
-- ============================================================================
--
-- agency_disclosure_revocation v1 — closes the L1 confidentiality defect in
-- the applied 20260723180000_agency_real_client_bridge_v1.sql.
--
-- WHY (L1 — disclosure survives revocation):
--   `list_agency_offered_candidates_for_request_v1` filters only
--   o.status = 'offered' and never requires the parent connection or share to
--   be active; `revoke_agency_client_connection_v1` cascade-revokes the
--   connection's shares but never withdraws its offers; and the
--   `agency_candidate_offers_select` RLS policy keeps granting the client
--   owner read unconditionally. Net effect: after an agency severs a client
--   connection, the severed client PERMANENTLY retains the agency's candidate
--   worker_ids + notes — the disclosure outlives the relationship that
--   authorized it. The same active-filter omission exists in
--   `list_agency_offer_progress_v1` (the agency keeps deriving the client's
--   review activity after the link is gone).
--
-- FIX (three tightenings, no schema change, no new object):
--   1. `list_agency_offered_candidates_for_request_v1` and
--      `list_agency_offer_progress_v1` now join the offer's share + connection
--      and require `c.status = 'active' and s.status = 'active'`.
--   2. `revoke_agency_client_connection_v1` now ALSO withdraws the
--      connection's live offers (status 'offered' → 'withdrawn'; the offers
--      status CHECK allows exactly these two values, and withdrawing frees the
--      uq_offer_active partial-unique slot for a future re-offer on a new
--      connection — the submit RPC's ON CONFLICT re-bind stays correct).
--   3. `agency_candidate_offers_select` RLS: the CLIENT-side arm now requires
--      the parent connection to be active. The agency-side arm and the admin
--      arm are UNCHANGED. This is a pure TIGHTENING (rows visible after this
--      policy ⊂ rows visible before).
--
-- COMPATIBILITY (apps/web/lib/agency/bridge-read.ts / bridge-actions.ts):
--   * Return shapes of both list functions are UNCHANGED (same columns, same
--     types, same order) — listOfferedCandidatesForRequest and
--     listAgencyOfferProgress deserialize identically.
--   * revoke_agency_client_connection_v1 signature + return values unchanged
--     ('revoked' | 'not_found') — revokeConnectionAction unaffected.
--   * Rows from revoked connections simply stop appearing — which is the fix.
--   * `create or replace` preserves each function's existing grants; the
--     grant-hygiene block below re-asserts them anyway (fail-closed on a
--     database where 20260723180000 has not run).
--
-- L3 (invited_email exposure) — DEFERRED, not fixed here:
--   `agency_client_connections_select` exposes the agency's invited_email to
--   the counterparty after accept. Masking one column per-arm is not
--   expressible in row-level RLS; the minimal real fix is a curated
--   list RPC + revoking direct table SELECT, which would break the direct
--   `.from("agency_client_connections")` reads in bridge-read.ts
--   (listAgencyConnections, listMyConnectionInvites) and is too invasive for
--   this package. Severity is low: the exposed value is the email the invite
--   was addressed to (normally the counterparty's own address). Recorded in
--   docs/audits/agency-confidentiality-audit-2026-09-01.md.
--
-- L2 (offer discloses a worker with zero worker consent) — OPEN owner product
--   decision (consent-gate design), recorded in the same audit; NOT fixed here.
--
-- ROLLBACK: supabase/rollbacks/20260901052300_agency_disclosure_revocation_v1.down.sql
--   restores the exact prior definitions (verbatim copies from the applied
--   20260723180000_agency_real_client_bridge_v1.sql).
-- ============================================================================

-- ══ 1. Client-facing candidate list: only while connection + share are live ═
create or replace function public.list_agency_offered_candidates_for_request_v1(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where o.request_id = p_request_id
     and o.status = 'offered'
     and c.status = 'active'
     and s.status = 'active'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by o.created_at desc
   limit 100;
$$;

-- ══ 2. Agency-facing progress: stop deriving a severed client's activity ════
create or replace function public.list_agency_offer_progress_v1()
returns table (
  offer_id     uuid,
  request_id   uuid,
  worker_id    uuid,
  offer_status text,
  review_stage text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.request_id, o.worker_id, o.status,
    case
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'accepted') then 'accepted'
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'proposed') then 'booking_started'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)
                      and d.status = 'not_fit') then 'rejected'
      when exists (select 1 from public.conversations cv
                    join public.workers w on w.id = o.worker_id
                    join public.conversation_participants cp
                      on cp.conversation_id = cv.id and cp.profile_id = w.profile_id
                    where cv.source_type = 'scouting' and cv.source_id = o.request_id) then 'contacted'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)) then 'reviewed'
      else 'offered'
    end as review_stage,
    o.created_at
    from public.agency_candidate_offers o
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where public.owns_company(o.agency_company_id)  -- caller = agency owner
     and c.status = 'active'
     and s.status = 'active'
   order by o.created_at desc
   limit 200;
$$;

-- ══ 3. Revoke now also withdraws the connection's live offers ═══════════════
create or replace function public.revoke_agency_client_connection_v1(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Either side (agency owner or client owner) may revoke a pending/active link.
  -- Soft revoke: history is kept; shares/offers stay in the audit but the
  -- revoked connection grants no new rights (share/offer RPCs re-check 'active').
  update public.agency_client_connections c
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where c.id = p_connection_id
     and c.status in ('pending', 'active')
     and (public.owns_company(c.agency_company_id)
          or (c.client_company_id is not null and public.owns_company(c.client_company_id)));
  get diagnostics v_upd = row_count;
  if v_upd = 0 then return 'not_found'; end if;
  -- Revoking also revokes the client's active shares on this connection
  -- (no new candidate can be offered once the link is gone).
  update public.agency_client_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where connection_id = p_connection_id and status = 'active';
  -- L1 FIX: revoking now ALSO withdraws the agency's live offers on this
  -- connection — a severed client must not retain the candidate identities
  -- ('offered' → 'withdrawn' respects the offers status CHECK and frees the
  -- uq_offer_active partial-unique slot).
  update public.agency_candidate_offers
     set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now(), updated_at = now()
   where connection_id = p_connection_id and status = 'offered';
  return 'revoked';
end;
$$;

-- ══ 4. RLS tightening: client-side offer read requires a live connection ════
-- Pure narrowing of agency_candidate_offers_select. Agency arm + admin arm
-- unchanged; the client arm gains an active-connection EXISTS gate.
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or (public.owns_company(client_company_id)
        and exists (select 1 from public.agency_client_connections c
                     where c.id = connection_id and c.status = 'active'))
    or public.is_admin()
  );

-- ══ 5. Grant hygiene (re-assert; `create or replace` keeps grants, but this ═
--       migration must be fail-closed on a DB where the bridge grants never ran)
revoke all on function public.list_agency_offered_candidates_for_request_v1(uuid) from public;
revoke all on function public.list_agency_offered_candidates_for_request_v1(uuid) from anon;
grant execute on function public.list_agency_offered_candidates_for_request_v1(uuid) to authenticated;
revoke all on function public.list_agency_offer_progress_v1() from public;
revoke all on function public.list_agency_offer_progress_v1() from anon;
grant execute on function public.list_agency_offer_progress_v1() to authenticated;
revoke all on function public.revoke_agency_client_connection_v1(uuid) from public;
revoke all on function public.revoke_agency_client_connection_v1(uuid) from anon;
grant execute on function public.revoke_agency_client_connection_v1(uuid) to authenticated;

-- ROLLBACK: supabase/rollbacks/20260901052300_agency_disclosure_revocation_v1.down.sql
-- (verbatim restore of the three function definitions and the SELECT policy
-- exactly as applied by 20260723180000_agency_real_client_bridge_v1.sql).
