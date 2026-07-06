# Privacy self-service v1 — process and honest boundaries

Status: shipped as quality-train PR G (2026-07-06). Implements the
"cheapest next actions" from `docs/compliance/gdpr-readiness-v1.md` §6:
data export + deletion request intake.

## What exists now

### Data export (live, immediate)
`/dashboard/privacy` → "Download my data (JSON)" streams the caller's OWN
data from `app/[locale]/dashboard/privacy/export/route.ts` via
`lib/privacy/export-data.ts`. Every read is an ordinary RLS-scoped query
as the signed-in user — profiles, consents, workers, journal_entries,
worker_skills, worker_documents (metadata only). Excluded and stated
inside the bundle: conversations/messages (other party's words), journal
confirmations (other users' identities), company/agency records, stored
file contents. No request queue needed; no service role used.

### Account-deletion request (intake, reviewed by a person)
The form files a typed row on the EXISTING `customer_requests` intake via
the DRAFT RPC `submit_privacy_request_v1`
(`supabase/migrations/20260706150000_privacy_request_intake.sql`, exact
twin of the help-request intake 20260705260000):
`kind='customer_request'`, `payload.privacy_request_type`,
`status='in_review'` (operator-queue visible; never on the open-demand
projections). Cap: 3 open per profile. The page states plainly that a
person reviews the request and nothing is deleted immediately.

**Migration status: DRAFT — needs-human-gate, in its OWN draft PR**
(SECURITY DEFINER + GRANT are RED-class per the migration-safety gate, so
the SQL is not bundled with app code). Until the owner reviews/merges
that PR and applies it via Supabase MCP, the form degrades honestly to
"not being accepted yet" (42883 → needs-migration state), while the
export keeps working (it needs no migration).

## Operator fulfilment (manual, honest)

- Requests appear on the existing admin intake queue
  (status `in_review`, payload key `privacy_request_type`).
- Data-export requests: usually unnecessary (self-service export exists) —
  close with a note pointing at /dashboard/privacy unless the user needs
  something the bundle excludes.
- Deletion requests: OWNER-GATED. Verify identity, check for live
  engagements/disputes, then the deletion itself is a manual owner action
  (`profiles` cascade covers key tables per gdpr-readiness §2) — never
  automated by this feature. Record the outcome via the normal intake
  status transitions.

## Known follow-ups (owner decisions)

1. Apply the DRAFT intake migration (one yes/no — enables the deletion
   request form).
2. PUBLIC legal copy still says "no export bundle"
   (`docs/compliance/gdpr-readiness-v1.md` §2 and the legal pages'
   pending-items). That copy is now stale — updating it touches public
   marketing/legal pages, which stay owner-gated per the train rules.
3. Consent dashboard + actual deletion automation remain separate,
   lawyer-aware PRs (gdpr-readiness §2 erasure note).
