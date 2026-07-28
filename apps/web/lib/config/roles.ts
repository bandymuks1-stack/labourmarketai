/**
 * Central labour-market role catalogue.
 *
 * One source of truth for: which roles exist, which are usable today,
 * which are honestly preparing, which are forward-looking and not yet
 * surfaced. UI surfaces (RoleSwitcher, account page, dashboard role
 * expansion section, onboarding picker) read from here instead of
 * duplicating role lists / labels / availability checks.
 *
 * Non-locking by design: every role row carries `canBeAddedLater: true`.
 * The platform never locks a person into one role — the first choice is
 * only an entry point (PLATFORM_DOCTRINE §1; product doctrine for this
 * sprint sequence).
 *
 * Adding / hiding / promoting a role is a one-row change here + the
 * matching i18n keys + (optionally) a feature catalogue row. No
 * component edits.
 */

import type { FeatureKey } from "./feature-availability";

export type RoleAvailability =
  | "active"
  | "preparing"
  | "hidden"
  /** Role has a real setup path (`/dashboard/start/<role>`) and writes
   *  a real entity row via the `add_role` RPC. Renders the `Pradėti`
   *  chip + a navigating CTA to the setup route. Used when the
   *  workspace is not "active" but the start path IS real and
   *  persists. Codified by `docs/policies/feature-definition-of-done-v1.md`. */
  | "start-available"
  /** Role has limited functionality today — some real surfaces exist
   *  but the first-class entity / full workspace is missing. Renders
   *  the `Dalinis` chip + the reason key + the setup-route CTA. Used
   *  for buyer / customer until `public.customers` migration ships. */
  | "partial";

/** Roles already used as the `Role` union elsewhere in the codebase
 *  (matches `profile_roles.role` + DB enum today). */
export type LiveRoleId = "worker" | "company" | "agency" | "customer";

/** Forward-looking role ids — documented as `hidden` for now so the
 *  catalogue is a single, searchable list of "every role we've ever
 *  considered". They have no DB enum value yet; this is pure UI / config
 *  data. A future migration sprint adds the enum values; UI flips them
 *  from `hidden` → `preparing` → `active` one row at a time. */
export type FutureRoleId =
  | "freelancer"
  | "team_lead"
  | "service_provider";

export type LabourMarketRoleId = LiveRoleId | FutureRoleId;

export type LabourMarketRole = {
  /** Stable identifier used in code, URLs, and i18n keys. */
  id: LabourMarketRoleId;
  /** i18n key for the localized SHORT label (e.g. "Darbuotojas"). */
  labelKey: string;
  /** i18n key for a longer description shown on cards / surfaces. */
  descriptionKey: string;
  /** "active" = fully usable today; "preparing" = surfaced as RUOŠIAMA;
   *  "hidden" = catalogue row only, never rendered in user UI. */
  availability: RoleAvailability;
  /** Can the user START as this role at signup / onboarding? Today only
   *  worker is a real entry point because the others land on the pilot
   *  cockpit, not a full management surface. */
  entryPoint: boolean;
  /** Can the role be added later via the role switcher / account page? */
  canBeAddedLater: boolean;
  /** Feature key the role maps to. Pulling availability from the feature
   *  catalogue keeps role / feature honesty in lock-step (e.g. if
   *  `company_workspace` flips to "active", any role row that points at
   *  it should be re-considered for promotion too). */
  primaryFeatureKey?: FeatureKey;
  /** Primary route the user goes to when they switch to this role.
   *  Omit for roles that have no destination yet (the renderer will
   *  surface the preparing chip + reason instead of a navigating link). */
  primaryRoute?: string;
  /** i18n key explaining *why* a role is preparing. UI surfaces show
   *  this verbatim as a chip / tooltip / reason line. */
  preparingReasonKey?: string;
  /** Whether the role is safe to surface in dashboard role-expansion
   *  surfaces today. Hidden rows are never safe; preparing rows are
   *  safe (rendered as preparing); active rows are always safe. */
  safeToShowInRoleSurfaces: boolean;
  /** Render order for catalogue-driven surfaces. Lower is earlier. */
  sortOrder: number;
  /** Optional explicit setup route used by `start-available` / `partial`
   *  availability rows. When set, the catalogue card surfaces a CTA to
   *  this route instead of the navigating link to `primaryRoute`. */
  setupRoute?: string;
};

/**
 * The canonical role catalogue. Order matters — surfaces iterate over
 * this list (sorted by `sortOrder`) so the order users see is the order
 * here.
 */
