import "server-only";

/**
 * EVERY RELATION THAT HOLDS A PERSON IS CLASSIFIED — the register the GDPR
 * export is built from.
 *
 * THE DEFECT, MEASURED (2026-09-14, production). 60 public tables carry a
 * `profile_id` or a `worker_id`. The export bundle read SIX of them, and it
 * carries an `excluded` list naming what was deliberately left out — so a
 * reader is entitled to conclude that everything NOT on that list IS
 * included. Roughly thirty relations were neither read nor named: the bundle
 * asserted something false about itself, to the one audience least able to
 * check it. That is the same class of defect as a journal count that includes
 * deleted work, and it is worse here, because a subject-access response is
 * what someone reaches for when they are already in a dispute.
 *
 * THE RULE THIS FILE ENFORCES: every relation keyed to a person is EXPORTED,
 * or NAMED with a reason, or declared not-a-product-relation. There is no
 * fourth option, and `lib/guards/privacy-export-completeness.test.ts` fails
 * on any relation that has none.
 *
 * WHY SOMETHING WOULD BE WITHHELD. Not to make the bundle smaller. A
 * subject-access response must not become a side channel onto a DIFFERENT
 * person: an employer's private shortlisting decision, a confirmer's
 * identity, the other party's words in a conversation, or an AI run whose
 * inputs may quote a third party. Those are named, with the reason, so the
 * person can ask for them through a route that can redact.
 *
 * SCALE (re-counted 2026-10-03): the register below reads well over a hundred
 * relations over ~100 tables (a table can be read through two columns, and
 * the chained children below hang off ids that were already exported). Do not
 * trust a number written in a comment: `EXPORTED_RELATIONS.length` is the
 * count, and the completeness guard fails when the register and the
 * migrations disagree.
 *
 * TWO REGISTERED RELATIONS ARE ABSENT FROM PRODUCTION (re-measured
 * 2026-10-03): `dashboard_preferences` and `demand_interest_seen`. They are
 * registered anyway: the export reads what the database has, and reports a
 * relation the database LACKS (42P01 / 42703 / PGRST205) as empty, not as
 * unread, because the person genuinely has no rows in a table that does not
 * exist. That is NOT a live gap; registering them means the bundle grows by
 * itself the day the migration lands.
 *
 * Two others used to be on this list (`worker_external_profiles`,
 * `worker_opportunity_seen`); both were applied on 2026-09-14/15 and the
 * bundle picked them up with no code change. Apply status belongs to the
 * database, not to a comment: re-measure before believing any line like the
 * one this replaced.
 *
 * CHILD TABLES WITHOUT A PERSON COLUMN (PER-12, 2026-10-03). Event, metric
 * and signal tables carry only a parent id (`entry_id`, `task_id`, ...), so the
 * migration sweep cannot see them as person-keyed, and several were parked in
 * ACTOR_ONLY_RELATIONS because their only person column is an actor. A row in
 * `journal_entry_metrics` or `booking_request_events` IS about the person: it
 * hangs off THEIR journal entry or THEIR booking. Those are now exported by
 * CHAINED reads (`key: "parent_row"`), keyed from ids the exporter already
 * holds, still read as the person under RLS. Other people's ids in them
 * (`actor_id`, `linked_by`, ...) are redacted per relation: see `redactActors`
 * and `omitColumns`.
 */

/**
 * How a relation is joined to the person. The exporter resolves the id set
 * for each key in order: the person's `profiles.id`, then their `workers.id`
 * rows, then the `organization_people` rows an organization linked to them,
 * then the `organization_evidence_records` written against those rows. A
 * relation keyed by a later stage is read only from what the earlier stage
 * actually returned — nothing is guessed.
 */
export type PersonKey =
  | "profile_id"
  | "worker_id"
  | "organization_person_id"
  | "organization_evidence_record_id"
  /**
   * A child table that carries no person column of its own and hangs off rows
   * the exporter ALREADY delivered (`parent`). Read last, from those ids.
   */
  | "parent_row";

