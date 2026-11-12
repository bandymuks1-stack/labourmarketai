/**
 * A PIN NEVER GRANTS ACCESS (owner P0 No. 1, 2026-11-12).
 *
 * A pin is a reference the person saved; it is drawn on the home ONLY when the
 * product's existing gating already admits the person to what it points at.
 * This module adds no rule of its own — it asks the gates that already exist:
 *
 *   `link:/dashboard/…`   the ONE route gate table (`routeIsAdmitted` over
 *                         `routeRequirement`), the layout's and the pages' rule;
 *   `f:<action-id>`       the conversation action registry's `allowedRoles`
 *                         (the roles the server re-checks before it runs it);
 *                         the company family also opens by membership in the
 *                         active workspace, exactly like the company gate;
 *   a bare chip reference the route that chip's flow belongs to
 *                         (`CHIP_GATE_ROUTE`), then the same route table;
 *   `project:` / `demand:` the area the entity lives in.
 *
 * It only decides what is DRAWN. Every destination and every chat flow still
 * re-checks its own rights on the server and under RLS: a reference this
 * module admits can still be refused there, and one it hides was never a way
 * in. PURE — no IO, safe on both sides of the boundary.
 */

import { getConversationAction } from "@/lib/conversation/action-registry";
import { routeIsAdmitted, type GoalAdmission } from "@/lib/navigation/home-goals";
import { pinKindFor, type WorkspacePin } from "@/lib/workspace/pins-model";

/**
 * The route whose gate governs each bare chip reference `pins-model.ts`
 * accepts. `null` = a flow open to every signed-in person (it works on the
 * person's own data, or re-derives everything on the server).
 * `lib/workspace/pin-admission.test.ts` pins that every bare reference the
 * model accepts is classified here.
 */
export const CHIP_GATE_ROUTE: Readonly<Record<string, string | null>> = {
  logwork: null,
  cv: null,
  profile: null,
  projects: null,
  engagements: null,
  agenda: null,
  offers: null,
  "documents-centre": null,
  "compass-page": null,
  // The worker's job board.
  jobs: "/dashboard/opportunities",
  // The employer space.
  candidates: "/dashboard/company/scouting",
  "agency:demand": "/dashboard/company/partners",
  "agency:progress": "/dashboard/company/partners",
  "edu:create": "/dashboard/company/education",
  "edu:cohort": "/dashboard/company/education",
  "edu:assign": "/dashboard/company/education",
};

const COMPANY_FAMILY = new Set(["company", "agency"]);

export function pinIsAdmitted(ref: string, admission: GoalAdmission): boolean {
  // An unrecognised reference is never drawn (the model refuses to store one).
  if (pinKindFor(ref) === null) return false;

  if (ref.startsWith("link:")) return routeIsAdmitted(ref.slice("link:".length), admission);

  if (ref.startsWith("f:")) {
    const action = getConversationAction(ref.slice("f:".length));
    // A pin to an action the registry no longer holds is a dead chip.
    if (!action) return false;
    if (action.allowedRoles.some((r) => admission.heldRoles.includes(r))) return true;
    return admission.opensCompanySpace && action.allowedRoles.some((r) => COMPANY_FAMILY.has(r));
  }

  if (ref.startsWith("demand:")) return routeIsAdmitted("/dashboard/company/needs", admission);
  // A project is reached by a manager and by an assigned worker alike; the
  // project's own page and RLS decide which, so the area gate is "signed in".
  if (ref.startsWith("project:")) return routeIsAdmitted("/dashboard/projects", admission);

  if (!(ref in CHIP_GATE_ROUTE)) return false;
  const gate = CHIP_GATE_ROUTE[ref];
  return gate === null ? true : routeIsAdmitted(gate, admission);
}

/** The pins the home may draw for this person, order kept. */
export function admittedPins<T extends Pick<WorkspacePin, "ref">>(
  pins: readonly T[],
  admission: GoalAdmission,
): T[] {
  return pins.filter((p) => pinIsAdmitted(p.ref, admission));
}
