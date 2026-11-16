import { PUBLIC_INTENTS, PUBLIC_INTENT_IDS } from "../../lib/navigation/public-intents";

/**
 * THE PUBLIC PATHS a visitor without an account can take (Lane L), as data:
 * read by `public-paths-isolated.spec.ts` (one Playwright case per entry) and
 * by `lib/guards/public-paths-known-findings.test.ts` (the known list may
 * only name cases that exist here).
 *
 * The panel links are read from PUBLIC_INTENTS at runtime, never retyped: a
 * link added to the navigation is a new case without anyone editing this file.
 * The `account: true` panel links are the signed-in "workspace links": for
 * them the genuine step IS the auth page, reached directly with a correct
 * `next`; one that carries a `guestHref` (a newcomer's first step is an
 * account, e.g. "Create a free CV") is sign-up with that `next`.
 */
export type PublicPathCase = {
  readonly id: string;
  readonly title: string;
};

export const PUBLIC_PATH_CASES: readonly PublicPathCase[] = [
  ...PUBLIC_INTENT_IDS.map((id) => ({ id: `goal:${id}`, title: `goal "${id}" opens its panel` })),
  ...PUBLIC_INTENTS.flatMap((intent) =>
    intent.links.map((link) => ({
      id: `link:${intent.id}.${link.id}`,
      title: link.account
        ? link.guestHref
          ? `workspace link ${intent.id}.${link.id} → sign-up with next=${link.href}`
          : `workspace link ${intent.id}.${link.id} → sign-in with next=${link.href}`
        : `panel link ${intent.id}.${link.id} → ${link.href}`,
    })),
  ),
  { id: "entry:work", title: "home free-text box, a work sentence, survives sign-up" },
  { id: "entry:hire", title: "home free-text box, a hiring sentence, survives sign-up" },
  { id: "door:worker-search", title: "worker-search door opens the need form, sent without an account" },
  { id: "door:company-need", title: "the company-need form is sent without an account" },
  { id: "intake:worker", title: "worker-intake: the typed intake survives sign-up" },
  { id: "calculator:project-cost", title: "calculator result carries its inputs into company-need" },
  { id: "header:assistant", title: "header assistant link, signed out → the home question box (/#find)" },
  { id: "header:education", title: "header More → education link → the institution sign-up door" },
];

export const PUBLIC_PATH_CASE_IDS: readonly string[] = PUBLIC_PATH_CASES.map((c) => c.id);

export type KnownPublicPathFinding = {
  /** A case id from PUBLIC_PATH_CASES. */
  readonly id: string;
  /** One line: what the case observed. */
  readonly reason: string;
  /** The lane that owns the fix, or "unassigned". */
  readonly owner: string;
};

/**
 * Cases that FAIL today, run with Playwright `test.fail()` semantics: the
 * case still runs, and the job goes red the day it starts passing — so a fix
 * must remove its entry here. Never `test.skip`.
 */
export const KNOWN_PUBLIC_PATH_FINDINGS: readonly KnownPublicPathFinding[] = [
  // intake:worker fixed by #3415 (F2): the typed intake reaches the profile
  // composer after sign-up and onboarding; the case is strict again.
];