export type ExportedRelation = {
  readonly table: string;
  readonly key: PersonKey;
  /**
   * The column that carries the key when the table does not spell it
   * `profile_id` / `worker_id` (`recipient_profile_id`, `user_id`,
   * `subject_profile_id`, …). Defaults to the key name. The completeness
   * guard checks that the column really exists on that table in a migration.
   */
  readonly column?: string;
  /**
   * Bundle key, when one table is exported twice through two columns (the
   * experience records a person WROTE and those written ABOUT them are both
   * theirs, and must not overwrite each other). Defaults to the table name.
   */
  readonly as?: string;
  /**
   * `key: "parent_row"` only. The bundle key of the already-exported parent
   * relation whose `id`s feed this read, joined through `column` (the FK on
   * THIS table). If the parent read failed, this relation is reported
   * unavailable; it is never guessed.
   */
  readonly parent?: string;
  /**
   * Columns holding ANOTHER person's profile id (a manager, an approver, the
   * other party). The value is kept only when it is the subject's own id and
   * is otherwise replaced with null: the event type and time stay, who else
   * did it does not leave the platform in a subject-access bundle.
   */
  readonly redactActors?: readonly string[];
  /**
   * Columns set to null outright because their content is free-form state
   * that can name a third party (assignee ids in a task history,
   * counterparty terms in an agreement history).
   */
  readonly omitColumns?: readonly string[];
  /**
   * Said in the bundle beside the relation when the subject's own read may
   * come back empty although rows about them exist, because the select policy
   * does not admit them. The relation is still listed, never silently empty.
   */
  readonly rlsNote?: string;
  /**
   * Read through this SECURITY DEFINER function instead of the table, because
   * the table's select policy must not be widened (rows can carry other
   * people). The function takes no person argument: it derives the subject
   * from auth.uid(), so a caller can only ever obtain their own rows. While
   * the function is not applied the relation is reported `unavailable`
   * (never silently empty).
   */
  readonly rpc?: string;
};

/**
 * READ INTO THE BUNDLE. Each is read as an ordinary RLS-scoped query as the
 * signed-in person — no service role, no policy widening, no admin path.
 */
