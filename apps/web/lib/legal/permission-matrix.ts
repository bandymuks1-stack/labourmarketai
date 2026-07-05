/**
 * Source-backed permission matrix (CR train WAGON 7, audit area 12).
 *
 * The SINGLE data source for the role × surface access matrix rendered on
 * /legal/data-access. Every row states, per role, what that role can SEE and
 * what it can CHANGE on one product surface — and every row carries `sources`:
 * repo-resolvable pointers to the RLS policy, trigger, RPC or route guard
 * that actually enforces the claim.
 *
 * Honesty contract (train §WAGON 7):
 *  - No claim may be broader than the pointed-at policy/guard. When in doubt
 *    the matrix UNDER-claims (shows "no" / "limited"), never over-claims.
 *  - Access levels are machine-readable so the guard can keep the table
 *    data-driven; the plain-language wording lives in the `legal.dataAccess.
 *    matrix` i18n namespace (en/lt/ru) keyed by `row.key`.
 *  - Source pointer format: `<repo-relative-path>` or
 *    `<repo-relative-path>#<policy_or_function_name>`. The permission-matrix
 *    guard asserts the file exists and (when given) the fragment name appears
 *    in that file — so a renamed policy breaks the build, not the truth.
 *
 * Pure data, no IO — imported by the marketing page (server component) and by
 * the guard test.
 */

/** The four explained roles (columns of the matrix). */
export const MATRIX_ROLES = ["worker", "company", "teamOwner", "admin"] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

/**
 * Access level shown in a cell:
 *  - "yes"     — the role can reach all rows of the surface (proven by source);
 *  - "own"     — only the role's own rows / own team;
 *  - "limited" — only within a proven relationship (participant, managed
 *                organization, shortlist gate, approved subset…);
 *  - "no"      — no access path exists (or none is proven — we under-claim).
 */
export type MatrixAccess = "yes" | "own" | "limited" | "no";

export type RoleAccess = Readonly<Record<MatrixRole, MatrixAccess>>;

export interface PermissionMatrixRow {
  /** i18n key: legal.dataAccess.matrix.rows.<key>.{surface,seeNote,editNote} */
  readonly key: string;
  readonly see: RoleAccess;
  readonly edit: RoleAccess;
  /** Repo-resolvable enforcement pointers (guard-checked). */
  readonly sources: readonly string[];
}

const MIG = "supabase/migrations";

