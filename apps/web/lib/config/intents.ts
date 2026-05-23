/**
 * Central intent model — what the user is trying to DO when they sign up,
 * separate from the role they hold. A worker can intend to "find work" OR
 * "build a side project"; a company can intend to "hire" OR "partner".
 * The product currently surfaces only the role picker, but intent is a
 * documented future axis so new copy / nav can branch on it later without
 * touching every page.
 *
 * No UI consumes this yet. Treat as foundation — guard tests do not
 * require it. When intent UI ships, follow the same pattern as roles.ts.
 */

export type Availability = "active" | "preparing" | "hidden";

export type IntentId =
  | "find_work"
  | "offer_services"
  | "hire"
  | "partner"
  | "build_team"
  | "explore"
  | "learn"
  | "record_history";

export type LabourMarketIntent = {
  id: IntentId;
  labelKey: string;
  descriptionKey?: string;
  /** Which roles this intent typically pairs with. Informative only. */
  roleAffinity: readonly string[];
  availability: Availability;
};

export const LABOUR_MARKET_INTENTS: readonly LabourMarketIntent[] = [
  {
    id: "find_work",
    labelKey: "intent.find_work",
    roleAffinity: ["worker", "freelancer"],
    availability: "preparing",
  },
  {
    id: "offer_services",
    labelKey: "intent.offer_services",
    roleAffinity: ["freelancer", "service_provider", "agency"],
    availability: "preparing",
  },
  {
    id: "hire",
    labelKey: "intent.hire",
    roleAffinity: ["company", "agency"],
    availability: "preparing",
  },
  {
    id: "partner",
    labelKey: "intent.partner",
    roleAffinity: ["company", "agency"],
    availability: "preparing",
  },
  {
    id: "build_team",
    labelKey: "intent.build_team",
    roleAffinity: ["team_lead", "company"],
    availability: "preparing",
  },
  {
    id: "explore",
    labelKey: "intent.explore",
    roleAffinity: ["worker", "customer"],
    availability: "preparing",
  },
  {
    id: "learn",
    labelKey: "intent.learn",
    roleAffinity: ["worker"],
    availability: "preparing",
  },
  {
    id: "record_history",
    labelKey: "intent.record_history",
    roleAffinity: ["worker", "freelancer", "team_lead"],
    availability: "active",
  },
] as const;

export const INTENT_BY_ID: Record<IntentId, LabourMarketIntent> =
  Object.fromEntries(LABOUR_MARKET_INTENTS.map((i) => [i.id, i])) as Record<
    IntentId,
    LabourMarketIntent
  >;