export const EXPORTED_RELATIONS: readonly ExportedRelation[] = [
  // ── Identity, consent and preference ──────────────────────────────────
  { table: "consents", key: "profile_id" },
  { table: "profile_roles", key: "profile_id" },
  { table: "notification_preferences", key: "profile_id" },
  { table: "dashboard_preferences", key: "profile_id" },
  { table: "preferred_locations", key: "profile_id" },
  { table: "consented_login_location_signals", key: "profile_id" },
  // How the platform classifies the account for reporting (real / test /
  // internal) and why — data about the person, so it is theirs to see.
  { table: "account_classifications", key: "profile_id" },
  // Platform capabilities granted to the person (e.g. marketplace company
  // ingest) and the organization claims they made — both are about them.
  { table: "platform_capability_grants", key: "profile_id" },
  { table: "organization_claims", key: "profile_id", column: "claimant_profile_id" },

  // ── What the person says about themselves ─────────────────────────────
  { table: "profile_skill_claims", key: "profile_id" },
  { table: "candidate_skills", key: "profile_id" },
  { table: "skill_candidate_clarifications", key: "profile_id" },
  { table: "worker_education", key: "profile_id" },
  { table: "worker_achievements", key: "profile_id" },
  { table: "education_cohort_members", key: "profile_id" },
  { table: "first_party_supply_declarations", key: "profile_id" },
  { table: "worker_languages", key: "worker_id" },
  { table: "worker_professions", key: "worker_id" },
  { table: "worker_skills", key: "worker_id" },

  // ── The work itself, and the evidence of it ───────────────────────────
  { table: "journal_entries", key: "worker_id" },
  { table: "journal_entry_skills", key: "worker_id" },
  { table: "journal_entry_work_items", key: "worker_id" },
  { table: "journal_entry_photos", key: "profile_id" },
  { table: "timesheets", key: "worker_id" },
  { table: "work_hour_allocations", key: "worker_id" },
  { table: "worker_documents", key: "worker_id" },

  // ── The person's relationships to organizations and projects ──────────
  { table: "engagement_contexts", key: "profile_id" },
  { table: "company_memberships", key: "profile_id" },
  { table: "company_workers", key: "worker_id" },
  { table: "company_worker_engagements", key: "worker_id" },
  { table: "agency_workers", key: "worker_id" },
  { table: "project_members", key: "profile_id" },
  { table: "project_worker_assignments", key: "worker_id" },
  { table: "project_worker_readiness_items", key: "worker_id" },
  { table: "project_worker_operational_statuses", key: "worker_id" },
  { table: "asset_assignments", key: "worker_id" },
  { table: "agreements", key: "worker_id" },

  // ── Availability, time and the market ─────────────────────────────────
  // requested_by / reviewed_by can name a manager: another person's id.
  {
    table: "worker_absences",
    key: "worker_id",
    redactActors: ["requested_by", "reviewed_by"],
  },
  { table: "business_trips", key: "profile_id" },
  // CAL-8: the windows an organization planned for THIS person — they may read
  // their own (RLS), so the export carries them. Not yet on production; a
  // relation the database lacks is reported empty, not unread.
  { table: "work_plan_entries", key: "worker_id" },
  { table: "booking_requests", key: "worker_id" },
  { table: "worker_saved_opportunities", key: "worker_id" },
  // DEM-8: the QUESTION a person saved, not just the answer they bookmarked.
  // Exported for the same reason the bookmark is — it is their own record of
  // what they are looking for, and it reveals nobody else.
  { table: "worker_saved_searches", key: "worker_id" },
  { table: "demand_interest_signals", key: "worker_id" },
  // Worker → real vacancy → interest → Nonstop commercial handoff v1: the
  // person's own "I want this job" as it was handed to the partner — which
  // vacancy, whether they allowed being presented to the employer, the
  // outreach state recorded, and whether/when it was delivered. Theirs above
  // all; it names the employer only by the publisher's key.
  { table: "commercial_handoffs", key: "worker_id" },
  // Universal network v1: the person's own answers to invitations (accepted /
  // declined, what it created) and their review of what an external source
  // declared about them. Theirs above all — it is the provenance of how they
  // arrived and what they said about it; it names the inviter only by id.
  { table: "invitation_acceptances", key: "profile_id" },
  { table: "matches", key: "worker_id" },
  { table: "agency_candidate_offers", key: "worker_id" },
  // Requests to disclose THIS person's contact details — theirs above all.
  { table: "contact_disclosure_requests", key: "worker_id" },
  { table: "market_intelligence_insight_queries", key: "profile_id" },
  // Both key the person by `profile_id` (2026-09-19: they were registered as
  // `worker_id`, a column neither table has — the exporter's read failed on
  // every bundle and the guard could not see it. It can now.)
  { table: "demand_interest_seen", key: "profile_id" },
  { table: "worker_opportunity_seen", key: "profile_id" },
  { table: "worker_external_profiles", key: "worker_id" },

  // ── Account and billing ───────────────────────────────────────────────
  { table: "subscriptions", key: "profile_id" },
  { table: "lmc_accounts", key: "profile_id" },
  { table: "usage_cost_events", key: "profile_id" },

  // ── Pilot programme participation ─────────────────────────────────────
  { table: "pilot_participants", key: "profile_id" },
  { table: "pilot_events", key: "profile_id" },

  // ── Added 2026-09-19: everything the previous sweep could not see ─────
  // The first sweep only recognised columns literally named `profile_id` or
  // `worker_id`. Every relation below keys the person through another column
  // name and was neither exported nor named — the bundle claimed a
  // completeness it did not have. Each is read as the person, under RLS.

  // What the platform told the person, and what they consented to.
  { table: "notification_events", key: "profile_id", column: "recipient_profile_id" },
  { table: "privacy_consent_events", key: "profile_id", column: "user_id" },
  { table: "personal_data_disclosures", key: "profile_id", column: "worker_user_id" },
  { table: "language_feedback", key: "profile_id", column: "user_id" },
  { table: "booking_requests_seen", key: "profile_id", column: "user_id" },
  { table: "service_offering_requests_seen", key: "profile_id", column: "user_id" },

  // What others recorded about the person, and what the person answered.
  { table: "experience_records", key: "profile_id", column: "subject_profile_id" },
  {
    table: "experience_records",
    key: "profile_id",
    column: "author_profile_id",
    as: "experience_records_authored",
  },
  { table: "experience_responses", key: "profile_id", column: "author_profile_id" },
  { table: "organization_people", key: "profile_id", column: "linked_profile_id" },
  { table: "organization_evidence_records", key: "organization_person_id" },
  { table: "organization_evidence_events", key: "organization_evidence_record_id" },
  { table: "candidate_drafts", key: "profile_id", column: "linked_profile_id" },
  {
    table: "candidate_drafts",
    key: "profile_id",
    column: "owner_id",
    as: "candidate_drafts_owned",
  },
  { table: "talent_source_records", key: "profile_id", column: "subject_profile_id" },
  { table: "identity_resolution_events", key: "profile_id", column: "primary_profile_id" },
  { table: "performance_reviews", key: "profile_id", column: "subject_profile_id" },
  { table: "follow_up_tasks", key: "profile_id", column: "subject_profile_id" },
  { table: "pilot_outcomes", key: "profile_id", column: "participant_profile_id" },
  { table: "learning_signals", key: "worker_id", column: "subject_worker_id" },
  { table: "learning_review_queue", key: "worker_id", column: "subject_worker_id" },

  // What the person attested about someone else's work — their own statement.
  { table: "journal_entry_confirmations", key: "profile_id", column: "confirmer_id" },

  // Work an organization assigned to the person, and what the person asked
  // of an organization.
  { table: "work_tasks", key: "profile_id", column: "assignee_profile_id" },
  { table: "work_objects", key: "profile_id", column: "responsible_profile_id" },
  { table: "training_assignments", key: "profile_id", column: "assignee_profile_id" },
  { table: "document_acknowledgements", key: "profile_id", column: "assignee_profile_id" },
  { table: "defects", key: "profile_id", column: "assignee_profile_id" },
  { table: "onboarding_run_items", key: "profile_id", column: "responsible_profile_id" },
  { table: "management_decisions", key: "profile_id", column: "responsible_profile_id" },
  { table: "employee_requests", key: "profile_id", column: "requester_profile_id" },
  { table: "procurement_inquiries", key: "profile_id", column: "requester_profile_id" },
  { table: "workflow_instances", key: "profile_id", column: "requester_profile_id" },
  { table: "workflow_instance_approvers", key: "profile_id", column: "approver_profile_id" },

  // Invitations the person sent (the answers they gave are above).
  { table: "invitations", key: "profile_id", column: "inviter_profile_id" },
  { table: "company_worker_invitations", key: "profile_id", column: "inviter_profile_id" },
  { table: "agency_worker_invitations", key: "profile_id", column: "inviter_profile_id" },

  // Things the person owns or offers on the market.
  { table: "organizations", key: "profile_id", column: "owner_profile_id" },
  { table: "service_offerings", key: "profile_id", column: "provider_id" },
  { table: "service_offering_requests", key: "profile_id", column: "buyer_id" },
  {
    table: "service_offering_requests",
    key: "profile_id",
    column: "provider_id",
    as: "service_offering_requests_received",
  },
  { table: "marketplace_listings", key: "profile_id", column: "owner_id" },
  { table: "proposals", key: "profile_id", column: "owner_id" },
  { table: "contracts", key: "profile_id", column: "owner_id" },
  { table: "team_enquiries", key: "profile_id", column: "owner_id" },
  { table: "company_demand_locations", key: "profile_id", column: "owner_id" },
  { table: "match_actions", key: "profile_id", column: "actor_id" },

  // Money.
  { table: "billing_customers", key: "profile_id", column: "owner_id" },
  { table: "billing_subscriptions", key: "profile_id", column: "owner_id" },
  { table: "billing_checkout_operations", key: "profile_id", column: "owner_id" },
  { table: "lmc_transactions", key: "profile_id", column: "actor_profile_id" },

  // -- PER-12 (2026-10-03): children that hang off exported rows ---------
  // Each is read as the person under RLS, keyed by ids ALREADY in the bundle.
  // The select policy of every one was read in supabase/migrations before it
  // was added (see docs/security/PER-12-export-child-relations.md).
  { table: "journal_entry_metrics", key: "parent_row", parent: "journal_entries", column: "entry_id" },
  { table: "journal_entry_extractions", key: "parent_row", parent: "journal_entries", column: "entry_id" },
  {
    table: "journal_entry_tasks",
    key: "parent_row",
    parent: "journal_entries",
    column: "entry_id",
    redactActors: ["linked_by", "unlinked_by"],
  },
  {
    table: "booking_request_events",
    key: "parent_row",
    parent: "booking_requests",
    column: "booking_request_id",
    redactActors: ["actor_id"],
  },
  {
    table: "timesheet_events",
    key: "parent_row",
    parent: "timesheets",
    column: "timesheet_id",
    redactActors: ["actor_profile_id"],
  },
  {
    table: "work_task_events",
    key: "parent_row",
    parent: "work_tasks",
    column: "task_id",
    redactActors: ["actor_profile_id"],
    omitColumns: ["before_state", "after_state"],
  },
  {
    table: "worker_document_events",
    key: "parent_row",
    parent: "worker_documents",
    column: "worker_document_id",
    redactActors: ["actor_id"],
  },
  {
    table: "workflow_instance_steps",
    key: "parent_row",
    parent: "workflow_instances",
    column: "instance_id",
  },
  {
    table: "contact_disclosure_request_events",
    key: "parent_row",
    parent: "contact_disclosure_requests",
    column: "contact_disclosure_request_id",
    redactActors: ["actor_profile_id"],
  },
  {
    table: "training_assignment_events",
    key: "parent_row",
    parent: "training_assignments",
    column: "training_assignment_id",
    redactActors: ["actor_id"],
    omitColumns: ["before_state", "after_state"],
  },
  {
    table: "agreement_events",
    key: "parent_row",
    parent: "agreements",
    column: "agreement_id",
    redactActors: ["actor_id"],
    omitColumns: ["before_state", "after_state"],
    rlsNote:
      "NEEDS POLICY: agreement_events_select admits only the organization's owner/admin and the agreement's responsible person, not the worker the agreement is about, so this list can be empty for you although history exists. Ask us and we will answer through a route that can redact.",
  },
  {
    table: "business_trip_events",
    key: "parent_row",
    parent: "business_trips",
    column: "trip_id",
    redactActors: ["actor_profile_id"],
  },
  {
    table: "document_files",
    key: "parent_row",
    parent: "worker_documents",
    column: "worker_document_id",
    redactActors: ["uploaded_by"],
  },
  {
    table: "engagement_lifecycle_events",
    key: "parent_row",
    parent: "engagement_contexts",
    column: "engagement_context_id",
    redactActors: ["actor_profile_id"],
    omitColumns: ["metadata"],
  },
  {
    table: "performance_review_events",
    key: "parent_row",
    parent: "performance_reviews",
    column: "review_id",
    redactActors: ["actor_id"],
    omitColumns: ["metadata"],
  },
  {
    table: "workflow_transitions",
    key: "parent_row",
    parent: "workflow_instances",
    column: "instance_id",
    redactActors: ["actor_profile_id"],
    omitColumns: ["metadata"],
  },
  {
    table: "team_enquiry_events",
    key: "parent_row",
    parent: "team_enquiries",
    column: "enquiry_id",
    redactActors: ["actor_profile_id"],
  },
  {
    table: "agreement_amendments",
    key: "parent_row",
    parent: "agreements",
    column: "agreement_id",
    redactActors: ["created_by"],
    rlsNote:
      "NEEDS POLICY: agreement_amendments_select uses the same predicate as agreement_events_select (organization owner/admin or the agreement's responsible person), so this list can be empty for you although amendments exist. Ask us and we will answer through a route that can redact.",
  },
  {
    table: "onboarding_runs",
    key: "parent_row",
    parent: "engagement_contexts",
    column: "engagement_context_id",
    redactActors: ["started_by"],
  },
  {
    table: "offboarding_runs",
    key: "parent_row",
    parent: "engagement_contexts",
    column: "engagement_context_id",
    redactActors: ["started_by"],
  },
  { table: "lmc_lots", key: "parent_row", parent: "lmc_accounts", column: "account_id" },
  { table: "lmc_lot_consumptions", key: "parent_row", parent: "lmc_accounts", column: "account_id" },
  // Staged organization evidence about the person's roster row: competency
  // signals the person may already read (their linked evidence record), and
  // the import rows themselves.
  {
    table: "organization_evidence_competency_signals",
    key: "parent_row",
    parent: "organization_evidence_records",
    column: "record_id",
  },
  // Read through `privacy_export_evidence_import_rows_v1()` (UNAPPLIED, RED:
  // see docs/security/PER-12-export-child-relations.md). It returns ONLY the
  // requesting person's own staged rows, without source_fact / fact_fields /
  // derived / customer_* / matching internals, which can describe other people
  // or the supplying organization's customers. Table RLS stays unchanged.
  {
    table: "evidence_import_rows",
    key: "organization_person_id",
    rpc: "privacy_export_evidence_import_rows_v1",
    rlsNote:
      "Staged import lines about you are read through a dedicated subject-safe function that returns only your own lines (dates, hours, kinds, status) and leaves out the raw source line, the free-text description, the project and customer labels, and other people's details. Until that function is applied in production this relation is listed as unavailable; ask us and we will answer through a route that can redact other people's rows.",
  },
  // A project that names the person as its responsible person. The project
  // itself is the organization's record; the person is exported only because
  // they are named on it. Rides the existing projects RLS (owner / manager /
  // assigned worker / admin): a responsible person outside those roles
  // receives nothing, which the note says.
  {
    table: "projects",
    key: "profile_id",
    column: "responsible_profile_id",
    as: "projects_responsible",
    redactActors: ["created_by", "owner_id"],
    rlsNote:
      "Projects you are named responsible for, as far as the project's own visibility rules let you read them; the project is the organization's record and you appear on it as its responsible person.",
  },
];

