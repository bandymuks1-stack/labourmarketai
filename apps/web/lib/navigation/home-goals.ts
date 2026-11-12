/**
 * THE HOME GOALS — what a person came to DO, as the first thing the signed-in
 * home offers (owner P0 No. 1, 2026-11-12: navigation is the launch blocker —
 * a new person must understand the main choices in five seconds and reach the
 * start of a function in at most two navigation actions).
 *
 * The home used to offer its destinations as a carousel of AREAS named in the
 * product's own vocabulary ("World", "Capacity", "Results"), two cards wide on
 * a phone, under the whole day's reading. A goal is the opposite: a verb the
 * person already has in mind ("Find work", "Find workers"), one tap from the
 * top of the home, for the role they are acting in.
 *
 * PURE. No IO, no React. One list per acting role; the FIRST
 * `HOME_TOP_TASK_COUNT` goals of each list are that role's top tasks (the
 * audit's and the walk's subject). Every href is an EXISTING canonical route —
 * the start of the function, never a new surface and never a second copy of
 * one (decision 0016). `lib/guards/home-goals.test.ts` pins that against the
 * app tree.
 *
 * A GOAL IS A PRESENTATION, NEVER A PERMISSION. `goalIsAdmitted` asks the ONE
 * route gate table (`routeRequirement`, the same rule the dashboard layout and
 * the page gates apply) whether the person may open the goal's route, and the
 * home renders only the goals that pass. The destination still re-checks its
 * own rights under RLS.
 */

import { routeRequirement } from "@/lib/auth/role-gated-routes";
import { NEED_DOOR_HREF } from "@/lib/company/need-door";
import type { WorkArea, WorkAreaIconKey } from "@/lib/navigation/work-areas";

/** The acting roles that have a goal home. `company` covers both the employer
 *  (find workers, projects, people) and the business that sells a service
 *  (offer services, requests and orders) — one organization is often both. */
export type HomeGoalRole = "worker" | "company" | "agency";

export type HomeGoal = {
  /** Stable id (test ids, React keys, the message key segment). */
  readonly id: string;
  /** Locale-prefix-free route of an existing page: the START of the function. */
  readonly href: string;
  readonly iconKey: WorkAreaIconKey;
};

/** The first N goals of a role are its top tasks. */
export const HOME_TOP_TASK_COUNT = 3;

export const HOME_GOALS: Readonly<Record<HomeGoalRole, readonly HomeGoal[]>> = {
  worker: [
    { id: "findWork", href: "/dashboard/opportunities", iconKey: "compass" },
    { id: "recordWork", href: "/dashboard/journal", iconKey: "journal" },
    { id: "myCv", href: "/cv", iconKey: "idCard" },
    { id: "messages", href: "/dashboard/communication", iconKey: "messages" },
  ],
  company: [
    // The ONE need door (`lib/company/need-door.ts`): the home renders this
    // goal through the shared, tracked `NeedDoorLink`.
    { id: "findWorkers", href: NEED_DOOR_HREF, iconKey: "userSearch" },
    { id: "projects", href: "/dashboard/projects", iconKey: "folder" },
    { id: "people", href: "/dashboard/company/people", iconKey: "users" },
    { id: "hours", href: "/dashboard/hours", iconKey: "activity" },
    { id: "offerServices", href: "/dashboard/services", iconKey: "package" },
    { id: "orders", href: "/dashboard/service-requests", iconKey: "store" },
  ],
  // SEP-4 (DEMAND ≠ SUPPLY): an agency's first goal is what it OFFERS. Its
  // Needs door opens on the offer (`resolveNeedsAudience`), so the goal is
  // named for supply and is never the "describe a need" door.
  agency: [
    { id: "offerPeople", href: "/dashboard/company/needs", iconKey: "userSearch" },
    { id: "clients", href: "/dashboard/company/partners", iconKey: "handshake" },
    { id: "people", href: "/dashboard/company/people", iconKey: "users" },
    { id: "candidates", href: "/dashboard/company/scouting", iconKey: "briefcase" },
  ],
};

/** The message keys of a goal, under the `homeGoals` namespace. */
export function homeGoalLabelKey(role: HomeGoalRole, goal: HomeGoal): string {
  return `${role}.${goal.id}.label`;
}
export function homeGoalHintKey(role: HomeGoalRole, goal: HomeGoal): string {
  return `${role}.${goal.id}.hint`;
}

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

/** The goals of a role this person may actually open, in order. */
export function admittedHomeGoals(
  role: HomeGoalRole,
  admission: GoalAdmission,
): readonly HomeGoal[] {
  return HOME_GOALS[role].filter((g) => goalIsAdmitted(g, admission));
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
