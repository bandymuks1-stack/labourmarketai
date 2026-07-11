/**
 * Dashboard module registry — the ONE descriptor layer behind the role-aware
 * control room (control-room capability programme §1, PR B).
 *
 * Before this file, four islands hard-coded route/icon/label lists
 * independently of each other (MyZone BASE_ACTIONS, the page-level
 * marketplaceAccess cards, dashboard-chain-actions role lists, the command
 * registry routes). This registry replaces the first two and feeds the third
 * (command registry) so a surface can never drift to a different route than
 * the rest of the product.
 *
 * Design contract (guard: lib/guards/dashboard-module-registry.test.ts):
 *
 *  - NOT a second truth. A module that corresponds to a catalogue feature
 *    carries its `featureKey` and derives its route from
 *    `feature-availability.ts` (`primaryRoute`) — never a duplicated literal.
 *    Real launch surfaces that are not catalogue features yet (bookings,
 *    services, service requests, opportunities, documents, the company
 *    workspace) carry a `surfaceRoute` that MUST be registered in the
 *    primary-route smoke inventory (lib/guards/primary-route-smoke.ts) and
 *    classified REAL_LAUNCH_SURFACE in the route truth map.
 *  - Real destinations only: every grid module routes to a page that exists
 *    and works today. No preparing/preview/removed surface may become a
 *    clickable card (no /dashboard/hub, no gated previews, no redirect stubs).
 *  - Labels/descriptions REUSE existing i18n keys (features.*, marketplace.*,
 *    auth.dashboard.myZone.actions.*) — no parallel copy source.
 *  - Attention is spine-only: a module may reference SPINE_SIGNALS ids and
 *    nothing else, so a card badge can never show a number the bell would not.
 *  - Pure data + pure lookups. No DB, no IO — the view model
 *    (lib/dashboard/control-room-view-model.ts) does the role filtering and
 *    count math; the page does the fetching.
 */

import type { Role } from "@/lib/auth/actions";
import {
  getFeatureConfig,
  type FeatureKey,
} from "@/lib/config/feature-availability";
import type { NavIconKey } from "@/lib/config/navigation";
import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";

export type DashboardModuleId =
  | "journal"
  | "profile"
  | "opportunities"
  | "tasks"
  | "bookings"
  | "planning"
  | "market_map"
  | "communication"
  | "documents"
  | "services"
  | "service_requests"
  | "projects"
  | "finance"
  | "company"
  | "activity"
  | "assist"
  | "overview";

/** Icon ids for module cards. A superset of the nav's NavIconKey so the nav
 *  and the grid keep speaking one visual language for shared destinations
 *  (journal = journal icon, messages = messages icon, map = map icon). The
 *  concrete lucide imports live in the grid component, mirroring how
 *  BottomNav / DashboardTabs own their icon maps. */
export type ModuleIconKey =
  | NavIconKey
  | "compass"
  | "calendar"
  | "documents"
  | "building"
  | "search"
  | "bell"
  | "checklist"
  | "handshake"
  | "briefcase"
  | "coins"
  | "sparkles";

/** Where a module may surface. `nav` is informational — the primary nav
 *  stays derived from the feature catalogue via lib/config/navigation.ts
 *  (this registry builds ON that source, it does not replace it). */
export type ModuleSurface = "grid" | "nav" | "command";

export type DashboardModule = {
  /** Stable module id (testids, React keys, command-registry references). */
  readonly id: DashboardModuleId;
  /** Catalogue feature the module is sourced from. When set, the route is
   *  ALWAYS the feature's `primaryRoute` — never a duplicated literal. */
  readonly featureKey?: FeatureKey;
  /** Route for real launch surfaces that are not catalogue features yet.
   *  Must be registered in the primary-route smoke inventory (guard-pinned). */
  readonly surfaceRoute?: string;
  /** i18n key for the card title (full path; existing keys reused). */
  readonly labelKey: string;
  /** i18n key for the one-line card description (full path). */
  readonly descriptionKey: string;
  readonly iconKey: ModuleIconKey;
  /** Which active roles see the module on their control room grid. The
   *  worker-with-company shortcut is handled by the view model. */
  readonly roles: readonly Role[];
  readonly surfaces: readonly ModuleSurface[];
  /** SPINE_SIGNALS ids whose counts badge this module's card. A signal id
   *  here must exist in the spine catalogue (guard-pinned) — attention can
   *  only come from the one notification spine, never a parallel count. */
  readonly attentionSignalIds?: readonly string[];
};

const ALL_ROLES: readonly Role[] = [
  "worker",
  "company",
  "agency",
  "customer",
];

const ORG_ROLES: readonly Role[] = ["company", "agency"];

