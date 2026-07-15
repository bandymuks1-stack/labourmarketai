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
  onboardingCompleted: "onboarding_completed",
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
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

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
  /** Anonymous entity type, e.g. 'company_request' | 'agency_offer'. Never an id. */
  entity_type?: string;
  /** Coarse success/failure flag for an attempted action. */
  success?: boolean;
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
};
