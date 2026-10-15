# Account erasure v2: design (issue #856, replaces PR #2412 "option B, redo")

Status: **DRAFT. Nothing is applied, committed or merged.** RED class (owner gate + lawyer
questions). Companion files: `migration_up.sql` (draft `20261016090000_privacy_erasure_executor_v2.sql`),
`migration_down.sql`, `LAWYER_QUESTIONS.md`, `TEST_PLAN.md`.

Measured on production (catalog only, no personal values) on 2026-10-15.
**264** foreign keys in `public` reference `public.profiles` (227), `public.workers` (36) or
`auth.users` (1, `profiles.id`). Another 11 FKs inside `auth.*` cascade from `auth.users`; the Auth Admin
API handles those. ON DELETE actions today: 120 CASCADE, 73 SET NULL, **65 NO ACTION**, **5 RESTRICT**,
1 CASCADE from auth.

## 1. Four outcomes, four words

| Word | What happens to the row | What remains | Data still "personal"? |
|---|---|---|---|
| **ERASURE (DELETE)** | the row is deleted | nothing (backups age out, see Q6) | no |
| **PSEUDONYMISATION** | the row stays for *someone else's* record; the link to the person becomes NULL and identifiers or free text that point at them are scrubbed | another party's record with an anonymous participant | treated as personal data until the lawyer says otherwise (Recital 26) |
| **RETAIN-DETACHED** | the row is kept under a **named legal hold** (consent proof, employer-confirmed work evidence, payroll/accounting, contract horizon); link NULL, private free text scrubbed | evidence that something happened, not who it was | yes, kept on a stated legal basis (Art 17(3)(b)/(e)), legal basis to confirm (LAWYER_QUESTIONS) |
| **BLOCK** | nothing runs until a human resolves it through the normal product path | — | — |

Pseudonymisation is **not** erasure. The completion note sent to the person must list the
retained/pseudonymised classes with the reason for each. It must not tell them "everything was deleted".

