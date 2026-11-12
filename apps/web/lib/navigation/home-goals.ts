/**
 * THE SIGNED-IN HOME'S GOALS AND FUNCTIONS (owner P0 No. 1, 2026-11-12; V2
 * structure approved the same day: ONE navigation system for the public site
 * and the signed-in app).
 *
 * The six goals are the public site's own (`PUBLIC_INTENT_IDS`,
 * `lib/navigation/public-intents.ts`) — never a second list of goals. What
 * this module adds is what a goal OPENS for a person who is signed in: the
 * product's functions (existing routes), and in which order a role meets the
 * goals. The home renders them through Lane A's shared components
 * (`components/navigation/goal-navigator.tsx` → `card-rail.tsx`); nothing
 * here knows what a card looks like.
 *
 * PURE. No IO, no React. Every href is an EXISTING canonical route — the
 * start of the function, never a new surface (decision 0016);
 * `lib/guards/home-goals.test.ts` pins that against the app tree.
 *
 * A GOAL IS A PRESENTATION, NEVER A PERMISSION. `routeIsAdmitted` asks the
 * ONE route gate table (`routeRequirement`, the rule the dashboard layout and
 * the page gates apply). A function the person may not open is not offered;
 * a goal whose FIRST function they may not open is not offered at all (a
 * worker is not shown "Find workers" because two of its functions happen to
 * be open to everyone). Each destination still re-checks its own rights.
 */

import { routeRequirement } from "@/lib/auth/role-gated-routes";
import { NEED_DOOR_HREF } from "@/lib/company/need-door";
import type { NavCardIconKey } from "@/lib/navigation/nav-card-icons";
import type { PublicIntentId } from "@/lib/navigation/public-intents";
import type { WorkArea } from "@/lib/navigation/work-areas";

/** The acting roles that have a goal home. `company` covers both the employer
 *  and the business that sells a service — one organization is often both. */
export type HomeGoalRole = "worker" | "company" | "agency";

export type HomeGoal = {
  /** Stable id (test ids, React keys). */
  readonly id: string;
  /** Locale-prefix-free route of an existing page: the START of the function. */
  readonly href: string;
  /** An icon id of the shared card system (`lib/navigation/nav-card-icons.ts`). */
  readonly iconKey: NavCardIconKey;
  /** Full message key of the function's name (root translator). */
  readonly labelKey: string;
  /** Full message key of its one-line description, where it has one. */
  readonly hintKey?: string;
  /**
   * The function is entered through the product's own tracked door, not as a
   * rail card: the employer's "describe a need" is `NeedDoorLink` (address,
   * click event and wording are one thing by contract). The home renders the
   * door; the rail leaves the function out so it is offered once.
   */
  readonly door?: true;
};

const g = (id: string, href: string, iconKey: NavCardIconKey, base: string, extra: Partial<HomeGoal> = {}): HomeGoal => ({
  id,
  href,
  iconKey,
  labelKey: `${base}.label`,
  hintKey: `${base}.hint`,
  ...extra,
});
/** A function the public navigation already names (`siteNav.links.*`). */
const shared = (id: string, href: string, iconKey: NavCardIconKey, link: string): HomeGoal => ({
  id,
  href,
  iconKey,
  labelKey: `siteNav.links.${link}`,
});

const PEOPLE = g("people", "/dashboard/company/people", "users", "homeGoals.company.people");
const CANDIDATES = g("candidates", "/dashboard/company/scouting", "userSearch", "homeGoals.agency.candidates");
const CLIENTS = g("clients", "/dashboard/company/partners", "handshake", "homeGoals.agency.clients");

/**
 * WHAT EACH GOAL OPENS when the person is signed in. The first function of a
 * goal is its primary one (it decides whether the goal is offered). Icons are
 * distinct within a goal (the shared system's rule: never one identical icon
 * across a rail).
 */
export const GOAL_FUNCTIONS: Readonly<Record<PublicIntentId, readonly HomeGoal[]>> = {
  work: [
    g("findWork", "/dashboard/opportunities", "search", "homeGoals.worker.findWork"),
    g("recordWork", "/dashboard/journal", "clipboardList", "homeGoals.worker.recordWork"),
    g("myCv", "/cv", "idCard", "homeGoals.worker.myCv"),
  ],
  workers: [
    // The ONE need door (`lib/company/need-door.ts`), entered through the
    // shared, tracked `NeedDoorLink` on the employer's home.
    { id: "findWorkers", href: NEED_DOOR_HREF, iconKey: "clipboardList", labelKey: "homeGoals.company.findWorkers.label", door: true },
    PEOPLE,
    CANDIDATES,
    g("projects", "/dashboard/projects", "briefcase", "homeGoals.company.projects"),
    g("hours", "/dashboard/hours", "barChart", "homeGoals.company.hours"),
  ],
  services: [
    shared("offerServices", "/dashboard/services", "wrench", "myServices"),
    shared("orders", "/dashboard/service-requests", "inbox", "serviceRequests"),
  ],
  orders: [
    shared("listings", "/dashboard/listings", "store", "marketListings"),
    shared("commercial", "/dashboard/commercial", "fileSignature", "commercial"),
  ],
  partners: [shared("network", "/dashboard/network", "users", "network"), CLIENTS],
  // SEP-4 (DEMAND ≠ SUPPLY): an agency's goal opens on what it OFFERS. Its
  // Needs door opens on the offer (`resolveNeedsAudience`); it is never the
  // "describe a need" door.
  agencies: [
    g("offerPeople", "/dashboard/company/needs", "building", "homeGoals.agency.offerPeople"),
    CLIENTS,
    PEOPLE,
    CANDIDATES,
  ],
};

