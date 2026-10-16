# GDPR erasure executor v3 — corrected architecture (DRAFT, RED, NOT applied)

> Status: DRAFT 2026-10-16 · RED — NOT applied to any database · Supersedes the **approach** of PR #2426 (erasure v2) after the 2026-10-16 audit review. #2426 stays blocked in its current form; nothing in it is edited by this document.
> Owner gate: draft PR + `needs-human-gate` + explicit owner **and** lawyer approval of §15 before `apply_migration`.
> Sources: `erasure-v2-technical-plan.md`, `data-subject-request-procedure-v1.md` (SOP), `data-retention-matrix-v1.md`, `deletion-process-design-v1.md` (E1–E8), decision 0024 (single-use confirmations), doctrine §3 / §16 / §20, the 2026-10-16 audit review of #2426, migration `20261016150000_privacy_erasure_executor_v3.sql` (+ rollback), harness `apps/web/scripts/db-proof/privacy-erasure-v3-local.mjs`, guard `apps/web/lib/guards/privacy-erasure-registry-coverage.test.ts`.
>
> **Santrauka (LT).** v2 leido kaskadoms (ON DELETE CASCADE) veikti be sprendimo: su paskyra dingtų visas darbo žurnalas su patvirtinimais ir Stripe kliento susiejimas; `usage_cost_events` sever'inimas buvo blokuojamas tos lentelės trigerio, tad kiekviena paskyra su AI naudojimu nepavyktų; patvirtinimas buvo statinis žodis „ERASE“, o bandomasis vykdymas ėmė DDL užraktus puslapio atvaizdavimo metu. v3: **kiekviena** nuoroda į asmenį (įskaitant kaskadas) turi aiškų registro sprendimą; išsaugomos eilutės **atskiriamos** nuo asmens (sentinel „ištrintas asmuo“), bet lieka; bandomasis vykdymas — tik skaitymas; vienkartinis, galiojimo laiką turintis, būsenai ir planui pririštas leidimo žetonas; kvitai be identifikatorių. Teisinius klausimus (§15) sprendžia savininkas ir teisininkas — ne inžinerija.

---

## 0. What the audit found in v2, and the v3 answer

| # | Audit finding on #2426 | v3 answer | Where |
|---|---|---|---|
| 1 | `ON DELETE CASCADE` ran without a registry decision: `journal_entries.worker_id` cascades (no delete trigger; SECURITY DEFINER bypasses RLS), so the whole journal + confirmations vanished; `billing_customers` / `billing_subscriptions.owner_id` cascade deleted the Stripe mapping while Stripe kept the customer | **Every** FK onto `profiles`/`workers` — 273 columns derived from the migrations, cascades included — carries an explicit registry row. `allow_cascade` is itself a decision and is verified against the live rule. Rows that must outlive the person are **severed to a sentinel before** the account delete, so the cascade finds nothing. An FK without a row refuses **by name**, rows or no rows | §2, §3, migration §10 |
| 2 | Scope was single-column FKs only: e-mail/name columns (`invitations.invited_email`, `waitlist.email`, intake contacts, message bodies), jsonb beyond one `audit_logs` LIKE, `ai_runs.output_excerpt`; no static guard for new person references | A second registry of **value rules** (e-mail exact, phone exact, mention scan over text/jsonb) with 21 seeded columns; a vitest guard that parses every migration and fails CI when a person-referencing column has no decision | §7, guard test |
| 3 | `usage_cost_events.profile_id` SET NULL is blocked by the table's own BEFORE UPDATE trigger → every account with AI usage fails | Treatment RETAIN + sever: the registry names the guard trigger; the executor disables **that one trigger around that one statement, in the EXECUTE path only**, then re-enables it. `ai_runs` reuses the existing `ai_runs_delink_subject` RPC | §6 |
| 4 | Confirmation = the static word "ERASE"; the GET rehearsal took an ACCESS EXCLUSIVE lock on page render | Admin **requests an authorization token**: 256-bit random, stored only as sha256, 15-minute expiry, bound to the request id, to the request's state fingerprint and to the digest of the plan the admin saw; EXECUTE consumes it atomically (single use). The dry run is a **pure read** (SELECT counts only; the function is STABLE; no DDL, no subtransaction, no exclusive lock) | §11, §12 |
| 5 | `auth.audit_log_entries` untouched; storage scanned by `owner_id` only (server-side uploads have NULL owner); Stripe / e-mail provider / Gemini not addressed; no production runbook | `auth.audit_log_entries` counted and reported as retained security evidence; storage scanned by `owner_id` **and** by path prefix per bucket; Stripe is an explicit `external.stripe` decision the executor demands; e-mail providers and Gemini are addressed in §10; runbook in §14 | §8, §9, §10, §14 |

---

## 1. Principles (binding for v3)

1. **Identity is severed; evidence stays.** A working-time record, an organisation record, an invoice, a ledger row keeps existing; the person column on it points at the sentinel or becomes NULL; identifying text is removed. Nothing retained is ever described as anonymous — it is **pseudonymised** (Recital 26).
2. **No undecided reference.** The catalog is read live; every FK onto `profiles`/`workers` needs a registry row; every known identifier column needs a value rule. Missing = refuse by name. Schema drift (registry expects cascade, live rule differs; registry says NULL, column is NOT NULL) = refuse.
3. **The dry run is a read.** It proves counts and decisions, never cascades. Executability is guaranteed by the registry invariant plus an all-or-nothing execute that reports any failure as a refusal with nothing changed.
4. **One confirmation, used once** (decision 0024): a token, not a word. Bound to request + state + plan, expiring, consumed atomically.
5. **No second memory**: registries, authorizations and receipts are canonical tables under RLS with all client grants revoked; `service_role` only, behind `isSuperadmin()` in the app.
6. **Receipts carry no identifier**: table names, treatments, counts, legal basis, tombstone, executor id.
7. **Append-only guards are never weakened**: no `session_replication_role`, no trigger body rewritten, no ad-hoc GUC. A named guard is switched off around exactly one statement inside the execute transaction and switched on again before the next statement (lock: `SHARE ROW EXCLUSIVE` on that table for the rest of the transaction — writes wait, reads do not; one erasure at a time, seconds).

