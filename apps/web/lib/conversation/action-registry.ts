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

/**
 * Who an action BELONGS to.
 *
 * Almost always a `Role`: the action is one party's act, and that party's name
 * is the id's namespace. §7.1 adds the one shape that is genuinely neither —
 * ending a company↔worker engagement, where the employer and the worker hold
 * the SAME authority over the SAME row (`owns_company(...) OR the engagement's
 * own worker`, in SQL since 20260723120000). Naming such an act after one side
 * would be a lie about who owns it, and would invite the exact drift this
 * registry exists to prevent: a `company.end-engagement` and a
 * `worker.end-engagement` that are two authorization models for one decision.
 *
 * A relationship subject is therefore held to a STRICTER rule than a role
 * subject, pinned by the guard test: it must list BOTH party roles, so it can
 * never quietly become a one-sided action wearing a neutral name.
 */
export type ActionSubject = Role | "engagement";

export interface ConversationActionDescriptor {
  /** Stable kebab id, e.g. "worker.respond-booking". Namespaced by subject. */
  readonly id: string;
  /** The primary subject this action belongs to — a role, or the relationship
   *  itself when both parties hold the same authority (see `ActionSubject`). */
  readonly subject: ActionSubject;
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
  /**
   * The non-PII funnel event this action BELONGS TO — a contract declaration,
   * **NOT an emitter**.
   *
   * CORRECTED 2026-08-08. This used to read "emitted when the action is
   * issued", which was false: nothing reads this field. It is assigned here,
   * type-checked against `FunnelEventName` by `action-registry.test.ts`, and
   * never passed to `trackFunnel`, `emitServerFunnelEvent` or `TelemetryView`.
   *
   * The mistake was not harmless. A structural guard checked that this file
   * CONTAINS the string `dashboardViewed` and concluded the event was covered;
   * `dashboard_viewed` — the activation funnel's first step — was in fact never
   * sent by anything, so the step reported zero because nobody was counting.
   * Twelve of the thirteen events declared here happen to be emitted by their
   * own surfaces, which is why only one gap existed and why it stayed hidden.
   *
   * If you need an event sent, add a real emitter on the surface.
   * `w14-dashboard-viewed-emitter.test.ts` pins that every event declared here
   * has one.
   */
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
    /**
     * Record a document by sentence (owner contract 2026-09-04 §12/§14 —
     * documents first-class). "Turiu naują A1 iki 2027-03" → the one inline
     * form (type / country / valid until, pre-filled from the sentence) over
     * the canonical upsert the documents page uses. The file itself stays a
     * documents-centre upload; the readiness re-answers right after.
     */
    id: "worker.add-document",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.addDocument.label",
    descriptionKey: "conversation.actions.worker.addDocument.description",
    confirmation: "reversible_write",
    precondition: "has_worker_row",
    migrationSensitive: true,
    telemetryEvent: E.profileSaved,
    advancedRoute: "/dashboard/documents",
    handler: { kind: "server_action", ref: "upsertWorkerDocumentAction" },
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
    id: "worker.log-work",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.logWork.label",
    descriptionKey: "conversation.actions.worker.logWork.description",
    confirmation: "important_write", // saves an append-only journal entry after explicit confirm
    precondition: "has_worker_row",
    migrationSensitive: true, // create_journal_entry_full RPC
    telemetryEvent: E.journalEntrySaved,
    advancedRoute: "/dashboard/journal",
    handler: { kind: "server_action", ref: "createJournalEntry" },
  },
  {
    // W6 slice 3 — the door to the `experiences` result. A READ: it opens the
    // panel, it writes nothing. Submitting, replying and disputing are
    // separate RPC-backed writes that need an eligible interaction, and none
    // of them hides behind this action.
    id: "worker.review-experiences",
    subject: "worker",
    // EVERY SIGNED-IN ROLE, matching the result's own `contexts`
    // ["personal","organization","project"]. The mismatch was reported by the
    // employer-organization-context audit; the fix below is W6's, not that
    // slice's — `employer-organization-context.test.ts` §6 pins that the
    // employer slice itself never edited this file.
    // The result was opened to organization context because the AUTHOR side of
    // this domain is normally an employer acting from inside their workspace —
    // but this gate stayed `["worker"]`, so a company-only employer could never
    // reach the door the result had already opened. `experience-entry.ts`
    // resolves the two parties SYMMETRICALLY from the canonical row
    // (`viewerId === ownerId` → subject is the worker; `viewerId ===
    // workerProfile` → subject is the employer), so the employer was always a
    // first-class viewer here; only this list disagreed.
    //
    // Widening this ONE gate is the whole fix: no second action, no second
    // experience system. The role list never grants anything — eligibility is
    // still re-derived server-side per interaction from real rows, and a viewer
    // who is not a party gets the same `not_available` as a forged token.
    allowedRoles: ["worker", "company", "agency"],
    labelKey: "conversation.actions.worker.reviewExperiences.label",
    descriptionKey: "conversation.actions.worker.reviewExperiences.description",
    confirmation: "read",
    precondition: "authenticated",
    // The experience domain migration is owner-gated; the read degrades to an
    // honest "not available in this environment" state rather than an empty
    // list, so the sensitivity is declared here too.
    migrationSensitive: true,
    telemetryEvent: E.profileViewed,
    advancedRoute: "/dashboard/profile",
    handler: { kind: "deep_link" },
  },
  {
    // §7.1 — the WORKER's door to the `engagements` result. A READ: it opens
    // the panel and writes nothing. Ending an engagement is a separate,
    // confirmation-gated act (`engagement.end`) that never hides behind this.
    //
    // WORKER-ONLY, and that is the honest split rather than an oversight. The
    // employer has their own door (`company.review-engagements`) because the
    // two are asking different questions of the same table — "the work I
    // personally do" versus "this company's roster" — and the reader keeps
    // exactly that distinction (`context: "personal" | "organization"`). One
    // shared read action would have to guess which of the two the person
    // meant. Both doors open the SAME result and the SAME renderer; only the
    // context differs, and the context is derived from where the person is
    // standing, never from the action.
    id: "worker.review-engagements",
    subject: "worker",
    allowedRoles: ["worker"],
    labelKey: "conversation.actions.worker.reviewEngagements.label",
    descriptionKey: "conversation.actions.worker.reviewEngagements.description",
    confirmation: "read",
    precondition: "authenticated",
    // `company_worker_engagements` reaches back to an applied migration, but
    // the v2 RPC this result's CTA needs is owner-gated — the panel degrades
    // to an honest "not available here" state rather than an empty list.
    migrationSensitive: true,
    telemetryEvent: E.dashboardViewed,
    // There is no worker-side engagements SCREEN, and none is invented for
    // one: the `experiences` precedent applies (a 73rd route would be refused
    // by Product Gate A-09). The planning surface is the closest honest
    // full-screen destination for "the work I am doing".
    advancedRoute: "/dashboard/planning",
    handler: { kind: "deep_link" },
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
    // §19 explicit human act — confirm the offline-recognized skill set on the
    // company's OWN demand. Canonical write: confirmRecognizedNeedAction
    // (own-row update under the existing customer_requests RLS — no RPC).
    id: "company.confirm-need",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.confirmNeed.label",
    descriptionKey: "conversation.actions.company.confirmNeed.description",
    confirmation: "important_write", // the whole point IS the explicit confirm
    precondition: "authenticated", // demand rows key on profile_id
    migrationSensitive: false,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "server_action", ref: "confirmRecognizedNeedAction" },
  },
  {
    // Close the company's own demand — hidden from the worker board (its RPC
    // serves status='submitted' only). Reversible via company.reopen-demand.
    // NOTE: there is deliberately NO "publish" action — visibility is
    // RLS/RPC-driven (submitted + verified-company gate), a separate honest
    // state, never a fake publish switch (§7).
    id: "company.close-demand",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.closeDemand.label",
    descriptionKey: "conversation.actions.company.closeDemand.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "server_action", ref: "closeDemandAction" },
  },
  {
    // Reopen a previously closed demand (back to submitted → worker-visible
    // again through the same verified-company gate).
    id: "company.reopen-demand",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.reopenDemand.label",
    descriptionKey: "conversation.actions.company.reopenDemand.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "server_action", ref: "reopenDemandAction" },
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
    // W11 audit P2-4: this was `/dashboard/company/projects`, which has no
    // `page.tsx` — that directory holds only `new/`. The "open full screen"
    // affordance for an irreversible action led to a 404. Every other caller in
    // the tree already uses either `/dashboard/company/projects/new` (create) or
    // `/dashboard/projects` (the list); this action assigns a worker to an
    // EXISTING project, so the list is its screen. `dashboard/projects` is
    // REAL_LAUNCH_SURFACE in the route truth map.
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "assignWorkerToProjectAction" },
  },
  {
    /**
     * §11 (owner contract 2026-09-04) — the WHAT-IF move: a person leaves
     * project X for project Y. The chat shows the consequences on both sides
     * from canonical reads first; this action is the confirmed commit — two
     * canonical RPCs in the safe order (assign to Y, then end X).
     */
    id: "company.move-worker",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.company.moveWorker.label",
    descriptionKey: "conversation.actions.company.moveWorker.description",
    confirmation: "strong_irreversible", // binds + ends assignments
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "assignWorkerToProjectAction" },
  },
  {
    // §7.1 — the EMPLOYER's door to the `engagements` result. The mirror of
    // `worker.review-engagements`; see that entry for why there are two doors
    // and one result.
    id: "company.review-engagements",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.reviewEngagements.label",
    descriptionKey: "conversation.actions.company.reviewEngagements.description",
    confirmation: "read",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDashboardViewed,
    // The projects list is where an employer already meets their engaged
    // workers (the assign picker reads the same table). No new screen.
    advancedRoute: "/dashboard/projects",
    handler: { kind: "deep_link" },
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

  {
    /**
     * ROSTER INVITATION BY SENTENCE (real recruiter pilot, 2026-09-04).
     * "Pakviesk darbuotoją į komandą" — the company's/agency's canonical
     * roster invite (`invite_company_worker` RPC via lib/company/actions):
     * a PENDING invitation addressed to an e-mail; the person links only by
     * accepting it themself. No e-mail is sent by the platform today (the
     * roster section says so); the chat says the same.
     */
    id: "company.invite-worker",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.inviteWorker.label",
    descriptionKey: "conversation.actions.company.inviteWorker.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "inviteCompanyWorkerAction" },
  },

  {
    /**
     * F2 (owner contract 2026-09-04 §9/§11 seed): "sukurk projektą Roterdame"
     * — the SITE as a project object, created by sentence through the ONE
     * dispatcher over the canonical `createProjectAction` (the same core the
     * company page's form inserts through). A project is what workers are
     * assigned to (`company.assign-worker`), so need → project → assignment
     * closes inside the conversation.
     */
    id: "company.create-project",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.createProject.label",
    descriptionKey: "conversation.actions.company.createProject.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "createProjectAction" },
  },

  {
    /**
     * The CLIENT's decision on an agency's candidate offer (owner contract
     * 2026-09-04 §15 — the client half of the agency journey). The agency's
     * chain by sentence is prod-proven; the client could decide only with the
     * scouting page's buttons. Same canonical action, token-confirmed, reached
     * from the in-chat offers list ("kokius kandidatus pasiūlė agentūra?").
     */
    id: "company.respond-offer",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.company.respondOffer.label",
    descriptionKey: "conversation.actions.company.respondOffer.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company/scouting",
    handler: { kind: "server_action", ref: "respondCandidateOfferAction" },
  },

  {
    /**
     * PROJECT → WORK (owner contract 2026-09-04 §11): a work package by
     * sentence — "pridėk užduotį projektui: sumontuoti pastolius iki spalio 3".
     * Same core the tasks page's form inserts through; the project pulse
     * shows it as an open task the moment it exists.
     */
    id: "company.create-task",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.createTask.label",
    descriptionKey: "conversation.actions.company.createTask.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/tasks",
    handler: { kind: "server_action", ref: "createWorkTaskAction" },
  },

  {
    /**
     * PROJECT → PROGRESS (owner contract 2026-09-04 §11): a stage moved to a
     * real status — "etapas pamatai baigtas" by sentence, or the stage row's
     * own control in the panel. Both enter here; the operations page's stage
     * panel calls the same action. Progress is a stored status, never a bar.
     */
    id: "company.update-stage-status",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.updateStageStatus.label",
    descriptionKey: "conversation.actions.company.updateStageStatus.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "updateStageStatusAction" },
  },
  {
    /**
     * WORK PERFORMED → RESULT (owner contract 2026-09-04 §14): a task moved
     * to a real status — "užduotis sumontuoti pastolius atlikta" by
     * sentence, or the task row's own control on the tasks page. Both enter
     * the ONE status core. A WORKER may close the task they were given: the
     * RPC (`set_work_task_status_v2`) re-checks creator / assignee / project
     * manager, so the role gate here is deliberately the union of the three
     * and the row-level authority stays in SQL. Result is a stored status.
     */
    id: "company.update-task-status",
    subject: "company",
    allowedRoles: ["company", "agency", "worker"],
    labelKey: "conversation.actions.company.updateTaskStatus.label",
    descriptionKey: "conversation.actions.company.updateTaskStatus.description",
    confirmation: "reversible_write",
    precondition: "authenticated",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/tasks",
    handler: { kind: "server_action", ref: "setWorkTaskStatusAction" },
  },
  {
    /**
     * READINESS → CORRECTIVE ACTION (owner contract 2026-09-04 §11, §12 "what
     * is missing → who / what can help → action", §16): a manager-kept
     * checklist row moved to a real status — "Gauta: A1 (Jonas)" by chip
     * right after the readiness answer, or the row's own control on the
     * operations page. Both call the ONE write; the RPC re-checks the gate.
     */
    id: "company.set-readiness-item",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.setReadinessItem.label",
    descriptionKey: "conversation.actions.company.setReadinessItem.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "upsertReadinessItemAction" },
  },
  {
    /**
     * READINESS → CORRECTIVE ACTION: start the standard document checklist
     * for every person on the project (the operations page's own seed, per
     * person, with the same default labels) — offered when nothing is
     * tracked yet, so "kas trūksta?" has real rows to answer from.
     */
    id: "company.seed-readiness-checklist",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.seedReadinessChecklist.label",
    descriptionKey: "conversation.actions.company.seedReadinessChecklist.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "seedReadinessItemsAction" },
  },
  {
    /**
     * READINESS → WHO CAN HELP → ACTION: ask the person for what is missing —
     * a WORK INSTRUCTION in the project's thread (the instructions page's own
     * send; the RPC requires an active assignment and that the caller manages
     * the worker). The body is composed from the REAL gap labels, never
     * invented. Important tier: the chip is the explicit confirmation.
     */
    id: "company.request-readiness",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.requestReadiness.label",
    descriptionKey: "conversation.actions.company.requestReadiness.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "sendWorkInstructionAction" },
  },
  {
    /**
     * WORK → EVIDENCE → EMPLOYER CONFIRMATION → VERIFIED CAPABILITY (owner
     * contract 2026-09-04 §14): "patvirtink Jono darbą" — the inbox's
     * one-tap confirm by chip: approve the entry and verify the declared
     * skills it proves. Important tier: a trust act on a person's identity;
     * the chip is the explicit confirmation.
     */
    id: "company.confirm-work",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.confirmWork.label",
    descriptionKey: "conversation.actions.company.confirmWork.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/inbox",
    handler: { kind: "server_action", ref: "quickConfirmEntry" },
  },
  {
    /**
     * The one action that makes a person's work confirmable: journal review
     * switched on for their employee engagement (the membership RPC). The
     * inbox's toggle and this chip are the same write.
     */
    id: "company.enable-journal-review",
    subject: "company",
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.company.enableJournalReview.label",
    descriptionKey: "conversation.actions.company.enableJournalReview.description",
    confirmation: "reversible_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/inbox",
    handler: { kind: "server_action", ref: "setEngagementJournalReview" },
  },

  // ── EDUCATION (owner contract 2026-09-04 §15) ─────────────────────────────
  // An education institution is a company that holds the `training_provider`
  // capability (I-2: one organization, many capabilities). Its commands
  // existed only as page forms; these rows make them sentences over the ONE
  // dispatcher. Authority is re-derived in SQL (`manages_organization` + the
  // capability check inside each RPC), never here.
  {
    id: "company.create-programme",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.education.createProgramme.label",
    descriptionKey: "conversation.actions.education.createProgramme.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "createProgramAction" },
  },
  {
    id: "company.create-cohort",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.education.createCohort.label",
    descriptionKey: "conversation.actions.education.createCohort.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "createCohortAction" },
  },
  {
    id: "company.assign-learner",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.education.assignLearner.label",
    descriptionKey: "conversation.actions.education.assignLearner.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/company",
    handler: { kind: "server_action", ref: "setCohortMemberAction" },
  },
  {
    id: "company.invite-learner",
    subject: "company",
    allowedRoles: ["company"],
    labelKey: "conversation.actions.education.inviteLearner.label",
    descriptionKey: "conversation.actions.education.inviteLearner.description",
    confirmation: "important_write",
    precondition: "has_company",
    migrationSensitive: true,
    telemetryEvent: E.companyDemandActionClicked,
    advancedRoute: "/dashboard/network",
    handler: { kind: "server_action", ref: "createAndSendInvitations" },
  },

  // ── AGENCY ────────────────────────────────────────────────────────────────
  // An agency is a company TYPE (Direction A: `companies.company_type =
  // 'staffing_agency'`), never a root role — every real agency account since
  // the first-run router holds the `company` role and nothing else. Gating
  // these on the legacy `agency` role alone made every agency act
  // `not_authorized` for exactly the accounts that are agencies (found with
  // the first real recruiter, 2026-09-04). Both roles are accepted here; the
  // real authority is re-derived in SQL (`owns_company` + the staffing_agency
  // check inside each bridge RPC), where it always was.
  {
    id: "agency.review-clients",
    subject: "agency",
    allowedRoles: ["company", "agency"],
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
    allowedRoles: ["company", "agency"],
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
    allowedRoles: ["company", "agency"],
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
    allowedRoles: ["company", "agency"],
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
    allowedRoles: ["company", "agency"],
    labelKey: "conversation.actions.agency.whoWaits.label",
    descriptionKey: "conversation.actions.agency.whoWaits.description",
    confirmation: "read",
    precondition: "authenticated",
    migrationSensitive: false,
    telemetryEvent: E.companyDashboardViewed,
    advancedRoute: "/dashboard/company",
    handler: { kind: "deep_link" },
  },

  // ── RELATIONSHIP (neither side owns it) ───────────────────────────────────
  {
    /**
     * §7.1 — END ONE COMPANY↔WORKER ENGAGEMENT. THE one write, for BOTH sides.
     *
     * The subject is the RELATIONSHIP, not a party, because the authority
     * genuinely is: `end_company_worker_engagement_v2` grants the act to
     * `owns_company(company_id) OR the engagement's own worker`, and has since
     * v1 in 20260723120000. Splitting this into `company.end-engagement` and
     * `worker.end-engagement` would create two ids, two schemas, two executors
     * and two confirmation flows over ONE SQL predicate — and they would drift.
     * See `ActionSubject`.
     *
     * THE INPUT IS AN ENGAGEMENT ID AND NOTHING ELSE. No company id, no worker
     * id, no side, no project id. Authority is re-derived server-side from the
     * authenticated actor and the row's own relationships, so a hand-typed id
     * buys nothing: an id the caller may not act on returns `not_found`,
     * exactly like one that does not exist (the migration's anti-oracle rule).
     *
     * `strong_irreversible` — the same tier as `worker.respond-booking` and
     * `company.assign-worker`, and for the same reason: an engagement can be
     * ended but not un-ended. There is no reopen RPC and this slice does not
     * add one, so the confirmation card is the only step between the person
     * and a state they cannot walk back.
     */
    id: "engagement.end",
    subject: "engagement",
    // BOTH parties — required of a relationship subject by the guard test.
    // Agency is included on the same footing as every other employer-side
    // action: `owns_company` is what actually decides, and it is re-derived
    // in SQL. This list never grants anything.
    allowedRoles: ["worker", "company", "agency"],
    labelKey: "conversation.actions.engagement.end.label",
    descriptionKey: "conversation.actions.engagement.end.description",
    confirmation: "strong_irreversible",
    // NOT `has_company`: the worker side has no company. The real gate is the
    // per-row authority the RPC re-derives, which no precondition can express.
    precondition: "authenticated",
    // The v2 RPC is owner-gated (20260804160000) — until it is applied the
    // action degrades to an honest `needs_migration`, never a generic failure.
    migrationSensitive: true,
    telemetryEvent: E.dashboardViewed,
    // The same honest full-screen destination the employer door names. There
    // is no engagements screen on either side and none is invented here.
    advancedRoute: "/dashboard/projects",
    handler: { kind: "server_action", ref: "endEngagementAction" },
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