/**
 * The canonical module catalogue. Order matters — the grid renders modules
 * in this order (action-first: recording work leads for workers; the shared
 * service loop and planning surfaces follow).
 */
export const DASHBOARD_MODULES: readonly DashboardModule[] = [
  // ── Worker person path (the former MyZone fast actions) ─────────────
  {
    id: "journal",
    featureKey: "journal_text_first",
    labelKey: "auth.dashboard.myZone.actions.recordWork.title",
    descriptionKey: "auth.dashboard.myZone.actions.recordWork.desc",
    iconKey: "journal",
    roles: ["worker"],
    surfaces: ["grid", "nav", "command"],
  },
  {
    id: "profile",
    featureKey: "profile_text_first",
    labelKey: "auth.dashboard.myZone.actions.improveProfile.title",
    descriptionKey: "auth.dashboard.myZone.actions.improveProfile.desc",
    iconKey: "idCard",
    roles: ["worker"],
    surfaces: ["grid", "command"],
  },
  {
    id: "opportunities",
    // Worker-only demand-consumption surface (bridge v1, concept-map-v1):
    // org roles post demand through the demand-intake section instead.
    surfaceRoute: "/dashboard/opportunities",
    labelKey: "auth.dashboard.myZone.actions.findOpportunities.title",
    descriptionKey: "auth.dashboard.myZone.actions.findOpportunities.desc",
    iconKey: "compass",
    roles: ["worker"],
    surfaces: ["grid", "command"],
  },

  // ── Shared operational surfaces ──────────────────────────────────────
  {
    id: "tasks",
    // Work tasks (control room PR D): every role gets the "my tasks" view;
    // org roles additionally reach project-linked tasks through the same
    // surface. Repo-safe layer — the page degrades honestly until the
    // owner-gated work_tasks migration (D2) is applied.
    surfaceRoute: "/dashboard/tasks",
    labelKey: "tasks.title",
    descriptionKey: "tasks.intro",
    iconKey: "checklist",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
    attentionSignalIds: ["open-task-attention"],
  },
  {
    id: "bookings",
    // Control room PR E: bookings hands the generic planning label to the
    // unified planning surface and speaks its own name — the card is the
    // proposal/accept loop, not the whole plan.
    surfaceRoute: "/dashboard/bookings",
    labelKey: "auth.dashboard.myZone.actions.bookings.title",
    descriptionKey: "auth.dashboard.myZone.actions.bookings.desc",
    iconKey: "handshake",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
    attentionSignalIds: ["pending-bookings", "booking-responses"],
  },
  {
    id: "planning",
    // Unified planning agenda (control room PR E): bookings + managed
    // project date bands + open task due dates in one compact agenda, each
    // row linking back to its real source object. Declares NO
    // attentionSignalIds — the booking/task signals already badge their own
    // modules; a badge here would double-count the same numbers.
    surfaceRoute: "/dashboard/planning",
    labelKey: "auth.dashboard.myZone.actions.planning.title",
    descriptionKey: "auth.dashboard.myZone.actions.planning.desc",
    iconKey: "calendar",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
  },
  {
    id: "market_map",
    featureKey: "market_map",
    labelKey: "features.market_map.label",
    descriptionKey: "features.market_map.description",
    iconKey: "map",
    roles: ALL_ROLES,
    surfaces: ["grid", "nav", "command"],
  },
  {
    id: "communication",
    featureKey: "communication",
    labelKey: "features.communication.label",
    descriptionKey: "features.communication.description",
    iconKey: "messages",
    roles: ALL_ROLES,
    surfaces: ["grid", "nav", "command"],
    attentionSignalIds: ["unread-messages"],
  },
  {
    id: "documents",
    surfaceRoute: "/dashboard/documents",
    labelKey: "auth.dashboard.myZone.actions.documents.title",
    descriptionKey: "auth.dashboard.myZone.actions.documents.desc",
    iconKey: "documents",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
  },

  // ── Service loop (the former marketplaceAccess cards) ────────────────
  {
    id: "services",
    surfaceRoute: "/dashboard/services",
    labelKey: "marketplace.hubOffer",
    descriptionKey: "marketplace.hubOfferNote",
    iconKey: "store",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
  },
  {
    id: "service_requests",
    surfaceRoute: "/dashboard/service-requests",
    labelKey: "marketplace.hubFind",
    descriptionKey: "marketplace.hubFindNote",
    iconKey: "search",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
    attentionSignalIds: [
      "incoming-service-requests",
      "service-request-responses",
    ],
  },

  // ── Manager operations (control room PR G) ───────────────────────────
  {
    id: "projects",
    // Projects / objects — the manager map into each project's operating
    // centre. Until PR G, managers reached /dashboard/projects only via
    // nav links and the command finder's literal route; the module makes
    // it a first-class grid card for org roles. Labels reuse the projects
    // page's own copy (no parallel copy source).
    surfaceRoute: "/dashboard/projects",
    labelKey: "projects.title",
    descriptionKey: "projects.intro",
    iconKey: "briefcase",
    roles: ORG_ROLES,
    surfaces: ["grid", "command"],
  },

  {
    id: "finance",
    // Operational finance records (control room PR I): manual invoices
    // issued/received + expenses with derived overdue flags and real
    // cent-exact sums. Org-role-first, and workers record expenses too;
    // customers have no operational-finance need. Repo-safe layer — the
    // page degrades honestly until the owner-gated finance_records
    // migration (I2) is applied. NO attentionSignalIds: a finance-overdue
    // spine signal is a recorded follow-up (joins the spine after the
    // migration is applied), so no badge can appear before real data can.
    surfaceRoute: "/dashboard/finance",
    labelKey: "finance.title",
    descriptionKey: "finance.intro",
    iconKey: "coins",
    roles: ["company", "agency", "worker"],
    surfaces: ["grid", "command"],
  },

  // ── Organisation workspace door ──────────────────────────────────────
  {
    id: "company",
    // Canonical company workspace (agency = company_type 'staffing_agency'
    // inside the same workspace — Direction A). Workers who really own a
    // company get this module too (view-model `hasCompany` flag, preserving
    // the former MyZone COMPANY_ACTION behaviour).
    surfaceRoute: "/dashboard/company",
    labelKey: "auth.dashboard.myZone.actions.companyActions.title",
    descriptionKey: "auth.dashboard.myZone.actions.companyActions.desc",
    iconKey: "building",
    roles: ORG_ROLES,
    surfaces: ["grid", "command"],
  },

  // ── Cross-module activity centre (control room PR C) ─────────────────
  {
    id: "activity",
    // The unified activity surface aggregates EVERY spine signal itself, so
    // it declares no attentionSignalIds — a badge here would double-count
    // the same numbers the bell and the per-module cards already carry.
    surfaceRoute: "/dashboard/activity",
    labelKey: "activityCentre.title",
    descriptionKey: "activityCentre.intro",
    iconKey: "bell",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
  },

  // ── AI assistance centre (control room PR J) ─────────────────────────
  {
    id: "assist",
    // One controlled assistance surface: the deterministic "what needs my
    // attention" composition, the deterministic role summaries and the
    // HONEST AI-provider state card (disabled in production — the page says
    // so; no generation is wired in this slice, gap map §10). Declares NO
    // attentionSignalIds — the surface aggregates the spine itself, so a
    // badge here would double-count the numbers the bell already carries.
    surfaceRoute: "/dashboard/assist",
    labelKey: "assist.title",
    descriptionKey: "assist.intro",
    iconKey: "sparkles",
    roles: ALL_ROLES,
    surfaces: ["grid", "command"],
  },

  // ── Nav-only: the overview itself (never a card linking to itself) ───
  {
    id: "overview",
    featureKey: "overview",
    labelKey: "features.overview.label",
    descriptionKey: "features.overview.description",
    iconKey: "home",
    roles: ALL_ROLES,
    surfaces: ["nav"],
    // Pending invitations clear on the overview (accept/decline card).
    attentionSignalIds: ["pending-invitations"],
  },
] as const;

