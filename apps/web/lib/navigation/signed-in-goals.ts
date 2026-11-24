/**
 * THE SIX GOALS, SIGNED IN (owner P0 2026-11-23: "Visi šeši pagrindiniai
 * tikslai turi būti pasiekiami viešuose ir prisijungusių vartotojų ekranuose.
 * Funkcijos pritaikomos pagal naudotojo vaidmenį."; CAROUSEL_NAVIGATION_SPEC
 * OD-1 (a), step N4).
 *
 * The goals are the public site's own (`PUBLIC_INTENTS`) — the same six, in
 * the same order, for EVERY role; never a second list of goals. What a goal
 * opens for a signed-in person (level 2) is assembled from lists that already
 * exist, never spelled again:
 *
 *   · the person's own stations (`PERSONAL_WORK_AREAS`) and the organization's
 *     areas (`ORGANIZATION_WORK_AREAS`, `ORGANIZATION_EDUCATION_AREA`), with
 *     the routes, labels and icons the header and the homes already use;
 *   · the goal's public functions (`PUBLIC_INTENTS[].links`), under the names
 *     the public navigation gives them.
 *
 * Each card opens a real step of the one professional chain (owner addendum
 * 2026-11-23: identity → history → competencies → opportunities → agreements
 * and projects → work and time → confirmation → Living CV); nothing here is a
 * new route or a new screen.
 *
 * A GOAL IS A PRESENTATION, NEVER A PERMISSION. A card is offered only when
 * the ONE route gate table (`routeRequirement`) admits the person, and an
 * organization's area only when the active workspace IS that organization
 * (or the person holds the company role) — so a worker is never handed an
 * employer's page that would turn them away. Every goal keeps at least its
 * public functions, so all six stay reachable for everyone. Each destination
 * still re-checks its own rights.
 *
 * PURE: no IO, no React.
 */

import { routeRequirement } from "@/lib/auth/role-gated-routes";
import { FUNCTION_ICONS, type NavCardIconKey } from "@/lib/navigation/nav-card-icons";
import {
  PUBLIC_INTENTS,
  PUBLIC_INTENT_IDS,
  type PublicIntentId,
} from "@/lib/navigation/public-intents";
import {
  CUSTOMER_HEADER_DOORS,
  ORGANIZATION_EDUCATION_AREA,
  ORGANIZATION_WORK_AREAS,
  PERSONAL_WORK_AREAS,
  type WorkArea,
  type WorkAreaIconKey,
} from "@/lib/navigation/work-areas";

/** What the person's home knows when it decides which cards to draw — the
 *  SAME facts the dashboard layout's gate uses, plus the education capability
 *  of the active organization (the doors' own rule). */
export type GoalAdmission = {
  readonly heldRoles: readonly string[];
  /** The active workspace opens the employer space (membership arm). */
  readonly opensCompanySpace: boolean;
  /** The active organization holds the education capability. */
  readonly education: boolean;
};

export type SignedInFunction = {
  readonly id: string;
  /** Locale-prefix-free route of an existing page (or a landing fragment). */
  readonly href: string;
  readonly iconKey: NavCardIconKey;
  /** Full message key (root translator). */
  readonly labelKey: string;
  /** Where the card comes from — decides its admission rule. */
  readonly source: "personal" | "organization" | "education" | "customer" | "public";
};

/** A work area's icon in the card system (one icon set per surface). */
const AREA_TO_CARD: Readonly<Record<WorkAreaIconKey, NavCardIconKey>> = {
  compass: "compass",
  journal: "notebook",
  chart: "barChart",
  user: "idCard",
  idCard: "fileText",
  images: "layoutGrid",
  userSearch: "userSearch",
  package: "package",
  store: "store",
  users: "users",
  folder: "folder",
  messages: "messagesSquare",
  handshake: "handshake",
  briefcase: "briefcase",
  calendar: "calendarCheck",
  gauge: "ruler",
  activity: "clock",
  barChart: "barChart",
  history: "fileText",
  education: "graduationCap",
};

const fromArea = (area: WorkArea, source: SignedInFunction["source"]): SignedInFunction => ({
  id: `area-${area.id}`,
  href: area.href,
  iconKey: AREA_TO_CARD[area.iconKey],
  labelKey: area.labelKey,
  source,
});

