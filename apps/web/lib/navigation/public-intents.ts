/**
 * THE PUBLIC INTENTS — the one list behind the public header's mega-menu
 * (desktop) and its mobile menu (owner P0 2026-11-12, premium navigation).
 * PURE: no React, no IO, so the header, the guards and the e2e walk read ONE
 * list.
 *
 * Six top-level INTENTS — what a visitor came to do — never six kinds of
 * person. Owner window 11 §16 took `Workers · Companies · Agencies` out of the
 * bar because, as identities, they told every visitor which box they were in.
 * An intent is a verb ("looking for work"), and one person may hold several at
 * once (SEP-5 IDENTITY ≠ ROLE): a contractor looks for orders AND for workers.
 *
 * Every href is an EXISTING route under `app/[locale]/`
 * (`lib/guards/public-intents.test.ts` checks each one against the tree on
 * every CI run). Links into the signed-in product carry `account: true`:
 *
 *   · none of them is a role-gated prefix (`lib/auth/role-gated-routes.ts`),
 *     so any signed-in person reaches the page itself — the guard asserts it;
 *   · a signed-out visitor who follows one is sent to login by the middleware
 *     with the destination preserved in `?next=`, and lands on it after
 *     signing in — no second auth path;
 *   · the list is a presentation, never a permission: every page re-checks
 *     its own rights under RLS.
 *
 * Nothing that is not live appears here. A future intent destination is added
 * the day its route works, not before.
 */

import { AGENCY_DOOR_NEXT } from "@/lib/marketing/public-doors";

export const PUBLIC_INTENT_IDS = [
  "work",
  "workers",
  "services",
  "orders",
  "partners",
  "agencies",
] as const;
export type PublicIntentId = (typeof PUBLIC_INTENT_IDS)[number];

export type PublicIntentIconKey =
  | "briefcase"
  | "userSearch"
  | "wrench"
  | "fileSignature"
  | "handshake"
  | "building";

export type PublicIntentLink = {
  /** Message key under `siteNav.links`. */
  readonly id: string;
  /** Locale-less internal path. */
  readonly href: string;
  /** True when the page is inside the signed-in product. */
  readonly account: boolean;
};

export type PublicIntent = {
  readonly id: PublicIntentId;
  readonly iconKey: PublicIntentIconKey;
  readonly links: readonly PublicIntentLink[];
};

export const PUBLIC_INTENTS: readonly PublicIntent[] = [
  {
    id: "work",
    iconKey: "briefcase",
    links: [
      { id: "jobs", href: "/jobs", account: false },
      { id: "workOpportunities", href: "/work-opportunities", account: false },
      { id: "createCv", href: "/create-cv", account: false },
      { id: "workAbroad", href: "/work-abroad", account: false },
      { id: "forWorkers", href: "/for-workers", account: false },
    ],
  },
  {
    id: "workers",
    iconKey: "userSearch",
    links: [
      // The ONE canonical structured-demand entry (doctrine §17).
      { id: "companyNeed", href: "/company-need", account: false },
      { id: "forCompanies", href: "/for-companies", account: false },
      { id: "labourMarket", href: "/labour-market", account: false },
    ],
  },
  {
    id: "services",
    iconKey: "wrench",
    links: [
      { id: "myServices", href: "/dashboard/services", account: true },
      { id: "serviceRequests", href: "/dashboard/service-requests", account: true },
    ],
  },
  {
    id: "orders",
    iconKey: "fileSignature",
    links: [
      { id: "marketListings", href: "/dashboard/listings", account: true },
      { id: "commercial", href: "/dashboard/commercial", account: true },
    ],
  },
  {
    id: "partners",
    iconKey: "handshake",
    links: [
      { id: "network", href: "/dashboard/network", account: true },
      // The partner enquiry door — the same destination the landing's
      // PARTNER_DOOR uses (a commercial relationship with the company behind
      // the product, not a workspace).
      { id: "partnerWithUs", href: "/about", account: false },
    ],
  },
  {
    id: "agencies",
    iconKey: "building",
    links: [
      { id: "forAgencies", href: "/for-agencies", account: false },
      // Derived from the onboarding router, never retyped: the ONE canonical
      // organisation setup with the staffing-agency type preselected.
      { id: "setUpAgency", href: AGENCY_DOOR_NEXT, account: true },
    ],
  },
];

/** The first link of an intent is its primary destination. */
export function primaryHref(intent: PublicIntent): string {
  return intent.links[0].href;
}
