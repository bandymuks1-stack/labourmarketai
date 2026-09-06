/**
 * Activation Funnel event registry (P0-A).
 *
 * PURE constants + types ONLY — this module imports nothing from the
 * client telemetry pipe (`task.ts`) or the server action, so it is safe
 * to import from BOTH server components (to pass an event name into a
 * client `<TelemetryView />`) and client components (to call
 * `trackFunnel` from `lib/telemetry/task.ts`).
 *
 * Why a registry: the original `pilot_events` only ever captured deep
 * feature events fired by a handful of components the owner reached, so
 * the real-user activation funnel was invisible (see
 * runtime/audits/p0-activation-telemetry-repair-plan-2026-06-30.md §5-7).
 * These names instrument the funnel end-to-end for ALL users through the
 * existing RLS-safe insert path — no migration, no schema change.
 *
 * Privacy: events carry only the bounded, non-PII metadata described by
 * `FunnelMetadata`. NEVER email / name / phone / address / free-text
 * CV / profile / journal / message bodies. The server action
 * (`lib/telemetry/actions.ts`) additionally allowlists metadata keys and
 * caps sizes, so anything off-contract is dropped before insert.
 */

export const FUNNEL_EVENTS = {
  // ── Public acquisition funnel (Pre-Advertising Launch Readiness v1).
  //    These are the TOP of the funnel — the surfaces a paid-ad visitor
  //    reaches BEFORE the login wall. They fire for anonymous users through
  //    the same RLS-safe insert path (profile_id = NULL for anon). This is
  //    what makes a paid campaign measurable. No migration, no schema change.
  landingViewed: "landing_viewed",
  ctaClicked: "cta_clicked",
  roleSelected: "role_selected",
  registrationStarted: "registration_started",
  companyNeedStarted: "company_need_started",
  companyNeedSubmitted: "company_need_submitted",
  loginStarted: "login_started",
  loginSucceeded: "login_succeeded",
  onboardingStarted: "onboarding_started",
  // ── Per-step onboarding progress (Pilot Onboarding and Measurement v1).
  //    The wizard has exactly two steps; these bounded names make per-step
  //    drop-off queryable from pilot_events without any schema change.
  //    step_role_completed fires when the user confirms the role step;
  //    step_profile_completed fires when the profile step is submitted with
  //    valid inputs (server confirmation is onboarding_completed).
  onboardingStepRoleCompleted: "onboarding_step_role_completed",
  onboardingStepProfileCompleted: "onboarding_step_profile_completed",
  onboardingCompleted: "onboarding_completed",
  // ── Time-to-first-value (FIRST REAL ECOSYSTEM USE, 2026-09-03). The key
  //    metric is not a page view: it is the moment a person performs their
  //    first REAL state-changing action and the moment they receive a real
  //    result for it. Emitted at the action points of each actor's first
  //    value chain; `role_context` carries the actor, `intent` the first-run
  //    choice, `surface` the chain. Bounded scalars only, never ids/PII.
  firstRealAction: "first_real_action",
  firstRealResult: "first_real_result",
  dashboardViewed: "dashboard_viewed",
  firstActionCardViewed: "first_action_card_viewed",
  firstActionCardClicked: "first_action_card_clicked",
  profileViewed: "profile_viewed",
  profileEditStarted: "profile_edit_started",
  profileSaved: "profile_saved",
  avatarUploadStarted: "avatar_upload_started",
  avatarUploadSucceeded: "avatar_upload_succeeded",
  preferredLocationViewed: "preferred_location_viewed",
  preferredLocationAddStarted: "preferred_location_add_started",
  preferredLocationSaved: "preferred_location_saved",
  journalViewed: "journal_viewed",
  journalEntryStarted: "journal_entry_started",
  journalEntrySaved: "journal_entry_saved",
  companyDashboardViewed: "company_dashboard_viewed",
  companyDemandActionClicked: "company_demand_action_clicked",
  demandFormViewed: "demand_form_viewed",
  demandSaved: "demand_saved",
  marketplaceOrOpportunitiesViewed: "marketplace_or_opportunities_viewed",
  serviceRequestStarted: "service_request_started",
  serviceRequestSent: "service_request_sent",
  returnVisitDetected: "return_visit_detected",
  // ── Worker signup-completion + CV + booking funnel (Worker Launch
  //    Readiness v1). Closes the gaps between registration_started and the
  //    later activation events so a paid worker-ad campaign is measurable
  //    end-to-end. All carry ONLY bounded scalars already on the allowlist
  //    (surface / success / role_context) — no new metadata key, no schema
  //    or RLS change, no third-party tracker, no PII.
  //    signup_completed fires once when a NEW signup first reaches an
  //    authenticated surface (distinguished from a returning login via a
  //    one-shot pending flag set at signup time — see lib/telemetry/task.ts).
  signupCompleted: "signup_completed",
  cvUploadStarted: "cv_upload_started",
  cvUploadSucceeded: "cv_upload_succeeded",
  bookingViewed: "booking_viewed",
  bookingAccepted: "booking_accepted",
  bookingDeclined: "booking_declined",
  //    Owner contract §4D (2026-09-05): an invitation addressed to the person
  //    was ACCEPTED from the chat's attention item — server-emitted by the
  //    conversation executor only on a real `accepted` / `linked` outcome
  //    (the SAME accept RPCs the network page and the dashboard card call).
  //    Bounded scalars only (surface / entity_type / success); no PII.
  invitationAccepted: "invitation_accepted",
  // ── Mid-funnel marketplace progression (W14 Pilot Analytics slice v1).
  //    The gap between "booking_*" and nothing: the stages where a demand
  //    actually turns into work — match preview → shortlist → contact →
  //    booking proposal → engagement → project → published experience.
  //    All are emitted SERVER-SIDE at the real action points through the
  //    existing RLS-safe insert path (lib/telemetry/server-funnel.ts →
  //    recordTelemetryEvent; profile_id derived server-side, fire-and-forget,
  //    a telemetry failure never breaks the action). Bounded scalars only —
  //    candidate_count is a count, never an id list. No migration, no schema
  //    change, no new RLS.
  //    `engagement_ended` fires from the ONE shared end path
  //    (lib/engagements/end-engagement.ts, on main since #1009) only on a
  //    real `ended` outcome — never on `already_ended`, a refusal or an
  //    error. `role_context` carries the server-derived actor side
  //    ("company" | "worker"); an ended engagement ends ONLY that
  //    engagement row, so the event implies no exclusive employment.
  matchPreviewGenerated: "match_preview_generated",
  shortlistAdded: "shortlist_added",
  contactRequested: "contact_requested",
  contactDisclosed: "contact_disclosed",
  bookingProposed: "booking_proposed",
  engagementCreated: "engagement_created",
  engagementEnded: "engagement_ended",
  projectAssigned: "project_assigned",
  projectCompleted: "project_completed",
  experienceSubmitted: "experience_submitted",
  experiencePublished: "experience_published",
  organizationCreated: "organization_created",
  // ── External-supply funnel (Sweden worker loop v1). The one click that
  //    proves a public-source ad delivered value: the person confirmed and
  //    opened the publisher's original advertisement. Bounded scalars only
  //    (cta_id names the mounting surface); no URL, no ad id, no PII.
  externalAdOpened: "external_ad_opened",
  // The retention loop's heartbeat: after a journal contribution genuinely
  // added/strengthened skills, the person opened the recomputed board via
  // the completion CTA. journal_entry_saved → this → return_visit is the
  // measurable "contribute → benefit → inspect" chain (§14).
  journalRematchViewed: "journal_rematch_viewed",
  // ── Profession recovery (2026-08-21). Onboarding now asks what work the
  //    person does, but the people already PAST that screen never were: 25 of
  //    29 onboarded workers hold no profession, so their board cannot be
  //    directed at their trade. These three measure whether one dismissible
  //    prompt actually recovers them, and `dismissed` is the honest
  //    denominator that stops "opened" from looking like consent. Bounded
  //    names only, NO metadata: which trade a person selected is profile data
  //    and never belongs in an event.
  //
  //    There is deliberately NO `profession_added` event. The conversion is
  //    already visible as real state — a `worker_professions` row — and a row
  //    cannot drift from the thing it measures the way a fire-and-forget
  //    client event can. Declaring an event nothing emits would be a dead
  //    constant wearing the costume of measurement.
  professionRecoveryPromptSeen: "profession_recovery_prompt_seen",
  professionRecoveryPromptOpened: "profession_recovery_prompt_opened",
  professionRecoveryPromptDismissed: "profession_recovery_prompt_dismissed",
  // ── Chat-first execution funnel (real recruiter pilot, 2026-09-04). The
  //    first real recruiter typed a valid agency sentence and fell through to
  //    the generic fallback — and nothing measured it. These five make the
  //    conversational operating layer measurable end-to-end: was the sentence
  //    understood (`step` = the routed intent id, never the sentence), did the
  //    chat have to ask for one missing fact, was a canonical action
  //    attempted, did it persist (server-side, in the ONE dispatcher). Bounded
  //    scalars only: intent/action ids and the coarse role — never text, ids
  //    or e-mails. `first_real_action` / `first_real_result` stay the
  //    value events; these are the mechanics that lead to them.
  chatIntentRecognized: "chat_intent_recognized",
  chatIntentUnrecognized: "chat_intent_unrecognized",
  chatMissingDataAsked: "chat_missing_data_asked",
  chatActionAttempted: "chat_action_attempted",
  chatActionPersisted: "chat_action_persisted",
  // ── Public entry (frozen design contract 2026-09-05, package P1). An
  //    anonymous visitor types a sentence on the landing and the SAME
  //    deterministic router reads it before any account exists. One event,
  //    fired through the anon-insert path (profile_id NULL) with the chat
  //    funnel's own shape: `step` = the routed intent id, "unrecognised", or
  //    "chip" (the two-chip answer to the one question), `intent` = the
  //    first-run family it belongs to, `resolution` = "deterministic". The
  //    sentence itself is NEVER recorded.
  landingIntent: "landing_intent",
} as const;