export type WithheldRelation = {
  readonly table: string;
  /** Said to the person, in the bundle, in words they can act on. */
  readonly reason: string;
};

/**
 * NAMED, NOT SILENT. Each of these holds rows keyed to the person and is
 * still withheld, because handing it over would hand over someone else too.
 */
export const WITHHELD_RELATIONS: readonly WithheldRelation[] = [
  {
    table: "conversation_participants",
    reason:
      "conversations and messages — they contain the other party's words, so they need a route that can separate them from yours",
  },
  {
    table: "companies",
    reason:
      "company records — these belong to the organization, not to you personally, even where you created it",
  },
  {
    table: "agencies",
    reason: "agency records — organization records, as above",
  },
  {
    table: "customers",
    reason: "customer records — organization records, as above",
  },
  {
    table: "customer_requests",
    reason:
      "demand you posted on behalf of a buying organization — it is that organization's business record, not your personal data",
  },
  {
    table: "customer_request_attachments",
    reason: "files attached to that organization's demand, as above",
  },
  {
    table: "demand_shortlist",
    reason:
      "an employer's private shortlisting decision about you — their judgement is their record; ask us and we will tell you what was decided, without exposing their notes",
  },
  {
    table: "org_documents",
    reason:
      "documents an organization owns that happen to reference you — the organization is their subject, not you",
  },
  {
    table: "ai_runs",
    reason:
      "AI run records — their inputs can quote another person, so they need a redaction pass before they can be handed over",
  },
  {
    table: "pilot_drafts",
    reason:
      "legacy pilot drafts, superseded by the canonical demand intake — kept only so nothing is lost, not maintained as your record",
  },
  // Named 2026-09-19 — these were withheld in effect (only the participant
  // rows were named) but not by name.
  {
    table: "conversations",
    reason:
      "conversation threads you created — they hold the other party's words as well as yours, so they need a route that can separate the two",
  },
  {
    table: "conversation_messages",
    reason:
      "messages you wrote — each sits in a thread with the other party's messages, so they need a route that can separate them from yours",
  },
  {
    table: "conversation_message_attachments",
    reason:
      "files you attached to messages — the same thread rule as the messages themselves",
  },
  {
    table: "messages",
    reason:
      "a retired message table kept only so nothing is lost — the same thread rule as conversation_messages",
  },
  {
    table: "company_need_public_intakes",
    reason:
      "a need someone submitted before signing in, keyed only by an e-mail address — it is matched to an account only when that person claims it, so ask us and we will look it up by the address you used",
  },
  {
    table: "leads",
    reason:
      "pre-sign-in enquiries keyed only by e-mail address — matched to you only on request, by the address you used",
  },
  {
    table: "waitlist",
    reason:
      "the waiting-list entry keyed only by e-mail address — matched to you only on request, by the address you used",
  },
  {
    table: "agency_clients",
    reason:
      "an agency's own client list, which may carry a contact e-mail — it is the agency's business record, not your personal data",
  },
  {
    table: "project_clients",
    reason:
      "an organization's own client record on a project, which may carry a contact e-mail — the organization's business record, not yours",
  },
];

