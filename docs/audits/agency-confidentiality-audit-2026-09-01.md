# Agency bridge confidentiality audit — 2026-09-01

Scope: the applied two-subject agency→client bridge
(`supabase/migrations/20260723180000_agency_real_client_bridge_v1.sql`, live in
production per the 2026-08 APPLIED_LEDGER reconciliation) plus its consuming
app layer (`apps/web/lib/agency/bridge-read.ts`, `bridge-actions.ts`).

Verdict: the bridge's *authorization-to-act* model is sound (caller-bound
SECURITY DEFINER RPCs, active-connection/share checks on every WRITE), but its
*disclosure* model has a lifecycle hole: what was disclosed while a
relationship was alive stays readable after the relationship dies.

## Findings (ranked)

### L1 — HIGH: disclosure survives revocation (FIXED in this package)

- `list_agency_offered_candidates_for_request_v1` (bridge migration ~L566)
  filters only `o.status = 'offered'` and never requires the parent
  connection or request share to be active.
- `revoke_agency_client_connection_v1` (~L287) cascade-revokes the
  connection's active shares (~L311) but **never withdraws its offers**.
- `agency_candidate_offers_select` RLS (~L166) grants the client owner read
  of the raw offer rows unconditionally.

Net effect: after an agency severs a client connection (or the client is
revoked by the agency), the severed client **permanently retains the agency's
candidate worker_ids + notes** — via the list RPC and via direct table SELECT.
The same active-filter omission in `list_agency_offer_progress_v1` (~L519)
lets the agency keep deriving the severed client's review activity
(shortlist / contact / booking stages) indefinitely.

Fix: `supabase/migrations/20260901052300_agency_disclosure_revocation_v1.sql`
(owner-gated DRAFT, needs-human-gate):

1. both list RPCs join share + connection and require
   `c.status = 'active' and s.status = 'active'`;
2. revoke also flips the connection's live offers `'offered'` →
   `'withdrawn'` (respects the offers status CHECK; frees the
   `uq_offer_active` partial-unique slot for a legitimate future re-offer);
3. the offers SELECT policy's client arm now requires an active parent
   connection (pure tightening; agency + admin arms unchanged).

Rollback restoring the exact prior definitions:
`supabase/rollbacks/20260901052300_agency_disclosure_revocation_v1.down.sql`.
Guard: `apps/web/lib/guards/agency-disclosure-revocation.test.ts`.

### L2 — HIGH (product): offers disclose a worker to a third company with zero worker consent (OPEN — owner decision)

`submit_agency_candidate_offer_v1` checks only that the worker is an **active
roster member of the agency** (`company_workers.status = 'active'`). There is
no `can_view_worker` check, no worker-facing consent artifact, and the worker
never reads the offer row at all — a worker's identity (worker_id, plus
whatever the client can resolve from it on its scouting surface) is handed to
a third company the worker may never have heard of.

This is **not fixed in this package** because it is a product decision, not a
patch: it needs a consent-gate design — the missing *agency leg* in the
consent spine (worker → agency "you may represent me to clients" with a
validity window / revocation), analogous to the existing client-side
share-consent leg. Recorded as an OPEN owner decision.

### L3 — LOW: invited_email exposed to the counterparty after accept (DEFERRED)

`agency_client_connections_select` (~L85) lets the client owner read the full
connection row, including `invited_email`, once linked. Row-level RLS cannot
mask one column per arm; the minimal real fix (curated list RPC + revoking
direct table SELECT) would break the direct `.from("agency_client_connections")`
reads in `bridge-read.ts` (`listAgencyConnections`, `listMyConnectionInvites`)
and is too invasive for the L1 package. Severity is low — the exposed value is
the email the invite was addressed to, normally the counterparty's own
address. Deferred with a note in the fix migration's header.

## Ranked gap list (beyond the three findings)

1. **Missing agency leg + validity in the consent spine** (drives L2): the
   platform has consent artifacts for client→agency demand sharing
   (`agency_client_request_shares`, revocable) but nothing for
   worker→agency representation. Any offer pipeline that discloses worker
   identity should hang off a revocable, time-bounded worker consent row.
2. **The "anonymous opportunity" stage is presentation-layer only**: the
   client-side scouting surface renders agency candidates through the
   anonymized shortlist/contact controls, but the RPC has already disclosed
   the raw `worker_id` (plus the agency's free-text note) to the client — the
   anonymity is a UI convention over an already-disclosed identifier, not a
   data boundary.
3. **Disclosure lifecycle as a class**: L1 is one instance of a general rule
   worth auditing across the platform — every curated cross-tenant read must
   re-check, at read time, that the relationship that authorized the
   disclosure is still alive (connection active, share active, consent valid).

## Status

- L1: fix packaged in this PR — **owner-gated DRAFT, NOT applied**.
- L2: OPEN — owner product decision (consent-gate design required).
- L3: DEFERRED — noted in the fix migration header.
