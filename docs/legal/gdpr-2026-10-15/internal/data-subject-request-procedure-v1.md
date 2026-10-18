# Data-subject request procedure (SOP) — v1

**Status:** DRAFT v1, 2026-10-15. **Requires lawyer review.** The interim erasure procedure in §6 is marked **[OWNER + LAWYER]**. Nothing in §6 may be executed until both have approved it.

**Scope:** GDPR Art. 12, 15–22, 7(3).

**Sources:**
- Audit A3 §1 and its addendum; audit A1 §0–§5.
- `deletion-process-design-v1.md`, `data-retention-matrix-v1.md`.
- Code on `origin/main`, 2026-10-15:
  - `apps/web/lib/privacy/*`
  - `apps/web/lib/admin/privacy-requests.ts`
  - `apps/web/components/app/privacy-deletion-request.tsx`
  - `supabase/migrations/20260706150000_privacy_request_intake.sql`

> **LT santrauka.** Ši procedūra aprašo, kaip šiandien priimami ir vykdomi duomenų subjektų prašymai: susipažinti su duomenimis, juos ištaisyti, ištrinti, apriboti tvarkymą, perkelti, nesutikti su tvarkymu, taip pat prašymai pagal 22 str. Nurodyti realūs kanalai, tapatybės patikra, terminas (1 mėnuo, pratęsiamas dar 2 mėnesiais, apie tai pranešus per pirmą mėnesį), atsakymas asmeniui ir įrašų tvarkymas.
>
> Šiuo metu atviras vienas prašymas ištrinti paskyrą. Jis gautas 2026-10-14, būsena `in_review`, terminas apie 2026-11-14.
>
> Ištrynimo vykdytojo nėra. Laikina rankinė procedūra (§6) nepažeidžia papildymo principu veikiančių (append-only) žurnalų. Ją turi patvirtinti savininkas ir teisininkas.

## 1. Intake channels

These are the channels that exist today.

| Channel | What it accepts | Evidence | Who sees it |
|---|---|---|---|
| **In-app privacy page** `/dashboard/privacy` | Self-serve **data export** (JSON + journal CSV). **Account-deletion request** only; the `data_export` request type exists but no UI submits it. Consent withdrawal (one click per purpose). | `app/[locale]/dashboard/privacy/page.tsx`; `components/app/privacy-deletion-request.tsx:56-58`; `lib/privacy/actions.ts:40-66` → RPC `submit_privacy_request_v1` (limits: 3 open requests, note ≤500 chars) | Superadmin queue (`components/admin/privacy-requests-section.tsx`, mounted at `dashboard/admin/page.tsx:592`) |
| **E-mail** `info@labourmarket.ai`, the published privacy contact | Any request, from anyone, including **people without an account** | `messages/en.json:5662, 6012`; mailbox hosted at Hostinger (register v3 P7) | Owner mailbox |
| Post to the registered office | Any request | Controller address (`corporate-identity-source-of-truth-v1.md` §2) | Owner |
| Requests received by an organisation customer about its own records | Organisation-supplied history, roster, workspace records | The organisation is the controller (`roles-and-responsibilities-v1.md`) | The organisation forwards them to us as its processor. **No contractual channel exists yet.** |

**Rules for intake:**
- A request is valid whatever its form and wording. Words such as "delete me" or "what do you have about me" are enough. Art. 12 does not require the in-app form.
- Every e-mail or post request is logged in the DSR log (§9) **the same day**, with its receipt date.

## 2. Deadlines (Art. 12(3))

- **Response:** without undue delay, and at the latest **one month from receipt**.
  - Example: a request received on 14 October is due on 14 November.
  - Where the corresponding day does not exist, the deadline is the last day of that month [LAWYER: confirm counting rule].
- **Extension:** **two further months** are allowed only where needed because of complexity or the number of requests. The person must be told **within the first month**, with the reasons.
- **Refusal or no action:** tell the person within one month, with reasons, and inform them of the right to complain to VDAI and to seek a judicial remedy (Art. 12(4)).
- **Gap (G-22):** the code has no due-date field or computation. Until engineering adds one, the DSR log (§9) is the deadline tracker. The owner checks it weekly.

## 3. Identity verification (Art. 12(2), (6))

| Requester | Verification |
|---|---|
| **In-app request** | Bound to the session. The RPC writes `profile_id = auth.uid()` and takes no user-id parameter. No further proof is needed, unless account takeover is suspected. |
| **E-mail from the account's address** | Reply to the account e-mail on file and ask for confirmation from that address. Never act on a different address alone. |
| **E-mail from an unknown address claiming an account** | Ask the person to sign in and use `/dashboard/privacy`, or to write from the account address. |
| **Person without an account** (org-imported history, vacancy contact, B2B contact, invitee) | Ask only for what is needed to find the records: full name, the organisation that recorded the work, approximate period, or the advert or e-mail concerned. Where doubt remains, ask the supplying organisation to confirm. **Do not ask for ID-document copies by default** (minimisation). |
| **Representative or parent** | Written authorisation, and proof of parental responsibility for a minor [LAWYER]. |

