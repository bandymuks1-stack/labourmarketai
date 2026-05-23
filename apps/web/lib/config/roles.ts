/**
 * Central labour-market role model.
 *
 * One source of truth for which roles exist, which are currently active in
 * the product, which are openly labelled as preparing, and where each lands
 * when chosen. UI surfaces (RoleSwitcher, account page, onboarding picker)
 * read from here instead of duplicating role lists / labels / availability
 * checks. Adding a new role later only requires touching this file +
 * the matching i18n keys — no scattered changes.
 *
 * Non-locking: every role flags `canBeAddedLater = true`. The system never
 * locks a person into one role; the first choice is only an entry point
 * (PLATFORM_DOCTRINE §1; product principle of this sprint).
 */

export type Availability = "active" | "preparing" | "hidden";

/** Roles that already exist as a `Role` union elsewhere in the codebase. */
export type LiveRoleId = "worker" | "company" | "agency" | "customer";

/** Forward-looking role ids — documented as preparing here so the system has
 *  a single canonical list. They do NOT yet exist as DB enum values; this is
 *  pure UI / config data. Future migration sprints would add them. */
export type FutureRoleId =
  | "freelancer"
  | "team_lead"
  | "service_provider";

export type LabourMarketRoleId = LiveRoleId | FutureRoleId;

export type LabourMarketRole = {
  /** Stable identifier used in code, URLs, and i18n keys. */
  id: LabourMarketRoleId;
  /** i18n key for the localized label (e.g. "auth.signup.role.worker"). */
  labelKey: string;
  /** i18n key for a one-line description. Optional — undefined for live
   *  roles whose existing copy already covers the label. */
  descriptionKey?: string;
  /** "active" = fully usable today; "preparing" = surfaced honestly as
   *  RUOŠIAMA; "hidden" = never rendered in user UI. */
  availability: Availability;
  /** Can the user START as this role at signup / onboarding? Today only
   *  worker is a real entry point because the others land on the pilot
   *  cockpit, not a full management surface. */
  entryPoint: boolean;
  /** Can the role be added later via the role switcher / account page? */
  canBeAddedLater: boolean;
  /** Primary route the user goes to when they switch to this role. Omit
   *  for roles that have no destination yet. */
  primaryRoute?: string;
  /** i18n key for the explanation shown next to a preparing chip. */
  disabledReasonKey?: string;
};

/**
 * The canonical role catalogue. Order matters — this is the order UI
 * surfaces render the rows in. `worker` first because it is the only
 * fully-active role today; the others follow grouped by closeness to
 * shipping.
 */
export const LABOUR_MARKET_ROLES: readonly LabourMarketRole[] = [
  {
    id: "worker",
    labelKey: "auth.signup.role.worker",
    availability: "active",
    entryPoint: true,
    canBeAddedLater: true,
    primaryRoute: "/dashboard",
  },
  {
    id: "company",
    labelKey: "auth.signup.role.company",
    availability: "preparing",
    entryPoint: false,
    canBeAddedLater: true,
    primaryRoute: "/dashboard",
    disabledReasonKey: "auth.dashboard.account.preview_workspace",
  },
  {
    id: "agency",
    labelKey: "auth.signup.role.agency",
    availability: "preparing",
    entryPoint: false,
    canBeAddedLater: true,
    primaryRoute: "/dashboard",
    disabledReasonKey: "auth.dashboard.account.preview_workspace",
  },
  {
    id: "customer",
    labelKey: "auth.signup.role.customer",
    availability: "preparing",
    entryPoint: false,
    canBeAddedLater: true,
    primaryRoute: "/dashboard",
    disabledReasonKey: "auth.dashboard.account.preview_workspace",
  },
  // Future roles — documented so the product never lies about scope. They
  // are hidden from UI today; when their flows ship they flip to
  // "preparing" then "active" without any other code changes.
  {
    id: "freelancer",
    labelKey: "auth.signup.role.freelancer",
    descriptionKey: "auth.signup.role.freelancer_desc",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
  },
  {
    id: "team_lead",
    labelKey: "auth.signup.role.team_lead",
    descriptionKey: "auth.signup.role.team_lead_desc",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
  },
  {
    id: "service_provider",
    labelKey: "auth.signup.role.service_provider",
    descriptionKey: "auth.signup.role.service_provider_desc",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
  },
] as const;

/** Quick lookup. */
export const ROLE_BY_ID: Record<LabourMarketRoleId, LabourMarketRole> =
  Object.fromEntries(LABOUR_MARKET_ROLES.map((r) => [r.id, r])) as Record<
    LabourMarketRoleId,
    LabourMarketRole
  >;

/** Roles surfaced in UI (live + preparing, not hidden). */
export const VISIBLE_LABOUR_MARKET_ROLES: readonly LabourMarketRole[] =
  LABOUR_MARKET_ROLES.filter((r) => r.availability !== "hidden");

export function isLiveRoleId(id: string): id is LiveRoleId {
  return id === "worker" || id === "company" || id === "agency" || id === "customer";
}

export function isLabourMarketRoleAvailable(id: LabourMarketRoleId): boolean {
  return ROLE_BY_ID[id]?.availability === "active";
}

export function rolePreparingLabelKey(): string {
  return "auth.dashboard.account.preview_workspace";
}
