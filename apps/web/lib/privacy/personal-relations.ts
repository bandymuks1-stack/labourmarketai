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
 * TWO REGISTERED RELATIONS ARE NOT ON PRODUCTION YET (re-measured 2026-09-15):
 * `dashboard_preferences` and `demand_interest_seen`. They are registered
 * anyway — the export reads what the database has, and reports a relation the
 * database LACKS as empty (it genuinely holds nothing for anyone), not as
 * unread. Registering them now means the bundle grows by itself the day the
 * migration lands, instead of quietly omitting them for however long it takes
 * someone to notice.
 *
 * THE OTHER TWO LANDED, WHICH IS THE POINT. This paragraph said FOUR on
 * 2026-09-14 and named `worker_external_profiles` and `worker_opportunity_seen`
 * among them; both were applied to production on 2026-09-15 (PER-11's split
 * `external_profiles_v1`, ledger 20260915042406, and `worker_opportunity_seen_v1`,
 * ledger 20260914202221). The bundle picked them up with no code change —
 * exactly the behaviour this design was for — and the only thing that needed
 * correcting was this sentence. Apply status belongs to the database, not to a
 * comment: re-measure before believing any line like the one this replaced.
 */

/** How a relation is joined to the person. */
export type PersonKey = "profile_id" | "worker_id";

export type ExportedRelation = {
  readonly table: string;
  readonly key: PersonKey;
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
  { table: "worker_absences", key: "worker_id" },
  { table: "business_trips", key: "profile_id" },
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
  { table: "demand_interest_seen", key: "worker_id" },
  { table: "worker_opportunity_seen", key: "worker_id" },
  { table: "worker_external_profiles", key: "worker_id" },

  // ── Account and billing ───────────────────────────────────────────────
  { table: "subscriptions", key: "profile_id" },
  { table: "lmc_accounts", key: "profile_id" },
  { table: "usage_cost_events", key: "profile_id" },

  // ── Pilot programme participation ─────────────────────────────────────
  { table: "pilot_participants", key: "profile_id" },
  { table: "pilot_events", key: "profile_id" },
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
