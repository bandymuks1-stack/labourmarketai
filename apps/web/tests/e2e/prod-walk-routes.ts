/**
 * THE PRODUCTION WALK'S SIGNED-IN ROUTE LISTS — one copy, shared by the specs
 * that open "every working surface" of a role:
 *
 *  - `prod-role-routes.spec.ts` (spec=role-routes): each route opens for each role;
 *  - `prod-ux-metrics.spec.ts` (spec=ux-metrics): numbers-only UX measurements of
 *    the same surfaces.
 *
 * Static paths only (no ids), `lt` prefix; a spec that needs another locale swaps
 * the first segment. Add a surface here and both walks pick it up.
 */

/** Surfaces every signed-in person has (the worker's whole set). */
export const COMMON_ROUTES: readonly string[] = [
  "/lt/dashboard",
  "/lt/dashboard/journal",
  "/lt/dashboard/planning",
  "/lt/dashboard/communication",
  "/lt/dashboard/profile",
  "/lt/dashboard/network",
  "/lt/dashboard/activity",
  "/lt/dashboard/learning",
  "/lt/dashboard/services",
  "/lt/dashboard/market-map",
  "/lt/dashboard/opportunities",
  "/lt/dashboard/work-in-numbers",
  "/lt/dashboard/documents",
  "/lt/dashboard/absences",
  "/lt/dashboard/tasks",
];

/** Employer surfaces (owner, manager, agency) on top of COMMON_ROUTES. */
export const EMPLOYER_ROUTES: readonly string[] = [
  "/lt/dashboard/company",
  "/lt/dashboard/company/people",
  "/lt/dashboard/company/needs",
  "/lt/dashboard/company/projects/new",
  "/lt/dashboard/company/planning",
  "/lt/dashboard/company/scouting",
  "/lt/dashboard/company/partners",
  "/lt/dashboard/buyer",
  "/lt/dashboard/projects",
  "/lt/dashboard/hours",
  "/lt/dashboard/candidates",
  "/lt/dashboard/talent",
  "/lt/dashboard/reports",
];
