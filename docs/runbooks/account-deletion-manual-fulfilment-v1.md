# Runbook — fulfil an account-deletion request by hand (v1, 2026-09-19)

> **Why this exists.** A person can already ask for deletion from
> `/dashboard/privacy` (RPC `submit_privacy_request_v1`, live in production
> since 2026-07-06) and a superadmin can review the request and open the
> read-only E1–E8 row-count preview (`apps/web/lib/privacy/deletion-plan.ts`).
> **Nothing executes the deletion.** There is no executor RPC, no FK
> `on delete set null` on the ~57 actor columns that reference `profiles`,
> and until this file no written procedure. GDPR Art. 12(3) gives one month
> from the request. This runbook is the procedure an owner follows **today**,
> by hand, through Supabase MCP `execute_sql` against
> `gorgitwvdzxbnaxhrsrw`, so a request never stalls for lack of a method.
>
> Design authority: `docs/legal/deletion-process-design-v1.md` (§3 E1–E8,
> §4 gates). Retention basis: `docs/legal/data-retention-matrix-v1.md`.
> Owner packet: R-7 in `docs/launch/OWNER_RETURN_PACKAGE_2026-09-19_COMPLETION.md`.

## 0. Classification of what happens to each data class

| Class | Model | Why |
|---|---|---|
| E1 Work Journal entries + confirmations | **ANONYMIZE / DETACH** (`worker_id → null`, keep the row) | employer-confirmed evidence is also the employer's record (#856 model A) |
| E2 consent + disclosure ledgers | **DETACH identity, RETAIN 6 y** | proof of lawfulness, append-only |
| E3 bookings / engagements / contracts | **RETAIN UNDER LEGAL BASIS** until Package A Decision 1 (contract-claim horizon) | not deletable before the owner/legal decision — named exception in the completion note |
| E4 the privacy-request row itself (`customer_requests`) | **RETAIN 3 y**, then anonymize requester linkage | Art. 12–22 defence |
| E5 storage objects (journal photos, avatars, attachments, documents) | **DELETE** | private buckets, no public copies |
| E6 messages | **DETACH** sender identity now; purge per matrix (36 mo) only after Decision 3 | counterpart keeps their side of the thread |
| E7 auth identity + `profiles` + `workers` | **DELETE** (last step; FK cascades do the rest) | account |
| E8 notification / pilot / analytics events | **DELETE** where profile-keyed (mostly via E7 cascade) | ephemeral |
| Billing / cost records | **RETAIN** (statutory) — `usage_cost_events` is trigger-immutable | tax law; no user-facing billing yet |
| Organization relationships (memberships, roster links) | **END via the canonical RPCs first**, then E7 cascades | `end_roster_link_v1`, `membership_leave_v1` / `membership_revoke_v1` keep history honest |
| Public content (public business profile owned by the person's org) | **owner decision per case** — an org outlives a person; if the person is the last active owner, transfer ownership first (the last-owner trigger refuses a revoke) | |

The whole thing is **owner-gated on every occurrence**. Do not script it into
a route, a cron or a service-role helper. Uncertainty at any step = stop.

## 1. Preconditions (read-only)

1. The request row exists and is the person's own:
   ```sql
   select id, profile_id, status, created_at,
          payload->>'privacy_request_type' as type
     from public.customer_requests
    where payload->>'source' = 'privacy_self_service'
      and payload->>'privacy_request_type' = 'account_deletion'
      and status in ('in_review','approved')
    order by created_at;
   ```
2. Identity is already bound: the row's `profile_id` was written by the RPC
   from `auth.uid()`. No e-mail round-trip is needed; do not accept a
   deletion request from any other channel without the same binding.
3. Open the superadmin preview (`/dashboard/admin` → Privacy requests →
   expand) and copy the E1–E8 counts into the request's review log
   (`reviewPrivacyRequest`, status `approved`, note = the counts).
4. Named exceptions the person must be told (completion note, step 6):
   E3 rows kept until Decision 1; E2 ledgers kept 6 y with identity detached;
   E4 the request itself kept 3 y.

Set `\set pid '<profile uuid>'` mentally — every statement below is scoped to
one `profile_id`; run them one at a time and check the row count each time.

## 2. Relationship ends (canonical RPCs, as the owner — never raw UPDATE)

- Roster links: for each `company_workers` / `agency_workers` row of the
  person's worker, an org owner/admin (or the person) calls
  `end_roster_link_v1(p_kind, p_org_legacy_id, p_worker_id, 'account_deletion')`.
- Governance memberships: `membership_revoke_v1(membership_id)` per row; if
  the person is the **last active owner** of an organization the trigger
  refuses — decide (transfer ownership or accept that the org is closed per
  `docs/runbooks/organization-closure-composition-v1.md`) before continuing.
- Engagement contexts: `end_org_membership_v1(engagement_id, 'account_deletion')`.

## 3. E1 — journal detach (keep the evidence, drop the identity)

```sql
-- entries authored by the person: detach; the #856 detached row grants nothing
update public.journal_entries set worker_id = null
 where worker_id in (select id from public.workers where profile_id = :'pid');
-- confirmations the person GAVE as a manager keep their evidential value;
-- the confirmer column is an actor column: null it, keep the row
update public.journal_entry_confirmations set confirmer_id = null
 where confirmer_id = :'pid';
```
If either statement errors with a NOT NULL violation, that column is not yet
nullable in production — **stop**; that is exactly the FK/nullable change the
RED packet R-7 exists for. Record it, do not work around it.

## 4. E2 / E4 / E6 — detach identity, retain the record

```sql
update public.privacy_consent_events set profile_id = null where profile_id = :'pid';
update public.personal_data_disclosures set subject_profile_id = null where subject_profile_id = :'pid';
update public.conversation_messages set sender_id = null
 where sender_id = :'pid';
```
E4: leave the deletion-request row in place for 3 years; it is the record
that the request was handled. Anonymize `profile_id` on it **last**, together
with E7, only if the FK does not cascade it away.

E3: touch nothing. `booking_requests`, `company_worker_engagements`,
contracts stay until Decision 1.

## 5. E5 — storage objects

For each private bucket (`journal-entry-photos`, `profile-avatars`,
`conversation-message-attachments`, `customer-request-attachments`, the org
document bucket) list objects whose path prefix is the person's worker/profile
id and delete them through the Supabase dashboard or the storage API with the
service key, **before** E7 (after E7 the owning rows are gone and the objects
become orphans nobody can find).

## 6. E7 — the account (LAST)

```sql
delete from auth.users where id = :'pid';
```
`profiles` cascades from `auth.users`; profile-keyed rows with `on delete
cascade` follow. The statement **fails** if any remaining reference is
`ON DELETE NO ACTION` (there are ~57 such actor columns in production). When
it fails, the error names the table: that table is either (a) a class above
you skipped — go back — or (b) a genuine RED gap. Record (b) in the R-7 packet
row and stop; never `drop constraint` by hand in production.

## 7. Completion note to the person

Send, in the person's locale, a plain statement of: what was deleted (E5, E7,
E8), what was detached and kept as evidence (E1, E6), what is kept under a
legal basis and for how long (E2 six years, E3 until the contract-claim
horizon, E4 three years). Set the request status to `closed` with the same
text in the review note. Never claim "everything was deleted".

## 8. What would make this a button instead of a runbook (RED, owner-gated)

1. `alter table … alter column … drop not null` + `on delete set null` on the
   actor columns that today block E1/E7 — one migration, one `.down.sql`
   recreating each constraint verbatim.
2. `execute_account_deletion_v1(p_profile_id)` — SECURITY DEFINER,
   superadmin-only, NOT web-reachable, implementing steps 3–6 in one
   transaction with a returned per-class receipt.
3. Package A Decision 1 (contract-claim horizon) — without it E3 cannot be
   described honestly in the completion note.

Approval sentence that would unblock (1)+(2): **"Apply R-7: nullable actor
columns + execute_account_deletion_v1, superadmin-only, with rollback."**