export const LABOUR_MARKET_ROLES: readonly LabourMarketRole[] = [
  {
    id: "worker",
    labelKey: "auth.signup.role.worker",
    descriptionKey: "roles.worker.description",
    availability: "active",
    entryPoint: true,
    canBeAddedLater: true,
    primaryFeatureKey: "profile_text_first",
    primaryRoute: "/dashboard",
    safeToShowInRoleSurfaces: true,
    sortOrder: 10,
  },
  {
    id: "company",
    labelKey: "auth.signup.role.company",
    descriptionKey: "roles.company.description",
    availability: "start-available",
    entryPoint: false,
    canBeAddedLater: true,
    primaryFeatureKey: "company_workspace",
    primaryRoute: "/dashboard",
    setupRoute: "/dashboard/start/company",
    preparingReasonKey: "roles.preparingReason.startAvailable",
    safeToShowInRoleSurfaces: true,
    sortOrder: 20,
  },
  {
    // Owner directive (company-role-simplicity-v1): an agency is NOT a
    // separate root role — it is a COMPANY whose company_type is
    // 'staffing_agency', picked inside the one canonical company profile.
    // `hidden` removes agency from every add-role / start surface for new
    // users. Users who ALREADY hold the agency role keep it: the switcher
    // renders held roles from profile_roles regardless of availability, and
    // /dashboard/agency + its tools stay live for them (legacy continuity).
    id: "agency",
    labelKey: "auth.signup.role.agency",
    descriptionKey: "roles.agency.description",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: false,
    primaryFeatureKey: "agency_workspace",
    primaryRoute: "/dashboard",
    setupRoute: "/dashboard/start/company",
    preparingReasonKey: "roles.preparingReason.default",
    safeToShowInRoleSurfaces: false,
    sortOrder: 30,
  },
  {
    // Owner directive (systemic-ux-roles-v1): "Pirkėjas" (buyer) is NOT a
    // top-level identity — buying is an ACTION a person or a company takes.
    // Mirrors the agency treatment: `hidden` removes buyer from every
    // add-role / start / "My spaces" surface. Buying stays reachable as an
    // action card (IdentityActions → /dashboard/buyer). Users who already
    // hold the customer role keep route access (legacy continuity); the
    // switcher folds it into the Įmonė identity rather than showing
    // "Pirkėjas" as a peer space. setupRoute is kept so the legacy
    // /dashboard/start/buyer form still resolves.
    id: "customer",
    labelKey: "auth.signup.role.customer",
    descriptionKey: "roles.customer.description",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: false,
    primaryFeatureKey: "customer_workspace",
    primaryRoute: "/dashboard",
    setupRoute: "/dashboard/start/buyer",
    preparingReasonKey: "roles.preparingReason.startAvailable",
    safeToShowInRoleSurfaces: false,
    sortOrder: 40,
  },
  // ── Forward-looking roles — hidden until UI surfaces ship ─────────
  // The platform may surface them as `preparing` once the catalogue
  // text exists in LT + EN; that's a one-row flip.
  {
    id: "freelancer",
    labelKey: "auth.signup.role.freelancer",
    descriptionKey: "roles.freelancer.description",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
    primaryFeatureKey: "service_offers",
    preparingReasonKey: "roles.preparingReason.default",
    safeToShowInRoleSurfaces: false,
    sortOrder: 50,
  },
  {
    id: "team_lead",
    labelKey: "auth.signup.role.team_lead",
    descriptionKey: "roles.team_lead.description",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
    primaryFeatureKey: "team_offers",
    preparingReasonKey: "roles.preparingReason.default",
    safeToShowInRoleSurfaces: false,
    sortOrder: 60,
  },
  {
    id: "service_provider",
    labelKey: "auth.signup.role.service_provider",
    descriptionKey: "roles.service_provider.description",
    availability: "hidden",
    entryPoint: false,
    canBeAddedLater: true,
    primaryFeatureKey: "service_offers",
    preparingReasonKey: "roles.preparingReason.default",
    safeToShowInRoleSurfaces: false,
    sortOrder: 70,
  },
] as const;

/** Quick lookup. */
export const ROLE_BY_ID: Record<LabourMarketRoleId, LabourMarketRole> =
  Object.fromEntries(LABOUR_MARKET_ROLES.map((r) => [r.id, r])) as Record<
    LabourMarketRoleId,
    LabourMarketRole
  >;

/** Single source of truth for the availability → status chip mapping.
 *  Both `RoleCatalogueCard` (dashboard) and `RoleSwitcher` (header
 *  dropdown) MUST consume this so the header and the dashboard cannot
 *  disagree. Returning `null` means "no chip" (the role is fully
 *  active or hidden — caller decides what to do). */