export type FunnelEventName =
  (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

/** Every funnel event name as a flat readonly list (used by guard tests). */
export const FUNNEL_EVENT_NAMES: readonly FunnelEventName[] =
  Object.values(FUNNEL_EVENTS);

/**
 * The ONLY metadata shape funnel events may carry. All keys are bounded,
 * non-identifying scalars and mirror a subset of the server allowlist in
 * `lib/telemetry/actions.ts`. No free-text user content ever goes here.
 */
export type FunnelMetadata = {
  /** Source surface, e.g. 'dashboard' | 'profile' | 'google' | 'password'. */
  surface?: string;
  /** A coarse step label inside a multi-step flow, e.g. 'compose'. */
  step?: string;
  /** Coarse role context: 'worker' | 'company' | 'agency' | 'customer' | 'person'. */
  role_context?: string;
  /** How a chat sentence was resolved: 'deterministic' (the always-on
   *  router), 'goal' (the ACTIVE CONVERSATION GOAL — a continuation such as
   *  "Nuo spalio." that the router alone reads as unknown; owner P0
   *  2026-09-06) or 'llm' (the Gemini proposer, owner approval 2026-09-05).
   *  Never the sentence. */
  resolution?: "deterministic" | "goal" | "llm";
  /** First-run intent: 'work' | 'hire' | 'agency' | 'student' | 'education',
   *  or a comma-joined set of them. Never free text. */
  intent?: string;
  /** Anonymous entity type, e.g. 'company_request' | 'agency_offer'. Never an id. */
  entity_type?: string;
  /** Coarse success/failure flag for an attempted action. */
  success?: boolean;
  /** True when the event was fired from a non-production origin (localhost /
   *  Vercel preview). Stamped automatically by `trackFunnel` so dev/preview
   *  traffic can be excluded from the owner's real acquisition funnel. */
  preview_host?: boolean;
  /** Coarse audience of a public marketing surface: 'workers' | 'companies' | 'agencies' | 'home'. */
  audience?: string;
  /** Stable, non-PII identifier of a CTA button, e.g. 'hero_signup' | 'company_need'. */
  cta_id?: string;
  // ── First-touch campaign attribution (Pre-Advertising Launch Readiness v1).
  //    Bounded, sanitized ad-campaign dimensions ONLY — never a raw query
  //    string, never a full referrer URL, never any user-entered value.
  //    Captured once on the first landing and attached to conversion events
  //    (see lib/telemetry/attribution.ts). Mirrors the server allowlist.
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Referrer HOST only (e.g. 'google.com') — never the full referrer URL. */
  referrer_host?: string;
  /** The path (no query) the visitor first landed on, e.g. '/for-workers'. */
  landing_path?: string;
  /** User-selected canonical landing presentation: 'live' | 'focus'. */
  mode?: "live" | "focus";
  /** How many candidates a match preview produced (a COUNT, never ids —
   *  W14 mid-funnel `match_preview_generated`). */
  candidate_count?: number;
  // ── M-P0-8 organization-aware attribution. Stamped SERVER-SIDE by the
  //    server-funnel emitter from the validated active workspace (see
  //    lib/telemetry/analytics-attribution.ts) — a personal workspace
  //    carries no organization, ever; ids are opaque uuids, not PII.
  /** 'personal' | 'organization'. */
  workspace_type?: string;
  /** The validated active workspace's organization id. */
  organization_id?: string;
  /** The caller's governance role behind that workspace. */
  org_role?: string;
  /** M-P0-7 billing subject for the same workspace: 'profile' | 'organization'. */
  billing_subject?: string;
  /** Referenced entity type: 'project' | 'booking' | 'engagement'. */
  ref_type?: string;
  /** Referenced entity id (opaque uuid). */
  ref_id?: string;
};