**What the pseudonym is.** An FK column cannot hold a random per-erasure id: the FK would reject it, and
a shared "erased" profile would need a fake auth user. So in FK columns the pseudonym is **NULL**, and
NULL is stored nowhere else. A random per-erasure id is used in exactly one place,
`privacy_consent_events.erased_subject_id`, so that a former subject's grant/withdraw pairs stay provable.
It is minted inside `execute_v2`, **never returned and never copied** (the #2412 draft returned it).
`erased_at` is truncated to the month. `company_worker_engagements.subject_key` (no FK, a per-row random
key) is **re-minted** at erasure, so no export or backup taken earlier can be joined to the row.

## 2. Classification result (264 FK columns, Appendix A)

| Class | FK columns | of which NO ACTION / RESTRICT today (would block deletion) | of which CASCADE today (would over-delete or must be kept) |
|---|---|---|---|
| DELETE | **67** | 3 (pilot_events, language_feedback, pilot_outcomes.participant) | 63 |
| PSEUDONYMISE | **163** | 60 | 35 (G2: records the person created for others) |
| RETAIN-DETACHED | **24** | 5 | 15 |
| BLOCK (until resolved, then DELETE or RETAIN) | **10** | 2 (LMC ledger) | 8 |

Outside the FK list there are also 2 no-FK columns (`company_worker_engagements.subject_key`,
`worker_display_name_backfill_20260805.profile_id`) and 6 tables keyed by e-mail address
(`invitations`, `agency_worker_invitations`, `company_worker_invitations`,
`agency_client_connections`, `waitlist`, `leads`, plus `company_need_public_intakes.contact_*`). 31 JSON
columns on surviving rows are swept for the person's ids (§5.6). Six Storage buckets are covered (§6).

The registry lives **in the database** (`public.privacy_erasure_relations`, 266 rows). If an FK onto
profiles/workers is not in the registry, every erasure is refused with `unclassified_relation`. This
drift guard was tested: a new FK added later cannot silently cascade or block.

## 3. How the review findings are closed

| Finding | v2 answer |
|---|---|
| **G1**: 62 NO ACTION + 4 RESTRICT FKs block deletion | Each one is classified. Rows that survive get the link NULLed **before** `profiles`/`workers` are deleted. 99 NOT NULL columns are relaxed for this (§7). The FK itself then guarantees nothing was missed: an unhandled reference raises, and the whole transaction rolls back. |
| **G2**: CASCADE over-deletes | Every CASCADE column was looked at. `created_by`/`owner_id`/`reviewer` columns on organization records (agreements, contracts, finance_records, timesheets.created_by, performance_reviews, work_tasks/work_objects (230 rows!), training_programs, workflow_definitions, management_decisions, invitations sent, …) are **PSEUDONYMISE**. Journal entries reached through `workers` are split: employer-confirmed (or submitted for review, or feeding hours, plus their correction/supersession chain) → RETAIN-DETACHED. Unconfirmed own entries → DELETE (E1). |
| **G3**: rows survive with personal content | `ai_runs.output_excerpt/request_context` set NULL. `audit_logs.payload`: the person's ids removed recursively; `display_name/full_name/email/phone` dropped on rows by or about them; `entity_id` NULLed. `usage_cost_events.session_id`, personal `workspace_id` and `metadata.request_context` dropped. `organization_people.display_name/normalized_name/source_note/external_ref` scrubbed and the row unlinked. `customer_requests.drafted_by` NULL. `learning_signals.actor_id` NULL. Rows where the person is the *subject* are deleted. |
| **G4**: no-FK leftovers | Storage objects are listed by path prefix and owner (§6). The backfill table row is deleted. `subject_key` is re-minted. Other recipients' notifications about the person get a fresh random `entity_id` and lose `title`. |
| **G5**: `personal_data_disclosures` refused | RETAIN-DETACHED. `worker_user_id` and `metadata` are NULLed under the sanctioned trigger suspension; the ledger row stays as proof (6 y, Q1). |
| **G6**: messages in others' threads | A thread with no other participant is deleted. In a shared thread the person's messages keep their place: author NULL, `body = ''`, translation cleared. The other party keeps their own words. Attachments are deleted. A legal-hold exception is Q5. |
| **G7**: SQL `delete from auth.users` | Removed (`erase_user_account_v1` is dropped). SQL deletes `workers` + `profiles` only. The server deletes Storage bytes through the Storage API and then calls **`auth.admin.deleteUser` LAST**. Storage ownership of retained objects is cleared, so the Admin API is not refused. |
| **Irreversibility** | The tombstone is never returned. `erased_at` is coarse. `updated_at` triggers are suspended, so a shared `now()` cannot re-link rows across tables. The job row forgets the subject id and paths at completion and keeps only aggregate counts + dates. |

## 4. The flow (server action, service role; owner-gated per occurrence)

```
0  request row: account_deletion, status 'approved' (existing review queue)   — precondition (blocker B0)
1  privacy_erasure_prepare_v2(user)  → job + dry-run counts + blockers + storage counts   (writes only the job row)
2  humans resolve blockers through product paths (end roster link, end engagement, transfer ownership, …)
3  server: auth.admin.updateUserById(user, { ban_duration }) + sign out all sessions   (no login during 4–7)
4  privacy_erasure_execute_v2(user, job)  → ONE transaction, returns storage_ops      state → storage_pending
5  server: Storage API remove()/move() for every op
6  privacy_erasure_storage_done_v2(job)  → verifies objects gone/moved, nothing owned by the user  → auth_pending
7  server: send the completion note to the address still on auth.users (what was erased / kept & why)
8  server: auth.admin.deleteUser(user)        ← LAST, through the Admin API
9  privacy_erasure_complete_v2(job)  → refuses while auth.users row exists; forgets subject id + paths → completed
10 request row → status 'closed' (it is itself RETAINED 3 y, detached, E4)
```

Inside `execute_v2` (order matters):

1. Lock the job and verify subject/state. If the DB part already ran, return the stored `storage_ops`
   (**idempotent replay**). Re-check blockers; if any exist → state `blocked`, nothing touched.
2. Suspend guard triggers **for this transaction only** (§8).
3. Decide what is kept before anything is removed: the retained journal set (confirmed / review-submitted /
   hour-linked, closed over `correction_of`/`superseded_by`); retained engagement contexts (those of
   retained entries, those referenced by confirmations the person gave, and all organization contexts, E3);
   retained customer_requests (the privacy request; organization demand; anything bookings, invitations,
   offers or handoffs hang off).
4. Build the Storage plan while the owning rows still exist (§6).
5. RETAIN-DETACHED steps: consent ledger (GUC detach, #2412 trigger), disclosure ledger, journal, work items,
   engagement contexts, requests, bookings (`readiness_snapshot` cleared), company engagements (`subject_key`
   re-minted), assets, absences (private reason cleared), performance reviews (`worker_input` cleared),
   usage cost events.
6. PSEUDONYMISE specials: ai_runs, audit_logs, conversations/messages, invitations (pending → revoked),
   e-mail-keyed rows, roster rows, other recipients' notifications, JSON id sweep over 31 columns, pilot
   analytics session purge, backfill row.
7. Generic: every registry column with mode `null` → `update … set col = null`.
8. Generic: registry DELETE columns whose FK does not cascade → explicit delete.
9. Delete the person's non-retained `customer_requests`, then `workers`, then `profiles`. Cascades remove
   the remaining DELETE-class rows. Any reference that was missed raises and **rolls everything back**.
10. Clear `storage.objects.owner/owner_id` on objects the person owns that are kept (e.g. an organization's
    evidence photo they uploaded).
11. Re-enable exactly the suspended triggers and assert that none is left disabled. Update the job.

On any error, the inner block rolls back to its savepoint, so all data changes and the trigger suspension
are undone. The job is marked `failed` with `sqlstate table= constraint=` (never values) and can be retried
after the fix (**resumable**; tested).

## 5. Notes per special step

5.1 **Journal (E1).** "Employer-confirmed" means a row in `journal_entry_confirmations`, a review
submission, or a `work_hour_allocations.journal_entry_id`. The original text of a retained entry is kept as
the evidence. Skills inferred from it (`journal_entry_skills`) are deleted. Photos are deleted (E5). The hash
chain columns (`hash_self/hash_prev`) are not recomputed: the stored hash no longer covers `worker_id`.
Verifiers must treat a NULL `worker_id` as "subject erased" (open risk R4).
5.2 **Engagement contexts.** `journal_entries.engagement_context_id` is RESTRICT. A retained entry
therefore forces its context to be retained (detached, `description`/`ended_note` cleared).
5.3 **customer_requests.** The privacy request row is kept for 3 y (E4): `profile_id` NULL, `notes` and
person-identifying payload keys dropped. Organization demand → pseudonymised. A personal demand that
nothing references → deleted.
5.4 **Invitations.** Pending ones the person sent → `revoked`, inviter NULL. Accepted ones survive, because
the invitee's acceptance proof hangs off them. Invitations addressed to the person: e-mail, name and personal
message cleared. E-mail-keyed staff invitations: the address is replaced by `erased-<random>@erased.invalid`
(NOT NULL column) and pending ones are cancelled. `waitlist`/`leads` rows with the address are deleted.
Public intake contact fields are cleared.
5.5 **Roster (`organization_people`).** The organization keeps the row, because its imported history
(`organization_evidence_records`, NO ACTION) hangs off it. The row is unlinked and renamed `Erased person`.
`normalized_name` becomes a random marker. `source_note`/`external_ref` are cleared. The evidence rows'
own text is the organization's record and is left as is (Q4).
5.6 **JSON sweep.** In 31 jsonb columns on surviving rows (event before/after states, metadata, payloads,
`timesheets.lines_snapshot`, evidence `source_fact/derived`, …), every string equal to the person's profile
or worker id is removed recursively (`privacy_erasure_scrub_jsonb`).

## 6. Storage (SQL lists, the server deletes)

SQL cannot delete Storage bytes. `execute_v2` returns `storage_ops = [{bucket, path, op, to?}]`:

| Bucket (prod objects 2026-10-15) | Path convention | Op |
|---|---|---|
| `profile-avatars` (25) | `<uid>/…` | delete |
| `journal-entry-photos` (16) | `<uid>/<entry>/<photo>/<file>` | delete (rows deleted too, also on retained entries) |
| `customer-request-attachments` (0) | `<uid>/…` | delete for deleted personal demand. For **retained organization demand: `move` to `erased/<random>.<ext>`**; the row's `storage_path` and `file_name` are rewritten in the same transaction |
| `conversation-attachments` (0) | `<conversation>/<uid>/…` | delete |
| `document-files` (0) | `worker/<workerId>/doc/…` | delete |
| `evidence-media` (bucket absent in prod) / any other | owner = user | not deleted (organization's object); `owner`/`owner_id` cleared |

`storage_done_v2` re-checks rather than trusting the server. It fails if any delete path still exists, if a
move target is missing, or if any object is still owned by the user. Only then can the auth user be deleted.

## 7. Schema changes in the migration (all additive or loosening; RED)

* 2 tables: `privacy_erasure_jobs` (RLS on, no policy; service_role SELECT) and `privacy_erasure_relations`
  (registry, 266 rows).
* Consent ledger: `erased_subject_id`, `erased_at` and the attached-xor-detached CHECK (as #2412); trigger
  function with the single GUC exception (as #2412).
* **99 `DROP NOT NULL`** on surviving-row link columns (list in the migration).
* **8 CHECK amendments**: workflow approver decided shape, on/offboarding item done shape, performance review
  manager-input stamp, organization claim decision-complete, counterparty revocation shape, document
  acknowledgement stamp pair, and a third "inviter erased" origin for invitations. Each is the production
  text minus the "actor id must be set" clause. Added NOT VALID + VALIDATE.
* 7 functions, all `SECURITY DEFINER` (except the two pure helpers), `set search_path = ''`, fully
  qualified names. EXECUTE is revoked from public/anon/authenticated and granted to `service_role` for
  prepare/execute/storage_done/complete only. Tested: anon=false, authenticated=false, service_role=true.
* `erase_user_account_v1` (the unmerged #2412 draft) is dropped if present.

Latent defects found on the way (they exist today, independent of v2):
`agency_client_connections.invited_by` and `agency_client_request_shares.shared_by` are `NOT NULL` +
`ON DELETE SET NULL`, so they always fail. `organization_facts.recorded_by` is SET NULL but the table's
append-only trigger refuses the update. `organization_people` pairs `linked_worker_id`/`linked_profile_id`
in a CHECK, but the two cascade independently. `organization_claims.decided_by` is SET NULL but a CHECK
requires it for verified claims. `journal_entries.engagement_context_id` is RESTRICT behind a CASCADE from
profiles. Every one of them makes today's manual "delete auth.users" fail.

## 8. Trigger suspension (why and how)

About 25 guard triggers would refuse the sanctioned changes: the append-only ledgers and event logs,
fill-once and immutability guards, `timesheets_frozen`, `ai_runs_enforce_retention_classes`, and others.
Rewriting each guard with a GUC exception would touch about 20 functions that are reviewed elsewhere.
Instead `execute_v2` runs `ALTER TABLE … DISABLE TRIGGER` on the exact list from
`privacy_erasure_guard_triggers_v2()`. That list is every enabled, non-internal UPDATE/DELETE trigger on a
registry table or on any table reachable from one by a cascade/set-null chain. Two are never suspended: the
consent ledger (opened only by its GUC detach) and `protect_last_owner` (a BLOCK, never bypassed).

* It is transactional. Other sessions never see the triggers disabled, because the SHARE ROW EXCLUSIVE lock
  is held until commit and the triggers are re-enabled before commit. On error the savepoint restores them.
  The function asserts that none is left disabled. Tested on success and on failure.
* `set_updated_at`-style triggers are suspended on purpose: otherwise every touched row would carry the same
  `updated_at = now()`, and that fingerprint would re-link the erased person's rows across tables.
* Cost: write locks on roughly 60–100 tables for the length of one erasure (expected under a second for
  today's volumes). `lock_timeout = 5s`. A timeout fails the job cleanly and it can be retried.

## 9. Audit record that does not re-identify

After `complete_v2` the job row holds: job id, `request_id` (pointing at the retained, detached request
row), `state = completed`, aggregate counts per table (`report.executed`), `created_on`/`executed_on`/
`completed_on` (dates), attempts. It holds **no** subject id, **no** tombstone, **no** object paths and **no**
e-mail. Tested: no column of a completed job contains the subject id. Error text is limited to sqlstate,
table and constraint names.

## 10. Open risks / owner decisions

* **R1 Legal basis**: every RETAIN-DETACHED class (24 FK columns + disclosure/consent ledgers) waits on
  LAWYER_QUESTIONS Q1–Q4. If the lawyer says a class must be erased, its registry row changes from
  RETAIN to DELETE and execute needs no code change. Exception: journal/engagement retention is special-cased.
* **R2 App null-safety**: 99 columns become nullable. Regenerated types will force the UI to handle "erased
  participant" (author NULL, empty message body, `Erased person`). Typecheck + UI pass required before merge.
* **R3 English placeholder**: `Erased person` and empty message bodies need i18n rendering in the app.
* **R4 Hash chains**: `journal_entries` / `engagement_contexts` / evidence records keep their stored hashes
  after the link is NULLed. A chain verifier must treat that change as sanctioned.
* **R5 Lock footprint**: suspending triggers takes write locks on ~60–100 tables per erasure. Acceptable for a
  reviewed, monthly-scale operation; never run it in a loop.
* **R6 Unclaimed roster rows** with the same person's name but no link cannot be found by id. Name matching is
  deliberately not done (it would mis-erase someone else). If the person points them out, handle them
  manually.
* **R7 Backups/PITR** keep pre-erasure data for the provider window (Q6). The completion note must say so.
* **R8 Move of organization attachments**: the read policy on `customer-request-attachments` keys on the
  first path segment. An organization's access to a moved `erased/…` object must be re-checked (server
  signed URLs vs RLS) before enabling this path. Production has 0 objects today.
* **R9 Stub-schema test only**: the local test used a stub of 187 tables (+3 helper tables) with the production FK/NOT
  NULL/CHECK shape, not the full production DDL (RLS, all triggers, all functions). The next gate is a
  Supabase branch or a restored copy (TEST_PLAN §4).

## 11. Local test (done, PG16, throwaway cluster)

What was tested: migration applied cleanly. Prepare: dry run, plus a blocked case (last owner). Execute on
a scenario seeding 39 relations: **44 post-conditions asserted, all passed**. Also tested: idempotent replay;
storage_done refusing, then passing after the simulated Storage work; complete refusing while the auth user
exists, then forgetting the subject; drift guard on a new FK; failure path (forced CHECK violation leads to
`failed`, nothing changed, no trigger left disabled, retry succeeds); grants; rollback refused after
execution and clean before any execution. Output: `test/test_output.txt`.

## Appendix A: every FK onto a person (production 2026-10-15)

"rows" is the number of rows whose column is non-NULL **for all users** (catalog count, no values read).
It shows impact, not one person's data.

| # | table.column | → | ON DELETE today | NOT NULL today | rows w/ value (prod, all users) | class | mechanism | why |
|---|---|---|---|---|---|---|---|---|
| 1 | `account_classifications.decided_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | platform's own classification decision; actor only |
| 2 | `account_classifications.profile_id` | profiles | CASCADE | yes | 69 | **DELETE** | deleted by cascade inside execute_v2 | classification of the erased account itself |
| 3 | `agencies.profile_id` | profiles | SET NULL |  | 3 | **PSEUDONYMISE** | link set NULL | organization record outlives the person (registry: organization record) |
| 4 | `agency_candidate_offers.created_by` | profiles | SET NULL |  | 14 | **PSEUDONYMISE** | link set NULL | actor on an agency's offer |
| 5 | `agency_candidate_offers.decided_by` | profiles | SET NULL |  | 14 | **PSEUDONYMISE** | link set NULL | actor |
| 6 | `agency_candidate_offers.withdrawn_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 7 | `agency_candidate_offers.worker_id` | workers | CASCADE | yes | 14 | **DELETE** | deleted by cascade inside execute_v2 | offer of THIS person to a client; pre-engagement, no legal hold |
| 8 | `agency_client_connections.accepted_by` | profiles | SET NULL |  | 3 | **PSEUDONYMISE** | link set NULL | actor |
| 9 | `agency_client_connections.invited_by` | profiles | SET NULL | yes | 4 | **PSEUDONYMISE** | link set NULL | actor; NOT NULL today although ON DELETE SET NULL (latent blocker) -> drop NOT NULL |
| 10 | `agency_client_connections.revoked_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 11 | `agency_client_request_shares.revoked_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 12 | `agency_client_request_shares.shared_by` | profiles | SET NULL | yes | 4 | **PSEUDONYMISE** | link set NULL | actor; NOT NULL + SET NULL (latent blocker) -> drop NOT NULL |
| 13 | `agency_clients.created_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 14 | `agency_worker_invitations.inviter_profile_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor; the invitee's e-mail is the invitee's data, untouched |
| 15 | `agency_workers.worker_id` | workers | CASCADE | yes | 0 | **BLOCK** | deleted by cascade inside execute_v2 | BLOCK while status='active' (end via end_roster_link_v1); then DELETE by cascade |
| 16 | `agreement_amendments.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: authored for the organization; CASCADE would delete it |
| 17 | `agreement_events.actor_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | append-only actor column |
| 18 | `agreements.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: organization's agreement, CASCADE would delete it |
| 19 | `agreements.responsible_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 20 | `agreements.worker_id` | workers | SET NULL |  | 0 | **RETAIN** | link set NULL | employment-related agreement with the person: contract record (Package A Decision 1 horizon) |
| 21 | `ai_runs.profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | dedicated step (see §5) | null link AND scrub output_excerpt + request_context (G3) |
| 22 | `asset_assignments.issued_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 23 | `asset_assignments.worker_id` | workers | SET NULL |  | 0 | **RETAIN** | dedicated step (see §5) | equipment issued to the person = employer accountability; rows with project_id null are DELETED (CHECK project_id or worker_id) |
| 24 | `assets.created_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 25 | `assistant_conversations.owner_id` | profiles | CASCADE | yes | 16 | **DELETE** | deleted by cascade inside execute_v2 | own assistant transcript |
| 26 | `audit_logs.actor_id` | profiles | SET NULL |  | 953 | **PSEUDONYMISE** | dedicated step (see §5) | null link AND redact payload keys that hold the subject id / name (G3) |
| 27 | `billing_checkout_operations.owner_id` | profiles | CASCADE | yes | 3 | **RETAIN** | link set NULL | payment-provider trail; statutory accounting (Package A Decision 2) |
| 28 | `billing_customers.owner_id` | profiles | CASCADE | yes | 3 | **RETAIN** | link set NULL | provider customer id; statutory accounting |
| 29 | `billing_subscriptions.owner_id` | profiles | CASCADE | yes | 0 | **BLOCK** | link set NULL | BLOCK while status in (trialing, active, past_due, unpaid, incomplete); else RETAIN-DETACHED |
| 30 | `booking_request_events.actor_id` | profiles | NO ACTION | yes | 27 | **PSEUDONYMISE** | link set NULL | actor on a booking lifecycle |
| 31 | `booking_requests.owner_id` | profiles | CASCADE | yes | 7 | **PSEUDONYMISE** | link set NULL | G2: employer-side booking record created by the person as staff |
| 32 | `booking_requests.worker_id` | workers | CASCADE | yes | 7 | **BLOCK** | dedicated step (see §5) | BLOCK while status='proposed' or accepted with an active engagement; else RETAIN-DETACHED (E3), readiness_snapshot scrubbed |
| 33 | `booking_requests_seen.user_id` | profiles | CASCADE | yes | 10 | **DELETE** | deleted by cascade inside execute_v2 | own read marker |
| 34 | `business_trip_events.actor_profile_id` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 35 | `business_trips.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: trip record created for someone else |
| 36 | `business_trips.profile_id` | profiles | CASCADE | yes | 0 | **RETAIN** | link set NULL | employer travel / per-diem record (tax) - legal basis to confirm |
| 37 | `candidate_drafts.linked_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | link to the person from someone else's draft |
| 38 | `candidate_drafts.owner_id` | profiles | CASCADE | yes | 2 | **DELETE** | deleted by cascade inside execute_v2 | the person's own private recruiting drafts |
| 39 | `candidate_skills.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 40 | `commercial_handoffs.worker_id` | workers | CASCADE | yes | 2 | **DELETE** | deleted by cascade inside execute_v2 | operational handoff; the consent proof itself lives in privacy_consent_events |
| 41 | `commitment_override_receipts.decided_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor (trigger already allows this exact change) |
| 42 | `commitment_override_receipts.worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | receipt about the person's own calendar |
| 43 | `companies.profile_id` | profiles | SET NULL |  | 25 | **PSEUDONYMISE** | link set NULL | organization record outlives the person |
| 44 | `company_demand_locations.owner_id` | profiles | CASCADE | yes | 2 | **PSEUDONYMISE** | link set NULL | G2: location of an organization's demand |
| 45 | `company_memberships.invited_by` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | link set NULL | actor |
| 46 | `company_memberships.profile_id` | profiles | CASCADE | yes | 53 | **BLOCK** | deleted by cascade inside execute_v2 | BLOCK when the person is the LAST active owner of an organization; else DELETE |
| 47 | `company_worker_engagements.created_by` | profiles | SET NULL |  | 3 | **PSEUDONYMISE** | link set NULL | actor |
| 48 | `company_worker_engagements.ended_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 49 | `company_worker_engagements.worker_id` | workers | SET NULL |  | 3 | **RETAIN** | dedicated step (see §5) | company-side engagement lineage (E3); subject_key RE-MINTED (G4) |
| 50 | `company_worker_invitations.inviter_profile_id` | profiles | NO ACTION | yes | 12 | **PSEUDONYMISE** | link set NULL | actor |
| 51 | `company_workers.worker_id` | workers | CASCADE | yes | 10 | **BLOCK** | deleted by cascade inside execute_v2 | BLOCK while status='active' (end_roster_link_v1); then DELETE by cascade |
| 52 | `competency_recognitions.assessed_by` | profiles | RESTRICT | yes | 1 | **PSEUDONYMISE** | link set NULL | assessor actor (RESTRICT today) |
| 53 | `competency_recognitions.subject_profile_id` | profiles | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | recognition about the person; the assessor's own trail is audit_logs |
| 54 | `confirmation_spends.spent_by` | profiles | CASCADE | yes | 116 | **DELETE** | deleted by cascade inside execute_v2 | single-use token digests |
| 55 | `consented_login_location_signals.profile_id` | profiles | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | own location signal |
| 56 | `consents.profile_id` | profiles | CASCADE |  | 0 | **DELETE** | deleted by cascade inside execute_v2 | legacy consent flags (0 rows); proof lives in privacy_consent_events |
| 57 | `contact_disclosure_request_events.actor_profile_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 58 | `contact_disclosure_requests.owner_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | employer-side request created by the person as staff |
| 59 | `contact_disclosure_requests.worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | request to reveal THIS person's contact; disclosure proof is personal_data_disclosures |
| 60 | `contracts.owner_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: organization's contract |
| 61 | `conversation_message_attachments.uploader_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | files the person attached; storage objects deleted (E5/E6) |
| 62 | `conversation_messages.author_id` | profiles | NO ACTION | yes | 65 | **PSEUDONYMISE** | dedicated step (see §5) | G6: author null + body/translated_text replaced by a fixed marker in threads with other participants; DELETE in solo threads |
| 63 | `conversation_participants.added_by` | profiles | NO ACTION |  | 19 | **PSEUDONYMISE** | link set NULL | actor |
| 64 | `conversation_participants.profile_id` | profiles | CASCADE | yes | 19 | **DELETE** | deleted by cascade inside execute_v2 | own membership of a thread |
| 65 | `conversation_participants.revoked_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 66 | `conversations.created_by` | profiles | NO ACTION | yes | 10 | **PSEUDONYMISE** | dedicated step (see §5) | thread survives for the other participants; DELETE when no other participant ever existed |
| 67 | `customer_request_attachments.profile_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | dedicated step (see §5) | org demand: row kept, object MOVED to an erased/ prefix; personal demand: DELETE + object deleted |
| 68 | `customer_requests.drafted_by` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | link set NULL | actor (connection drafting) |
| 69 | `customer_requests.profile_id` | profiles | CASCADE | yes | 33 | **RETAIN** | dedicated step (see §5) | privacy request row RETAIN 3 y (E4); org demand PSEUDONYMISE; personal demand without bookings DELETE |
| 70 | `customers.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | private-customer record of the person (0 rows) |
| 71 | `decision_document_links.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 72 | `decision_task_links.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 73 | `defect_corrections.reviewer_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 74 | `defects.assignee_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 75 | `defects.reporter_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 76 | `demand_interest_signals.worker_id` | workers | CASCADE | yes | 14 | **DELETE** | deleted by cascade inside execute_v2 | own interest signal |
| 77 | `demand_shortlist.owner_id` | profiles | CASCADE | yes | 4 | **PSEUDONYMISE** | link set NULL | G2: employer's shortlist the person kept as staff |
| 78 | `demand_shortlist.worker_id` | workers | CASCADE | yes | 4 | **DELETE** | deleted by cascade inside execute_v2 | an employer's judgement about the erased person |
| 79 | `document_acknowledgements.acknowledged_by` | profiles | NO ACTION |  | 0 | **RETAIN** | link set NULL | employer compliance proof (safety instruction acknowledged) - legal basis to confirm |
| 80 | `document_acknowledgements.assigned_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 81 | `document_acknowledgements.assignee_profile_id` | profiles | CASCADE | yes | 0 | **RETAIN** | link set NULL | see acknowledged_by |
| 82 | `document_files.uploaded_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor on an organization document file |
| 83 | `education_cohort_members.added_by` | profiles | SET NULL |  | 4 | **PSEUDONYMISE** | link set NULL | actor |
| 84 | `education_cohort_members.profile_id` | profiles | CASCADE | yes | 4 | **DELETE** | deleted by cascade inside execute_v2 | learner membership (institution keeps its own official register) |
| 85 | `education_cohorts.created_by` | profiles | SET NULL |  | 6 | **PSEUDONYMISE** | link set NULL | actor |
| 86 | `education_programs.created_by` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | link set NULL | actor |
| 87 | `email_verification_requests_v1.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | security state |
| 88 | `email_verifications_v1.profile_id` | profiles | CASCADE | yes | 70 | **DELETE** | deleted by cascade inside execute_v2 | e-mail proof; no longer needed once the account is gone |
| 89 | `employee_requests.requester_profile_id` | profiles | CASCADE | yes | 0 | **RETAIN** | link set NULL | HR request held by the employer - controller question (Q4) |
| 90 | `engagement_contexts.profile_id` | profiles | CASCADE | yes | 226 | **BLOCK** | dedicated step (see §5) | BLOCK while status='active' with an organization; RETAIN-DETACHED when retained journal evidence or confirmations point at it; else DELETE |
| 91 | `engagement_lifecycle_events.actor_profile_id` | profiles | NO ACTION |  | 11 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 92 | `evidence_import_events.actor_profile_id` | profiles | SET NULL |  | 261 | **PSEUDONYMISE** | link set NULL | actor |
| 93 | `evidence_import_sessions.created_by` | profiles | SET NULL |  | 9 | **PSEUDONYMISE** | link set NULL | actor |
| 94 | `experience_records.author_profile_id` | profiles | CASCADE | yes | 2 | **DELETE** | deleted by cascade inside execute_v2 | the person's own reviews |
| 95 | `experience_records.moderated_by` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | link set NULL | actor |
| 96 | `experience_records.subject_profile_id` | profiles | CASCADE |  | 1 | **DELETE** | deleted by cascade inside execute_v2 | reviews about the person |
| 97 | `experience_responses.author_profile_id` | profiles | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 98 | `experience_responses.moderated_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 99 | `finance_records.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: organization's finance record (accounting) |
| 100 | `first_party_supply_declarations.profile_id` | profiles | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | own declaration |
| 101 | `follow_up_tasks.created_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 102 | `follow_up_tasks.subject_profile_id` | profiles | CASCADE |  | 0 | **DELETE** | deleted by cascade inside execute_v2 | CRM note about the person |
| 103 | `historical_consolidation_decisions.decided_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 104 | `historical_consolidation_decisions.reverted_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 105 | `invitation_acceptances.profile_id` | profiles | CASCADE | yes | 46 | **RETAIN** | link set NULL | record that the person accepted, with notice version (Art 7(1)-type proof) |
| 106 | `invitations.accepted_by_profile_id` | profiles | NO ACTION |  | 47 | **PSEUDONYMISE** | dedicated step (see §5) | null + scrub invited_email / invited_name / personal_message of invitations addressed to the person |
| 107 | `invitations.inviter_profile_id` | profiles | CASCADE |  | 47 | **PSEUDONYMISE** | dedicated step (see §5) | G2: invitations sent to others survive; pending ones become 'revoked'; CHECK amended |
| 108 | `journal_entries.worker_id` | workers | CASCADE | yes | 155 | **RETAIN** | dedicated step (see §5) | employer-confirmed entries RETAIN-DETACHED (E1); unconfirmed own entries DELETE |
| 109 | `journal_entry_confirmations.confirmer_id` | profiles | NO ACTION | yes | 42 | **PSEUDONYMISE** | link set NULL | confirmations the person GAVE keep evidential value (E1) |
| 110 | `journal_entry_photos.profile_id` | profiles | CASCADE | yes | 16 | **DELETE** | deleted by cascade inside execute_v2 | own photos; objects deleted via Storage API (E5) |
| 111 | `journal_entry_review_submissions.submitted_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 112 | `journal_entry_review_submissions.worker_id` | workers | NO ACTION | yes | 0 | **RETAIN** | link set NULL | review submission of retained evidence (append-only) |
| 113 | `journal_entry_skills.worker_id` | workers | CASCADE | yes | 222 | **DELETE** | deleted by cascade inside execute_v2 | derived skill inference about the person (even on retained entries) |
| 114 | `journal_entry_tasks.linked_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 115 | `journal_entry_tasks.unlinked_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 116 | `journal_entry_work_items.worker_id` | workers | CASCADE | yes | 0 | **RETAIN** | dedicated step (see §5) | work quantities of RETAINED entries kept detached; others deleted with their entry |
| 117 | `language_feedback.user_id` | profiles | NO ACTION |  | 0 | **DELETE** | explicit DELETE | own feedback text (NO ACTION today) |
| 118 | `leads.assigned_to` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 119 | `learning_policy_settings.disabled_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 120 | `learning_policy_settings.enabled_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 121 | `learning_review_queue.reviewed_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 122 | `learning_review_queue.subject_worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | inference about the person |
| 123 | `learning_signals.actor_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor (G3: rows about OTHER subjects; nothing of the erased person left but the link) |
| 124 | `learning_signals.subject_worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | inference about the person |
| 125 | `leave_balance_policies.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 126 | `lmc_accounts.profile_id` | profiles | RESTRICT |  | 0 | **BLOCK** | blocker only | immutable credit ledger (RESTRICT + trigger): any row = manual resolution |
| 127 | `lmc_settings.updated_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 128 | `lmc_transactions.actor_profile_id` | profiles | RESTRICT |  | 0 | **BLOCK** | blocker only | immutable credit ledger: manual resolution |
| 129 | `management_decision_events.actor_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 130 | `management_decisions.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 131 | `management_decisions.responsible_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 132 | `market_intelligence_insight_queries.profile_id` | profiles | SET NULL |  | 20 | **DELETE** | explicit DELETE | own query log (SET NULL today would keep params) |
| 133 | `market_rate_averages.entered_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 134 | `marketplace_listings.owner_id` | profiles | CASCADE | yes | 13 | **DELETE** | deleted by cascade inside execute_v2 | own listings |
| 135 | `match_actions.actor_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 136 | `matches.worker_id` | workers | CASCADE |  | 0 | **DELETE** | deleted by cascade inside execute_v2 | match about the person |
| 137 | `notification_events.recipient_profile_id` | profiles | CASCADE | yes | 226 | **DELETE** | dedicated step (see §5) | own notifications deleted; OTHER recipients' events about the person: entity_id re-minted + metadata title dropped (G4) |
| 138 | `notification_preferences.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | own settings |
| 139 | `offboarding_run_items.completed_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 140 | `offboarding_runs.started_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 141 | `onboarding_run_items.completed_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 142 | `onboarding_run_items.responsible_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 143 | `onboarding_runs.started_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 144 | `onboarding_templates.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 145 | `org_document_events.actor_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 146 | `org_documents.created_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 147 | `org_documents.responsible_profile_id` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 148 | `org_documents.worker_id` | workers | NO ACTION |  | 0 | **RETAIN** | link set NULL | employer document about the person (e.g. contract copy) - controller question (Q4) |
| 149 | `organization_claims.claimant_profile_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | organization verification evidence |
| 150 | `organization_claims.decided_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 151 | `organization_evidence_events.actor_profile_id` | profiles | SET NULL |  | 158 | **PSEUDONYMISE** | link set NULL | actor |
| 152 | `organization_evidence_media.imported_by_profile_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 153 | `organization_evidence_parties.created_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 154 | `organization_evidence_records.imported_by_profile_id` | profiles | SET NULL |  | 2944 | **PSEUDONYMISE** | link set NULL | actor |
| 155 | `organization_evidence_records.supplied_by_profile_id` | profiles | SET NULL |  | 2944 | **PSEUDONYMISE** | link set NULL | actor |
| 156 | `organization_facts.recorded_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only; SET NULL is blocked by its trigger today) |
| 157 | `organization_history_periods.created_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 158 | `organization_identifiers.created_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 159 | `organization_people.created_by` | profiles | SET NULL |  | 43 | **PSEUDONYMISE** | link set NULL | actor |
| 160 | `organization_people.linked_by` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | link set NULL | actor |
| 161 | `organization_people.linked_profile_id` | profiles | SET NULL |  | 2 | **PSEUDONYMISE** | dedicated step (see §5) | roster row unlinked AND display_name/normalized_name/source_note/external_ref scrubbed (G3); evidence rows keep their org text |
| 162 | `organization_people.linked_worker_id` | workers | SET NULL |  | 2 | **PSEUDONYMISE** | dedicated step (see §5) | together with linked_profile_id (CHECK pairs them) |
| 163 | `organizations.owner_profile_id` | profiles | SET NULL |  | 50 | **PSEUDONYMISE** | link set NULL | organization outlives the person (last-owner case is a BLOCK on memberships) |
| 164 | `performance_review_events.actor_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 165 | `performance_reviews.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 166 | `performance_reviews.manager_input_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 167 | `performance_reviews.reviewer_profile_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: reviews the person wrote about others |
| 168 | `performance_reviews.subject_profile_id` | profiles | CASCADE | yes | 0 | **RETAIN** | dedicated step (see §5) | employer HR record about the person; worker_input scrubbed - legal basis to confirm |
| 169 | `personal_data_disclosures.disclosed_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 170 | `personal_data_disclosures.worker_user_id` | profiles | CASCADE | yes | 0 | **RETAIN** | dedicated step (see §5) | disclosure ledger kept 6 y, identity detached (G5) |
| 171 | `pilot_drafts.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | legacy drafts |
| 172 | `pilot_events.profile_id` | profiles | NO ACTION |  | 9891 | **DELETE** | explicit DELETE | analytics events of the person (E8; NO ACTION today) |
| 173 | `pilot_outcomes.noted_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 174 | `pilot_outcomes.participant_profile_id` | profiles | NO ACTION |  | 0 | **DELETE** | explicit DELETE | outcome note about the person |
| 175 | `pilot_participants.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | own participation |
| 176 | `pilots.created_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 177 | `platform_capability_grants.granted_by` | profiles | SET NULL |  | 1 | **PSEUDONYMISE** | link set NULL | actor |
| 178 | `platform_capability_grants.profile_id` | profiles | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | grant to the erased account |
| 179 | `platform_capability_grants.revoked_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 180 | `preferred_locations.profile_id` | profiles | CASCADE | yes | 2 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 181 | `privacy_consent_events.user_id` | profiles | CASCADE | yes | 40 | **RETAIN** | dedicated step (see §5) | #2412 tombstone detach (random per-erasure id, never returned); erased_at coarse to the month |
| 182 | `procurement_events.actor_profile_id` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 183 | `procurement_inquiries.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 184 | `procurement_inquiries.requester_profile_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 185 | `procurement_offers.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 186 | `productivity_units.created_by_profile_id` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 187 | `profile_roles.profile_id` | profiles | CASCADE | yes | 117 | **DELETE** | deleted by cascade inside execute_v2 | own roles |
| 188 | `profile_skill_claims.profile_id` | profiles | CASCADE | yes | 44 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 189 | `profiles.id` | auth.users | CASCADE | yes | 113 | **DELETE** | dedicated step (see §5) | PII scrubbed then row deleted in SQL; auth.users deleted LAST by the server via auth.admin.deleteUser |
| 190 | `project_budgets.created_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 191 | `project_handover_entries.created_by` | profiles | NO ACTION | yes | 1 | **PSEUDONYMISE** | link set NULL | actor |
| 192 | `project_members.profile_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | membership of the erased person |
| 193 | `project_stages.created_by` | profiles | NO ACTION | yes | 1 | **PSEUDONYMISE** | link set NULL | actor |
| 194 | `project_worker_assignments.worker_id` | workers | CASCADE | yes | 8 | **DELETE** | deleted by cascade inside execute_v2 | staffing link of the person |
| 195 | `project_worker_operational_statuses.updated_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 196 | `project_worker_operational_statuses.worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | status about the person |
| 197 | `project_worker_readiness_items.updated_by` | profiles | NO ACTION | yes | 14 | **PSEUDONYMISE** | link set NULL | actor |
| 198 | `project_worker_readiness_items.worker_id` | workers | CASCADE | yes | 14 | **DELETE** | deleted by cascade inside execute_v2 | readiness about the person |
| 199 | `projects.responsible_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 200 | `proposals.owner_id` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2: organization's commercial proposal |
| 201 | `review_cycles.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 202 | `review_evidence_links.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 203 | `service_offering_requests.buyer_id` | profiles | CASCADE | yes | 13 | **DELETE** | deleted by cascade inside execute_v2 | request the person sent (both parties' copy goes; flagged Q6) |
| 204 | `service_offering_requests.provider_id` | profiles | CASCADE | yes | 13 | **DELETE** | deleted by cascade inside execute_v2 | requests to the person's own offering |
| 205 | `service_offering_requests_seen.user_id` | profiles | CASCADE | yes | 9 | **DELETE** | deleted by cascade inside execute_v2 | own read marker |
| 206 | `service_offerings.provider_id` | profiles | CASCADE | yes | 14 | **DELETE** | deleted by cascade inside execute_v2 | own offering |
| 207 | `skill_candidate_clarifications.profile_id` | profiles | CASCADE | yes | 27 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 208 | `subscriptions.profile_id` | profiles | CASCADE |  | 0 | **BLOCK** | link set NULL | legacy billing: BLOCK while status in (trial, active, past_due); else RETAIN-DETACHED |
| 209 | `task_dependencies.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 210 | `team_assignments.assigned_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 211 | `team_assignments.ended_by` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 212 | `team_demand_offer_terms.decided_by` | profiles | SET NULL |  | 9 | **PSEUDONYMISE** | link set NULL | actor |
| 213 | `team_demand_offer_terms.proposed_by` | profiles | SET NULL |  | 18 | **PSEUDONYMISE** | link set NULL | actor |
| 214 | `team_demand_offers.offered_by` | profiles | SET NULL |  | 10 | **PSEUDONYMISE** | link set NULL | actor |
| 215 | `team_demand_offers.responded_by` | profiles | SET NULL |  | 9 | **PSEUDONYMISE** | link set NULL | actor |
| 216 | `team_enquiries.owner_id` | profiles | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | own enquiry message |
| 217 | `team_enquiry_events.actor_profile_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 218 | `timesheet_events.actor_profile_id` | profiles | NO ACTION |  | 6 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 219 | `timesheets.created_by` | profiles | CASCADE | yes | 2 | **PSEUDONYMISE** | link set NULL | G2: timesheets the person created for others |
| 220 | `timesheets.worker_id` | workers | CASCADE | yes | 2 | **BLOCK** | link set NULL | BLOCK while status='submitted' (undecided payroll); else RETAIN-DETACHED (payroll evidence) |
| 221 | `training_assignment_events.actor_id` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 222 | `training_assignments.assigned_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 223 | `training_assignments.assignee_profile_id` | profiles | CASCADE | yes | 0 | **RETAIN** | link set NULL | employer training/safety record - legal basis to confirm |
| 224 | `training_programs.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 225 | `training_skill_links.created_by` | profiles | CASCADE | yes | 0 | **PSEUDONYMISE** | link set NULL | G2 |
| 226 | `usage_cost_events.profile_id` | profiles | SET NULL |  | 0 | **RETAIN** | dedicated step (see §5) | cost ledger kept; session_id, request_context, personal workspace_id scrubbed (G3) |
| 227 | `work_counterparty_links.established_by` | profiles | NO ACTION | yes | 0 | **PSEUDONYMISE** | link set NULL | actor (append-only) |
| 228 | `work_counterparty_links.revoked_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 229 | `work_counterparty_links.worker_id` | workers | NO ACTION | yes | 0 | **RETAIN** | link set NULL | who the work counterparty was for retained evidence (append-only) |
| 230 | `work_hour_allocations.entered_by` | profiles | RESTRICT | yes | 5 | **PSEUDONYMISE** | link set NULL | actor (RESTRICT today) |
| 231 | `work_hour_allocations.worker_id` | workers | RESTRICT | yes | 5 | **RETAIN** | link set NULL | hours = payroll / working-time evidence (RESTRICT today) |
| 232 | `work_objects.created_by` | profiles | CASCADE | yes | 230 | **PSEUDONYMISE** | link set NULL | G2: 230 organization work objects would cascade away |
| 233 | `work_objects.responsible_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 234 | `work_plan_entries.cancelled_by` | profiles | NO ACTION |  | 10 | **PSEUDONYMISE** | link set NULL | actor |
| 235 | `work_plan_entries.created_by` | profiles | NO ACTION | yes | 10 | **PSEUDONYMISE** | link set NULL | actor |
| 236 | `work_plan_entries.worker_id` | workers | CASCADE | yes | 10 | **DELETE** | deleted by cascade inside execute_v2 | the person's own plan |
| 237 | `work_task_events.actor_profile_id` | profiles | SET NULL |  | 4 | **PSEUDONYMISE** | dedicated step (see §5) | actor null + assignee id scrubbed from before/after_state |
| 238 | `work_tasks.assignee_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 239 | `work_tasks.created_by` | profiles | CASCADE | yes | 3 | **PSEUDONYMISE** | link set NULL | G2 |
| 240 | `worker_absences.requested_by` | profiles | NO ACTION | yes | 10 | **PSEUDONYMISE** | link set NULL | actor |
| 241 | `worker_absences.reviewed_by` | profiles | NO ACTION |  | 10 | **PSEUDONYMISE** | link set NULL | actor |
| 242 | `worker_absences.worker_id` | workers | CASCADE | yes | 10 | **RETAIN** | dedicated step (see §5) | absence fact = working-time record; private reason (note) scrubbed |
| 243 | `worker_achievements.profile_id` | profiles | CASCADE | yes | 27 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 244 | `worker_document_events.actor_id` | profiles | NO ACTION | yes | 2 | **PSEUDONYMISE** | link set NULL | actor |
| 245 | `worker_documents.updated_by` | profiles | NO ACTION | yes | 1 | **PSEUDONYMISE** | link set NULL | actor |
| 246 | `worker_documents.verified_by` | profiles | NO ACTION |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 247 | `worker_documents.worker_id` | workers | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | own documents + files (E5); employer copy duty = Q4 |
| 248 | `worker_education.profile_id` | profiles | CASCADE | yes | 31 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 249 | `worker_external_profiles.worker_id` | workers | CASCADE | yes | 1 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 250 | `worker_languages.worker_id` | workers | CASCADE | yes | 32 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 251 | `worker_opportunity_seen.profile_id` | profiles | CASCADE | yes | 71 | **DELETE** | deleted by cascade inside execute_v2 | own read marker |
| 252 | `worker_professions.worker_id` | workers | CASCADE | yes | 159 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 253 | `worker_saved_opportunities.worker_id` | workers | CASCADE | yes | 3 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 254 | `worker_saved_searches.worker_id` | workers | CASCADE | yes | 0 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 255 | `worker_skills.verified_by` | profiles | NO ACTION |  | 6 | **PSEUDONYMISE** | link set NULL | actor |
| 256 | `worker_skills.worker_id` | workers | CASCADE |  | 166 | **DELETE** | deleted by cascade inside execute_v2 | own content |
| 257 | `workers.profile_id` | profiles | CASCADE |  | 112 | **DELETE** | dedicated step (see §5) | deleted in SQL after retained children are detached |
| 258 | `workflow_definition_versions.created_by` | profiles | CASCADE | yes | 24 | **PSEUDONYMISE** | link set NULL | G2 |
| 259 | `workflow_definitions.created_by` | profiles | CASCADE | yes | 24 | **PSEUDONYMISE** | link set NULL | G2 |
| 260 | `workflow_instance_approvers.approver_profile_id` | profiles | CASCADE | yes | 1 | **PSEUDONYMISE** | link set NULL | approver slot on someone else's workflow |
| 261 | `workflow_instance_approvers.decided_by` | profiles | NO ACTION |  | 1 | **PSEUDONYMISE** | link set NULL | actor; CHECK amended |
| 262 | `workflow_instance_approvers.delegated_to_profile_id` | profiles | SET NULL |  | 0 | **PSEUDONYMISE** | link set NULL | actor |
| 263 | `workflow_instances.requester_profile_id` | profiles | CASCADE | yes | 1 | **RETAIN** | link set NULL | HR workflow record (e.g. leave) with append-only transitions - legal basis to confirm |
| 264 | `workflow_transitions.actor_profile_id` | profiles | NO ACTION |  | 4 | **PSEUDONYMISE** | link set NULL | actor (append-only) |

## Appendix B: references without a foreign key

| Where | Kind | Class | Step |
|---|---|---|---|
| `company_worker_engagements.subject_key` | per-row random uuid | PSEUDONYMISE | re-minted |
| `worker_display_name_backfill_20260805.profile_id` (22 rows) | migration artifact with names | DELETE | explicit delete |
| `invitations.invited_email/invited_name/personal_message` | e-mail keyed | PSEUDONYMISE | cleared; pending → revoked |
| `agency_worker_invitations`, `company_worker_invitations`, `agency_client_connections` `.invited_email` | e-mail keyed, NOT NULL | PSEUDONYMISE | `erased-<random>@erased.invalid`; pending → cancelled/revoked |
| `waitlist.email`, `leads.email` | e-mail keyed | DELETE | explicit delete |
| `company_need_public_intakes.contact_*` | e-mail keyed | PSEUDONYMISE | contact fields cleared |
| `notification_events.entity_id/metadata.title` of other recipients | id in payload | PSEUDONYMISE | random entity id, title dropped |
| `audit_logs.entity_id/payload` | id/name in payload | PSEUDONYMISE | entity NULL, recursive id scrub, name keys dropped |
| `pilot_events.session_id` | device session | DELETE | whole session purged |
| 31 jsonb columns (§5.6) | ids in JSON | PSEUDONYMISE | recursive scrub |
| `storage.objects.owner/owner_id` | ownership | PSEUDONYMISE | cleared on kept objects |
| `auth.*` (identities, sessions, mfa, one_time_tokens, oauth, webauthn, scim) | auth internals | DELETE | `auth.admin.deleteUser` |
