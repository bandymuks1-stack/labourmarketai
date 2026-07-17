import type { AbstractIntlMessages } from "next-intl";

/**
 * Client message allowlist (Performance Reality Audit v1).
 *
 * The root layout previously let NextIntlClientProvider inherit the FULL
 * runtime message tree (~440 KB minified per locale), serializing every
 * namespace — including server-only ones (legal, projectOps, scouting, …) —
 * into the RSC flight payload of EVERY page. Only client components
 * (`useTranslations`) actually need messages on the client; server
 * components read via `getTranslations` and never touch this tree.
 *
 * This allowlist is the union of:
 *  - every top-level root of a LITERAL `useTranslations("…")` call inside a
 *    "use client" file, and
 *  - the roots reached through DYNAMIC keys: the dashboard module registry
 *    (`labelKey`/`descriptionKey`), the nav tab labels, skill-group labels
 *    and the demand draft-form namespaces.
 *
 * `lib/guards/client-messages-allowlist.test.ts` re-derives both sets from
 * the source on every CI run — a new client namespace that is missing here
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
  "playercards",
  "productivityUnits",
  "professions",
  "profileAvatar",
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

const ROOT_SET: ReadonlySet<string> = new Set(CLIENT_MESSAGE_ROOTS);

/** The subset of the runtime message tree that client components can reach.
 *  Pure pick by top-level root — no key is rewritten, so every resolved
 *  translation is byte-identical to the full-tree behaviour. */
export function pickClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const out: Record<string, unknown> = {};
  for (const [root, value] of Object.entries(messages)) {
    if (ROOT_SET.has(root)) out[root] = value;
  }
  return out as AbstractIntlMessages;
}
