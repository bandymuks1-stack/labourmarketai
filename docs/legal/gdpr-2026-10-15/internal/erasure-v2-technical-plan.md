# GDPR erasure v2 — technical plan, tests and remaining dependencies

> Status: DRAFT 2026-10-15 · Requires lawyer review · Owner gate: the migration is NOT applied to production.
> Sources: audit 01 (inventory, 66 FKs), the production read-backs listed below, PR #2412 (superseded), migration `20261015200000_privacy_erasure_executor_v2.sql`.
>
> **Santrauka (LT).** #2412 nebus taikomas: jis atrakintų tik 29 iš 81 profilio, kurių ištrinti šiandien neįmanoma. v2 vykdyklė remiasi sprendimų registru: ji vykdo tik aiškiai nuspręstas klases (analitikos įrašų ištrynimas, nebūtinų autoriaus laukų išvalymas, sutikimų žurnalo pseudonimizavimas). Visi kiti atvejai atsisakomi, nurodant tikslią lentelę ir priežastį. Bandomasis vykdymas atlieka viską ir atšaukia. Atvirą 2026-10-14 prašymą v2 įvykdytų pilnai, tačiau tik savininkui patvirtinus migraciją.

## 1. Why #2412 is not enough

| Fact (production, 2026-10-15) | Value |
|---|---|
| Profiles whose deletion fails today (upper bound) | 81 / 113 |
| … blocked only by the consent ledger (#2412's scope) | 29 |
| Non-cascading FKs onto `profiles` | 66 (41 NOT NULL) |
| Append-only tables reachable by cascades | 24 |
| Storage objects (not FK-linked) | 41 in 2 buckets |

#2412 also described the detached consent row as no longer naming a person. That is true literally, but GDPR Recital 26 still treats it as **pseudonymised** personal data: one random id per erasure links that person's rows to each other. v2 uses that wording throughout.

## 2. What happens to the data — classes

| Class | Meaning | Count of the 66 | v2 behaviour |
|---|---|---:|---|
| DELETE | the rows are about the person and nobody needs them | 6 | 3 decided and executed (`pilot_events`, `language_feedback`, `pilot_outcomes.participant_profile_id`); 3 need a decision (message content, invitations, review submissions) |
| REASSIGN | an organisation's record the person only authored | 36 | nullable column → `set_null`, executed (8); NOT NULL → needs the "erased person" sentinel decision, refuses (28) |
| RETAIN (pseudonymised) | kept for a legal obligation or another party's interest | 21 | refuses until the lawyer confirms the basis; 18 sit behind append-only guards |
| PSEUDONYMISE | provenance of another person's record (verifier, reviewer) | 3 | refuses (owner decision: an erased verifier must not read as a verified claim) |
| ANONYMISE | truly irreversible | **0** | none: every row keeps context ids, timestamps and often free text |

Outside the 66:
- **Consent ledger:** detached to a per-erasure tombstone (pseudonymised), executed.
- **The person's own rows:** deleted by the existing cascades (journal entries, skills, CV data, documents rows, chats).
- **Storage:** files are removed through the Storage API before the run.
- **Audit payloads that name the person:** the run refuses (scrub rule = owner/lawyer decision).

**Still linked to a person after erasure:** the pseudonymised consent rows, which link to each other but not to an account; any RETAIN row once decided; free text written by other people that names the erased person (messages, journal text, evidence `original_text`). These are not anonymous and must never be called anonymous.

## 3. How a request is executed and confirmed

1. The person files the request at `/dashboard/privacy`, which creates a `customer_requests` row with `privacy_request_type = account_deletion`.
2. A superadmin reviews it in the admin control room, sets the status to **Approved** and records a note. That step already exists.
3. **Rehearse:** "Rehearse erasure (dry run)" runs `erase_user_account_v2(..., p_dry_run => true)`. The function executes the whole erasure inside a subtransaction and rolls it back, then shows the exact plan, or every refusal with its table, column, row count and reason.
4. **Execute:** the operator types `ERASE`. The app first removes the person's files through the Storage API, rehearses again, then executes. The function writes an **append-only receipt** (`privacy_erasure_receipts`): request id, tombstone, actions with counts, executor, time. The receipt holds no identifier of the person.
5. **Confirmation to the person:** OPEN. There is no app-level transactional e-mail. Interim: the operator sends the completion notice from `info@labourmarket.ai` **before** execution, saying "your account will be erased today", because the address no longer exists afterwards. [OWNER DECISION]

## 4. The real open request (filed 2026-10-14, due about 2026-11-14)

Footprint read on production (counts only; no values read):
- `pilot_events` 58 rows: delete.
- `privacy_consent_events` 2 rows: pseudonymise.
- The privacy request row itself: cascades away; the receipt replaces it.
- 1 engagement context: cascades, with 0 lifecycle events.
- `audit_logs`: 1 actor reference set to NULL, 0 payload mentions.
- Normal cascades: worker profession, workers, roles, assistant conversation, notification.
- **0 storage objects, 0 organisation roster links.**

**Expected v2 result: executable.** It needs the owner's approval of the migration and the request set to Approved. No interim manual SQL is needed.

## 5. Tests (local Postgres 16, schema mirroring the production shapes) — all pass

| # | Case | Result |
|---|---|---|
| T1 | `authenticated` / `anon` call | permission denied |
| T2 | dry run of the open-request shape | executable, 7 actions, nothing changed, guard trigger re-enabled |
| T3 | NOT NULL author reference | refused: sentinel decision |
| T4 | cascade into an append-only table with rows | refused: "cascade failed: … append-only", nothing changed |
| T5 | unclassified non-cascading reference | refused: unclassified |
| T6 | storage objects remain | refused, with the object list for the Storage API |
| T7 | audit payload names the person | refused |
| T8 | a request id of another user | rejected |
| T9 | execute | user/profile/worker gone; telemetry deleted; consent detached (2 rows, 1 tombstone); other users untouched; receipt written with no identifier of the person |
| T10 | raw UPDATE/DELETE on ledger and receipts afterwards | blocked |
| T11 | reviewer erased | the other worker's absence record kept, reviewer NULL |
| RB | rollback with receipts / on a clean DB | evidence kept / full revert; apply-rollback cycles idempotent |

App side: `lib/admin/privacy-erasure.test.ts` (9 tests: result reader fails closed, superadmin + Approved + typed word gates, rehearsal precedes every real run, only storage refusals auto-resolved, migration grants/dry-run default/66 seeds).

## 6. Remaining dependencies (to make every account erasable)

| # | Decision / work | Owner | Unblocks |
|---|---|---|---|
| D1 | Approve and apply the v2 migration | Owner | the open request and every profile without blockers |
| D2 | Erased-person sentinel profile (one `auth.users` row, no login) for NOT NULL author columns | Owner | 28 REASSIGN FKs (mostly company owners/managers) |
| D3 | Retention basis per RETAIN table (working time, approvals, booking history, confirmations) | Lawyer | 21 RETAIN FKs; then sentinel + named guard bypass |
| D4 | Message content: delete the body and keep a "removed" shell? legal hold for disputes? | Owner + Lawyer | `conversation_messages` |
| D5 | Journal entries: delete (today's cascade) or keep detached evidence (design E1)? The schema cannot do E1 yet (`worker_id NOT NULL`) | Owner + Lawyer | the deletion design and retention matrix |
| D6 | Audit payload scrub rule | Owner + Lawyer | `audit_logs` refusals |
| D7 | Disclosure ledger detach | Engineering after D3 | `personal_data_disclosures` (0 rows today) |
| D8 | Cascades into append-only events (`engagement_lifecycle_events`, `timesheet_events`, `workflow_transitions`): detach the parent instead of deleting it | Engineering after D3 | 5 profiles today |
| D9 | Erasure path for people WITHOUT an account (organisation-supplied history, 41 people) | Owner + Lawyer | Art. 14/17 for non-users |
| D10 | Completion notice channel | Owner | step 3.5 |
| D11 | Backups: erased data persists in Supabase backups until they expire; state the window in the privacy policy | Owner (confirm PITR window) | Art. 17 honesty |