const MODULE_BY_ID: Record<DashboardModuleId, DashboardModule> =
  Object.fromEntries(DASHBOARD_MODULES.map((m) => [m.id, m])) as Record<
    DashboardModuleId,
    DashboardModule
  >;

export function getDashboardModule(id: DashboardModuleId): DashboardModule {
  return MODULE_BY_ID[id];
}

/**
 * The ONE route resolver. Feature-backed modules always resolve through the
 * feature catalogue (route drift is impossible); surface modules use their
 * registered launch-surface route.
 */
export function getModuleRoute(id: DashboardModuleId): string {
  const m = MODULE_BY_ID[id];
  if (m.featureKey) {
    const route = getFeatureConfig(m.featureKey).primaryRoute;
    if (route) return route;
  }
  if (!m.surfaceRoute) {
    // Unreachable by construction (guard-pinned): every module carries a
    // resolvable route. Fail loudly in dev rather than render a dead card.
    throw new Error(`dashboard module "${id}" has no resolvable route`);
  }
  return m.surfaceRoute;
}

const SPINE_SIGNAL_IDS = new Set(SPINE_SIGNALS.map((s) => s.id));

/** True when every attention reference points at a real spine signal —
 *  consumed by the guard test so a typo cannot silently drop a badge. */
export function moduleAttentionSignalsAreValid(m: DashboardModule): boolean {
  return (m.attentionSignalIds ?? []).every((id) => SPINE_SIGNAL_IDS.has(id));
}