/**
 * IN WHICH ORDER A ROLE MEETS THE GOALS — its own first. The "For agencies"
 * goal is an agency's alone; an agency keeps "Find workers" (it can also be a
 * client) but after its own.
 */
export const ROLE_GOAL_ORDER: Readonly<Record<HomeGoalRole, readonly PublicIntentId[]>> = {
  worker: ["work", "services", "orders", "partners"],
  company: ["workers", "services", "orders", "partners", "work"],
  agency: ["agencies", "workers", "services", "orders", "partners", "work"],
};

/** Does this role enter this function through a tracked door on its home? */
export function isDoorFor(role: HomeGoalRole, fn: HomeGoal): boolean {
  // The need door is the employer's. An agency is never offered it.
  return fn.door === true && role === "company";
}

/** A goal's functions as its rail lists them before any access check: never
 *  a door (the home renders the door itself, for the role that has one). */
function railFunctions(goal: PublicIntentId): readonly HomeGoal[] {
  return GOAL_FUNCTIONS[goal].filter((fn) => !fn.door);
}

/**
 * Every function a role's home offers, goal by goal, each route once — what
 * can be pinned from that home and what the area switcher below it leaves
 * out. The employer's need door is included (it is on the home); an agency's
 * list never holds it.
 */
function functionsOf(role: HomeGoalRole): readonly HomeGoal[] {
  const seen = new Set<string>();
  const out: HomeGoal[] = [];
  for (const goal of ROLE_GOAL_ORDER[role]) {
    for (const fn of GOAL_FUNCTIONS[goal]) {
      if (fn.door && !isDoorFor(role, fn)) continue;
      const path = fn.href.split(/[?#]/)[0];
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(fn);
    }
  }
  return out;
}

export const HOME_GOALS: Readonly<Record<HomeGoalRole, readonly HomeGoal[]>> = {
  worker: functionsOf("worker"),
  company: functionsOf("company"),
  agency: functionsOf("agency"),
};

/** A route without its query and hash — what a gate and a page are keyed on. */
export function routePath(href: string): string {
  return href.split(/[?#]/)[0];
}

/**
 * What the home knows about the person when it decides which goals to draw —
 * the SAME two facts the dashboard layout's gate uses: the roles they hold,
 * and whether the active workspace opens the employer space by membership.
 */
export type GoalAdmission = {
  readonly heldRoles: readonly string[];
  readonly opensCompanySpace: boolean;
};

/**
 * May this person open `href`? The dashboard layout's rule, restated over the
 * one table: an ungated route is open to every signed-in person; a role-gated
 * route needs the held role, and the company gate also opens by membership in
 * the active workspace; an operator route is never offered as a goal or a pin.
 */
export function routeIsAdmitted(href: string, admission: GoalAdmission): boolean {
  const requirement = routeRequirement(routePath(href));
  if (!requirement) return true;
  if (requirement.kind === "admin") return false;
  if (admission.heldRoles.includes(requirement.role)) return true;
  return requirement.role === "company" && admission.opensCompanySpace;
}

export function goalIsAdmitted(goal: HomeGoal, admission: GoalAdmission): boolean {
  return routeIsAdmitted(goal.href, admission);
}

/** The functions of a role's home this person may actually open, in order. */
export function admittedHomeGoals(
  role: HomeGoalRole,
  admission: GoalAdmission,
): readonly HomeGoal[] {
  return HOME_GOALS[role].filter((fn) => goalIsAdmitted(fn, admission));
}

export type SignedInGoal = {
  readonly id: PublicIntentId;
  /** The goal's rail cards: admitted functions, no door. */
  readonly functions: readonly HomeGoal[];
};

/**
 * THE GOALS A PERSON'S HOME SHOWS, in their role's order, each with the
 * functions they may open. A goal is offered only when the person may open
 * its PRIMARY function (the first one, door included), and only when at
 * least one rail card remains.
 */
export function signedInGoals(role: HomeGoalRole, admission: GoalAdmission): readonly SignedInGoal[] {
  const out: SignedInGoal[] = [];
  for (const id of ROLE_GOAL_ORDER[role]) {
    const all = GOAL_FUNCTIONS[id].filter((fn) => !fn.door || isDoorFor(role, fn));
    const primary = all[0];
    if (!primary || !goalIsAdmitted(primary, admission)) continue;
    const functions = railFunctions(id).filter((fn) => goalIsAdmitted(fn, admission));
    if (functions.length === 0) continue;
    out.push({ id, functions });
  }
  return out;
}

/**
 * The work areas the goals do NOT already offer. The home shows a destination
 * once: an area whose route is a goal's route leaves the area switcher below
 * the goals. Compared by path, so the need door (`…/needs#demand-intake`) and
 * the needs area (`…/needs`) count as the same place.
 */
export function areasBeyondGoals(
  areas: readonly WorkArea[],
  goals: readonly HomeGoal[],
): readonly WorkArea[] {
  const offered = new Set(goals.map((g) => routePath(g.href)));
  return areas.filter((a) => !offered.has(routePath(a.href)));
}
