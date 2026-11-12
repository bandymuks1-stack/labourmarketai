/**
 * THE WORK AREAS — the one source of truth for "which areas can I go to from
 * here", per workspace (owner order 2026-10-25, phase 2 of the one navigation
 * system). The home surfaces render these through the light 3D area switcher
 * (`components/app/area-switcher.tsx`); nothing else spells these routes.
 *
 *   personal      — the worker's contextual workspaces, derived from
 *                   `TODAY_STATIONS` (opportunities first: the former
 *                   PASAULIS tab). The core loop (chat · journal · calendar ·
 *                   messages) lives in the header and is not repeated here,
 *                   except the journal, which is also a station.
 *   organization  — the company model's doors, in priority order: the six
 *                   everyday ones first, then the rest (the former "More").
 *
 * Every href is an existing canonical route (guard:
 * `lib/guards/company-model.test.ts`, `lib/guards/area-switcher.test.ts`);
 * each destination re-checks its own rights under RLS — the list is a
 * presentation, never a permission.
 */

import type { NavItem } from "@/lib/config/navigation";
import { TODAY_STATIONS, type TodayStationId } from "@/lib/today/today-route";

export type WorkAreaIconKey =
  | "compass"
  | "journal"
  | "chart"
  | "user"
  | "idCard"
  | "images"
  | "userSearch"
  | "package"
  | "store"
  | "users"
  | "folder"
  | "messages"
  | "handshake"
  | "briefcase"
  | "calendar"
  | "gauge"
  | "activity"
  | "barChart"
  | "history"
  // Public browse carousels (owner P0 2026-11-12): one icon per work sector
  // and per public function. Same switcher, same icon map.
  | "hardHat"
  | "factory"
  | "warehouse"
  | "truck"
  | "sprout"
  | "sparkles"
  | "utensils"
  | "heartHandshake"
  | "tractor"
  | "building"
  | "shoppingBag"
  | "code"
  | "graduationCap"
  | "scissors"
  | "wrench"
  | "fileSignature"
  | "globe"
  | "layers";

export type WorkArea = {
  readonly id: string;
  readonly href: string;
  readonly iconKey: WorkAreaIconKey;
  /** Full i18n key path (read with the root translator). */
  readonly labelKey: string;
};

const PERSONAL_ICONS: Record<TodayStationId, WorkAreaIconKey> = {
  world: "compass",
  journal: "journal",
  numbers: "chart",
  profile: "user",
  cv: "idCard",
  gallery: "images",
};

/** The person's own workspace: the stations, one tap each. */
export const PERSONAL_WORK_AREAS: readonly WorkArea[] = TODAY_STATIONS.map((s) => ({
  id: s.id,
  href: s.href,
  iconKey: PERSONAL_ICONS[s.id],
  labelKey: `todayScreen.home.stations.${s.id}`,
}));

/** The organization workspace: the company model's doors, by priority. The
 *  calendar entry is the ONE calendar; "capacity" is the workforce zone. */
export const ORGANIZATION_WORK_AREAS: readonly WorkArea[] = [
  { id: "need", href: "/dashboard/company/needs", iconKey: "userSearch", labelKey: "companyModel.need" },
  { id: "offer", href: "/dashboard/services", iconKey: "package", labelKey: "companyModel.offer" },
  // "Rinka" is the service/request loop — the SAME route as the organization
  // door of that name (route drift fix 2026-11-03). Physical-resource listings
  // stay reachable from that page and from the command finder.
  { id: "market", href: "/dashboard/service-requests", iconKey: "store", labelKey: "companyModel.market" },
  { id: "people", href: "/dashboard/company/people", iconKey: "users", labelKey: "companyModel.people" },
  { id: "projects", href: "/dashboard/projects", iconKey: "folder", labelKey: "companyModel.projects" },
  { id: "messages", href: "/dashboard/communication", iconKey: "messages", labelKey: "companyModel.messages" },
  { id: "clients", href: "/dashboard/company/partners", iconKey: "handshake", labelKey: "companyModel.clients" },
  { id: "candidates", href: "/dashboard/company/scouting", iconKey: "briefcase", labelKey: "companyModel.candidates" },
  { id: "calendar", href: "/dashboard/planning", iconKey: "calendar", labelKey: "companyModel.calendar" },
  { id: "capacity", href: "/dashboard/company/planning", iconKey: "gauge", labelKey: "companyModel.capacity" },
  { id: "work", href: "/dashboard/hours", iconKey: "activity", labelKey: "companyModel.work" },
  { id: "results", href: "/dashboard/reports", iconKey: "barChart", labelKey: "companyModel.results" },
  { id: "history", href: "/dashboard/company/history", iconKey: "history", labelKey: "companyModel.history" },
];

