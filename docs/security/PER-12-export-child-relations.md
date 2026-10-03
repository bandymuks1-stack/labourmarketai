# PER-12 — subject-access export: child relations (2026-10-03)

Status: static proof + unit tests. Production proof of a real bundle is
BLOCKED_QA_IDENTITY (needs an authenticated QA session). No migration.

## What was wrong

`buildPrivacyExport` reads each registered relation as the signed-in user under
RLS, joined by a person key. Tables that carry **only a parent id** (events,
metrics, signals) have no person column, so the completeness guard could not see
them, and several were parked as ACTOR-ONLY because their only person column is
an actor. Their rows are about the person: they hang off the person's journal
entry, booking, timesheet, task, document, workflow instance.

This is an INCOMPLETENESS risk for a subject-access response, not a leak: no
one else's data was exposed.

## What changed

* `key: "parent_row"` stage: a child is read last, in id chunks of 100 with
  paging (1000 rows), from the `id`s of an already-exported parent
  (`parent` = bundle key, `column` = FK on the child). Parent read failed ->
  children reported `unavailable` (never silently empty).
* Redaction per relation: `redactActors` (another person's profile id becomes
  null, the subject's own id is kept) and `omitColumns` (free-form state that can
  name a third party). Also applied to `worker_absences.requested_by/reviewed_by`.
* `relationNotes` in the bundle: relations whose select policy may hide rows from
  the subject carry an explicit NEEDS POLICY note. `redactions` lists blanked
  columns. Bundle `version` 2 -> 3 (additive: every v2 key unchanged).
* `storage_manifest` under `data`: journal photos + avatar, with 24h signed URLs
  minted as the signed-in user (the bucket's owner-scoped storage policy decides;
  a refusal gives `signedUrl: null` and `unavailable` names `storage_manifest`).
* Guard: parses `alter table ... add column` person columns (found
  `projects.responsible_profile_id`); fails on any table with an FK to an exported
  person-parent that is neither exported, withheld, nor reviewed in
  `CHILD_TABLES_NOT_EXPORTED`.

## Newly exported relations

Production rows are the owner's read-only totals (2026-10-03). Expected export
rows for a test person = the rows of that person's parents (e.g. all
`journal_entry_metrics` whose `entry_id` is in the person's `journal_entries`).

| Relation | Chain (parent.column) | Redacted | Prod rows today | RLS select |
|---|---|---|---|---|
| journal_entry_metrics | journal_entries.entry_id | - | 498 | worker owns entry: OK |
| journal_entry_extractions | journal_entries.entry_id | - | 0 | owner: OK |
| journal_entry_tasks | journal_entries.entry_id | linked_by, unlinked_by | 0 | can_read_journal_entry_v1: OK |
| booking_request_events | booking_requests.booking_request_id | actor_id | 17 | worker of the booking: OK |
| timesheet_events | timesheets.timesheet_id | actor_profile_id | 6 | owns_worker: OK |
| work_task_events | work_tasks.task_id (assignee) | actor_profile_id; before/after_state | 4 | via visible task: OK |
| worker_document_events | worker_documents.worker_document_id | actor_id | 2 | owner of document: OK |
| document_files | worker_documents.worker_document_id | uploaded_by | 0 | owns_worker_document_v1: OK |
| workflow_instance_steps | workflow_instances.instance_id (requester) | - | 1 | requester: OK |
| workflow_transitions | workflow_instances.instance_id | actor_profile_id; metadata | not measured | requester: OK |
| contact_disclosure_request_events | contact_disclosure_requests.contact_disclosure_request_id | actor_profile_id | 0 | worker: OK |
| training_assignment_events | training_assignments.training_assignment_id | actor_id; states | 0 | assignee: OK |
| business_trip_events | business_trips.trip_id | actor_profile_id | not measured | traveler: OK |
| engagement_lifecycle_events | engagement_contexts.engagement_context_id | actor_profile_id; metadata | not measured | ec.profile_id: OK |
| onboarding_runs / offboarding_runs | engagement_contexts.engagement_context_id | started_by | not measured | same predicate, one hop up: OK |
| performance_review_events | performance_reviews.review_id | actor_id; metadata | not measured | subject: OK |
| team_enquiry_events | team_enquiries.enquiry_id (owner) | actor_profile_id | not measured | owner: OK |
| organization_evidence_competency_signals | organization_evidence_records.record_id | - | 62 | linked subject: OK |
| lmc_lots / lmc_lot_consumptions | lmc_accounts.account_id | - | 0 | account owner: OK |
| projects (as `projects_responsible`) | profile_id via responsible_profile_id | created_by, owner_id | 0 non-null | existing projects RLS (owner/manager/assigned worker) |

## Remaining gap, classified (RED items are UNAPPLIED)

### CURRENT LIVE EXPORT GAP