**Do not reveal** whether data exists about a person until identity is reasonably established. Ask for more information only when there is reasonable doubt (Art. 12(6)). The time spent waiting for that information pauses the practical work, but it does not formally move the deadline [LAWYER].

## 4. How each right is executed today

| Right | Execution today (code path) | Manual steps / gaps |
|---|---|---|
| **Art. 15 access** | Self-serve JSON export via `buildPrivacyExport()` (`lib/privacy/export-data.ts:350`), covering the profile, workers and the relations registered in `lib/privacy/personal-relations.ts`. Linked roster and evidence rows are included (`export-data.ts:399-424`). Journal CSV. | The export is a copy only. **The reply must add the Art. 15(1)(a)-(h) information:** purposes, categories, recipients, retention, rights, source, and profiling logic (use `ropa-v2.md` and the matrix). **Withheld classes must be assessed manually:** own messages, own `customer_requests`, `demand_shortlist`. Provide own data, and redact third parties per Art. 15(4). The **assistant transcript** is exported through the `export_assistant_transcript` RPC, run by an admin, because no UI exists. **Files** in `document-files`, `conversation-attachments`, `evidence-media` and `customer-request-attachments` are not linked, so add them manually. `pilot_events` and `ai_runs` rows linked to the person must be counted and supplied (coverage unverified). |
| **Art. 16 rectification** | The user edits their own profile. Journal entries cannot be rewritten (`en.json:5921`); the person adds a correction entry. Organisation evidence: org-side correction via `correction_of` (`lib/organization-evidence/record-correction.ts`), at most one per record. A linked subject can contest (`lib/organization-evidence/dispute-actions.ts:77`) and withdraw the contest (`:170`). | No rectification request type exists. Handle it by e-mail. **E-mail change has no path:** do it manually in Supabase Auth admin after verification, and record it in the DSR log. Organisation records: forward to the organisation (REFER) and tell the person. Confirmations cannot be disputed (G-32). |
| **Art. 17 erasure** | Intake via `submit_privacy_request_v1` → `customer_requests` with `source=privacy_self_service`. The admin can set the status and add a note (`lib/admin/privacy-requests.ts:108-181`), logged in `payload.privacy_review_log[]`. There is a read-only preview in `lib/privacy/deletion-plan.ts` ("ZERO writes"). | **No executor exists** (G-01). `auth.admin.deleteUser` appears only in tests. A plain account delete is unsafe and would fail: 66 NO ACTION/RESTRICT FKs, cascades into append-only tables, the request row is destroyed by cascade, and storage objects are orphaned. PR #2412 is a RED draft, not approved, and is being redesigned as erasure v2. **Use the interim procedure in §6.** |
| **Art. 18 restriction** | No mechanism. | Manual handling. Mark the request in the DSR log. The person can withdraw discoverability and partner-supply consent themselves (`lib/privacy/discoverability-actions.ts:125`, `partner-supply-actions.ts:227`). Pause any operator use. As a last resort, suspend sign-in with the person's agreement. Tell the person before lifting a restriction (Art. 18(3)). |
| **Art. 20 portability** | JSON export, which is machine-readable. | Direct controller-to-controller transfer is not offered. |
| **Art. 21 objection** | Discoverability withdrawal ends employer discovery and auto-match inclusion. Partner-supply withdrawal. Notification preferences. | No objection mechanism exists for telemetry, cross-organisation inference, or inclusion of org-imported people. Handle manually: delete the person's `pilot_events`. There is no way to stop future telemetry except deleting it again, because device-side keys sit in the browser (G-10). Record the objection and assess compelling grounds. |
| **Art. 22 / profiling** | No solely automated decisions with legal or similarly significant effect (DPIA §2). | On request, explain the ranking logic, the hard criteria and the top-8 display, and confirm human selection. **Auto-confirmation** (`apply_learning_auto_confirmation`) can be contested by e-mail only. Remove it on a valid objection [OWNER]. |
| **Art. 7(3) withdrawal** | One-step withdraw RPCs per purpose. Append-only ledger. | Withdrawal events hardcode locale `lt` (G-39). |
| **Assistant transcript erasure** | `erase_assistant_transcript` RPC (migration `20261012100000_assistant_transcript_v1.sql`). | No UI. An admin runs it on request. |

## 5. Confirmation to the person (Art. 12(1), 19)

