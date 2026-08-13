# Data retention matrix v1 — DRAFT for owner/legal sign-off (2026-08-13)

State: `DRAFT — LEGAL/OWNER GATE`. Every row below separates what is
**implemented today** (fact, re-derived from schema and code) from the
**recommended retention** (proposal). No recommended period becomes public
copy until the owner/legal approves this matrix — but the public policy may
not keep saying "periods are being prepared" at launch, so this document
exists to make the decision one sitting long.

Method: implementation facts come from the live schema/migrations
(`ai_runs` retention draft 20260808130000 UNAPPLIED; consent ledger
append-only; privacy intake live since 2026-07-06); legal-basis columns
mirror `docs/legal/legal-basis-matrix-v1.md`. Nothing here invents a legal
deadline — where a statutory period applies it is named as the REASON.

| Data class | Purpose | Legal basis | Implemented today | RECOMMENDED retention | Delete/anonymize path | Exception |
|---|---|---|---|---|---|---|
| Account (auth) | login, identity | 6(1)(b) | kept until deleted; deletion via reviewed request (live) | until account deletion | Supabase auth delete cascades `profiles` | fraud/abuse hold (6(1)(f)) |
| Profile / worker data | professional identity | 6(1)(b) | kept while account lives | account life; anonymize on deletion | FK cascade from profiles | active engagement contract data → keep until relationship ends |
| CV / documents | applications | 6(1)(b) | no uploads exist yet in prod; storage unlimited | account life OR 24 mo after last activity (recommend) | storage object delete + row delete | none |
| Work Journal | living work record | 6(1)(b) | kept while account lives | account life; on deletion ANONYMIZE (detach worker_id, keep aggregate) — mirrors #856 model A | detach pattern exists (GDPR-detached rows grant nothing) | employer-confirmed entries tied to a real engagement: keep detached evidence |
| Messages | party communication | 6(1)(b) | kept | 36 mo after conversation close (recommend) | bulk delete job (none exists — build behind gate) | legal dispute hold |
| Inquiries (customer_requests) | demand intake | 6(1)(b)/(f) | kept | 24 mo after closed (recommend) | delete or anonymize org linkage | invoicing linkage when billing starts |
| Bookings / engagements | work relationship record | 6(1)(b) | kept (append lifecycle) | 6 years after end (recommend — contract-claim horizon; owner/legal to confirm jurisdiction) | none yet | statutory claim periods |
| Absences | scheduling + private reason | 6(1)(b); reason is restricted | kept; private reason policy-guarded | reason text 12 mo, absence fact as engagement record | reason column redaction job (build behind gate) | none |
| Notification events | durable awareness | 6(1)(f) | NO automatic retention (stated in gate) | 12 mo rolling delete (recommend) | needs a small owner-gated retention migration | none |
| Audit/security logs (consent, disclosure ledgers) | accountability | 6(1)(c)+(f) | append-only, kept | keep 6 years (accountability horizon) | none — deliberate | none |
| Analytics/funnel events | product improvement | 6(1)(f) | bounded scalars, no PII payloads | 24 mo (recommend) | table purge job | none |
| Consent events | prove consent state | 6(1)(c) | append-only, version-pinned | as long as the account + 6 years after deletion (proof of lawfulness) | never edited; detach identity on account deletion | none |
| Privacy requests | Art. 12-22 handling | 6(1)(c) | kept in customer_requests | 3 years after completion | anonymize requester linkage | supervisory authority defense |
| Billing/invoices (future) | payment records | 6(1)(c) | not live | statutory accounting period (10 y LT / owner's jurisdiction — LEGAL GATE) | none | tax law |
| LMC ledger (future) | credit accounting | 6(1)(b)/(c) | not live | as billing | none | tax law |
| AI runs (output excerpts) | debugging/quality | 6(1)(f) | DRAFT 90-day redaction UNAPPLIED (20260808130000) | apply the existing 90-day redaction | already written + scheduled sweep draft | none |
| Backups | disaster recovery | 6(1)(f) | provider-managed (Supabase PITR) | provider window (state factually, no invented number) | expires by rotation | none |

## The three decisions the owner/legal actually has to make
1. **The contract-claim horizon** for bookings/engagements (recommended 6 y —
   depends on governing law; Legal Notice says Polish entity, users may be
   under LT/other law → LEGAL GATE).
2. **Billing/invoice statutory period** once payments exist (jurisdictional).
3. Approve the **12-month rolling deletes** (notifications, absence reasons,
   analytics) — each needs one small owner-gated migration; none exists yet.

## What can ship WITHOUT the gate
The public retention page can state, factually and today: what is kept while
the account lives; that deletion is a reviewed request (live); that consent
and audit ledgers are append-only by design; the ai_runs 90-day redaction
once its (already drafted) migration is applied; provider-managed backups.
The page must stop at facts and label the pending numbers as pending — but
AFTER this matrix is approved there is nothing left "being prepared".