/**
 * THE PERSON APPEARS ONLY AS THE ACTOR. These relations carry a person column
 * that records WHO DID the thing (`created_by`, `actor_id`, `reviewed_by`,
 * `uploaded_by`, …) on a record whose subject is an organization, a project,
 * a document or another person. The record is that subject's data; the
 * person's part in it is the organization's own audit trail and is not
 * theirs to receive in a subject-access bundle. The guard allows a table here
 * ONLY when every person column on it is an actor column — the moment one of
 * them names a subject, the table must be exported or withheld instead.
 */
export const ACTOR_ONLY_RELATIONS: readonly string[] = [
  // Discovered-organization provenance: the person is only the recorder of a
  // fact or identifier about a COMPANY, never its subject.
  "organization_facts",
  "organization_identifiers",
  "agency_client_connections",
  "agency_client_request_shares",
  "assets",
  "audit_logs",
  "company_locations",
  "decision_document_links",
  "decision_task_links",
  "defect_corrections",
  "education_cohorts",
  "education_programs",
  "evidence_import_events",
  "evidence_import_sessions",
  "finance_records",
  "learning_policy_settings",
  "leave_balance_policies",
  "lmc_settings",
  "management_decision_events",
  "market_rate_averages",
  "offboarding_run_items",
  "onboarding_templates",
  "org_document_events",
  "organization_evidence_parties",
  "pilots",
  "procurement_events",
  "procurement_offers",
  "productivity_units",
  "project_budgets",
  "project_handover_entries",
  "project_stages",
  "review_cycles",
  "review_evidence_links",
  "task_dependencies",
  "training_programs",
  "training_skill_links",
  "workflow_definition_versions",
  "workflow_definitions",
];