export function roleStatusChipKey(
  availability: RoleAvailability,
): "roles.status.active" | "roles.status.start" | "roles.status.partial" | "roles.status.preparing" | null {
  switch (availability) {
    case "active":
      return "roles.status.active";
    case "start-available":
      return "roles.status.start";
    case "partial":
      return "roles.status.partial";
    case "preparing":
      return "roles.status.preparing";
    case "hidden":
      return null;
  }
}

/** Single source for the "where does clicking this role go?" decision.
 *  `held` = true → user already holds the role (workspace switch).
 *  `held` = false → user does NOT hold the role yet (route to setup).
 *  Returns `{ kind: 'switch' }` (caller invokes switchRole) or
 *  `{ kind: 'navigate', route }` (caller renders a Link).
 *  Used by RoleSwitcher to avoid the "blank-name addRole" dead-label
 *  bug where clicking Įmonė / Agentūra / Pirkėjas in the dropdown
 *  previously triggered an entity insert with `legal_name = null`
 *  instead of routing to the setup form. */
export function roleSwitcherTargetForRole(
  role: LabourMarketRole,
  held: boolean,
): { kind: "switch" } | { kind: "navigate"; route: string } {
  if (held) return { kind: "switch" };
  if (role.setupRoute) return { kind: "navigate", route: role.setupRoute };
  if (role.primaryRoute) return { kind: "navigate", route: role.primaryRoute };
  return { kind: "switch" };
}

/** Backwards-compatible alias for callers (PR #35) that still iterate
 *  by "is this visible at all?". Filters out hidden + sorts. */
export const VISIBLE_LABOUR_MARKET_ROLES: readonly LabourMarketRole[] =
  [...LABOUR_MARKET_ROLES]
    .filter((r) => r.availability !== "hidden")
    .sort((a, b) => a.sortOrder - b.sortOrder);

// ── Helpers (called by UI surfaces) ─────────────────────────────────

export function getRoleConfig(
  id: LabourMarketRoleId,
): LabourMarketRole | undefined {
  return ROLE_BY_ID[id];
}

/** Roles safe to render on dashboard role-expansion / account surfaces.
 *  Returns active + preparing rows (hidden is excluded), sorted. */
export function getVisibleRoleOptions(): readonly LabourMarketRole[] {
  return [...LABOUR_MARKET_ROLES]
    .filter((r) => r.safeToShowInRoleSurfaces && r.availability !== "hidden")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getActiveRoles(): readonly LabourMarketRole[] {
  return [...LABOUR_MARKET_ROLES]
    .filter((r) => r.availability === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPreparingRoles(): readonly LabourMarketRole[] {
  return [...LABOUR_MARKET_ROLES]
    .filter((r) => r.availability === "preparing")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isRoleActive(id: LabourMarketRoleId): boolean {
  return ROLE_BY_ID[id]?.availability === "active";
}

export function isRolePreparing(id: LabourMarketRoleId): boolean {
  return ROLE_BY_ID[id]?.availability === "preparing";
}

export function isLiveRoleId(id: string): id is LiveRoleId {
  return id === "worker" || id === "company" || id === "agency" || id === "customer";
}

export function rolePreparingLabelKey(): string {
  return "roles.status.preparing";
}

// ── Base identities (systemic-ux-roles-v1) ──────────────────────────
//
// The owner model has exactly TWO base identities a user can switch
// between — Asmuo (person) and Įmonė (company) — plus an Admin space
// that is handled separately (admin badge, never a role chip). Buy /
// sell / hire / agency activity are ACTIONS inside an identity, not
// identities themselves. The role switcher renders base identities, not
// raw `profile_roles` values, so "Agentūra" / "Pirkėjas" never appear as
// top-level switchable spaces. The legacy 4-role DB enum is untouched;
// agency/customer simply fold into the company identity here.

export type BaseIdentity = "person" | "company";

/** The base identity a live role belongs to. `worker` → person; every
 *  company-family role (`company`, `agency`, `customer`) → company.
 *  Returns null for roles that are not a base identity surface. */
export function baseIdentityForRole(id: string): BaseIdentity | null {
  if (id === "worker") return "person";
  if (id === "company" || id === "agency" || id === "customer") return "company";
  return null;
}

/** Canonical role to switch to for a base identity (the value passed to
 *  `switchRole`). Person → worker; company → company. */
export const BASE_IDENTITY_PRIMARY_ROLE: Record<BaseIdentity, LiveRoleId> = {
  person: "worker",
  company: "company",
};

/** Render order for base identities in the switcher. */
export const BASE_IDENTITY_ORDER: readonly BaseIdentity[] = ["person", "company"];

/** i18n key (under `auth.roleSwitcher`) for a base identity's space label. */
export function baseIdentityLabelKey(identity: BaseIdentity): "personSpace" | "companySpace" {
  return identity === "person" ? "personSpace" : "companySpace";
}