const byId = (list: readonly WorkArea[], id: string): WorkArea => {
  const found = list.find((a) => a.id === id);
  if (!found) throw new Error(`signed-in-goals: unknown work area "${id}"`);
  return found;
};
const personal = (id: string) => fromArea(byId(PERSONAL_WORK_AREAS, id), "personal");
const org = (id: string) => fromArea(byId(ORGANIZATION_WORK_AREAS, id), "organization");

/** The goal's own public functions, as the public navigation names them. */
function publicFunctions(goal: PublicIntentId): readonly SignedInFunction[] {
  const intent = PUBLIC_INTENTS.find((i) => i.id === goal);
  return (intent?.links ?? []).map((link) => ({
    id: link.id,
    href: link.href,
    iconKey: FUNCTION_ICONS[link.id as keyof typeof FUNCTION_ICONS],
    labelKey: `siteNav.links.${link.id}`,
    source: "public" as const,
  }));
}

const customerRequests: SignedInFunction = {
  id: "area-buyer",
  href: CUSTOMER_HEADER_DOORS[0].href,
  iconKey: "shoppingBag",
  labelKey: CUSTOMER_HEADER_DOORS[0].tabLabelKey,
  source: "customer",
};

/**
 * WHAT EACH GOAL OPENS, signed in — the person's own steps first, then the
 * goal's public functions. Order follows the chain: find → agree → work →
 * record → the Living CV.
 */
export const SIGNED_IN_GOAL_FUNCTIONS: Readonly<Record<PublicIntentId, readonly SignedInFunction[]>> = {
  work: [
    personal("world"),
    personal("journal"),
    personal("cv"),
    personal("profile"),
    personal("numbers"),
    personal("gallery"),
    ...publicFunctions("work"),
  ],
  workers: [
    org("need"),
    org("candidates"),
    org("people"),
    org("projects"),
    org("work"),
    org("capacity"),
    ...publicFunctions("workers"),
  ],
  services: [org("offer"), org("market"), ...publicFunctions("services")],
  contractors: [customerRequests, ...publicFunctions("contractors")],
  partners: [
    org("clients"),
    fromArea(ORGANIZATION_EDUCATION_AREA, "education"),
    ...publicFunctions("partners"),
  ],
  agencies: [org("clients"), ...publicFunctions("agencies")],
};

/** A route without its query and hash — what a gate and a page are keyed on. */
export function routePath(href: string): string {
  return href.split(/[?#]/)[0];
}

/**
 * May this person open this card? The ONE gate table first (an operator route
 * is never offered); then the card's own rule: an organization's area only
 * inside an organization the person may run, the education area only with
 * the capability, the customer door only for a customer.
 */
export function functionIsAdmitted(fn: SignedInFunction, admission: GoalAdmission): boolean {
  const path = routePath(fn.href);
  const requirement = path ? routeRequirement(path) : null;
  if (requirement?.kind === "admin") return false;
  if (requirement?.kind === "role") {
    const held = admission.heldRoles.includes(requirement.role);
    const byMembership = requirement.role === "company" && admission.opensCompanySpace;
    if (!held && !byMembership) return false;
  }
  switch (fn.source) {
    case "organization":
      return admission.opensCompanySpace || admission.heldRoles.includes("company");
    case "education":
      return admission.opensCompanySpace && admission.education;
    case "customer":
      return admission.heldRoles.includes("customer");
    default:
      return true;
  }
}

export type SignedInGoal = {
  readonly id: PublicIntentId;
  readonly functions: readonly SignedInFunction[];
};

/**
 * ALL SIX GOALS, in the public order, each with the cards this person may
 * open — every route once per goal (a public function and an area can name
 * the same page). A goal never ends up empty: its public functions are open
 * to every signed-in person.
 */
export function signedInGoals(admission: GoalAdmission): readonly SignedInGoal[] {
  return PUBLIC_INTENT_IDS.map((id) => {
    const seen = new Set<string>();
    const functions = SIGNED_IN_GOAL_FUNCTIONS[id].filter((fn) => {
      if (!functionIsAdmitted(fn, admission)) return false;
      const key = fn.href.startsWith("/#") ? fn.href : routePath(fn.href);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { id, functions };
  });
}
