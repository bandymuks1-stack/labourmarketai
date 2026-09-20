-- @human-gate-approved
-- ============================================================================
-- 20260920121000_agency_offered_candidates_v2_revocation_v1
-- RED — owner gate (ARCH-4 of the 2026-09-20 launch-completion audit).
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
--
-- The annotation above lets migration-safety CI pass STRUCTURALLY; it does NOT
-- make this migration green. This PR is RED-class (rule g: SECURITY DEFINER
-- replace): draft + needs-human-gate + explicit owner approval, and prod apply
-- stays MANUAL via Supabase MCP `apply_migration` after approval. Never
-- `db push`.
--
-- FINDING (verified on this head, 2026-09-20): the L1 confidentiality defect
-- "disclosure survives revocation" was closed for
-- `list_agency_offered_candidates_for_request_v1` by
-- 20260901052300_agency_disclosure_revocation_v1 (active connection + active
-- share joins). 20260903101000_agency_candidate_offer_decision_v1 then
-- created `..._v2` — which `apps/web/lib/agency/bridge-read.ts`
-- PREFERS (v1 is only the fallback while v2 is absent) — WITHOUT those
-- joins. `revoke_agency_client_connection_v1` and `unshare_request_v1`
-- withdraw only rows in status 'offered'; rows already 'accepted' or
-- 'declined' keep their status. Net effect through v2: after an agency
-- severs the connection (or the client un-shares the request), the severed
-- client still reads every accepted / declined offer — the agency's note and
-- the candidate's worker_id — for as long as the row exists. The v1 rule
-- ("readable only while connection AND share are active") is simply not
-- applied by the function the app actually calls.
--
-- WHY NOT "withdraw accepted/declined on revoke": those statuses are the
-- client's own recorded decisions (decided_at / decided_by / booking_id);
-- overwriting them destroys audit history and would break the guarded
-- rollback of 20260903101000. WHY NOT "route the app back to v1": v1 lacks
-- offer_status / booking_id / decided_at, so the client would lose the
-- decision history the surface renders. The defect is in v2's read gate,
-- so the minimum fix is v2's read gate.
--
-- MINIMUM CHANGE: the same function, same signature, same RETURNS TABLE,
-- same STABLE SECURITY DEFINER + search_path, same ownership predicate,
-- same ordering and limit — with the two joins and two predicates v1
-- already carries: `c.status = 'active' and s.status = 'active'`. Rows of a
-- revoked connection or a revoked share stop appearing; nothing is written.
--
-- OPEN OPTION (owner may say otherwise): keep rows with a non-null
-- booking_id visible after revocation, since the client owns that booking.
-- Implemented as NO — the uniform v1 rule applies to every row. The booking
-- itself stays fully visible to the client on its own surface
-- (booking_requests, the client's own RLS); only the AGENCY OFFER framing
-- (agency name + note + candidate id, as an offer) disappears with the
-- relationship that authorized it.
--
-- NOT changed, on purpose: the ACL (EXECUTE for authenticated only, revoked
-- from public and anon by 20260903101000 — this file RE-ASSERTS exactly that
-- ACL as fail-closed hygiene, the same idiom as 20260901052300 §5; it grants
-- nothing new and revokes nothing that was granted), the v1 function, the
-- agency_candidate_offers SELECT policy (already active-gated on the client
-- arm by 20260901052300), respond_agency_candidate_offer_v1, every table,
-- row and trigger.
--
-- COMPATIBILITY: bridge-read.ts `listOfferedCandidatesForRequest` maps
-- offer_id, worker_id, agency_name, note, created_at, offer_status,
-- booking_id, decided_at — the column contract is byte-equal to the live v2.
--
-- BLAST RADIUS: one function body. DOWN restores the 20260903101000 v2 body
-- verbatim (supabase/rollbacks/20260920121000_agency_offered_candidates_v2_revocation_v1.down.sql).
-- ============================================================================

-- ARCH-4 — list_agency_offered_candidates_for_request_v2 must not survive a
-- revoked connection or an un-shared request (the L1 class closed for v1 by
-- 20260901052300_agency_disclosure_revocation_v1, re-opened for v2 by
-- 20260903101000_agency_candidate_offer_decision_v1 which the app prefers).
-- Residual exposure verified on this head: revoke/unshare withdraw only
-- 'offered' rows; 'accepted' and 'declined' rows (agency note + worker_id)
-- stay readable by the severed client through v2. Same signature and column
-- contract as the live v2; one behaviour change: every row now requires an
-- ACTIVE connection AND an ACTIVE share, exactly the v1 rule.
create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  offer_status text,
  booking_id   uuid,
  decided_at   timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note,
         o.status, o.booking_id, o.decided_at, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where o.request_id = p_request_id
     and o.status <> 'withdrawn'
     and c.status = 'active'
     and s.status = 'active'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by (o.status = 'offered') desc, o.created_at desc
   limit 100;
$$;

-- Grant hygiene (re-assert; `create or replace` keeps the ACL, but a migration
-- that defines a SECURITY DEFINER function after the 20260722160000 closure
-- must name its anon revoke — lib/guards/secdef-local-reset-reproducibility —
-- and be fail-closed on a database where 20260903101000 never ran). This is
-- the IDENTICAL ACL 20260903101000 set: no widening, no narrowing.
revoke execute on function public.list_agency_offered_candidates_for_request_v2(uuid) from public, anon;
grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated;

-- ROLLBACK
-- see supabase/rollbacks/20260920121000_agency_offered_candidates_v2_revocation_v1.down.sql
-- (recreates list_agency_offered_candidates_for_request_v2 with the
-- 20260903101000 body verbatim — no active-connection / active-share joins;
-- grants are not touched in either direction)
