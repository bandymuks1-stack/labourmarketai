/**
 * Operations role capability map — the single honest source of truth for
 * what each operational role can ACTUALLY do today (long-cycle plan PR B).
 *
 * Grounded in docs/audits/company-worker-foreman-operations-truth-v1.md.
 * Pure, deterministic, no IO. It deliberately does NOT pretend roles work:
 * foreman / project_manager / site_manager are `not_enabled`, team_lead is
 * `planned`. Capability flags are `true` ONLY where the audit found real,
 * cited code/data backing them.
 *
 * This complements lib/config/roles.ts (which drives the user-facing role
 * catalogue / switcher). This file is the OPERATIONS view: it also lists
 * coordination roles that are not in the live role catalogue at all, so a
 * UI or guard can state, honestly, that they are not enabled.
 */

export type OperationsRoleId =
  | "worker"
  | "company_admin"
  | "agency_admin"
  | "buyer"
  | "admin"
  | "foreman"
  | "project_manager"
  | "site_manager"
  | "team_lead";

/**
 * - `active`      — real today, backed by routes + data + lib code.
 * - `planned`     — exists as a forward-looking catalogue row only (no DB
 *                   enum, no route).
 * - `not_enabled` — referenced only as a label/profession; no role, route,
 *                   permission, or data behind it.
 */
export type OperationsRoleStatus = "active" | "planned" | "not_enabled";

export interface OperationsRoleCapabilities {
  /** Manage one's own profile / CV. */
  readonly manageOwnProfile: boolean;
  /** Create a persisted work-journal entry. */
  readonly createWorkJournal: boolean;
  /** See the organisation's workers (employment links). */
  readonly seeWorkers: boolean;
  /** Invite workers (self-join model, no external send). */
  readonly inviteWorkers: boolean;
  /** Assign a per-worker role/title (worker vs foreman vs manager). */
  readonly assignWorkerRoles: boolean;
  /** Review/confirm another worker's work entries. */
  readonly reviewWorkEntries: boolean;
  /** Coordinate a team/project (assignments, daily work). */
  readonly coordinateTeam: boolean;
}

export interface OperationsRole {
  readonly id: OperationsRoleId;
  readonly status: OperationsRoleStatus;
  readonly capabilities: OperationsRoleCapabilities;
  /** Short repo-evidence note (audit / route / table). */
  readonly evidence: string;
}

const NONE: OperationsRoleCapabilities = {
  manageOwnProfile: false,
  createWorkJournal: false,
  seeWorkers: false,
  inviteWorkers: false,
  assignWorkerRoles: false,
  reviewWorkEntries: false,
  coordinateTeam: false,
};

/**
 * The canonical operations role capability map. Every flag is honest: a
 * `true` means the audit found real backing; assignWorkerRoles and
 * coordinateTeam are `false` everywhere because no role/title column or
 * team model exists today (company_workers has only `status`).
 */
export const OPERATIONS_ROLES: readonly OperationsRole[] = [
  {
    id: "worker",
    status: "active",
    capabilities: {
      ...NONE,
      manageOwnProfile: true,
      createWorkJournal: true,
    },
    evidence:
      "dashboard/profile + dashboard/journal; lib/journal/actions.ts createJournalEntry → create_journal_entry_full RPC (migration 0017).",
  },
  {
    id: "company_admin",
    status: "active",
    capabilities: {
      ...NONE,
      seeWorkers: true,
      inviteWorkers: true,
    },
    evidence:
      "dashboard/company; lib/company/company-workers.ts (list + invite_company_worker RPC, migration 0027). No role/title column → no assignWorkerRoles; journal review keys off org model, not company_workers → no reviewWorkEntries.",
  },
  {
    id: "agency_admin",
    status: "active",
    capabilities: {
      ...NONE,
      seeWorkers: true,
      inviteWorkers: true,
    },
    evidence:
      "dashboard/agency; lib/agency/agency-workers.ts (list + invite_agency_worker RPC, migrations 0001/0025). Mirrors company.",
  },
  {
    id: "buyer",
    status: "active",
    capabilities: { ...NONE },
    evidence:
      "dashboard/buyer request flow (customer_requests 0028). No worker/journal coordination capabilities.",
  },
  {
    id: "admin",
    status: "active",
    capabilities: {
      ...NONE,
      seeWorkers: true,
      reviewWorkEntries: true,
    },
    evidence:
      "dashboard/admin; deriveIsAdmin dual signal; broad RLS read incl. journal review inbox via manages_organization (migration 0013).",
  },
  {
    id: "foreman",
    status: "not_enabled",
    capabilities: { ...NONE },
    evidence:
      "Profession label only (messages/*/professions.json). No role enum, route, permission, or data. Audit verdict: ui_only/missing.",
  },
  {
    id: "project_manager",
    status: "not_enabled",
    capabilities: { ...NONE },
    evidence: "Not present in codebase as a role. Audit verdict: missing.",
  },
  {
    id: "site_manager",
    status: "not_enabled",
    capabilities: { ...NONE },
    evidence:
      "Profession label only (messages/*/professions.json). Audit verdict: ui_only/missing.",
  },
  {
    id: "team_lead",
    status: "planned",
    capabilities: { ...NONE },
    evidence:
      'lib/config/roles.ts row with availability:"hidden" — forward-looking, no DB enum, no route.',
  },
];

const BY_ID: Record<OperationsRoleId, OperationsRole> = Object.fromEntries(
  OPERATIONS_ROLES.map((r) => [r.id, r]),
) as Record<OperationsRoleId, OperationsRole>;

export function getOperationsRole(id: OperationsRoleId): OperationsRole {
  return BY_ID[id];
}

/** True only when the role is real and usable today. */
export function isOperationsRoleEnabled(id: OperationsRoleId): boolean {
  return BY_ID[id].status === "active";
}

/** The coordination roles the product talks about but has NOT enabled. */
export function getNotEnabledCoordinationRoles(): readonly OperationsRole[] {
  return OPERATIONS_ROLES.filter((r) => r.status !== "active");
}
