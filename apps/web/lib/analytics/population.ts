/**
 * THE canonical analytics population boundary (W14 item 5).
 *
 * WHAT WENT WRONG WITHOUT ONE. Exclusion was decided per surface. The event
 * inbox had an opt-in "exclude admins" checkbox; the acquisition funnel had a
 * hardcoded `preview_host` filter and never saw the checkbox at all. So the
 * owner's own navigation counted as acquisition traffic on the one panel that
 * exists to judge whether to spend money on ads, while the table underneath it
 * could be told to hide exactly those rows. Two surfaces over one table,
 * disagreeing about who counts.
 *
 * This module is the single place that answers "does this event represent a
 * real prospective user?". A metric added later inherits the rule by calling
 * `isBusinessFunnelCountable` rather than by remembering a filter.
 *
 * ── WHAT CAN AND CANNOT BE CLASSIFIED ──────────────────────────────────────
 *
 * DETERMINISTIC, from data the row already carries:
 *   - ADMIN     — `profile_id` is set server-side from `auth.getUser()` and
 *                 matched against the current admin set. Unspoofable by a
 *                 client, and retroactive: historical rows classify too.
 *   - PREVIEW   — `metadata.preview_host`, now stamped by BOTH emitters from
 *                 one shared host rule (see lib/telemetry/production-host.ts).
 *   - IDENTIFIED_USER — `profile_id` set and not an admin.
 *
 * NOT DETERMINISTIC, and deliberately left UNKNOWN:
 *   - an ANONYMOUS visitor is anonymous. Most top-of-funnel events
 *     (`landing_viewed`, `cta_clicked`, `registration_started`) carry no
 *     `profile_id` because they happen before sign-in. The owner browsing
 *     their own landing page while logged out is, in the data, identical to a
 *     real visitor. No marker distinguishes them and none is invented here.
 *
 * The honest consequence is written down rather than hidden: admin exclusion
 * removes AUTHENTICATED internal activity only. See
 * `HISTORICAL_CONTAMINATION_UNKNOWN` below.
 *
 * ── THE SYMMETRY REQUIREMENT ───────────────────────────────────────────────
 *
 * Filtering a rate's numerator by a rule its denominator cannot be filtered by
 * does not clean the rate — it DEFLATES it, replacing one wrong number with a
 * differently wrong number. So the rule is applied uniformly to every event
 * feeding a rate, and `RATE_AUTH_PROFILE` records that each of the seven
 * funnel rates compares two events of the same authentication profile. That
 * property is asserted by a test, not assumed.
 */

/** Who or what produced an event. */
export const ANALYTICS_POPULATIONS = [
  "identified_user",
  "admin",
  "preview",
  "anonymous",
] as const;
export type AnalyticsPopulation = (typeof ANALYTICS_POPULATIONS)[number];

/** The fields classification is allowed to look at. Nothing else is read —
 *  in particular no route, locale or user-agent heuristics. */
export interface ClassifiableEvent {
  readonly profileId: string | null | undefined;
  readonly metadata: Record<string, unknown> | null | undefined;
}

/**
 * Classify one event. Order matters and is deliberate: a preview origin is a
 * stronger signal than the identity behind it, because a real user's session
 * on a preview deploy is still not production traffic.
 */
export function classifyEvent(
  event: ClassifiableEvent,
  adminProfileIds: ReadonlySet<string>,
): AnalyticsPopulation {
  if (event.metadata?.["preview_host"] === true) return "preview";
  const pid = typeof event.profileId === "string" ? event.profileId : null;
  if (!pid) return "anonymous";
  return adminProfileIds.has(pid) ? "admin" : "identified_user";
}

/**
 * Does this population belong in a BUSINESS conversion metric?
 *
 * `anonymous` counts — it is the normal state of a genuine prospective user at
 * the top of the funnel, and excluding it would empty the denominator of every
 * acquisition rate. That it also hides logged-out internal browsing is the
 * known, stated limit of this boundary, not an oversight.
 *
 * `admin` is excluded. This is the PLATFORM admin set (`profile_roles.role =
 * 'admin'` / `profiles.active_role = 'admin'`) — the owner and staff. It is
 * NOT a role an employer or worker holds: a company owner is privileged inside
 * their own organisation and is still a real customer, and nothing here
 * removes them.
 */
export function isBusinessFunnelCountable(
  population: AnalyticsPopulation,
): boolean {
  return population === "identified_user" || population === "anonymous";
}

/** Convenience: classify and decide in one step. */
export function countsForBusinessFunnel(
  event: ClassifiableEvent,
  adminProfileIds: ReadonlySet<string>,
): boolean {
  return isBusinessFunnelCountable(classifyEvent(event, adminProfileIds));
}

/**
 * Why funnel figures cannot be certified clean for the whole of history, in
 * one string the panel can render verbatim rather than paraphrase.
 *
 * Two distinct reasons, both permanent for the rows already written:
 *  1. logged-out internal browsing is indistinguishable from a real visitor
 *     in ANY row, past or future — no marker exists and none is invented;
 *  2. before the shared host rule shipped, SERVER-emitted events carried no
 *     preview marker at all, so preview/localhost mid-funnel activity was
 *     recorded as production.
 *
 * Reason 2 stops accruing from `MEASUREMENT_VALID_FROM`. Reason 1 does not.
 */
export const HISTORICAL_CONTAMINATION_UNKNOWN =
  "Internal browsing while logged out cannot be distinguished from a real visitor, so no period can be certified free of it. Server-emitted events also carried no preview marker before the shared host rule shipped.";

/**
 * The authentication profile of each event that feeds a funnel rate. Used by
 * the symmetry test: a rate whose two sides differ here could be deflated
 * rather than cleaned by an actor-based filter, and would need per-cohort
 * handling instead.
 *
 * "anonymous" = normally fired before sign-in; "authenticated" = only
 * reachable behind a session.
 */
export const RATE_AUTH_PROFILE: Readonly<
  Record<string, "anonymous" | "authenticated">
> = {
  landing_viewed: "anonymous",
  cta_clicked: "anonymous",
  role_selected: "anonymous",
  registration_started: "anonymous",
  onboarding_started: "authenticated",
  onboarding_completed: "authenticated",
  company_need_started: "anonymous",
  company_need_submitted: "anonymous",
  match_preview_generated: "authenticated",
  shortlist_added: "authenticated",
  contact_requested: "authenticated",
  contact_disclosed: "authenticated",
  booking_proposed: "authenticated",
  engagement_created: "authenticated",
  project_assigned: "authenticated",
  project_completed: "authenticated",
  experience_submitted: "authenticated",
  experience_published: "authenticated",
  organization_created: "authenticated",
};