* `evidence_import_rows` (158 prod rows, 1 session, 1 organization). Table
  policy admits only `manages_organization(organization_id) OR is_admin()`, so
  a subject reading the table gets nothing. Direct RLS is NOT widened.
  Fix drafted as an UNAPPLIED RED migration
  `supabase/migrations/20261003120000_privacy_export_import_lines_subject_v1.sql`
  (`-- @human-gate-approved`, new SECURITY DEFINER fn
  `privacy_export_evidence_import_rows_v1()`, rollback
  `supabase/rollbacks/20261003120000_privacy_export_import_lines_subject_v1.down.sql`).
  No argument; subject = `auth.uid()` via `organization_people.linked_profile_id`
  with `link_state = 'linked'`; STABLE; ACL: revoked from public and anon,
  granted to authenticated. Until applied the relation is `unavailable`.

  Field provenance (writer: `insertSourceRows` in
  `apps/web/lib/organization-evidence/import-core.ts` fills the verbatim
  source columns from the organization's uploaded file; the commit/matching
  SQL and `import-core` fill the interpreted columns; prod shapes measured
  read-only 2026-10-03, aggregates only: all 158 rows `person_state=created`,
  `person_match_method=plan_created`, `status=committed`, `row_origin` null,
  0 with an e-mail-like or 7+ digit string in activity_text, 0 rows where
  person_label differs from the linked roster display_name):

  | Column | SOURCE | SUBJECT | Other person's identity? | Free-text PII? | EXPORT DECISION |
  |---|---|---|---|---|---|
  | id, row_index, created_at | platform | the row | no | no | RETURN |
  | organization_id, organization_person_id | session / roster link | supplying org, the subject | no | no | RETURN (ids) |
  | person_label | uploaded file, name as written (tidy) | the person the SOURCE row named | yes if the match was fuzzy or the roster row was reused | name | RETURN ONLY when equal (case/space-insensitive) to the linked roster `display_name`, else null |
  | activity_text | uploaded file, work text cell | the work, free text | YES (co-workers, customers, sites named in prose) | YES | OMIT (not proven subject-safe) |
  | context_label | uploaded file, project label | the organization's project | possibly a customer name | possible | OMIT (ids work_object_id/project_id returned instead) |
  | activity_kind, outcome_kind | parsed / defaulted enums | the row | no | no | RETURN |
  | activity_date, period_start, period_end, hours | parsed from file, numeric/date | the subject's work | no | no | RETURN |
  | status, row_origin | pipeline state | the row | no | no | RETURN |
  | work_object_id, project_id | matched by pipeline | org's object | no | no | RETURN (ids) |
  | source_fact | verbatim source row (whole file line, all cells) | mixed | YES | YES | OMIT |
  | fact_fields, derived | pipeline interpretation of source | mixed | possible | possible | OMIT |
  | customer_label, customer_code, customer_key | file customer cells | the organization's customer | YES (a third party) | possible | OMIT |
  | person_match_method / _confidence, context_*, duplicate_*, record_fingerprint, problem, person_state, session_id, education_* | pipeline internals | the pipeline | possible via problem text | problem is free text | OMIT |

  What stays unavailable: the raw source line, the work description, the
  project label and the customer cells. A subject who wants them asks us and
  we answer through a reviewed route. Re-open the allowlist only with
  per-field provenance proof.

### FUTURE CONTRACT GAP (no live harm today)

* `agreement_events`, `agreement_amendments`: 0 rows in prod (agreements 0,
  events 0, amendments 0). Both policies are exactly
  `can_view_agreement_v1(agreement_id)`, which admits org owner/admin,
  `agreements.responsible_profile_id` and admin; not the worker
  (`agreements.worker_id` -> `workers.profile_id`).
  Blast radius of `can_view_agreement_v1` (pg_policies + function bodies,
  2026-10-03): exactly those two SELECT policies, plus the function
  `sync_agreement_approval_v1`. Therefore DO NOT widen the function (it would
  also change the sync function). Narrowest option, TEXT ONLY, not applied,
  apply only when the first agreement row is about to exist:

      create policy agreement_events_select_subject on public.agreement_events
        for select to authenticated using (exists (
          select 1 from public.agreements a join public.workers w on w.id = a.worker_id
          where a.id = agreement_events.agreement_id and w.profile_id = auth.uid()));
      -- same shape for agreement_amendments_select_subject

  The export already omits `before_state/after_state` and redacts actors.
  The bundle carries a NEEDS POLICY note until then.

### RED APPLY ITEMS (owner channel, nothing applied)

1. `20261003120000_privacy_export_import_lines_subject_v1.sql` (SECURITY DEFINER fn + grants).
2. agreement subject-read sibling policies (text above), deferred until agreements exist.

QA proof remains BLOCKED_QA_IDENTITY. Nothing here is PASS_REAL_PRODUCTION.

## Deliberately not exported

* `market_intelligence_observations` (76 rows): `subject_kind` is one of role,
  skill, profession, geo_market, company_need, platform. Aggregates, never a
  person.
* Children of organization records (budgets, stages, facts, procurement,
  decision links, task dependencies, threads, ...): listed with reasons in
  `CHILD_TABLES_NOT_EXPORTED`.
* Conversations and other WITHHELD relations unchanged.

## Storage decision

Metadata rows (`journal_entry_photos`) were already exported. Added a manifest
with per-file signed URLs created through the user client (the same pattern the
app uses: owner-scoped `storage.objects` policies, first path segment =
`auth.uid()`), so another person's file cannot be signed. Buckets with 0 objects
(document-files, conversation-attachments, customer-request-attachments) are not
listed. Residual: a downloaded bundle carries live links for 24h; contents of
conversation attachments stay withheld with the conversations.

## Production proof plan (BLOCKED_QA_IDENTITY)

After deploy, as a QA person with journal entries and a booking: download
`/dashboard/privacy/export`, check `version` = 3, `unavailable` empty, row counts
of each relation above equal the SQL count of children of that person's parents,
`actor_id` null on foreign actors, `relationNotes` present for the three
policy-limited relations (evidence_import_rows reads via the RPC once applied), `storage_manifest` links resolve.