---

## 2. Per-class treatment and the exact table list

Four classes, realised by six registry treatments. Counts are the seeded registry (273 FK columns) plus 21 value rules. `*` = `legal_review = true` (engineering decided the mechanism; the lawyer confirms the Art. 17(3) basis — §15). `(cascade)` = the live FK cascades today; v3 turns that into the stated decision.

### 2.1 DELETE — the person's own rows, no retention need (`allow_cascade` 51 + `delete_rows` 4 + value `delete_rows` 3)

`allow_cascade` (the cascade **is** the decision; the executor verifies the live rule is CASCADE):
account_classifications.profile_id, assistant_conversations.owner_id, booking_requests_seen.user_id, candidate_skills.profile_id, company_memberships.profile_id (refuses while the person is the **sole active owner** of an organisation — `protect_last_owner` would abort the cascade; ownership must be transferred first), confirmation_spends.spent_by, consented_login_location_signals.profile_id, consents.profile_id, conversation_participants.profile_id, customer_request_attachments.profile_id, dashboard_preferences.profile_id, demand_interest_seen.profile_id, demand_interest_signals.worker_id, document_acknowledgements.assignee_profile_id, email_verification_requests_v1.profile_id, email_verifications_v1.profile_id, first_party_supply_declarations.profile_id, follow_up_tasks.subject_profile_id, invitation_acceptances.profile_id, invitations.inviter_profile_id, journal_entry_photos.profile_id, marketplace_listings.owner_id, notification_events.recipient_profile_id, notification_preferences.profile_id, pilot_drafts.profile_id, pilot_participants.profile_id, platform_capability_grants.profile_id, preferred_locations.profile_id, profile_roles.profile_id, profile_skill_claims.profile_id, project_members.profile_id, service_offering_requests_seen.user_id, service_offerings.provider_id, skill_candidate_clarifications.profile_id, subscriptions.profile_id, worker_achievements.profile_id, worker_education.profile_id, worker_external_profiles.worker_id, worker_languages.worker_id, worker_opportunity_seen.profile_id, worker_professions.worker_id, worker_saved_opportunities.worker_id, worker_saved_searches.worker_id, workers.profile_id, **plus the Living-CV / roster / learning rows about the person**: worker_skills.worker_id, worker_documents.worker_id, matches.worker_id, agency_workers.worker_id, company_workers.worker_id, learning_review_queue.subject_worker_id, learning_signals.subject_worker_id.

`delete_rows` (non-cascading FKs, deleted explicitly): pilot_events.profile_id, language_feedback.user_id, pilot_outcomes.participant_profile_id, **billing_customers.owner_id\*** (the processor-key mapping; deleted only after `external.stripe` says the Stripe customer was deleted or anonymised — §10).

