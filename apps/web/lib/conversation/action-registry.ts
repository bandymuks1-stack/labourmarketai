/**
 * Conversation Control — canonical Action Registry (foundation v1).
 *
 * A DETERMINISTIC, declarative catalogue of the actions the conversation-first
 * control layer can offer. It is the conversation layer's contract with the
 * rest of the platform:
 *
 *   - it carries NO domain logic and NO data writes — every entry only
 *     REFERENCES an existing canonical entrypoint (server action / RPC / REST
 *     route) by a stable `handler` descriptor. The real write, authorization
 *     (RLS + the canonical RPC), and result shape stay exactly where they are
 *     today (see docs/architecture/CONVERSATION_CONTROL_ARCHITECTURE_v1.md §3);
 *   - it is a FIXED code-path set (doctrine §10 boundary note — like the RBAC
 *     `Role` union): the ids are code paths, the LABELS resolve via the
 *     `conversation` i18n namespace, never inline copy;
 *   - the LLM may only PROPOSE an `id` + partial input from this registry; it
 *     can never execute and can never invent an action that is not here.
 *
 * This module is intentionally PURE (no server-only imports, no supabase, no
 * fetch) so it is safe to import from both server and client and is trivially
 * unit-testable. Execution is performed by a separate server dispatcher wired
 * per journey (Phase B/C/D), which re-checks role + input + confirmation token
 * before delegating to the referenced entrypoint.
 */

import type { Role } from "@/lib/auth/actions";
import { FUNNEL_EVENTS, type FunnelEventName } from "@/lib/telemetry/funnel-events";

/** How strongly an action must be confirmed before it runs. Mirrors the
 *  audited reversibility of each underlying entrypoint. */
export type ConfirmationTier =
  | "read" // no write — run immediately, show a result card
  | "reversible_write" // run, show result, offer inline edit / undo
  | "important_write" // explicit confirmation card required before dispatch
  | "strong_irreversible"; // strong confirmation (engagement / assignment / revoke / journal grant)

/** A real-world precondition the acting user must satisfy before the action is
 *  offered. Evaluated server-side from canonical rows; the shell uses it to
 *  hide/soft-disable an action a brand-new user cannot yet use, honestly. */
export type ActionPrecondition =
  | "authenticated"
  | "has_worker_row"
  | "has_worker_direction" // profession/direction set (skills need it)
  | "has_open_booking" // an incoming proposed booking exists
  | "has_visible_demand" // a currently-visible approved demand exists
  | "has_company"
  | "has_agency"
  | "has_agency_connection"; // an accepted agency<->client connection exists

/** How the conversation dispatcher reaches the existing canonical entrypoint.
 *  The registry never contains the logic — only a reference. `deep_link` means
 *  the foundation routes the user to the real Advanced-mode screen; the journey
 *  PRs upgrade selected entries to inline `server_action` / `rest` execution. */
export type ActionHandler =
  | { kind: "deep_link" } // route to `advancedRoute` (foundation default)
  | { kind: "server_action"; ref: string } // existing "use server" fn name
  | { kind: "rest"; method: "POST" | "DELETE"; ref: string }; // existing route

export interface ConversationActionDescriptor {
  /** Stable kebab id, e.g. "worker.respond-booking". Namespaced by subject. */
  readonly id: string;
  /** The primary subject role this action belongs to. */
  readonly subject: Role;
  /** Roles allowed to invoke it (re-checked server-side vs HELD roles). */
  readonly allowedRoles: readonly Role[];
  /** i18n key (namespace `conversation.actions`) for the human label. */
  readonly labelKey: string;
  /** i18n key for a one-line human description. */
  readonly descriptionKey: string;
  /** Confirmation strength required before it runs. */
  readonly confirmation: ConfirmationTier;
  /** Real-world precondition to satisfy before offering it. */
  readonly precondition: ActionPrecondition;
  /** True when the underlying RPC/table may be unapplied → the dispatcher must
   *  surface the honest `needs_migration` state instead of a hard error. */
  readonly migrationSensitive: boolean;
  /** Non-PII usage event emitted when the action is issued. */
  readonly telemetryEvent: FunnelEventName;
  /** The existing Advanced-mode route that performs this action today. Used as
   *  the deep-link target and as the "open the full screen" affordance. Must be
   *  a real route (guard-checked as locale-prefix-free, starting with "/"). */
  readonly advancedRoute: string;
  /** Reference to the canonical entrypoint. NEVER inline logic. */
  readonly handler: ActionHandler;
}

const E = FUNNEL_EVENTS;

