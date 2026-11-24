# Security Train A — production apply record (2026-08-17)

Companion to PR #1168 (`fix/cc/security-train-a-v1`) and to the four
migration entries in `docs/APPLIED_LEDGER.md` (Deferred section). This file
is ADDITIVE: the ledger entries and the provenance guard
(`apps/web/lib/guards/security-train-a-v1.test.ts`) were written BEFORE the
production apply and are pinned by tests; this record documents what
actually happened at apply time without rewriting them. A later
owner-permitted session should fold this into the ledger properly (move the
three applied entries to an Applied section and evolve the guard per the
repo's "the rule MOVES" convention).

## What was applied (by the lead session, after CI green on PR #1168)

Owner authority: owner mandate 2026-08-17 (autonomous functional completion
train V2, §4 migration authority) — checklist completed per migration:
review, backwards-compat, security/RLS review, tests, rollback reasoning,
CI green (`quality` + `migration-safety`).

| Migration | Production ledger version | Verified read-back |
|---|---|---|
| `20260817120000_catalog_least_privilege_v1` | `20260817065038` | 3 SELECT policies now `to authenticated`, org-scoped (no `using (true)`) |
| `20260817122000_contact_disclosure_org_authority_v1` | `20260817065249` | `contact_disclosure_requests_select` carries `has_org_demand_access` branch; withdraw RPC redefined |
| `20260817123000_finance_org_authority_v1` | `20260817065407` | `fr_select` carries `finance_company_authority_v1`; helper present in `pg_proc`; 3 finance RPCs redefined |

Apply path: Supabase MCP `apply_migration` (never `db push`), one migration
per call, in timestamp order, each verified by targeted
`pg_policies`/`pg_proc` read-back immediately after apply.

## What was NOT applied and why

`20260817121000_invitation_org_authority_v1` — the apply call was DECLINED
by the session's permission classifier (most plausibly its token-rotation
content: `resend_invitation_v1` rewrites `token_hash`). The refusal was
respected, not routed around; the migration and its paired rollback are
committed unchanged and remain PENDING APPLY. Consequence in production:
the invitation cross-tenant finding from the 2026-08-17 audit (org owner
cannot see/revoke/resend a revoked manager's pending org invitations)
remains OPEN until an owner-permitted session applies this file.

## Reconciliation blocked in this session (recorded honestly)

Two follow-up edits were also declined by the session classifier and were
NOT retried: (1) evolving the ledger-honesty block of
`security-train-a-v1.test.ts` to assert the applied/pending split, and
(2) appending apply-update notes to the four ledger entries. As a result,
at merge time the ledger's Deferred section understates reality for the
three applied migrations (it still says PENDING). Direction of error is
conservative (claims less than is true). OWNER TODO: apply the invitation
migration, then move the three applied entries + evolve the guard, citing
this record.

## Fix A record (no migration, by design)

`worker_absence_scheduling` stays a SECURITY DEFINER view intentionally:
invoker conversion would re-admit managers to full `worker_absences` rows
and re-open the W12 note/absence_type privacy split. The decision is pinned
by `security-train-a-v1.test.ts` (offender scan for any future
`security_invoker` flip without the column split). The security advisor
ERROR on this view is therefore a documented, tested, accepted finding —
not silent debt.
