import type { AbstractIntlMessages } from "next-intl";

/**
 * Client message allowlists (Performance Reality Audit v1 + v2).
 *
 * v1: the root layout previously let NextIntlClientProvider inherit the FULL
 * runtime message tree (~440 KB minified per locale), serializing every
 * namespace — including server-only ones (legal, projectOps, scouting, …) —
 * into the RSC flight payload of EVERY page. Only client components
 * (`useTranslations`) actually need messages on the client; server
 * components read via `getTranslations` and never touch this tree.
 * CLIENT_MESSAGE_ROOTS below is the union of:
 *  - every top-level root of a LITERAL `useTranslations("…")` call inside a
 *    "use client" file, and
 *  - the roots reached through DYNAMIC keys: the dashboard module registry
 *    (`labelKey`/`descriptionKey`), the nav tab labels, skill-group labels
 *    and the demand draft-form namespaces.
 *
 * v2 (route-group subsetting): one union list still made every route pay
 * for the heaviest surface — a marketing visitor's client components reach
 * ~4 KB of messages, yet the landing document carried the full ~300 KB
 * union pick. Nested NextIntlClientProvider REPLACES `messages` for its
 * subtree (use-intl context merge: `messages === undefined ?
 * prevContext?.messages : messages`), so each route group now ships exactly
 * the roots its own client components can reach:
 *
 *  - root [locale] layout    → BASE_CLIENT_MESSAGE_ROOTS (error boundary)
 *  - (marketing) layout      → MARKETING_CLIENT_MESSAGE_ROOTS
 *  - auth + onboarding       → AUTH_CLIENT_MESSAGE_ROOTS
 *  - dashboard + design      → CLIENT_MESSAGE_ROOTS (full union pick)
 *  - cv, invite, [...rest]   → none beyond BASE (guard-enforced: zero
 *                              client-reachable namespaces)
 *
 * `lib/guards/client-messages-allowlist.test.ts` re-derives EVERY list from
 * source on each CI run (per-group import-graph walk) — a client namespace
 * that becomes reachable from a group without being in that group's list
 * fails the guard instead of silently rendering raw keys.
 */
export const CLIENT_MESSAGE_ROOTS = [
  "activityCentre",
  "admin",
  "adminPilots",
  "agencyPool",
  "assist",
  "auth",
  "bookings",
  "capabilityProfile",
  "commandFinder",
  "common",
  "communication",
  "company",
  "companyNeed",
  "companyOps",
  "companySwitcher",
  "cv",
  "cvExport",
  "cvImport",
  "cvSections",
  "demandLocationCapture",
  "documents",
  "draft",
  "errorBoundary",
  "features",
  "finance",
  "followUp",
  "handoverPassport",
  "helpRequests",
  "intelligence",
  "journal",
  "journalSkillLinks",
  "labourMarket",
  "languageFeedback",
  "live",
  "map",
  "marketMap",
  "marketMapBase",
  "marketPulse",
  "marketRecognition",
  "marketplace",
  "messaging",
  "needStructuring",
  "network",
  "opportunities",
  "opportunityDirections",
  "playercards",
  "productivityUnits",
  "professions",
  "profileAvatar",
  "projectStages",
  "projects",
  "relationshipTypes",
  "reports",
  "roleDashboards",
  "salesIntake",
  "shared",
  "skillGroups",
  "skillNames",
  "skills",
  "structuredDemand",
  "structuring",
  "tasks",
  "teamBrigades",
  "teamEnquiries",
  "waitlist",
  "waze",
  "workEntryReview",
  "workforcePlanning",
] as const;

/** Shipped by the root [locale] layout. The root error boundary
 *  (`app/[locale]/error.tsx`) renders INSIDE the root layout but OUTSIDE
 *  every route-group provider, and `useTranslations` throws without a
 *  provider in scope — so `errorBoundary` must stay at the root. (~0.1 KB) */
export const BASE_CLIENT_MESSAGE_ROOTS = ["errorBoundary"] as const;

/** Shipped by `app/[locale]/(marketing)/layout.tsx` — public site chrome
 *  (locale switcher, funnel beacon) + the public demo widgets (draft board,
 *  live map, player cards, market pulse) + the waitlist form. (~4 KB) */
export const MARKETING_CLIENT_MESSAGE_ROOTS = [
  "common",
  "company",
  "draft",
  "live",
  "map",
  "marketPulse",
  "playercards",
  "shared",
  "waitlist",
] as const;

/** Shipped by `app/[locale]/auth/layout.tsx` and
 *  `app/[locale]/onboarding/layout.tsx`. (~28 KB) */
export const AUTH_CLIENT_MESSAGE_ROOTS = ["auth"] as const;

/** Pure pick of top-level roots — no key is rewritten, so every resolved
 *  translation is byte-identical to the full-tree behaviour. */
export function pickMessages(
  messages: AbstractIntlMessages,
  roots: readonly string[],
): AbstractIntlMessages {
  const set: ReadonlySet<string> = new Set(roots);
  const out: Record<string, unknown> = {};
  for (const [root, value] of Object.entries(messages)) {
    if (set.has(root)) out[root] = value;
  }
  return out as AbstractIntlMessages;
}

/** The full union pick — the dashboard shell and the /design dev gallery
 *  (the only trees that can reach dynamic whole-tree `useTranslations()`
 *  consumers such as the bottom nav and the module grid). */
export function pickClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickMessages(messages, CLIENT_MESSAGE_ROOTS);
}