- **Gap (G-22):** no completion notice is ever sent. The in-app copy promises contact "at your account email", but no code sends anything. Until engineering adds a notice, the owner sends every reply manually from `info@labourmarket.ai`.
- Every reply states:
  - what was done, class by class;
  - **what was kept**, under which exception (Art. 17(3)) and for how long. Kept data is described as **pseudonymised, never "anonymous"**;
  - which other controllers hold data and how to reach them (organisations; Nonstop Group staffing if a hand-off happened);
  - that backups expire on provider rotation (window [NOT EVIDENCED]);
  - the right to complain to VDAI.
- **Art. 19:** tell the recipients of the data about a rectification, erasure or restriction unless this is impossible or disproportionate. Recipients here are employers who received a disclosure (`personal_data_disclosures`, 0 today) and the Nonstop staffing hand-off. Tell the person who those recipients are if they ask.
- For erasure, send the completion notice **before** the account e-mail is removed.

## 6. CURRENT OPEN REQUEST: interim erasure procedure [OWNER + LAWYER]

### 6.1 The request

| Fact | Value |
|---|---|
| Type | `account_deletion` (in-app) |
| Filed | 2026-10-14 |
| Status | `in_review` |
| Due | about **2026-11-14**; any extension notice must also be sent by then |
| Account | still exists |
| Executor | **none** |
| PR #2412 | consent-ledger detach; RED draft; **not approved**; the owner refused prod apply on 2026-10-15; being redesigned as erasure v2 |

Identifiers of the request and the person are kept only in the DSR log, never in this repository.

### 6.2 Principles

The interim procedure:

- **does not disable, bypass or weaken any append-only or immutability trigger.** No `session_replication_role`, no ad-hoc GUC, no `ALTER TABLE … DISABLE TRIGGER`;
- **does not delete `auth.users` or `profiles`.** That delete fails or destroys records (A1 §0), and it destroys the request record itself;
- erases or redacts content in tables that are not guarded, keeps a minimal pseudonymised tombstone, and tells the person exactly what remains and why;
- runs every write as **owner-approved, subject-scoped, single-transaction DML** through Supabase MCP. Each step first runs a **dry-run that returns counts only**, and no personal values are printed;
- is completed later by erasure v2, which detaches the ledgers and deletes the account. A dated commitment goes into the completion notice.

### 6.3 Steps

**Step 1 — Acknowledge (target 2026-10-21).**
- E-mail the account address from `info@labourmarket.ai`.
- Confirm the receipt date and the deadline.
- Offer a last self-serve export.
- Ask the person to withdraw discoverability and partner-supply consent with one click. The platform must not write a withdrawal on their behalf; no admin consent path exists, by design.
- Ask whether any account-specific dispute exists that would need a legal hold.

**Step 2 — Scope (counts only).**
- Open the admin deletion-plan preview for the request.
- Run A1's per-FK count queries scoped to this profile and worker id.
- Record the counts per class in the DSR log, and flag any blocker:
  - RESTRICT rows: `work_hour_allocations`, `competency_recognitions.assessed_by`, `lmc_*`;
  - sole-owner memberships (`protect_last_owner`);
  - legal-hold conversations.

**Step 3 — Exception check (lawyer).**
- For each retained class, name the Art. 17(3) ground and the period. Use the matrix:
  - consent and disclosure ledgers (proof, 17(3)(b)/(e));
  - employer statutory working-time records (17(3)(b));
  - booking and engagement records (claim horizon, still an [OWNER DECISION]);
  - the privacy request record (Art. 5(2)).
- Everything else is erased.

**Step 4 — Erase or redact (owner-approved DML, one transaction per class).**

a. **Storage.** Delete the person's objects in `profile-avatars`, `journal-entry-photos` and `document-files` through the Storage API, then null the referencing paths.