export const PERMISSION_MATRIX: readonly PermissionMatrixRow[] = [
  {
    // profiles: own-only RLS (id = auth.uid() or is_admin()).
    key: "profileAccount",
    see: { worker: "own", company: "own", teamOwner: "own", admin: "yes" },
    edit: { worker: "own", company: "own", teamOwner: "own", admin: "yes" },
    sources: [
      `${MIG}/0001_initial_schema.sql#profiles_select`,
      `${MIG}/0001_initial_schema.sql#profiles_update`,
    ],
  },
  {
    // workers rows: owner/admin/employer select — but the company UI only
    // ever receives the anonymised scout-safe preview (no name/contacts).
    key: "workerCard",
    see: { worker: "own", company: "limited", teamOwner: "no", admin: "yes" },
    edit: { worker: "own", company: "no", teamOwner: "no", admin: "yes" },
    sources: [
      `${MIG}/0001_initial_schema.sql#workers_select`,
      `${MIG}/0001_initial_schema.sql#workers_update`,
      "apps/web/lib/scouting/scout-safe-view.ts",
      "apps/web/lib/visibility/worker-profile-visibility.ts",
    ],
  },
  {
    // journal_entries: worker-own OR manager of the entry's engagement org OR
    // admin; append-only (no UPDATE/DELETE policy). Managers add review
    // results through the gated review chain — they never rewrite entries.
    key: "workJournal",
    see: { worker: "own", company: "limited", teamOwner: "limited", admin: "yes" },
    edit: { worker: "own", company: "limited", teamOwner: "limited", admin: "no" },
    sources: [
      `${MIG}/0013_work_journal_m1.sql#journal_entries_select`,
      `${MIG}/0013_work_journal_m1.sql#journal_entries_insert`,
      `${MIG}/0034_manager_review_evidence_result.sql`,
      "apps/web/lib/journal/confirm-actions.ts",
    ],
  },
  {
    // engagement_contexts: own row, managed organization, or admin.
    key: "orgMembership",
    see: { worker: "own", company: "limited", teamOwner: "limited", admin: "yes" },
    edit: { worker: "own", company: "no", teamOwner: "no", admin: "yes" },
    sources: [
      `${MIG}/0013_work_journal_m1.sql#engagement_contexts_select`,
      `${MIG}/0013_work_journal_m1.sql#manages_organization`,
      `${MIG}/0032_engagement_context_provisioning_rpc.sql`,
    ],
  },
  {
    // get_team_capability_summary_v1: returns rows only for the team's
    // owner/manager (or admin); read-only derivation from worker_skills.
    key: "teamCapability",
    see: { worker: "no", company: "no", teamOwner: "own", admin: "yes" },
    edit: { worker: "no", company: "no", teamOwner: "no", admin: "no" },
    sources: [
      `${MIG}/20260705220000_team_brigade_org_spine.sql#get_team_capability_summary_v1`,
    ],
  },
  {
    // customer_requests: poster-own or admin; status changes are pinned to a
    // guarded transition sequence (trigger), so even admins follow the
    // pipeline order.
    key: "demandPosting",
    see: { worker: "no", company: "own", teamOwner: "own", admin: "yes" },
    edit: { worker: "no", company: "own", teamOwner: "own", admin: "limited" },
    sources: [
      `${MIG}/0028_customer_requests.sql#customer_requests_select`,
      `${MIG}/0028_customer_requests.sql#customer_requests_update`,
      `${MIG}/20260705150000_customer_requests_status_transition_guard.sql#customer_requests_status_transition_guard`,
    ],
  },
  {
    // list_open_demand_for_workers: worker-only caller gate; approved rows
    // only; structured columns only (never free text / contacts). Non-worker
    // callers — including admins — get an empty result from THIS surface.
    key: "workerBoard",
    see: { worker: "limited", company: "no", teamOwner: "no", admin: "no" },
    edit: { worker: "no", company: "no", teamOwner: "no", admin: "no" },
    sources: [
      `${MIG}/20260702170000_worker_demand_approved_route_model_a.sql#list_open_demand_for_workers`,
    ],
  },
  {
    // conversation_messages: participants only (plus admin); append-only;
    // authors send their own messages. Counterpart identity comes from a
    // dedicated RPC, not from open profile reads.
    key: "messages",
    see: { worker: "limited", company: "limited", teamOwner: "limited", admin: "yes" },
    edit: { worker: "own", company: "own", teamOwner: "own", admin: "own" },
    sources: [
      `${MIG}/0021_communication.sql#conversation_messages_select`,
      `${MIG}/20260705170000_conversation_counterpart_identity.sql#conversation_counterpart_identities`,
      "apps/web/lib/communication/contact-permission.ts",
    ],
  },
  {
    // project_handover_entries: manager-only (can_manage_project) or admin;
    // append-only entries.
    key: "handover",
    see: { worker: "no", company: "limited", teamOwner: "limited", admin: "yes" },
    edit: { worker: "no", company: "limited", teamOwner: "limited", admin: "yes" },
    sources: [
      `${MIG}/20260705230000_project_handover_passport.sql#phe_select`,
      `${MIG}/20260601091000_project_object_client_context.sql#can_manage_project`,
    ],
  },
  {
    // follow_up_tasks: admin-only SELECT; writes only through gated RPCs.
    key: "followUp",
    see: { worker: "no", company: "no", teamOwner: "no", admin: "yes" },
    edit: { worker: "no", company: "no", teamOwner: "no", admin: "limited" },
    sources: [
      `${MIG}/20260705235000_follow_up_tasks.sql#fut_select`,
      `${MIG}/20260705235000_follow_up_tasks.sql#create_follow_up_task_v1`,
    ],
  },
  {
    // Admin control room routes: fail-closed superadmin gate.
    key: "adminPanels",
    see: { worker: "no", company: "no", teamOwner: "no", admin: "yes" },
    edit: { worker: "no", company: "no", teamOwner: "no", admin: "yes" },
    sources: ["apps/web/lib/auth/superadmin.ts#requireSuperadmin"],
  },
  // Owner CR-Wagon-7 lock rows (2026-07-05): projects/rosters + assign/end,
  // service requests, and explicit companies visibility.
  {
    // project_worker_assignments: managers of THIS project see/staff its
    // roster (can_manage_project); workers see their OWN assignments.
    // Edit = assign/end ONLY through the gated RPCs — no direct table write.
    key: "projectsRosters",
    see: { worker: "own", company: "own", teamOwner: "limited", admin: "yes" },
    edit: { worker: "no", company: "own", teamOwner: "limited", admin: "yes" },
    sources: [
      `${MIG}/20260609120000_project_worker_assignment_gate.sql#assign_worker_to_project`,
      `${MIG}/20260609120000_project_worker_assignment_gate.sql#end_worker_project_assignment`,
      `${MIG}/20260601091000_project_object_client_context.sql#project_worker_assignments`,
    ],
  },
  {
    // service_offering_requests: a two-party loop — requester and provider
    // each see their OWN side; respond/withdraw via the gated RPCs; the
    // provider learns the requester's display name only through the
    // identity RPC (never contacts).
    key: "serviceRequests",
    see: { worker: "own", company: "own", teamOwner: "own", admin: "yes" },
    edit: { worker: "own", company: "own", teamOwner: "own", admin: "no" },
    sources: [
      `${MIG}/20260627145318_service_offering_requests.sql#service_offering_requests`,
      `${MIG}/20260627174500_requester_identity_for_provider.sql#requester_identities_for_provider`,
    ],
  },
  {
    // companies: any SIGNED-IN user can read company rows (companies_select
    // requires only a session) — the honest broad boundary; editing stays
    // owner-or-admin. Workers additionally see VERIFIED company identity on
    // the opportunities board via the Model-A RPC.
    key: "companies",
    see: { worker: "yes", company: "yes", teamOwner: "yes", admin: "yes" },
    edit: { worker: "no", company: "own", teamOwner: "no", admin: "yes" },
    sources: [
      `${MIG}/0001_initial_schema.sql#companies_select`,
      `${MIG}/20260702170000_worker_demand_approved_route_model_a.sql#list_open_demand_for_workers`,
    ],
  },
];

/**
 * Who can message whom — the exhaustive list of contact-permission states.
 * Every direct conversation open maps to exactly ONE of these; the default is
 * "no relationship → no contact". i18n:
 * legal.dataAccess.matrix.messaging.rules.<key>
 */
export interface MessagingRule {
  readonly key: string;
  readonly sources: readonly string[];
}

export const MESSAGING_RULES: readonly MessagingRule[] = [
  {
    key: "existingConversation",
    sources: ["apps/web/lib/communication/communication-eligibility.ts#allowed_existing_conversation"],
  },
  {
    key: "engagement",
    sources: ["apps/web/lib/communication/communication-eligibility.ts#allowed_engagement"],
  },
  {
    key: "scoutingShortlist",
    sources: [
      "apps/web/lib/communication/communication-eligibility.ts#allowed_scouting_shortlist",
      "apps/web/lib/communication/communication-eligibility.ts#evaluateCommunicationRequest",
    ],
  },
  {
    key: "admin",
    sources: ["apps/web/lib/communication/communication-eligibility.ts#allowed_admin"],
  },
  {
    key: "none",
    sources: ["apps/web/lib/communication/communication-eligibility.ts#no_permission"],
  },
];