/**
 * THE ORGANIZATION'S DOORS IN THE ONE HEADER (owner P0-2, direction A,
 * 2026-11-03: navigation by role). For a person whose acting role in the
 * ACTIVE workspace is company or agency (`actingRoleForWorkspace` — the ONE
 * resolver; owner/manager AND the held role), the header's "More" and the
 * phone sheet open with these doors, the role's own core first. The primary
 * row stays the A-03 core loop for everyone (chat → journal → calendar →
 * messages): this re-prioritizes "More", it adds no primary item.
 *
 * The two areas that ARE a core destination (messages, calendar) are left out
 * so no destination appears twice. Every door re-checks its own rights: for
 * an owner or manager of the active organization the company gate opens by
 * membership (`requireRoleOrRedirect` → `workspaceOpensCompanySpace`), which
 * is why an agency owner can open them too.
 */
export const HEADER_AREA_LEADS: Record<"company" | "agency", readonly string[]> = {
  company: ["people", "projects", "work"],
  agency: ["people", "clients", "projects"],
};
const AREAS_IN_THE_CORE_LOOP = new Set(["messages", "calendar"]);

export function organizationHeaderAreas(role: "company" | "agency"): readonly NavItem[] {
  const leads = HEADER_AREA_LEADS[role];
  const rank = (id: string) => (leads.includes(id) ? leads.indexOf(id) : leads.length);
  return ORGANIZATION_WORK_AREAS.filter((a) => !AREAS_IN_THE_CORE_LOOP.has(a.id))
    .map((a, n) => ({ a, n }))
    .sort((x, y) => rank(x.a.id) - rank(y.a.id) || x.n - y.n)
    .map(({ a }) => ({ id: `area:${a.id}` as const, href: a.href, tabLabelKey: a.labelKey, iconKey: a.iconKey }));
}

/**
 * THE CUSTOMER'S OWN DOOR in the one header (owner P0-2, coordinator ruling
 * 2026-11-03): a person who HOLDS the customer role, outside an organization
 * workspace, finds "Mano užklausos" (/dashboard/buyer — the customer role's
 * home) first in "More" and the phone sheet. Same rule as the
 * organization doors: the primary row stays the A-03 core loop, this adds no
 * primary item, and the page re-checks the customer role itself.
 */
export const CUSTOMER_HEADER_DOORS: readonly NavItem[] = [
  { id: "area:buyer", href: "/dashboard/buyer", tabLabelKey: "roleDashboards.buyer.title", iconKey: "package" },
];

/**
 * WHO GETS THE CUSTOMER DOOR — the SAME rule as the /dashboard/buyer gate
 * (`requireRoleOrRedirect(locale, "customer")`, a HELD-role check). Production
 * walk buyer-workspace 41676554374: a customer whose active role was `worker`
 * (the normal state after onboarding resets active_role to the chosen
 * primary) got no door, because the first version asked for the ACTIVE role.
 */
export function customerHeaderDoors(
  heldRoles: readonly string[],
  activeWorkspace: { readonly kind: "personal" | "organization" } | null | undefined,
): readonly NavItem[] {
  if (!heldRoles.includes("customer")) return [];
  if (activeWorkspace?.kind === "organization") return [];
  return CUSTOMER_HEADER_DOORS;
}

export type WorkAreaContext = "personal" | "organization";

/** The areas of a workspace — the one lookup every home surface uses. */
export function workAreasFor(context: WorkAreaContext): readonly WorkArea[] {
  return context === "organization" ? ORGANIZATION_WORK_AREAS : PERSONAL_WORK_AREAS;
}