b. **Delete the person's own rows in non-guarded tables.** Included:
- `pilot_events` (own rows);
- `worker_opportunity_seen`, `notification_events`, `notification_preferences`;
- `preferred_locations`, `consented_login_location_signals`;
- `worker_saved_*`, `language_feedback`, `market_intelligence_insight_queries`;
- the assistant transcript (`erase_assistant_transcript`);
- journal entries and child rows (per-worker chain; no other person's chain is affected) **unless** the lawyer keeps employer-confirmed entries;
- `worker_*` professional rows, documents, and skill claims and clarifications.

Excluded: any delete that would cascade into an append-only table. Check A1 §0 finding 1 first: engagement contexts, timesheets and workflow instances cascade into guarded event tables, so **leave them** for erasure v2 and list them as retained.

c. **Redact identifying fields on the rows that remain as the tombstone.**
- `profiles`: `full_name`, `phone`, `profile_text` and `avatar_url` become NULL. **The e-mail is replaced only after Step 6.**
- `workers`: `display_name` becomes a fixed neutral label; free-text fields become NULL.

d. **Third-party-facing content.**
- Messages authored by the person: null `body` and `translated_text`, keeping a "message removed" shell, unless a legal hold applies.
- Invitations where the person is the invitee: null `invited_email`, `invited_name` and `personal_message`.

e. **`audit_logs`.** Remove the person's identifiers from `payload`. This needs a reviewed statement: the table is not append-only, but it is an accountability log, so the owner approves it explicitly.

f. **Organisation-held records** (`organization_people` / evidence linked to the person): leave them. They are the organisation's records. Tell the person which organisations hold records and that requests go to them (REFER). Delete platform-derived competency signals only if they are not part of the organisation's record [LAWYER].

g. **Delete the stale backup row**, if the person appears in `worker_display_name_backfill_20260805`.

**Step 5 — Verify.**
- Re-run the Step 2 counts and confirm the expected zeros and the expected retained rows.
- Record before and after counts in the DSR log.
- Leave the `customer_requests` row in place. It survives because no account delete runs.

**Step 6 — Close and suspend.**
- Send the completion notice (§5) to the account e-mail, listing:
  - what was erased;
  - what remains (pseudonymised tombstone and ledger rows, with grounds and periods);
  - that the remaining identifiers are removed when erasure v2 ships, by **[OWNER: commit to a date]**.
- **Then** suspend sign-in (Supabase Auth admin ban) and replace the auth e-mail with a non-routable placeholder. This is pseudonymisation, not anonymisation.
- Set the request status to `closed` with a note. The admin queue writes the review log.

**Step 7 — Complete later.**
- When erasure v2 is approved and applied, run it for this subject: ledger detach, account delete, request-row detach.
- Send a short final confirmation if a channel still exists. Otherwise record it in the DSR log.

### 6.4 Fallback

If the owner and lawyer cannot approve Step 4 by **about 2026-11-07**:
- send an **Art. 12(3) extension notice** before 2026-11-14;
- give the reason: technical complexity of detaching append-only accountability ledgers without destroying proof;
- set a new date, at most about 2027-01-14 [LAWYER: confirm counting];
- in the meantime apply Step 1 and the restriction measures.

### 6.5 Engineering follow-ups that make this routine

These are erasure v2 inputs, each RED and owner-gated:
- a subject-scoped, sanctioned detach for every append-only table, with a shared sentinel rather than a per-subject uuid where linkability is not needed;
- detach `customer_requests` before the account delete;
- delete storage objects before the auth delete;
- resolve the RESTRICT FKs;
- add an `erasure` field per relation in `personal-relations.ts`;
- a completion-notice e-mail;
- due-date tracking.

## 7. People without accounts

Organisation-imported history (41 unlinked people), vacancy contact persons, B2B contacts and invitees.

1. **Intake:** e-mail only. Verify identity as in §3.
2. **Locate.**
   - Org history: search `organization_people.normalized_name` and `display_name` within the organisation the person names.
   - Vacancies: search the description text for the person's e-mail or name.
   - Intake and invitations: search by e-mail.
   - Run counts only.
3. **Organisation records** (the organisation is the controller): forward the request to the organisation the same week, and tell the person who the controller is and that it was forwarded. Provide platform-derived data (competency signals, link proposals) directly.
4. **Erasure.**
   - Platform-derived data: DELETE.
   - Organisation evidence: insert-only and hash-chained, with no redaction path (G-05). The organisation must decide. Record the gap honestly in the reply.
   - Vacancy text: redact the contact from the stored description [E: one-off statement, owner-approved].
5. These requests have **no in-app channel and no Art. 14 notice** today (G-05, G-06).

## 8. Requests from or about minors

Treat a request from a parent or guardian for a minor's data as valid when proof of parental responsibility is supplied [LAWYER]. Minors may also exercise their rights themselves. See `minors-and-age-policy-v1.md`.

## 9. Record keeping (Art. 5(2), 12)

Keep the **DSR log in the owner's private document store**, not in this public repository and not under `runtime/`. Use one row per request.

| Field | Content |
|---|---|
| DSR id | `DSR-YYYY-NNN` (+ `customer_requests.id` if in-app) |
| Received | date and channel |
| Right(s) | 15 / 16 / 17 / 18 / 20 / 21 / 22 / 7(3) |
| Requester type | account / no-account / representative |
| Identity verified | how, date |
| Due date | received + 1 month; extended? (date the notice was sent, reason) |
| Scope counts | before and after, per class (no values) |
| Exceptions applied | Art. 17(3) ground + period per retained class |
| Referred to | other controller(s), date |
| Art. 19 recipients informed | yes / no / n.a. |
| Reply sent | date, summary |
| Closed | date, by |

**Retention of the DSR log:** recommended 3 years after completion [OWNER DECISION, matrix M40].
