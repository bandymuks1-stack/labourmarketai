# GDPR erasure inventory — LabourMarket.ai production (gorgitwvdzxbnaxhrsrw)

Measured 2026-10-15, read-only (catalog + COUNT queries only; no personal values read).
Repo: `origin/main` @ 063f864fb. Context: draft PR #2412 `erase_user_account_v1`.

Legend — FK delete rule: `c` CASCADE, `n` SET NULL, `a` NO ACTION, `r` RESTRICT.
Registry (`apps/web/lib/privacy/personal-relations.ts`): **E** exported, **W** withheld,
**A** actor-only, **C** child-not-exported, **R** root, **NP** non-product, **—** NOT in registry.

---

## 0. Headline facts

| Fact | Value |
|---|---|
| auth.users / profiles / workers | 113 / 113 / 112 (every worker has a profile) |
| FKs onto `public.profiles` with NO ACTION/RESTRICT | **66** (62 NO ACTION, 4 RESTRICT) on 56 tables |
| …of those, NOT NULL columns | 41 (cannot be "nulled" without a schema change or a sentinel profile) |
| …of those with at least one referencing row today | 24 FKs |
| Profiles whose `auth.users` delete would fail **today** (upper bound*) | **81 / 113** |
| …excluding `pilot_events` | 19 |
| Profiles blocked only by `privacy_consent_events` (what #2412 fixes) | 29 |
| Tables with append-only / immutability triggers that block DELETE and/or UPDATE | 24 (see §3.2) |
| Storage buckets (all private) | 6; objects in 2 (`profile-avatars` 25, `journal-entry-photos` 16) |

\* Counted as "has any row in a NO ACTION/RESTRICT child, or a cascade into an append-only
table". NO ACTION only fires if the referencing row SURVIVES the statement, so rows that the same
delete also cascades away (e.g. `worker_absences.requested_by = self`, which goes via
`worker_id → workers` CASCADE) don't actually block. RESTRICT is checked immediately and is not
saved by a cascade in the same statement. So 81 is an upper bound. The dominant blocker is
`pilot_events.profile_id` (9,894 rows, 77 profiles).

### Critical findings for #2412 as drafted

1. **The cascade itself hits append-only tables.** Deleting `profiles` cascades into tables whose
   BEFORE DELETE trigger raises, and the cascade fails. The PR handles this only for
   `privacy_consent_events` (it detaches the rows) and refuses on `personal_data_disclosures`
   (it raises). The same failure comes from:
   - `engagement_lifecycle_events` (11 rows, `engagement_lifecycle_events_append_only`), reached via
     `engagement_contexts.profile_id` CASCADE → `engagement_context_id` CASCADE. Affects 2 profiles today.
   - `timesheet_events` (6 rows, `timesheet_events_append_only`), reached via `timesheets.created_by`
     CASCADE and `timesheets.worker_id` CASCADE. Affects 2 profiles.
   - `workflow_transitions` (4 rows, `workflow_transitions_append_only`), reached via
     `workflow_instances.requester_profile_id` CASCADE. Affects 1 profile.
   - Latent (0 rows today): `agreement_amendments` / `agreement_events` (via `agreements.created_by`
     c), `business_trip_events` (via `business_trips` c), `performance_review_events` (via
     `performance_reviews` c ×3), `training_assignment_events` (via `training_assignments` c ×2),
     `contact_disclosure_request_events` (via `contact_disclosure_requests` c),
     `management_decision_events` (via `management_decisions.created_by` c), `procurement_events`
     (via `procurement_inquiries` c ×2), `commitment_override_receipts.worker_id` c.
   - **SET NULL into immutable tables fails too.** RI SET NULL runs an UPDATE, and BEFORE UPDATE
     guards fire on it: `usage_cost_events.profile_id` (n; `usage_cost_events_no_mutation`;
     0 linked rows today), `commitment_override_receipts.decided_by` (n; immutable),
     `organization_facts.recorded_by` (n; the guard rejects a `recorded_by` change).
2. **`work_hour_allocations` has RESTRICT on both `entered_by` and `worker_id`.** One profile
   cannot be erased at all until working-time records get a detach design.
3. **The detached consent row is PSEUDONYMISED, not anonymous.** It keeps a per-subject random
   uuid (`erased_subject_id`), so all of one person's rows stay linkable to each other. It also
   keeps `created_at`, `request_id`, `context_id`, `metadata`, `locale` and `source`, any of which
   can re-link the row through surviving tables (`customer_requests`, `audit_logs`, backups). The
   migration comment says the row "no longer names a person". That is true literally, but it must
   not be read as "anonymous": GDPR Recital 26 still treats this as personal data. Today all
   40 rows have `context_type` NULL, no recipient org and NULL `selected_fields`, so the practical
   risk is low. The wording should still say "pseudonymised".
4. **The privacy request record is destroyed by the erasure it documents.**
   `customer_requests.profile_id` is CASCADE (1 privacy request in prod), but
   `deletion-process-design-v1.md` E4 says the request is kept 3 years for Art. 12-22 defence.
   It needs a detach before the auth delete.
5. **`journal_entries.worker_id` is NOT NULL + CASCADE.** Design step E1 ("detach worker_id, keep
   aggregate") can't run on the current schema. The account delete simply DELETES all 155
   journal entries' worth of free text for the person, which also breaks the `hash_prev/hash_self`
   chain for nobody else (each chain is per worker). E1 and the retention matrix disagree with
   what the cascade actually does.
6. **Storage objects are not FK-linked.** `storage.objects.owner_id` has no FK to auth.users.
   Deleting the user leaves avatar files (25 objects; only 21 profiles carry `avatar_url`, so at
   least 4 are already stale) and journal photos (16) orphaned. Design step E5 must run before E7.
   Some Supabase versions also refuse to delete a user who still owns objects; verify this against
   the target project.
7. **`audit_logs` is registered as ACTOR_ONLY, but its payload holds subject identifiers.** The
   `payload` jsonb keys include `display_name` (22 rows), `profile_id` (11), `worker_profile_id`
   (3), `invited_profile_id` (1), `owner_profile_id` (8), `worker_id` (86), `confirmed_by` (589)
   and `before`/`after` (96). `actor_id` SET NULL leaves all of that in place. After erasure these
   rows are neither anonymous nor clean.

---

## 1. Inventory — public tables holding data about a natural person

Row counts are exact `count(*)`. Categories: ID identity · CT contact · WH work history ·
FT free text · LOC location · DOC documents/media · FIN financial · SC special-category or
high-risk (health / ID document / absence reason / performance) · TEC device/analytics.

### 1a. Roots and the person's own data (most cascade from profiles/workers)

| Table | Link → person (rule) | Rows | Categories | Reg |
|---|---|---:|---|---|
| profiles | id → auth.users (c) | 113 | ID CT (full_name, email, phone) FT (profile_text) DOC (avatar_url) LOC (country) | R |
| workers | profile_id (c) | 112 | ID (display_name) FT (headline, bio, availability_note) LOC FIN (salary_min/max) SC-adjacent (driving licence) | R |
| profile_roles | profile_id (c) | 117 | ID | E |
| account_classifications | profile_id (c), decided_by (n) | 69 | ID | E |
| consents | profile_id (c) | 0 | consent | E |
| privacy_consent_events | user_id (c) + append-only | 40 | consent proof, TEC | E |
| personal_data_disclosures | worker_user_id (c), disclosed_by (a) + append-only | 0 | disclosure log | E |
| email_verifications_v1 | profile_id (c) | 70 | CT (email) | W |
| email_verification_requests_v1 | profile_id (c) | 0 | CT | W |
| notification_preferences | profile_id (c) | 0 | prefs | E |
| notification_events | recipient_profile_id (c) | 229 | TEC; metadata keys: conversationId, title, country, vacancyId | E |
| preferred_locations | profile_id (c) | 2 | LOC FT | E |
| consented_login_location_signals | profile_id (c) | 1 | LOC (city) | E |
| platform_capability_grants | profile_id (c), granted_by/revoked_by (n) | 1 | ID FT | E |
| profile_skill_claims | profile_id (c) | 44 | WH | E |
| candidate_skills | profile_id (c) | 0 | WH FT (original_text) | E |
| skill_candidate_clarifications | profile_id (c) | 27 | WH | E |
| worker_education | profile_id (c) | 31 | WH FT | E |
| worker_achievements | profile_id (c) | 27 | WH FT | E |
| worker_languages / worker_professions / worker_skills | worker_id (c) | 32 / 159 / 166 | WH | E |
| worker_external_profiles | worker_id (c) | 1 | ID CT (links) | E |
| worker_saved_opportunities / worker_saved_searches | worker_id (c) | 3 / 0 | behaviour FT | E |
| worker_opportunity_seen | profile_id (c) | 71 | TEC | E |
| first_party_supply_declarations | profile_id (c) | 1 | WH, authorities | E |
| education_cohort_members | profile_id (c) | 4 | WH | E |
| journal_entries | worker_id (c, NOT NULL), hash-chained | 155 (8 soft-deleted) | WH **FT original_text** LOC (via project) | E |
| journal_entry_skills / _work_items | worker_id (c) | 222 / 0 | WH | E |
| journal_entry_metrics / _extractions / _tasks | entry_id (c via journal) | 898 / 0 / 0 | WH FT (value_text, raw_response) | E (chained) |
| journal_entry_photos | profile_id (c) | 16 | DOC (photos; may show faces/places) | E |
| journal_entry_confirmations | confirmer_id (a) [about another worker's entry] | 42 | WH attestation | E |
| journal_entry_review_submissions | submitted_by (a), worker_id (a) + append-only | 0 | WH | E |
| worker_documents | worker_id (c) | 1 | **DOC SC** (ID docs/certs; file_path, reviewer_note) | E |
| document_files | worker_document_id (c), uploaded_by (a) | 0 | DOC | E (chained) |
| worker_absences | worker_id (c), requested_by/reviewed_by (a) | 10 | **SC** (absence type/reason note) | E |
| timesheets / timesheet_events | worker_id (c) / via timesheet + append-only | 2 / 6 | WH FIN-adjacent | E |
| work_hour_allocations | worker_id (**r**), entered_by (**r**) | 5 | WH FIN-adjacent FT | E |
| work_plan_entries | worker_id (c) | 10 | WH FT | E |
| business_trips (+events) | profile_id/created_by (c) | 0 | LOC WH | E |
| engagement_contexts (+lifecycle events) | profile_id (c) | 226 / 11 | WH FT | E |
| company_memberships | profile_id (c) + last-owner guard | 53 | ID WH | E |
| company_workers / company_worker_engagements / agency_workers | worker_id (c/n) | 10 / 3 / 0 | WH | E |
| project_members / project_worker_assignments | profile_id/worker_id (c) | 0 / 8 | WH | E |
| project_worker_readiness_items / _operational_statuses | worker_id (c), updated_by (a) | 14 / 0 | WH FT | E |
| commitment_override_receipts | worker_id (c), decided_by (n) + immutable | 0 | WH | E |
| asset_assignments | worker_id (n), issued_by (a) | 0 | WH FT | E |
| agreements (+events, amendments) | worker_id (n), created_by (c) | 0 | WH contract | E |
| booking_requests (+events, _seen) | worker_id/owner_id (c) | 7 / 27 / 10 | WH FT (note, reason_note) | E |
| demand_interest_signals / demand_shortlist | worker_id (c) | 14 / 4 | WH FT (employer notes in shortlist) | E / W |
| commercial_handoffs / matches / match_actions | worker_id (c) / actor (n) | 2 / 0 / 0 | WH | E |
| agency_candidate_offers | worker_id (c), created/decided/withdrawn_by (n) | 14 | WH FT | E |
| contact_disclosure_requests (+events) | worker_id/owner_id (c) | 0 / 0 | CT | E |
| invitations | inviter (c), accepted_by_profile_id (a) | 79 | **CT (invited_email 72, invited_name)** FT (personal_message) consent_record | E (inviter side only) |
| invitation_acceptances | profile_id (c) | 46 | WH | E |
| company_worker_invitations / agency_worker_invitations | inviter (a) | 12 / 0 | CT (invited_email of a third party) | E |
| experience_records / experience_responses | subject/author (c) | 2 / 1 | FT (reviews about a person) | E |
| performance_reviews (+events) | subject/reviewer/created_by (c), manager_input_by (a) | 0 | **SC (performance) FT** | E |
| competency_recognitions | subject (c), assessed_by (**r**) | 1 | WH FT | E |
| training_assignments (+events) | assignee/assigned_by (c) | 0 | WH | E |
| document_acknowledgements | assignee (c), acknowledged_by/assigned_by (a) | 0 | WH (OHS proof) | E |
| work_tasks / work_task_events / work_objects | assignee (n), created_by (c) | 3 / 4 / 230 | WH FT LOC (work_objects address, lat/lng) | E |
| defects / defect_corrections | assignee (n), reporter/reviewer (a) | 0 | FT | E / A |
| onboarding_runs, _run_items / offboarding_runs, _run_items | started_by/completed_by (a) | 0 | WH | E / A |
| follow_up_tasks | subject (c), created_by (a) | 0 | FT | E |
| learning_signals / learning_review_queue | subject_worker_id (c) | 0 / 0 | WH inference | E |
| management_decisions / employee_requests / procurement_inquiries / workflow_instances (+steps, approvers, transitions) | responsible/requester (c/n) | 0/0/0/1 (+1/1/4) | WH FT payload | E |
| service_offerings / service_offering_requests (+_seen) | provider/buyer (c) | 14 / 13 / 9 | FT (message) FIN (rate_text) | E |
| marketplace_listings / proposals / contracts / team_enquiries / company_demand_locations | owner_id (c) | 13 / 0 / 0 / 0 / 2 | FT LOC (lat/lng) | E |
| candidate_drafts | owner (c), linked_profile_id (n) | 2 | FT (skills_text, notes) about a candidate | E |
| organizations / companies / agencies | owner_profile_id / profile_id (n) | 50 / 25 / 3 | org data; companies has contact_email/phone/address (may be a sole trader = natural person) | E / W / W |
| customers / customer_requests / customer_request_attachments | profile_id (c) | 0 / 33 / 0 | FT payload; **privacy request row lives here** | W |
| billing_customers / billing_subscriptions / billing_checkout_operations / subscriptions | owner_id/profile_id (c) | 3 / 0 / 3 / 0 | **FIN** (provider ids) | E |
| lmc_accounts / lmc_transactions / lmc_lots / lmc_lot_consumptions | profile_id (**r**), actor (**r**) + immutable | 0 | **FIN** CT (recipient_email_at_grant) | E |
| usage_cost_events | profile_id (n) + immutable | 382 (0 linked) | FIN TEC | E |
| ai_runs | profile_id (n) + retention trigger | 418 (0 linked) | FT (output_excerpt), TEC | E (rpc) |
| market_intelligence_insight_queries | profile_id (n) | 20 | behaviour | E |
| pilot_participants / pilot_drafts / pilot_outcomes / pilots | profile_id (c) / participant (a) | 0 / 0 / 0 / 0 | FT payload | E / W / E / A |
| pilot_events | profile_id (a) | 13,364 (9,894 linked, 77 profiles) | **TEC** (session_id, route, utm, referrer, organization_id, ref_id) | E |
| language_feedback | user_id (a) | 0 | FT | E |
| assistant_conversations | owner_id (c) | 16 | FT (title) | W |
| conversations / conversation_participants / conversation_messages / conversation_message_attachments | created_by (a) / profile_id (c) / author_id (a) / uploader (c) | 10 / 19 / 65 / 0 | **FT (body)** DOC | W |
| education_cohorts / education_programs | created_by (n) | 6 / 2 | org | A |
| platform_skill_aggregates | none (aggregate, sample_size) | 0 | aggregate — check k-threshold | — (not personal if k≥5) |

### 1b. Person data reachable only through a parent row or a non-FK column

| Table | Link | Rows | Categories | Reg |
|---|---|---:|---|---|
| assistant_messages | conversation_id → assistant_conversations (owner cascade); hash-chained (prev_hash/content_hash) | 166 (91 user turns) | **FT original_text** | **—** |
| assistant_message_attachments | message_id → assistant_messages | 0 | DOC (storage_path) | **—** |
| audit_logs | actor_id (n); **payload jsonb carries profile_id / display_name / worker_id / invited_profile_id / confirmed_by** | 1,097 (953 with actor) | ID TEC | A (wrong — see §4) |
| historical_consolidation_decisions | decided_by/reverted_by (n) | 180 | FT original_text (copied project/work text) | A (questionable) |
| evidence_import_events / evidence_import_sessions | actor (n) | 261 / 9 | payload (counts only seen), FT notes | A |
| email_send_ledger_v1 | recipient_hash (no FK) | 0 | CT pseudonymous (email hash) | **—** |
| payment_webhook_events | none; payload jsonb (Stripe objects carry customer email/name) | 0 (Stripe live, 0 webhooks) | FIN CT | **—** |
| worker_display_name_backfill_20260805 | profile_id (no FK) | 22 | ID (display_name before/after, country) | NP (should be purged, see §4) |
| company_need_public_intakes | none (contact_email, contact_phone, contact_name) | 6 | CT FT LOC | W |
| leads / waitlist | none (email, full_name) | 0 / 3 | CT | W |
| project_clients / agency_clients | none (name, contact_email) | 4 / 0 | CT (client contact person) | W |

### 1c. Organization-provided history about a person (may have no account) — see §3.3

| Table | Link | Rows | Categories | Reg |
|---|---|---:|---|---|
| organization_people | linked_profile_id (n), linked_worker_id (n), created_by/linked_by (n) | 43 (2 linked) | ID (display_name, normalized_name, external_ref) FT (source_note) | E |
| organization_evidence_records | organization_person_id (a), supplied_by/imported_by (n); hash-chained | 2,944 (2,630 on unlinked people; all have original_text) | WH FT; **source_fact jsonb has `Person` (158), `addresses` (54), `assignment_note`, `allocation_note`** | E |
| organization_evidence_events | record (c), actor (n) | 158 | FT note | E |
| organization_evidence_competency_signals | record (c) | 1,094 | WH inference | E |
| organization_evidence_media | organization_person_id (a), imported_by (a) | 0 | DOC (photos) | W |
| evidence_import_rows | organization_person_id (n) | 2,967 (all with person_label + activity_text) | ID (person_label) FT customer_* | E (rpc, unapplied) |

### 1d. Storage buckets (all `public = false`)

| Bucket | Objects | Bytes | Person link | Erasure path today |
|---|---:|---:|---|---|
| profile-avatars | 25 | 5.9 MB | owner_id (no FK) / `profiles.avatar_url` (21 set) | **none** — orphaned on auth delete; ≥4 already stale |
| journal-entry-photos | 16 | 15.2 MB | `journal_entry_photos.storage_path` (profile c) | **none** — row cascades, object stays |
| conversation-attachments | 0 | 0 | conversation_message_attachments | — |
| customer-request-attachments | 0 | 0 | customer_request_attachments | — |
| document-files | 0 | 0 | document_files (worker/org documents) — **SC risk (ID docs)** | — |
| evidence-media | 0 | 0 | organization_evidence_media | — |

Note: `worker_documents.file_path` (1 row, NULL today) and `assistant_message_attachments.storage_path`
have no matching bucket listed. Confirm where those paths would point before files exist.

---

## 2. The 66 NO ACTION / RESTRICT FKs onto profiles — erasure treatment

Shared rules:

- **RETAIN** always means RETAIN-**PSEUDONYMISED**. The actor id is replaced, but the row keeps
  timestamps, its parent ids and often free text, so it stays linkable. It must never be described
  as anonymous.
- **REASSIGN** = the record belongs to an organization and the person only authored it. Replace
  the id with a **single shared sentinel "erased person" profile**, or NULL where the column is
  nullable. A shared sentinel removes linkability *between* erasures. A per-subject random uuid
  (the #2412 pattern) keeps one subject's rows linkable: that is pseudonymisation.
- 41 of the 66 columns are NOT NULL, so NULL needs a schema change. A sentinel needs an
  `auth.users` row, because `profiles.id → auth.users` exists. Pick one approach.
- **No FK qualifies as ANONYMISE.** Every child row keeps context ids (project, organization,
  engagement, parent) and timestamps, and many keep free text.
- `†` = table has an append-only / immutable trigger. The replacement needs a sanctioned,
  subject-scoped bypass (the #2412 `lm.privacy_erasure_subject` GUC pattern), because the plain
  UPDATE raises.
- `FT⚠` = free text on the row may itself name or describe the person, so "detached" is not
  "anonymised".

| # | Child.column (constraint) | Rule | NN | Rows nonnull / distinct | Treatment | Basis / note |
|---:|---|:-:|:-:|---|---|---|
| 1 | agency_worker_invitations.inviter_profile_id (`agency_worker_invitations_inviter_profile_id_fkey`) | a | Y | 0 | REASSIGN (DELETE if still pending) | agency's record; invited_email is a third party's data FT⚠ note |
| 2 | agreement_events.actor_id (`agreement_events_actor_id_fkey`) † | a | Y | 0 | RETAIN | contract evidence, claim horizon (Package A D1), 6(1)(f)/17(3)(e); before/after_state jsonb FT⚠ |
| 3 | asset_assignments.issued_by (`asset_assignments_issued_by_fkey`) | a | Y | 0 | REASSIGN | org asset register; condition/note FT⚠ |
| 4 | assets.created_by (`assets_created_by_fkey`) | a | Y | 0 | REASSIGN | org record |
| 5 | booking_request_events.actor_id (`booking_request_events_actor_id_fkey`) | a | Y | 27 / 6 | RETAIN | other party's booking history (claim horizon); reason_note FT⚠, previous_terms jsonb |
| 6 | business_trip_events.actor_profile_id (`business_trip_events_actor_profile_id_fkey`) † | a | N | 0 | RETAIN | travel/expense record of the traveller (tax/expense evidence); note FT⚠ |
| 7 | company_worker_invitations.inviter_profile_id (`company_worker_invitations_inviter_profile_id_fkey`) | a | Y | 12 / 8 | REASSIGN (DELETE if pending) | company's record; invited_email = third party |
| 8 | competency_recognitions.assessed_by (`competency_recognitions_assessed_by_fkey`) | **r** | Y | 1 / 1 | RETAIN | the SUBJECT's recognition (their legitimate interest); assessor_organization_id keeps provenance; note/revoked_reason FT⚠ |
| 9 | contact_disclosure_request_events.actor_profile_id (`contact_disclosure_request_events_actor_profile_id_fkey`) † | a | Y | 0 | RETAIN | disclosure accountability Art. 5(2), 6(1)(c) |
| 10 | conversation_messages.author_id (`conversation_messages_author_id_fkey`) | a | Y | 65 / 9 | **DELETE content** (null body + translated_text, author → sentinel, keep "message removed" shell) | detaching the author alone leaves body FT⚠ that the other party can read and attribute: false anonymisation. Apply a legal-hold exception per conversation if a dispute exists |
| 11 | conversation_participants.added_by (`conversation_participants_added_by_fkey`) | a | N | 19 / 7 | REASSIGN (NULL) | membership metadata |
| 12 | conversation_participants.revoked_by (`conversation_participants_revoked_by_fkey`) | a | N | 0 | REASSIGN (NULL) | — |
| 13 | conversations.created_by (`conversations_created_by_fkey`) | a | Y | 10 / 7 | REASSIGN (DELETE thread if no surviving participant) | subject text FT⚠ |
| 14 | defect_corrections.reviewer_id (`defect_corrections_reviewer_id_fkey`) | a | Y | 0 | REASSIGN | org quality record |
| 15 | defects.reporter_id (`defects_reporter_id_fkey`) | a | Y | 0 | REASSIGN | description/location FT⚠ |
| 16 | document_acknowledgements.acknowledged_by (`document_acknowledgements_acknowledged_by_fkey`) | a | N | 0 | RETAIN | OHS / instruction-acknowledgement proof, 6(1)(c). **Conflict:** `assignee_profile_id` is CASCADE, so erasing the assignee silently deletes the proof the employer may be obliged to keep |
| 17 | document_acknowledgements.assigned_by (`document_acknowledgements_assigned_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 18 | document_files.uploaded_by (`document_files_uploaded_by_fkey`) | a | Y | 0 | REASSIGN | the person's own worker_document files go via worker_document_id CASCADE (plus storage delete) |
| 19 | engagement_lifecycle_events.actor_profile_id (`engagement_lifecycle_events_actor_profile_id_fkey`) † | a | N | 11 / 1 | RETAIN | engagement record (D1 horizon); note/metadata FT⚠. Also the cascade-DELETE blocker (§0.1) |
| 20 | follow_up_tasks.created_by (`follow_up_tasks_created_by_fkey`) | a | Y | 0 | REASSIGN | org CRM; note FT⚠ |
| 21 | invitations.accepted_by_profile_id (`invitations_accepted_by_profile_id_fkey`) | a | N | 47 / 9 | **DELETE** the erased invitee's personal fields (invited_email, invited_name, personal_message, external_reference, declared_context), or the whole row | the row is ABOUT the erased person. Keep `consent_record` only if it is the sole consent proof (then pseudonymise it like PCE) |
| 22 | journal_entry_confirmations.confirmer_id (`journal_entry_confirmations_confirmer_id_fkey`) | a | Y | 42 / 6 | RETAIN | another worker's evidence ("confirmed by manager"), their 6(1)(f) interest; keep confirmer_role + engagement org; confirmation_scope jsonb |
| 23 | journal_entry_review_submissions.submitted_by (`journal_entry_review_submissions_submitted_by_fkey`) † | a | Y | 0 | DELETE (own submission) / REASSIGN (if submitted for someone else) | worker_id is also NO ACTION; the append-only DELETE guard needs a sanctioned bypass |
| 24 | language_feedback.user_id (`language_feedback_user_id_fkey`) | a | N | 0 | DELETE | product feedback, no retention need; comment/selected_text FT⚠ |
| 25 | lmc_accounts.profile_id (`lmc_accounts_profile_id_fkey`) † | **r** | N | 0 | RETAIN | credit ledger; accounting law if monetary (Package A D2, 10y LT); immutable, so a ledger-level detach design is needed |
| 26 | lmc_transactions.actor_profile_id (`lmc_transactions_actor_profile_id_fkey`) † | **r** | N | 0 | RETAIN | as #25. **`recipient_email_at_grant` is plain e-mail: hash or null it** (immutable trigger forbids today) |
| 27 | management_decision_events.actor_id (`management_decision_events_actor_id_fkey`) † | a | Y | 0 | RETAIN | org governance trail, 6(1)(f); metadata FT⚠ |
| 28 | market_rate_averages.entered_by (`market_rate_averages_entered_by_fkey`) | a | Y | 0 | REASSIGN | reference data |
| 29 | offboarding_run_items.completed_by (`offboarding_run_items_completed_by_fkey`) | a | N | 0 | REASSIGN | — |
| 30 | offboarding_runs.started_by (`offboarding_runs_started_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 31 | onboarding_run_items.completed_by (`onboarding_run_items_completed_by_fkey`) | a | N | 0 | REASSIGN | — |
| 32 | onboarding_runs.started_by (`onboarding_runs_started_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 33 | org_document_events.actor_id (`org_document_events_actor_id_fkey`) | a | Y | 0 | REASSIGN | before/after jsonb FT⚠ |
| 34 | org_documents.created_by (`org_documents_created_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 35 | org_documents.responsible_profile_id (`org_documents_responsible_profile_id_fkey`) | a | N | 0 | REASSIGN (NULL) | counterparty_name/description FT⚠; `worker_id` is also NO ACTION onto workers |
| 36 | organization_evidence_media.imported_by_profile_id (`organization_evidence_media_imported_by_profile_id_fkey`) | a | Y | 0 | REASSIGN | org is controller of its own evidence |
| 37 | performance_review_events.actor_id (`performance_review_events_actor_id_fkey`) † | a | Y | 0 | RETAIN | employment record of the reviewed worker (employer controller) |
| 38 | performance_reviews.manager_input_by (`performance_reviews_manager_input_by_fkey`) | a | N | 0 | PSEUDONYMISE (NULL id) | manager_input FT⚠ authored by the erased manager stays (employer's record). **Cascade conflict:** erasing the SUBJECT deletes the review, and the delete fails on its append-only events |
| 39 | personal_data_disclosures.disclosed_by (`personal_data_disclosures_disclosed_by_fkey`) † | a | Y | 0 | RETAIN | Art. 5(2)/30 accountability, 6(1)(c). #2412 currently refuses (raises) instead of detaching |
| 40 | pilot_events.profile_id (`pilot_events_profile_id_fkey`) | a | N | **9,894 / 77** | **DELETE** the person's rows | analytics, 6(1)(f) yields to Art. 17/21. NULLing profile_id is NOT anonymisation: session_id, organization_id, ref_id, utm_*, referrer and timestamps re-link. **Biggest single blocker** |
| 41 | pilot_outcomes.noted_by (`pilot_outcomes_noted_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 42 | pilot_outcomes.participant_profile_id (`pilot_outcomes_participant_profile_id_fkey`) | a | N | 0 | DELETE | about the person; note FT⚠ |
| 43 | pilots.created_by (`pilots_created_by_fkey`) | a | Y | 0 | REASSIGN | — |
| 44 | procurement_events.actor_profile_id (`procurement_events_actor_profile_id_fkey`) † | a | N | 0 | RETAIN | buying org's commercial record; note FT⚠ |
| 45 | productivity_units.created_by_profile_id (`productivity_units_created_by_profile_id_fkey`) | a | N | 0 / 0 (14 rows) | REASSIGN (NULL) | reference data |
| 46 | project_budgets.created_by (`project_budgets_created_by_fkey`) | a | Y | 0 | REASSIGN | org financial planning |
| 47 | project_handover_entries.created_by (`project_handover_entries_created_by_fkey`) | a | Y | 1 / 1 | REASSIGN | body FT⚠ |
| 48 | project_stages.created_by (`project_stages_created_by_fkey`) | a | Y | 1 / 1 | REASSIGN | — |
| 49 | project_worker_operational_statuses.updated_by (`project_worker_operational_statuses_updated_by_fkey`) | a | Y | 0 | REASSIGN | worker side cascades via worker_id |
| 50 | project_worker_readiness_items.updated_by (`project_worker_readiness_items_updated_by_fkey`) | a | Y | 14 / 2 | REASSIGN | note FT⚠ |
| 51 | team_enquiry_events.actor_profile_id (`team_enquiry_events_actor_profile_id_fkey`) | a | Y | 0 | REASSIGN | — |
| 52 | timesheet_events.actor_profile_id (`timesheet_events_actor_profile_id_fkey`) † | a | N | 6 / 2 | RETAIN | working-time records, employer statutory duty 6(1)(c). Also the cascade-DELETE blocker via timesheets |
| 53 | training_assignment_events.actor_id (`training_assignment_events_actor_id_fkey`) † | a | Y | 0 | RETAIN | OHS training proof 6(1)(c) |
| 54 | work_counterparty_links.established_by (`work_counterparty_links_established_by_fkey`) † | a | Y | 0 | RETAIN | evidence relation backing a worker's record |
| 55 | work_counterparty_links.revoked_by (`work_counterparty_links_revoked_by_fkey`) † | a | N | 0 | RETAIN | as #54 |
| 56 | work_hour_allocations.entered_by (`work_hour_allocations_entered_by_fkey`) | **r** | Y | 5 / 1 | RETAIN | working-time / billing basis 6(1)(c); RESTRICT also on worker_id, so a worker-side detach design is needed too |
| 57 | work_plan_entries.cancelled_by (`work_plan_entries_cancelled_by_fkey`) | a | N | 10 / 1 | REASSIGN | note FT⚠ |
| 58 | work_plan_entries.created_by (`work_plan_entries_created_by_fkey`) | a | Y | 10 / 1 | REASSIGN | — |
| 59 | worker_absences.requested_by (`worker_absences_requested_by_fkey`) | a | Y | 10 / 1 | REASSIGN (if self, the row is DELETEd via worker cascade) | **SC**: absence note may contain health info FT⚠ |
| 60 | worker_absences.reviewed_by (`worker_absences_reviewed_by_fkey`) | a | N | 10 / 1 | REASSIGN | employer's absence record |
| 61 | worker_document_events.actor_id (`worker_document_events_actor_id_fkey`) | a | Y | 2 / 1 | REASSIGN | before/after jsonb FT⚠ |
| 62 | worker_documents.updated_by (`worker_documents_updated_by_fkey`) | a | Y | 1 / 1 | REASSIGN | — |
| 63 | worker_documents.verified_by (`worker_documents_verified_by_fkey`) | a | N | 0 | PSEUDONYMISE (sentinel, keep verifier org if known) | verification provenance is another worker's evidence |
| 64 | worker_skills.verified_by (`worker_skills_verified_by_fkey`) | a | N | 6 / 3 | PSEUDONYMISE | as #63; an anonymous verifier weakens the claim, so state "verifier erased" honestly (doctrine: no fake verification) |
| 65 | workflow_instance_approvers.decided_by (`workflow_instance_approvers_decided_by_fkey`) | a | N | 1 / 1 | RETAIN | approval audit; `workflow_approvers_fill_once` blocks the change, so a bypass is needed |
| 66 | workflow_transitions.actor_profile_id (`workflow_transitions_actor_profile_id_fkey`) † | a | N | 4 / 2 | RETAIN | approval history; metadata FT⚠. Also the cascade-DELETE blocker via workflow_instances |

**Totals:** DELETE **6** (#10 content, 21, 23, 24, 40, 42) · RETAIN-pseudonymised **21** · PSEUDONYMISE **3**
(#38, 63, 64) · REASSIGN **36** · ANONYMISE **0**.
14 of the 66 sit on tables with a mutation-blocking trigger (†, plus #25/26 lmc and #65 fill-once).
Of the 21 RETAIN, 18 need a sanctioned guard bypass.

---

## 3. Other linkage paths

### 3.1 Linked via workers.id rather than profiles.id

CASCADE from `workers`: agency_candidate_offers, agency_workers, booking_requests,
commercial_handoffs, commitment_override_receipts (†), company_workers, contact_disclosure_requests,
demand_interest_signals, demand_shortlist, journal_entries (NOT NULL), journal_entry_skills,
journal_entry_work_items, learning_review_queue, learning_signals, matches,
project_worker_assignments, project_worker_operational_statuses, project_worker_readiness_items,
timesheets (→ timesheet_events †), work_plan_entries, worker_absences, worker_documents,
worker_external_profiles, worker_languages, worker_professions, worker_saved_opportunities,
worker_saved_searches, worker_skills.

SET NULL: agreements, asset_assignments, company_worker_engagements, organization_people.linked_worker_id.

**Blocking from workers:**

- `journal_entry_review_submissions.worker_id` (a, †), `work_counterparty_links.worker_id`
  (a, †) and `org_documents.worker_id` (a) block, if rows exist.
- `work_hour_allocations.worker_id` (**r**) blocks (5 rows, 1 worker).
- `commitment_override_receipts` CASCADE fails on its immutable trigger.

Treatment: the person's own work rows → DELETE by cascade. This contradicts design E1 and the
retention matrix, which promise journal "detach, keep evidence"; the schema (NOT NULL worker_id)
cannot do that. Employer-held time records (`work_hour_allocations`, `timesheets/_events`) →
RETAIN-pseudonymised under the employer's statutory duty. That needs a tombstone-worker or
nullable worker_id design.

### 3.2 Append-only / hash-chained tables (triggers blocking UPDATE and/or DELETE)

| Table | Trigger (function) | Blocks | Rows |
|---|---|---|---:|
| agreement_amendments | agreement_amendments_append_only (agreement_amendments_guard) | DEL/UPD | 0 |
| agreement_events | agreement_events_append_only (agreement_events_guard) | DEL/UPD | 0 |
| business_trip_events | business_trip_events_append_only (business_trip_events_guard) | DEL/UPD | 0 |
| commitment_override_receipts | commitment_override_receipts_immutable (…_immutable_v1) | DEL/UPD | 0 |
| contact_disclosure_request_events | contact_disclosure_request_events_append_only (contact_disclosure_events_block_mutation) | DEL/UPD | 0 |
| engagement_lifecycle_events | engagement_lifecycle_events_append_only (…_guard) | DEL/UPD | 11 |
| journal_entry_review_submissions | journal_entry_review_submissions_append_only (work_counterparty_append_only_v1) | DEL/UPD | 0 |
| lmc_accounts | lmc_accounts_immutable (lmc_forbid_mutation) | DEL/UPD | 0 |
| lmc_lots | lmc_lots_append_only (lmc_forbid_mutation) | DEL/UPD | 0 |
| lmc_lot_consumptions | lmc_lot_consumptions_append_only (lmc_forbid_mutation) | DEL/UPD | 0 |
| lmc_transactions | lmc_transactions_append_only (lmc_forbid_mutation) | DEL/UPD | 0 |
| management_decision_events | management_decision_events_append_only (…_guard) | DEL/UPD | 0 |
| organization_facts | organization_facts_append_only (same) | DEL; UPD except supersede | 0 |
| performance_review_events | performance_review_events_append_only (…_guard) | DEL/UPD | 0 |
| personal_data_disclosures | personal_data_disclosures_append_only (…_guard) | DEL; UPD of identity cols | 0 |
| privacy_consent_events | privacy_consent_events_append_only (privacy_ledger_block_mutation) — #2412 adds a GUC-scoped detach exception | DEL/UPD | 40 |
| procurement_events | procurement_events_append_only (…_guard) | DEL/UPD | 0 |
| timesheet_events | timesheet_events_append_only (…_guard) | DEL/UPD | 6 |
| training_assignment_events | training_assignment_events_append_only (training_events_guard) | DEL/UPD | 0 |
| usage_cost_events | usage_cost_events_no_mutation (…_forbid_mutation) | DEL/UPD (so SET NULL fails) | 382 |
| work_counterparty_links | work_counterparty_links_append_only (work_counterparty_append_only_v1) | DEL; UPD except first revoke | 0 |
| workflow_transitions | workflow_transitions_append_only (…_guard) | DEL/UPD | 4 |
| workflow_version_steps | workflow_version_steps_frozen (…_frozen_guard) | DEL/UPD (definition data, not personal) | 24 |
| company_memberships | protect_last_owner | DEL/UPD of the last active owner — erasing a sole owner fails | 53 |

Partial guards on UPDATE only: `performance_reviews_immutable_when_closed`, `timesheets_frozen`,
`training_assignments_fill_once`, `workflow_approvers_fill_once`,
`learning_review_queue_guard_stale_trg`, `lmc_settings_update_guard`.

Hash-chained without a blocking trigger (editing breaks chain verification, nothing more):
`journal_entries` (hash_prev/hash_self), `assistant_messages` (prev_hash/content_hash),
`organization_evidence_records` (hash_prev/hash_self), `engagement_contexts` (hash_self).

**Implication.** Every † table needs the same sanctioned, subject-scoped detach that #2412 adds
for `privacy_consent_events`. The alternative is to switch the FK/cascade so a parent delete
never reaches it. Without one of these, an erasure fails, or someone weakens the guard ad hoc.

### 3.3 organization_people / organization_evidence_records (org-supplied history)

- 43 roster people; **41 have no account link** (2 linked). 2,944 evidence records, of which
  2,630 hang off unlinked people. 2,967 staging rows (`evidence_import_rows`) all carry
  `person_label` + `activity_text`.
- Controller: the supplying organization, for its own records. LabourMarket.ai is processor for
  that copy, and controller for the matching/linking it adds.
- Account erasure: `organization_people.linked_profile_id` / `linked_worker_id` are SET NULL, so
  the org's record survives and only the link goes. This is correct as RETAIN (other party's
  record). The row still holds `display_name`, `normalized_name` and `external_ref`, and
  `organization_evidence_records.source_fact` holds a `Person` key (158 rows) and `addresses`
  (54). It is fully identified, not anonymised.
- A request from a person **without an account** (Art. 17 against the platform as processor or
  controller of the linkage) has **no path at all**. No key reaches these rows except
  name-matching on `normalized_name`. The process needs:
  1. identity-verified lookup by name and organization;
  2. a referral to the supplying organization (controller);
  3. for platform-derived data (competency signals, match confidence), DELETE.
- `organization_evidence_records.organization_person_id` and
  `organization_evidence_media.organization_person_id` are **NO ACTION**. Deleting a roster
  person row is blocked while evidence exists, so the org must erase evidence first, and evidence
  rows are hash-chained.
- `evidence_import_rows.organization_person_id` is SET NULL, but `person_label`/`activity_text`
  survive. Staging rows should be DELETED once their import session is finalised.

---

## 4. Registry gaps (`personal-relations.ts` vs production)

**Personal data in prod but missing from the registry, or mis-registered:**

| Table | Problem |
|---|---|
| assistant_messages (166) | not registered; holds the user's free text (`original_text`). Covered only conceptually via withheld `assistant_conversations`; the guard can't see a child without a person column |
| assistant_message_attachments (0) | not registered; DOC |
| email_send_ledger_v1 (0) | not registered; `recipient_hash` = pseudonymous email (check salting) |
| payment_webhook_events (0; Stripe LIVE) | not registered; Stripe payloads carry customer name/email; financial retention (D2) applies |
| audit_logs (1,097) | registered ACTOR_ONLY, but payload carries subject ids and `display_name`. Should be WITHHELD-with-reason and in erasure scope (scrub payload person keys) |
| historical_consolidation_decisions (180) | ACTOR_ONLY, but `original_text` can describe workers |
| evidence_import_sessions / evidence_import_events | ACTOR_ONLY; notes/payload may name people (payload keys seen are counts only, notes not inspected) |
| worker_display_name_backfill_20260805 (22) | NON_PRODUCT, yet it is a backup copy of 22 people's display names + country keyed by profile_id with no FK. **Survives erasure.** Should be dropped (one-off migration artifact) or included in erasure |
| platform_skill_aggregates (0) | not registered; fine only if a minimum sample_size (k) is enforced |
| market_intelligence_observations (76) | not registered; all `privacy_class = public_aggregate`, subject_kind `geo_market`, so not personal today |

Not registered and not personal (reference/config): achievement_types, countries,
country_document_requirements, document_types, education_types, email_verification_policy_v1,
esco_*, job_demands, journal_profession_templates, market_intelligence_sources,
market_subject_types, onboarding_template_items, organization_role_types, organization_roles,
plans, privacy_consent_purposes, profession_skills, profession_templates, professions,
public_vacancies (CC0 ads), public_vacancy_supply_counts, relationship_types, skill_icons,
skill_seed_benchmarks, skills, team_details (org-level), vacancy_import_cursors,
workflow_version_steps, ai_runs_retention_sweeps.

**Registry entries with no table in the production schema (7):** `company_locations`, `dashboard_preferences`,
`demand_interest_seen`, `identity_resolution_events`, `messages`, `talent_source_records`,
`threads`. The file's own header mentions only `dashboard_preferences` and
`demand_interest_seen`. The other five are stale or unapplied and should be re-measured or
annotated.

**Registry vs erasure:** the registry is an EXPORT register. It has no erasure-treatment field,
and `deletion-plan.ts` covers only 13 classes (journal, photos, skills, claims, documents,
bookings, engagements, consents, messages, inquiries, notifications, external profiles,
account). The plan does not count `pilot_events`, `invitations`, `conversation_participants`,
`journal_entry_confirmations`, `audit_logs`, `assistant_*`, storage objects or any §2 FK. The
gap could be closed by adding an `erasure` field per relation in `personal-relations.ts` (one
register, not a second one) and having the guard fail on any FK onto profiles/workers without
one.

---

## 5. Reconciliation with the docs

| Doc says | Production reality |
|---|---|
| E1 / matrix: journal "anonymize — detach worker_id, keep evidence" | worker_id NOT NULL + CASCADE: the cascade DELETES. Detached text would be pseudonymised at best (FT) |
| E2: consent "detach identity, keep 6 y" | #2412 implements it for PCE; result is pseudonymised (per-subject tombstone + context cols). Disclosures: v1 refuses |
| E3: bookings/engagements kept to D1 horizon | `booking_requests.owner_id/worker_id` and `engagement_contexts.profile_id` are CASCADE: deleted, or the delete fails on append-only events. Nothing keeps them |
| E4: privacy request row kept 3 y | `customer_requests.profile_id` CASCADE: deleted with the account |
| E5: storage objects deleted | no code; objects orphaned (41 objects today) |
| E6: messages "detach requester identity" | detach ≠ anonymise (body FT); `author_id` NO ACTION blocks today |
| E7: "FKs from profiles cascade the remaining personal rows" | 66 FKs block; ~20 cascades are blocked by append-only triggers or RESTRICT |
| Matrix: analytics "bounded scalars, no PII payloads" | `pilot_events` metadata carries organization_id, ref_id, utm_*, referrer_host, session_id. Linkable, so personal data |
| Matrix: ai_runs `profile_id` retained (D1) | 0 linked rows today; the subject-linkage class de-links at 90 d, consistent |