/**
 * Tables that hang off an exported table's id (an FK to it) and are
 * deliberately NOT exported, each with the reason. PER-12 added this register
 * because the person-column sweep cannot see a child table that carries only a
 * parent id: without it a new event/metric table under an exported parent is
 * silently absent from a subject-access bundle. The guard fails on any such
 * child that is neither exported, withheld, nor listed here.
 */
export type ReviewedChild = {
  readonly table: string;
  readonly reason: string;
};
export const CHILD_TABLES_NOT_EXPORTED: readonly ReviewedChild[] = [
  {
    table: "decision_document_links",
    reason:
      "links an organization's management decision to a document: the decision is the organization's record and the person appears on it only as the responsible party",
  },
  {
    table: "decision_task_links",
    reason:
      "links an organization's management decision to a task: organization structure, not data about the person",
  },
  {
    table: "management_decision_events",
    reason:
      "audit trail of an organization's management decision; the person is named responsible on the decision (exported) but the trail is the organization's own record",
  },
  {
    table: "defect_corrections",
    reason:
      "an organization's quality-correction record on a defect the person was assigned; the record belongs to the organization's quality process",
  },
  {
    table: "procurement_events",
    reason:
      "audit trail of an organization's procurement inquiry; business record of the buying organization, not personal data",
  },
  {
    table: "procurement_offers",
    reason:
      "supplier offers on an organization's procurement inquiry: supplier commercial terms, a third party's data",
  },
  {
    table: "review_evidence_links",
    reason:
      "links a performance review to organization evidence records; the linked evidence is exported through its own relations",
  },
  {
    table: "project_stages",
    reason:
      "a stage of an organization's project that may point at the person's engagement as its contractor; project structure, the organization's record",
  },
  {
    table: "offboarding_run_items",
    reason:
      "checklist items of an organization's offboarding process; the organization's own task list (items assigned to you as the responsible person are exported on the onboarding side, and the run itself is exported)",
  },
  {
    table: "organization_evidence_parties",
    reason:
      "the other organizations recorded as parties to an evidence record: third-party organization data, not data about you",
  },
  {
    table: "task_dependencies",
    reason:
      "dependency edges between two organization tasks: workflow structure between tasks, not an attribute of a person",
  },
  {
    table: "threads",
    reason:
      "conversation threads on a match; same thread rule as conversations: they hold the other party's words, so they need a route that can separate them",
  },
  {
    table: "training_skill_links",
    reason:
      "links a training programme assignment to a skill taxonomy entry; programme content rather than personal data (the assignment itself is exported)",
  },
];

/**
 * Carries a person column but is NOT a record OF the person: a one-off
 * migration artifact. Listed so the completeness guard can account for every
 * table rather than quietly skipping one.
 */
export const NON_PRODUCT_RELATIONS: readonly string[] = [
  "worker_display_name_backfill_20260805",
];

/** The person's own row in `profiles`, and their `workers` rows, are read
 *  separately by the exporter because everything else keys off them. */
export const ROOT_RELATIONS: readonly string[] = ["profiles", "workers"];
