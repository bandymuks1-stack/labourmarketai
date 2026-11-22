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
  | "education";

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
/**
 * THE EDUCATION AREA (UX_GAPS 2026-11-18 I-1): an organization with the
 * education capability gets its learning home in the header too — the SAME
 * route and the SAME label as the `education` organization door
 * (`ORGANIZATION_DOOR_ROUTES.education`, `organizationDoors.education`). It is
 * not one of the company model's areas: only an organization that holds the
 * capability has it, by the doors' own gate (`isEducationInstitution`).
 */
export const ORGANIZATION_EDUCATION_AREA: WorkArea = {
  id: "education",
  href: "/dashboard/company/education",
  iconKey: "education",
  labelKey: "organizationDoors.education",
};

/**
 * BUTTON = ACTION (owner directive 2026-11-21, P1). Each invite CTA names one
 * action and opens it: `invite=1` makes /dashboard/network open AS the invite
 * form (titled after the action), not as the relationships overview whose
 * first screen is about the person's organisations. One address per action,
 * used by every CTA for it (lib/guards/cta-routes.test.ts).
 */
/** "Invite a worker / an employee": the invitation panel, employee type. */
export const WORKER_INVITE_HREF = "/dashboard/network?invite=1&type=join_as_employee";
/** "Add / create an organisation": the setup form in CREATE mode. Without
 *  `new=1` the form EDITS the active or single owned company, so "+ Add
 *  company" used to open the existing company's profile. `new=1` still
 *  completes an unfinished first organisation (a shell row) instead of
 *  inserting a second one. */
export const NEW_ORGANIZATION_HREF = "/dashboard/start/company?new=1";

/** The ONE address of "invite a learner": the invitation panel with the
 *  type, the organization and the student relationship preset. */
export function learnerInviteHref(organizationId: string): string {
  // `invite=1`: the page opens AS the invite action (button = action, owner
  // directive 2026-11-21), not as the relationships overview.
  return `/dashboard/network?invite=1&type=join_organization&org=${organizationId}&relationship=student`;
}

const HEADER_AREA_LEADS: Record<"company" | "agency", readonly string[]> = {
  company: ["people", "projects", "work"],
  agency: ["people", "clients", "projects"],
};
const AREAS_IN_THE_CORE_LOOP = new Set(["messages", "calendar"]);

/**
 * `education`: the organization holds the education capability, so its
 * learning home is one of its areas. `educationFirst`: it is first of all an
 * institution (`isEducationFirstWorkspace` — the education capability without
 * `employer`), so that home leads (I-1). An organization that ALSO employs
 * people keeps its own leads first and finds the learning home right after
 * them: the education capability never pushes a company's or an agency's
 * areas down (prod-company-chain N-1).
 */
export function organizationHeaderAreas(
  role: "company" | "agency",
  {
    education = false,
    educationFirst = false,
  }: { readonly education?: boolean; readonly educationFirst?: boolean } = {},
): readonly NavItem[] {
  const leads = HEADER_AREA_LEADS[role];
  const rank = (id: string) => (leads.includes(id) ? leads.indexOf(id) : leads.length);
  const areas = ORGANIZATION_WORK_AREAS.filter((a) => !AREAS_IN_THE_CORE_LOOP.has(a.id))
    .map((a, n) => ({ a, n }))
    .sort((x, y) => rank(x.a.id) - rank(y.a.id) || x.n - y.n)
    .map(({ a }) => a);
  const withEducation = !education
    ? areas
    : educationFirst
      ? [ORGANIZATION_EDUCATION_AREA, ...areas]
      : [...areas.slice(0, leads.length), ORGANIZATION_EDUCATION_AREA, ...areas.slice(leads.length)];
  return withEducation.map((a) => ({
    id: `area:${a.id}` as const,
    href: a.href,
    tabLabelKey: a.labelKey,
    iconKey: a.iconKey,
  }));
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

/**
 * THE PERSON'S OWN DOORS IN THE ONE HEADER (coordinator 2026-11-22: job search
 * and offers clearly and quickly reachable at 375/390 px and on desktop). The
 * core loop (chat · journal · calendar · messages) is the primary row; job
 * search ("Žiūrėti galimybes") and the incoming offers ("Rezervacijos") were
 * in NO header surface — only the home's stations reached them, so from any
 * other page the way to a job ran through home. They now lead "More" and the
 * phone sheet for a worker in their own workspace. Existing routes, existing
 * labels; the core row is unchanged.
 */
export const PERSONAL_HEADER_DOORS: readonly NavItem[] = [
  {
    id: "area:opportunities",
    href: "/dashboard/opportunities",
    tabLabelKey: "auth.dashboard.myZone.actions.findOpportunities.title",
    iconKey: "compass",
  },
  {
    id: "area:bookings",
    href: "/dashboard/bookings",
    tabLabelKey: "auth.dashboard.myZone.actions.bookings.title",
    iconKey: "handshake",
  },
];

/** A worker in their own workspace gets the personal doors; an organization
 *  workspace keeps its own (`organizationHeaderAreas`). */
export function personalHeaderDoors(
  heldRoles: readonly string[],
  activeWorkspace: { readonly kind: "personal" | "organization" } | null | undefined,
): readonly NavItem[] {
  if (!heldRoles.includes("worker")) return [];
  if (activeWorkspace?.kind === "organization") return [];
  return PERSONAL_HEADER_DOORS;
}

export type WorkAreaContext = "personal" | "organization";

/** The areas of a workspace — the one lookup every home surface uses. */
export function workAreasFor(context: WorkAreaContext): readonly WorkArea[] {
  return context === "organization" ? ORGANIZATION_WORK_AREAS : PERSONAL_WORK_AREAS;
}