/**
 * The canonical MVP action set (brief §9). Metadata only — see the entrypoint
 * inventory in the architecture doc for the exact server function each id maps
 * to. Foundation ships every entry as `deep_link`; journey PRs promote the
 * ones that should execute inline.
 */
export const CONVERSATION_ACTIONS: readonly ConversationActionDescriptor[] = [
  // ── WORKER ────────────────────────────────────────────────────────────────
  {
    id: "worker.complete-onboarding",
    subject: "worker",
    allowedRoles: ["worker", "company", "agency", "customer"],
    labelKey: "conversation.actions.worker.completeOnboarding.label",
    descriptionKey: "conversation.actions.worker.completeOnboarding.description",
    confirmation: "important_write",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.onboardingStarted,
    advancedRoute: "/onboarding",
    handler: { kind: "deep_link" },
  },
  {
    id: "worker.upload-cv",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.uploadCv.label",
    descriptionKey: "conversation.actions.worker.uploadCv.description",
    confirmation: "read", // extraction persists nothing
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.cvUploadStarted,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "rest", method: "POST", ref: "/api/cv/extract" },
  },
  {
    id: "worker.complete-profile",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.completeProfile.label",
    descriptionKey: "conversation.actions.worker.completeProfile.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.profileEditStarted,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "deep_link" },
  },
  {
    id: "worker.add-work-history",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.addWorkHistory.label",
    descriptionKey: "conversation.actions.worker.addWorkHistory.description",
    confirmation: "reversible_write",
    precondition: "has_worker_row",
    migrationSensitive: true, // save_self_declared_work_history_v1
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "confirmCvWorkHistoryAction" },
  },
  {
    id: "worker.add-language",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.addLanguage.label",
    descriptionKey: "conversation.actions.worker.addLanguage.description",
    confirmation: "reversible_write",
    precondition: "has_worker_row",
    migrationSensitive: true,
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "saveWorkerLanguageAction" },
  },
  {
    id: "worker.save-skills",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.saveSkills.label",
    descriptionKey: "conversation.actions.worker.saveSkills.description",
    confirmation: "reversible_write",
    precondition: "has_worker_direction",
    migrationSensitive: false,
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "rest", method: "POST", ref: "/api/workers/:id/skills" },
  },
  {
    id: "worker.add-education",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.addEducation.label",
    descriptionKey: "conversation.actions.worker.addEducation.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: true, // worker_education table
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "saveWorkerEducationAction" },
  },
  {
    id: "worker.add-achievement",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.addAchievement.label",
    descriptionKey: "conversation.actions.worker.addAchievement.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: true, // worker_achievements table
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "saveWorkerAchievementAction" },
  },
  {
    id: "worker.save-work-card",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.saveWorkCard.label",
    descriptionKey: "conversation.actions.worker.saveWorkCard.description",
    confirmation: "reversible_write",
    precondition: "has_worker_row",
    migrationSensitive: false,
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "saveWorkerCardAction" },
  },
  {
    id: "worker.save-preferences",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.savePreferences.label",
    descriptionKey: "conversation.actions.worker.savePreferences.description",
    confirmation: "reversible_write",
    precondition: "has_worker_row",
    migrationSensitive: false,
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "server_action", ref: "saveWorkerAvailabilityPrefsAction" },
  },
  {
    id: "worker.review-bookings",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.reviewBookings.label",
    descriptionKey: "conversation.actions.worker.reviewBookings.description",
    confirmation: "read",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.bookingViewed,
    advancedRoute: "/dashboard/bookings",
    handler: { kind: "deep_link" },
  },
  {
    id: "worker.respond-booking",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.respondBooking.label",
    descriptionKey: "conversation.actions.worker.respondBooking.description",
    confirmation: "strong_irreversible", // accept creates engagement/assignment (#857)
    precondition: "has_open_booking",
    migrationSensitive: true,
    telemetryEvent: E.bookingAccepted,
    advancedRoute: "/dashboard/bookings",
    handler: { kind: "server_action", ref: "respondBookingAction" },
  },
  {
    id: "worker.express-interest",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.expressInterest.label",
    descriptionKey: "conversation.actions.worker.expressInterest.description",
    confirmation: "important_write",
    precondition: "has_visible_demand",
    migrationSensitive: true,
    telemetryEvent: E.marketplaceOrOpportunitiesViewed,
    advancedRoute: "/dashboard/opportunities",
    handler: { kind: "server_action", ref: "expressInterestAction" },
  },
  {
    id: "worker.what-next",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.whatNext.label",
    descriptionKey: "conversation.actions.worker.whatNext.description",
    confirmation: "read",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.dashboardViewed,
    advancedRoute: "/dashboard",
    handler: { kind: "deep_link" },
  },

  // ── COMPANY ───────────────────────────────────────────────────────────────
  {
    id: "company.create-demand",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.createDemand.label",
    descriptionKey: "conversation.actions.company.createDemand.description",
    confirmation: "important_write",
    precondition: "authenticated", // demand writes on profile_id (no company row needed)
    migrationSensitive: true,
    telemetryEvent: E.demandFormViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "submitDemandRequestAction" },
  },
  {
    id: "company.review-candidates",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.reviewCandidates.label",
    descriptionKey: "conversation.actions.company.reviewCandidates.description",
    confirmation: "read",
    precondition: "has_company",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "deep_link" },
  },
  {
    id: "company.shortlist-candidate",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.shortlistCandidate.label",
    descriptionKey: "conversation.actions.company.shortlistCandidate.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: false,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "server_action", ref: "setShortlistAction" },
  },
  {
    id: "company.contact-worker",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.contactWorker.label",
    descriptionKey: "conversation.actions.company.contactWorker.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/inbox",
    handler: { kind: "server_action", ref: "requestWorkerConversationAction" },
  },
  {
    id: "company.propose-booking",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.proposeBooking.label",
    descriptionKey: "conversation.actions.company.proposeBooking.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/bookings",
    handler: { kind: "server_action", ref: "proposeBookingAction" },
  },
  {
    id: "company.assign-worker",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.company.assignWorker.label",
    descriptionKey: "conversation.actions.company.assignWorker.description",
    confirmation: "strong_irreversible", // binds worker to project (#857)
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/projects",
    handler: { kind: "server_action", ref: "assignWorkerToProjectAction" },
  },
  {
    id: "company.who-waits",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.whoWaits.label",
    descriptionKey: "conversation.actions.company.whoWaits.description",
    confirmation: "read",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "deep_link" },
  },

  // ── AGENCY ────────────────────────────────────────────────────────────────
  {
    id: "agency.review-clients",
    subject: "agency",
    allowedRoles: ["agency"],
    labelKey: "conversation.actions.agency.reviewClients.label",
    descriptionKey: "conversation.actions.agency.reviewClients.description",
    confirmation: "read",
    precondition: "has_agency",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "deep_link" },
  },
  {
    id: "agency.invite-client",
    subject: "agency",
    allowedRoles: ["agency"],
    labelKey: "conversation.actions.agency.inviteClient.label",
    descriptionKey: "conversation.actions.agency.inviteClient.description",
    confirmation: "important_write",
    precondition: "has_agency",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "inviteClientAction" },
  },
  {
    id: "agency.propose-candidate",
    subject: "agency",
    allowedRoles: ["agency"],
    labelKey: "conversation.actions.agency.proposeCandidate.label",
    descriptionKey: "conversation.actions.agency.proposeCandidate.description",
    confirmation: "important_write",
    precondition: "has_agency_connection",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "submitOfferAction" },
  },
  {
    id: "agency.offer-status",
    subject: "agency",
    allowedRoles: ["agency"],
    labelKey: "conversation.actions.agency.offerStatus.label",
    descriptionKey: "conversation.actions.agency.offerStatus.description",
    confirmation: "read",
    precondition: "has_agency",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "deep_link" },
  },
  {
    id: "agency.who-waits",
    subject: "agency",
    allowedRoles: ["agency"],
    labelKey: "conversation.actions.agency.whoWaits.label",
    descriptionKey: "conversation.actions.agency.whoWaits.description",
    confirmation: "read",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "deep_link" },
  },
] as const;

/** All registry ids (guard: unique, stable). */
export const CONVERSATION_ACTION_IDS: readonly string[] =
  CONVERSATION_ACTIONS.map((a) => a.id);

/** Lookup by id (undefined for an unknown id — an LLM proposal for an id not in
 *  the registry is rejected, never executed). */
export function getConversationAction(
  id: string,
): ConversationActionDescriptor | undefined {
  return CONVERSATION_ACTIONS.find((a) => a.id === id);
}

/** Actions offered to a viewer, filtered by their HELD roles. Ordering is the
 *  registry order; the shell re-prioritizes using next-action / spine. */
export function actionsForRoles(
  heldRoles: ReadonlySet<Role>,
): readonly ConversationActionDescriptor[] {
  return CONVERSATION_ACTIONS.filter((a) =>
    a.allowedRoles.some((r) => heldRoles.has(r)),
  );
}