Value rules `delete_rows` (matched by the person's e-mail): waitlist.email, email_verification_requests_v1.email, email_verifications_v1.email.

Also deleted: storage objects (§8), the auth user and its auth-schema children (identities, sessions, refresh tokens, MFA factors — GoTrue cascades), the assistant transcript (`assistant_conversations` cascades).

### 2.2 PSEUDONYMISE-in-place — the row stays, the identifying **value** is replaced (`pseudonymise_ledger` 2 + value rules 12)

Ledgers (`pseudonymise_ledger`, Recital 26 wording — detach columns `erased_subject_id`, `erased_at`; the user column becomes NULL; one random tombstone per erasure links the person's own rows to each other and to nothing else): privacy_consent_events.user_id\*, personal_data_disclosures.worker_user_id\*.

Value rules `pseudonymise_value` (address → `erased-<tombstone>@erased.invalid`; `scrub_columns` → NULL): invitations.invited_email (+ invited_name, personal_message), agency_worker_invitations.invited_email, company_worker_invitations.invited_email, agency_client_connections.invited_email, company_need_public_intakes.contact_email\* (+ contact_name, contact_phone), agency_clients.contact_email (+ contact_name), project_clients.contact_email (+ contact_name), companies.contact_email (+ contact_phone), leads.email\* (+ full_name), lmc_transactions.recipient_email_at_grant\*.

Value rules `pseudonymise_mentions` (the person's id → tombstone, each known e-mail → sentinel address, inside text/jsonb, structure untouched): audit_logs.payload\*, payment_webhook_events.payload\*.

### 2.3 SEVER-to-sentinel — the row stays, the person column points at the "erased person" (`sever_sentinel` 115)

Working-time / work records\* (Art. 17(3)(b), employer statutory retention — LT Darbo kodeksas working-time records, NO arbeidsmiljøloven; period to be named by the lawyer): journal_entries.worker_id (cascade), journal_entry_skills.worker_id (cascade), journal_entry_work_items.worker_id (cascade), engagement_contexts.profile_id (cascade; `title`, `description` scrubbed), timesheets.worker_id / .created_by (cascade; guard `timesheets_frozen`), work_hour_allocations.worker_id / .entered_by (RESTRICT), work_plan_entries.worker_id (cascade) / .created_by, project_worker_assignments.worker_id (cascade), journal_entry_confirmations.confirmer_id\*, journal_entry_review_submissions.submitted_by\* / .worker_id\* (append-only guard), work_counterparty_links.worker_id\* / .established_by\* (append-only guard).

Accounting\* (Art. 17(3)(b), 10 y LT): billing_subscriptions.owner_id (cascade), billing_checkout_operations.owner_id (cascade) — both demand `external.stripe`.

Organisation / counterparty records the person authored or took part in (Art. 17(3)(b)/(e); the organisation is controller — `roles-and-responsibilities-v1`): agency_candidate_offers.worker_id, agency_worker_invitations.inviter_profile_id, agreement_amendments.created_by, agreement_events.actor_id, agreements.created_by, asset_assignments.issued_by, assets.created_by, booking_request_events.actor_id, booking_requests.owner_id / .worker_id (E3: claim horizon), business_trips.created_by / .profile_id, candidate_drafts.owner_id, commercial_handoffs.worker_id (hand-off to Nonstop: a second controller), commitment_override_receipts.worker_id (immutable receipts; guard), company_demand_locations.owner_id, company_worker_invitations.inviter_profile_id, competency_recognitions.assessed_by\* / .subject_profile_id\*, contact_disclosure_request_events.actor_profile_id, contact_disclosure_requests.owner_id / .worker_id, contracts.owner_id, conversation_message_attachments.uploader_id\*, conversation_messages.author_id\* (E6; body = §15 L-4), conversations.created_by, customer_requests.profile_id (`need_summary`, `notes`, `manual_review_note` scrubbed; the privacy request itself is kept 3 y, E4), customers.profile_id, decision_document_links.created_by, decision_task_links.created_by, defect_corrections.reviewer_id, defects.reporter_id, demand_shortlist.owner_id / .worker_id, document_acknowledgements.assigned_by, document_files.uploaded_by, education_cohort_members.profile_id, employee_requests.requester_profile_id, experience_records.author_profile_id\* / .subject_profile_id\*, experience_responses.author_profile_id\*, finance_records.created_by, follow_up_tasks.created_by, identity_resolution_events.primary_profile_id / .duplicate_profile_id (immutable; guard), leave_balance_policies.created_by, management_decision_events.actor_id, management_decisions.created_by, market_rate_averages.entered_by, offboarding_runs.started_by, onboarding_runs.started_by, onboarding_templates.created_by, org_document_events.actor_id, org_documents.created_by, organization_claims.claimant_profile_id, organization_evidence_media.imported_by_profile_id, performance_review_events.actor_id, performance_reviews.created_by / .reviewer_profile_id / .subject_profile_id, personal_data_disclosures.disclosed_by\*, pilot_outcomes.noted_by, pilots.created_by, procurement_inquiries.created_by / .requester_profile_id, procurement_offers.created_by, project_budgets.created_by, project_handover_entries.created_by, project_stages.created_by, project_worker_operational_statuses.updated_by / .worker_id, project_worker_readiness_items.updated_by / .worker_id, proposals.owner_id, review_cycles.created_by, review_evidence_links.created_by, service_offering_requests.buyer_id / .provider_id, talent_source_records.subject_profile_id\* (org-supplied history, D9), task_dependencies.created_by, team_enquiry_events.actor_profile_id, team_enquiries.owner_id, training_assignment_events.actor_id, training_assignments.assigned_by / .assignee_profile_id, training_programs.created_by, training_skill_links.created_by, work_objects.created_by, work_tasks.created_by, worker_absences.requested_by / .worker_id\*, worker_document_events.actor_id, worker_documents.updated_by, workflow_definition_versions.created_by, workflow_definitions.created_by, workflow_instance_approvers.approver_profile_id, workflow_instances.requester_profile_id.

### 2.4 RETAIN-with-legal-basis — the row stays, the reference becomes NULL or is only counted (`set_null` 101 + value `report_only` 6)

`set_null` (nullable author/actor columns on retained records; the FK already says SET NULL for most — v3 runs it **explicitly before** the account delete because several of these tables carry guard triggers that would block the FK's own action): account_classifications.decided_by, agency_candidate_offers.created_by / .decided_by / .withdrawn_by, agency_client_connections.accepted_by / .invited_by / .revoked_by, agency_client_request_shares.revoked_by / .shared_by, agency_clients.created_by, agencies.profile_id, agreements.responsible_profile_id / .worker_id, ai_runs.profile_id (after `ai_runs_delink_subject`, which also clears `output_excerpt`), asset_assignments.worker_id, audit_logs.actor_id, business_trip_events.actor_profile_id, candidate_drafts.linked_profile_id, commitment_override_receipts.decided_by (guard), company_locations.created_by, company_memberships.invited_by, company_worker_engagements.created_by / .ended_by / .worker_id (#856 model A: a detached row grants nothing), companies.profile_id, conversation_participants.added_by / .revoked_by, customer_requests.drafted_by, defects.assignee_profile_id, document_acknowledgements.acknowledged_by, education_cohort_members.added_by, education_cohorts.created_by, education_programs.created_by, engagement_lifecycle_events.actor_profile_id (guard), evidence_import_events.actor_profile_id, evidence_import_sessions.created_by, experience_records.moderated_by, experience_responses.moderated_by, historical_consolidation_decisions.decided_by / .reverted_by, identity_resolution_events.decided_by (guard), invitations.accepted_by_profile_id, journal_entry_tasks.linked_by / .unlinked_by, leads.assigned_to, learning_policy_settings.disabled_by / .enabled_by, learning_review_queue.reviewed_by (guard), learning_signals.actor_id, lmc_accounts.profile_id, lmc_settings.updated_by, lmc_transactions.actor_profile_id, management_decisions.responsible_profile_id, market_intelligence_insight_queries.profile_id, match_actions.actor_id, offboarding_run_items.completed_by, onboarding_run_items.completed_by / .responsible_profile_id, org_documents.responsible_profile_id / .worker_id, organization_claims.decided_by, organization_evidence_events.actor_profile_id, organization_evidence_parties.created_by, organization_evidence_records.imported_by_profile_id / .supplied_by_profile_id, organization_facts.recorded_by (guard), organization_history_periods.created_by, organization_identifiers.created_by, organization_people.created_by / .linked_by / .linked_profile_id / .linked_worker_id, organizations.owner_profile_id, performance_reviews.manager_input_by\*, platform_capability_grants.granted_by / .revoked_by, privacy_erasure_authorizations_v3.issued_by, privacy_erasure_receipts_v3.executed_by, procurement_events.actor_profile_id (guard), productivity_units.created_by_profile_id, projects.responsible_profile_id, talent_source_records.canonical_person_link, team_assignments.assigned_by / .ended_by, team_demand_offer_terms.decided_by / .proposed_by, team_demand_offers.offered_by / .responded_by, timesheet_events.actor_profile_id (guard), **usage_cost_events.profile_id (guard `usage_cost_events_no_mutation`)**, work_counterparty_links.revoked_by (guard), work_objects.responsible_profile_id, work_plan_entries.cancelled_by, work_task_events.actor_profile_id, work_tasks.assignee_profile_id, worker_absences.reviewed_by, worker_documents.verified_by\*, worker_skills.verified_by\*, workflow_instance_approvers.decided_by / .delegated_to_profile_id, workflow_transitions.actor_profile_id (guard).

Value rules `report_only` (counted into the receipt, never changed, never printed): conversation_messages.body\*, journal_entries.original_text\*, customer_requests.need_summary, evidence_import_rows.person_label\*, organization_people.display_name\*, **auth.audit_log_entries.payload\***.

### 2.5 Found during the inventory, outside every class

`worker_display_name_backfill_20260805` keeps `display_name_before/after` with no FK onto `workers` — a table of names that an erasure cannot reach. Decision needed (§15 L-13): drop the backfill table (it was a one-off), or add a keyed value rule.

---

## 3. Cascades become explicit decisions

- The executor reads `pg_constraint` live. For each FK onto `profiles`/`workers` it looks up `privacy_erasure_registry_v3 (schema, table, column)`.
- **Missing row → refusal by name**, even with zero rows (the registry is a completeness contract; the static guard catches it in CI first).
- `allow_cascade` is only accepted when the live rule is CASCADE; `set_null` only when the column is nullable. Any mismatch is a drift refusal.
- `sever_sentinel` / `set_null` / `delete_rows` / `pseudonymise_ledger` run **before** `delete from auth.users`, in a fixed order (delete → set null → sever → ledger), so when the cascade finally runs it meets only rows the registry decided as `allow_cascade`.
- After the delete, a post-check counts every FK column for the person's ids; any remaining row raises `LME03` and the whole transaction rolls back.
- `refuse_where` lets a treatment refuse conditionally with a counted reason (today: the sole-owner membership).
- Multi-column FKs (none today) refuse unless the registry row says `allow_cascade`.
- A registry change is itself a reviewed migration; the registry tables have RLS on and every client grant revoked.

---

## 4. The sentinel "erased person"

- Fixed ids: profile `00000000-0000-4000-a000-00000000e5a0`, worker `00000000-0000-4000-a000-00000000e5a1`.
- One `auth.users` row: `banned_until = infinity`, no password, no identities, no confirmed e-mail, `raw_user_meta_data = {"sentinel":"erased_person"}`; one `profiles` row (`full_name = 'Erased person'`, no e-mail/phone/role); one `workers` row (`availability_status = 'unavailable'`).
- It **grants nothing**: every RLS predicate compares with `auth.uid()`, which is never this id (no session can exist). It has no consent rows, so discoverability and partner supply are fail-closed. It can never be erased (the plan refuses).
- Severed rows read as "work recorded by an erased person", which is the honest state: the employer's record exists, the person's identity does not.
- Unique constraints: `billing_customers (owner_id, provider)` would collide on the second erasure → that table is `delete_rows` (the mapping is a processor key; invoices live at the processor and in accounting). `workers.profile_id UNIQUE`, `first_party_supply_declarations.profile_id UNIQUE` cascade (deleted). A future unique index on a severed column would surface as a refusal (unique_violation → rolled back), never as partial state.
- App follow-ups (not in this PR): exclude the sentinel from people lists, counts, roster pickers and exports (`privacy_erasure_is_sentinel(uuid)` exists for that); the Living CV of the sentinel must never render.

---

## 5. Journal entries as employer evidence, severed from the person

What v3 does (engineering):
- `journal_entries.worker_id` → sentinel worker; `journal_entry_skills` / `journal_entry_work_items.worker_id` → sentinel worker; `engagement_contexts.profile_id` → sentinel profile with `title`/`description` NULL; `journal_entry_confirmations` stay as they are (the manager's confirmation of the person's entry survives; where the **person** was the confirmer of someone else's entry, `confirmer_id` → sentinel).
- `journal_entry_photos` rows and the `journal-entry-photos/<uid>/…` objects are **deleted** (photos usually show the person).
- `hash_prev` / `hash_self` are left untouched. The chain was computed over `worker.id | engagement | text | locale | prev | timestamp` at write time; after severance it cannot be recomputed from stored columns, but the seal still proves that the retained text was not altered after the fact. Tamper evidence is kept; re-derivation from the original worker id is not.
- The attribution guard `journal_entries_attribution_guard_v1` passes for the executor (service role, `auth.uid()` NULL), so no trigger is disabled on `journal_entries`.

**The legal question is stated, not decided** (§15 L-1/L-2): must `original_text` (and the AI extractions, metrics, work items derived from it) stay under the sentinel as employer working-time evidence, or must free text be removed and only structured facts (dates, hours, metrics, confirmations) remain? Free text may name the person or third parties. v3 ships `report_only` for `journal_entries.original_text` (counted in the receipt) and no scrub; a one-line registry change (`scrub_columns = {original_text}` on the `journal_entries.worker_id` row) flips it once the lawyer decides.

---

## 6. Append-only tables and `usage_cost_events`

| Table | Guard | v3 treatment | Mechanism |
|---|---|---|---|
| `usage_cost_events` | `usage_cost_events_no_mutation` (BEFORE UPDATE OR DELETE, raises 42501 for everyone) | RETAIN rows, **sever** `profile_id` → NULL | registry `guard_triggers = {usage_cost_events_no_mutation}`: `ALTER TABLE … DISABLE TRIGGER` → the one `UPDATE … SET profile_id = NULL WHERE profile_id = $1` → `ENABLE TRIGGER`, inside the execute transaction. Proven: T1d (rows kept, 2 severed, guard back in force). The FK's own SET NULL action would be blocked by the same trigger, which is why v2 failed — and why the FK rule on this table is a latent bug regardless of erasure. |
| `ai_runs` | `ai_runs_enforce_retention_classes` (allows `profile_id` / `output_excerpt`) | RETAIN, sever | existing `ai_runs_delink_subject(uuid)` RPC first (also nulls `output_excerpt`), then the registry `set_null` (finds nothing) |
| `privacy_consent_events`, `personal_data_disclosures` | `*_append_only` | PSEUDONYMISE (detach columns) | guard disabled around the one detach statement |
| event tables with NOT NULL actor columns (`agreement_events`, `booking_request_events`, `management_decision_events`, `performance_review_events`, `training_assignment_events`, `org_document_events`, `worker_document_events`, `team_enquiry_events`, `contact_disclosure_request_events`, `journal_entry_review_submissions`, `work_counterparty_links`, `commitment_override_receipts`, `identity_resolution_events`) | `*_append_only` / `*_immutable` | SEVER (NOT NULL) or NULL (nullable) | guard named per row; same mechanism |
| `timesheets` | `timesheets_frozen` (identity columns immutable) | SEVER `worker_id`, `created_by` | guard named |

Alternative considered and **not** chosen for v3: a narrow exemption inside each guard function (allow only "person column → NULL/sentinel, nothing else changed"), as `ai_runs_enforce_retention_classes` already does. It is cleaner (no DDL in the executor) but rewrites ~20 trigger bodies; it is listed as a follow-up the owner may prefer (§15 L-11).

---

## 7. Value rules — references the FK catalog cannot see

- `email_exact`: `lower(col) = any(subject e-mails)` where the e-mails are `auth.users.email` and `profiles.email`. `phone_exact`: digits-only equality with `profiles.phone`.
- `mention`: `col::text ILIKE '%<uuid>%'` or any `'%<e-mail>%'`; for jsonb the replacement is done on the text form and cast back, so structure is untouched. Names are **never** matched by text (false positives); name columns are scrubbed only as `scrub_columns` of an e-mail-matched row.
- `report_only` rows go into the receipt as counts. No value is ever returned by the plan or stored.
- The static guard (`privacy-erasure-registry-coverage.test.ts`) requires every `*email*`, `*phone*`, `contact_name`, `invited_name`, `full_name`, `person_label` column in any migration to have a value rule or an allowlisted reason. Today's allowlist: the subject's own `profiles.*`, scrub-handled siblings, the organisation's own published contact, and `customers.contact_name` (no e-mail to key on — §15 L-12).

---

## 8. Storage — owner_id and path prefix

`privacy_erasure_storage_scan_v3(profile, worker)` lists objects where `owner_id = <uid>` **or** the path matches the bucket's convention:

| Bucket | Path convention (from the bucket's RLS policy) | Scanned |
|---|---|---|
| `profile-avatars` | `<uid>/…` | yes |
| `journal-entry-photos` | `<uid>/<entry>/…` | yes |
| `customer-request-attachments` | `<uid>/…` | yes |
| `conversation-attachments` | `<conversation>/<uid>/…` | yes (segment 2) |
| `document-files` | `worker/<worker_id>/doc/…` | yes; `org/<org>/…` not scanned |
| `evidence-media` | `org/<org>/<sha256>.<ext>` | **no** — organisation evidence; the organisation is controller (`organization_evidence_media.imported_by_profile_id` is severed) |

While any object remains the plan refuses; the app deletes them through the Storage API (service role) and re-plans. Proven: T1a finds the owner-less avatar by prefix and the owned photo, and ignores the org evidence.

---

## 9. `auth.users` and `auth.audit_log_entries`

- `auth.users` is deleted **last**; GoTrue cascades identities, sessions, refresh tokens, MFA factors; `profiles` cascades the decided rows.
- `auth.audit_log_entries` (GoTrue's own log; payload names the actor id and address) is **retained** as security evidence and **counted** into the receipt (`report_only`). Rewriting auth-schema data is an auth-core change; whether to pseudonymise actor fields there, and the retention window, is §15 L-9.
- Backups: erased data persists in provider backups until rotation (window [NOT EVIDENCED] — state it in the Art. 12 reply, D11).

---

## 10. External processors

| Processor | What exists | v3 step | Who |
|---|---|---|---|
| **Stripe** (billing) | `billing_customers.provider_customer_id` per payer (`lib/billing/billing-subject.ts`); live customers exist in prod, 0 webhooks processed (memory 10-11b) | Before authorization the operator deletes the customer in Stripe (`DELETE /v1/customers/{id}` — Stripe keeps invoices/charges for its own legal retention and marks the customer deleted) **or** anonymises it (name/e-mail/phone/address/metadata cleared) when open invoices or an active subscription forbid deletion. The decision is passed as `external.stripe = "customer_deleted" | "customer_anonymised"`; without it `billing_*` refuse. The app wiring (a server action calling the Stripe API with `STRIPE_SECRET_KEY`) is a follow-up; today it is a manual dashboard step recorded in the DSR log. | Owner (Stripe dashboard) |
| **E-mail providers** (Resend / Postmark, `lib/email/transactional.ts`) | Transactional only; no marketing lists; `email_send_ledger_v1` stores `recipient_hash` (sha256) only | Nothing to suppress (no list). The provider keeps delivery logs (Resend: message data retained per its retention setting; Postmark: 45 days default) — named in the Art. 12 reply as processor retention. The hashed ledger stays. | — |
| **Gemini** (`ai_runs`, `usage_cost_events`) | Paid API; prompts are not used for training under the paid terms; abuse-monitoring logs are Google's, short-lived | No retention to clear on the provider side; locally `ai_runs_delink_subject` severs and clears excerpts; cost events retained severed. Stated in the reply. | — |
| **Nonstop Group** (staffing hand-off, `commercial_handoffs`) | A second controller | Art. 19 notification of the erasure to the recipient controller; the hand-off row is severed. | Owner |

---

## 11. Authorization token flow (single use, expiring, state-bound)

```
request (customer_requests, privacy_request_type = account_deletion)
  → superadmin review … status = approved (existing queue)
  → completion notice sent to the person (manual today; §13)
  → PLAN  privacy_erasure_plan_v3(request, external)         pure read
  → AUTHORIZE privacy_erasure_authorize_v3(request, admin, external)
        refuses unless external.notice = "sent" and the plan is executable
        token = 256 random bits (hex); stores sha256(token), request id,
        state fingerprint = md5(status | updated_at | profile_id | review log),
        plan digest = sha256(actions | retained), external, expires_at = now()+15 min
        returns the token ONCE
  → EXECUTE erase_user_account_v3(request, token, admin)
        UPDATE … SET consumed_at = now() WHERE digest = … AND request_id = … AND consumed_at IS NULL AND expires_at > now()
          (exactly one concurrent caller wins; forged / expired / reused / cross-request → one message)
        state fingerprint must match; plan recomputed, digest must match, must be executable → else refuse (token stays consumed)
        actions → delete auth.users → post-check → receipt
```

Why not reuse `confirmation_spends` (20261013120000): it is an INSERT-only spend ledger for **authenticated** callers' 5-minute conversation tokens (`spent_by = auth.uid()`), purged daily. Erasure needs a server-issued token bound to a request id, a state fingerprint and a plan digest, with an outcome and a receipt link, under `service_role` — the same digest-primary-key single-use pattern, a separate narrow table (`privacy_erasure_authorizations_v3`).

Proven: T2 (forged, consumed, expired, cross-request, state-drift, fresh-token-then-reuse).

---

## 12. The dry run never takes an exclusive lock

`privacy_erasure_plan_v3` is `STABLE` (PostgreSQL rejects writes inside it), runs only `SELECT count(*)` statements and catalog reads, performs no DDL and opens no subtransaction. Locks: `ACCESS SHARE` on the tables it counts — the same as any page read. The admin queue may call it on a GET. What it cannot do is prove that cascades will succeed; that is guaranteed instead by (a) the registry invariant (every FK decided, drift refused), (b) the pre-delete severance order, (c) the single execute transaction that turns **any** failure into a refusal with nothing changed (proven by the `LME03` post-check path and the failed-outcome record on the authorization).

---

## 13. Receipts and the notice to the person

`privacy_erasure_receipts_v3` (append-only, trigger-enforced): `request_id`, `authorization_id`, `erased_subject_id` (tombstone), `requested_at`, `executed_at`, `executed_by` (admin; SET NULL if the admin is later erased), `external` (stripe/notice decisions), `actions` (table, column, treatment, rows, legal basis, legal_review flag), `retained` (report-only counts). No e-mail, no name, no profile id, no object names. Proven: T4.

**Completion notice (Art. 12(1), SOP §5)** — sent **before** execution from `info@labourmarket.ai` because the address disappears; `external.notice = "sent"` is required by the authorize step. The reply states, from the plan: what is deleted (class by class), what is retained and under which Art. 17(3) ground and for how long (the registry `legal_basis` text per retained class — pseudonymised, never "anonymous"), which other controllers hold data (organisations; Stripe; Nonstop where a hand-off exists; e-mail provider logs), the backup window, the VDAI complaint right, and the tombstone id as the reference for future enquiries. **Deadline**: the queue computes the due date with `apps/web/lib/privacy/dsr-deadline.ts` (PR #2436: `dsrDueAtIso`, `dsrOverdue`, 30 days from receipt; extension is a human note). This design does not duplicate it; the receipt's `requested_at` / `executed_at` let the DSR log show that the reply went out inside the deadline.

---

## 14. Production runbook (after owner + lawyer approval)

1. **Approve**: owner signs §15 decisions (or defers them explicitly — a deferred decision keeps `legal_review = true` rows runnable only if the owner accepts the engineering basis for now). Lawyer initials the Art. 17(3) grounds per class.
2. **Apply**: Supabase MCP `apply_migration` with the exact file content of `20261016150000_privacy_erasure_executor_v3.sql` on the verified production project (never `supabase db push` / `prisma migrate deploy`; the ledger and filenames do not match). Record `APPLIED TO PROD: 20261016150000_privacy_erasure_executor_v3 (rollback: supabase/rollbacks/20261016150000_privacy_erasure_executor_v3.down.sql)`.
3. **Verify the apply** (MCP read queries, counts only):
   ```sql
   select count(*) from public.privacy_erasure_registry_v3;            -- expect 273 (271 FK columns from existing migrations + 2 executor rows)
   select count(*) from public.privacy_erasure_value_rules_v3;         -- expect 21
   select banned_until = 'infinity' from auth.users where id = public.privacy_erasure_sentinel_profile_id();
   select count(*) from public.workers where id = public.privacy_erasure_sentinel_worker_id();   -- 1
   select proname, prosecdef, provolatile from pg_proc where proname in ('privacy_erasure_plan_v3','privacy_erasure_authorize_v3','erase_user_account_v3');
   -- coverage against the LIVE catalog (must return 0 rows):
   select c.conrelid::regclass, a.attname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid in ('public.profiles'::regclass,'public.workers'::regclass)
      and not exists (select 1 from public.privacy_erasure_registry_v3 g where g.table_name = c.conrelid::regclass::text and g.column_name = a.attname);
   ```
   A non-empty last result means production has an FK the migrations do not declare: add the registry row (reviewed migration) before any erasure.
4. **Dry run on the open request** (filed 2026-10-14, due ≈ 2026-11-14): superadmin opens the request → "Plan" → reads refusals/actions (counts). Expected from the v2 footprint: `pilot_events` delete 58, consent pseudonymise 2, request row sever, 1 engagement context sever, `audit_logs.actor_id` NULL 1, normal cascades, 0 storage, 0 org links; plus any `usage_cost_events`/`ai_runs` rows.
5. **Storage**: if the plan lists objects, the superadmin clicks "Delete files" (Storage API, service role) and re-plans.
6. **Stripe**: if `billing_*` refuse, the owner deletes/anonymises the Stripe customer in the dashboard, records it in the DSR log, and the operator passes `external.stripe`.
7. **Notice**: the owner sends the completion notice (§13) and records `external.notice = "sent"`.
8. **Authorize**: the superadmin clicks "Request authorization" → the app shows the plan digest and keeps the token in the form for ≤ 15 minutes (never logged).
9. **Execute**: the superadmin clicks "Execute erasure" with the token → the receipt id and the tombstone are shown; the DSR log gets both; the request shows `closed`.
10. **Verify the erasure** (counts only): `select count(*) from auth.users where id = <uid>` → 0; `select count(*) from public.privacy_erasure_receipts_v3 where request_id = <request>` → 1; the registry post-check already ran inside the transaction.
11. **Art. 12 reply**: already sent (step 7); file the receipt id in the DSR log; set the queue entry to closed; note Art. 19 notifications (organisations, Nonstop if any).
12. **Who clicks**: steps 4, 5, 8, 9 — a superadmin in the admin queue (app wiring is the follow-up PR; until then the same RPCs run via MCP by the owner, counts only, token never pasted into a chat); steps 6, 7 — the owner; step 1 — owner + lawyer.

---

## 15. DECISIONS REQUIRING LEGAL REVIEW

| # | Decision | Default shipped in the draft (engineering) | Registry row(s) |
|---|---|---|---|
| L-1 | **Journal free text**: keep `original_text` (+ extractions, metrics, work items) under the sentinel as employer working-time evidence, or remove free text and keep only structured facts? | kept; counted (`report_only`) | `journal_entries.worker_id` (`scrub_columns` empty), value rule `journal_entries.original_text` |
| L-2 | **Working-time retention period and basis** per jurisdiction (LT Darbo kodeksas; NO arbeidsmiljøloven; others) for journal, timesheets, allocations, work plans, assignments | sever + retain indefinitely until a period is named | all rows marked "working-time" |
| L-3 | **Confirmations by an erased confirmer**: may a journal confirmation / document verification / skill verification still read as confirmed when the confirmer is the sentinel or NULL? | kept as confirmed, identity severed/NULL | `journal_entry_confirmations.confirmer_id`, `worker_skills.verified_by`, `worker_documents.verified_by`, `performance_reviews.manager_input_by` |
| L-4 | **Message bodies** (`conversation_messages.body`) and the person's uploaded attachments for the counterparty: retain for 36 months (matrix) with the author severed, or scrub bodies? | retained, author severed; bodies counted | `conversation_messages.author_id`, `conversation_message_attachments.uploader_id`, value rule `conversation_messages.body` |
| L-5 | **Billing**: confirm the 10-year accounting basis for `billing_subscriptions` / `billing_checkout_operations` (severed) and that the Stripe mapping row may be deleted after the processor-side action; confirm Stripe delete vs anonymise policy | sever; mapping deleted; `external.stripe` required | `billing_*` |
| L-6 | **Consent and disclosure ledgers**: detach to a per-erasure tombstone (pseudonymised) and keep 6 years — confirm the basis and the period | detach, keep | `privacy_consent_events.user_id`, `personal_data_disclosures.*` |
| L-7 | **Audit payload scrub-in-place** (`audit_logs.payload`, `payment_webhook_events.payload`): is replacing the id/e-mail inside retained audit evidence acceptable, or must payloads stay byte-identical with the identifier? | replaced in place | value rules `audit_logs.payload`, `payment_webhook_events.payload` |
| L-8 | **Organisation-supplied history about the person** (`talent_source_records`, `evidence_import_rows.person_label`, `organization_people`, D9): the organisation is controller — which Art. 14/17 path applies to a person who also had an account? | severed / counted only | `talent_source_records.subject_profile_id`, value rules |
| L-9 | **`auth.audit_log_entries`**: retention window of the GoTrue security log and whether actor fields are pseudonymised (an auth-core change) | retained, counted | value rule `auth.audit_log_entries.payload` |
| L-10 | **Recognition and review records about the person** (`competency_recognitions.subject_profile_id`, `experience_records.subject_profile_id`, `education_cohort_members`): retain severed as the assessor's/organisation's record, or delete as the person's data? | severed | those rows |
| L-11 | **Guard mechanism**: accept "disable the named trigger around one statement in the execute transaction", or require narrow shape exemptions inside each guard function (no DDL in the executor)? | disable-around-one-statement | `guard_triggers` on 20 rows |
| L-12 | `customers.contact_name`, `leads` (CRM), `lmc_transactions.recipient_email_at_grant`, `company_need_public_intakes`: pseudonymise vs delete; retention of commercial contact records after an objection | pseudonymise | value rules |
| L-13 | `worker_display_name_backfill_20260805`: drop the one-off backfill table (names without an FK) | untouched (not reachable) | none |
| L-14 | **Completion notice channel and wording** (sent before execution; tombstone as reference); backup window statement (D11) | manual from `info@`; `external.notice` required | authorize step |
| L-15 | **Who may authorize and execute** (two different superadmins, or the same?); whether the owner must be one of them | one superadmin may do both; both ids recorded | `issued_by`, `executed_by` |

Until L-1…L-15 are signed, the migration is NOT applied. Rows with `legal_review = true` (31 FK rows + 12 value rules) are runnable by the engineering default only because the owner's apply decision covers the registry as a whole; a different answer is a one-row registry change in a reviewed migration.

---

## 16. Engineering follow-ups (separate PRs, after the gate)

- Admin queue: replace #2426's typed-word UI with Plan → Delete files → Request authorization → Execute (token held in the form, never logged); show refusals/actions as counts; show the due date from `dsr-deadline.ts`.
- Stripe server action (delete or anonymise the customer; records the outcome; passes `external.stripe`).
- Exclude the sentinel everywhere people are listed or counted (`privacy_erasure_is_sentinel`).
- Guard tests: `privacy-erasure-registry-coverage.test.ts` is in this PR; add the migration-count pins and the service-role caller inventory entries when the app wiring lands.
- Narrow guard exemptions (L-11) if the owner prefers them to DISABLE TRIGGER.
- Fix the latent `usage_cost_events.profile_id ON DELETE SET NULL` vs trigger contradiction independently of erasure.

---

## 17. Test evidence (local PostgreSQL 16, throwaway cluster, schema mirroring production shapes)

`node apps/web/scripts/db-proof/privacy-erasure-v3-local.mjs` — 71 checks, all pass (output in the PR body):

| Case | What is proven |
|---|---|
| apply | 273 registry rows, 21 value rules; sentinel auth user + profile + worker, banned forever |
| T1a | refuses while files remain (owner-less avatar found by prefix, owned photo found, org evidence ignored) and while `external.stripe` is missing (`billing_customers`, `billing_subscriptions` named) |
| T1b | with files gone and the Stripe decision: executable; plan names journal sever (2), engagement context sever, confirmation sever, `usage_cost_events` NULL (2), `ai_runs` NULL, consent pseudonymise (2), disclosure pseudonymise, billing delete/sever, request sever, worker cascade, invitation pseudonymise, waitlist delete, audit/webhook mention replacement; `auth.audit_log_entries` counted; the dry run changed nothing; the plan function is STABLE |
| T1c | authorization refused until the notice is recorded; token issued once; only its sha256 stored |
| T1d | execute: auth user and profile gone; journal rows retained under the sentinel; engagement labels scrubbed; both confirmations survive; `usage_cost_events` retained and severed with the guard back in force; `ai_runs` delinked; consent ledger pseudonymised (one tombstone) with the guard back; disclosure pseudonymised; Stripe mapping deleted, subscription retained; invitation pseudonymised; waitlist deleted; audit and webhook payloads no longer name the person; request row closed/severed/scrubbed; the other person untouched; authorization outcome `erased` |
| T2 | forged, already-consumed, expired, cross-request and state-drifted tokens refused; a fresh token executes; the same token again is refused |
| T3 | an FK added after seeding is refused **by name with zero rows**; no token can be issued; a registry row makes it executable; a changed live rule is refused as drift |
| T4 | two receipts; none contains the id, e-mail, name or phone; authorization rows hold neither identifiers nor the raw token; receipts are append-only; receipts list treatments and legal basis |
| RB | rollback with receipts: refused, nothing changed; on a clean database: everything removed, NOT NULL restored, migration re-applies |

`node .github/scripts/migration-safety.mjs` (BASE_SHA=origin/main): STRUCTURAL-GREEN, RISK-ACKNOWLEDGED — 10 findings bypassed by the annotation (auth-core, security definer, grants, drop-not-null, DML, dynamic SQL, create/disable trigger; the "set-role" notice is a false positive on `set role = null` in the sentinel profile upsert). The annotation is an acknowledgement, not an approval.
