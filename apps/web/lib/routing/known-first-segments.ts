/**
 * The first path segment of every page under `app/[locale]`. Anything else cannot be
 * answered by a route, so the middleware can give it a real 404 page without letting
 * the catch-all throw (UX-9). `lib/guards/unknown-address-404.test.ts` compares this
 * list with the directories, so a new page cannot be turned into a 404 by forgetting it.
 */
export const KNOWN_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  // app/[locale]
  "auth",
  "business",
  "cv",
  "dashboard",
  "focus-landing",
  "invite",
  "oauth",
  "onboarding",
  "opengraph-image",
  "twitter-image",
  "unknown-address",
  // app/[locale]/(marketing)
  "about",
  "calculators",
  "company-need",
  "create-cv",
  "for-agencies",
  "for-companies",
  "for-workers",
  "jobs",
  "labour-market",
  "legal",
  "match-preview",
  "pricing",
  "professions",
  "questions",
  "skills",
  "vision",
  "work-abroad",
  "work-opportunities",
  "worker-intake",
]);

/** `rest` is the path without its locale: "" or "/" is the landing. */
export function isUnknownAddress(rest: string): boolean {
  const first = rest.split("/").filter(Boolean)[0];
  return first !== undefined && !KNOWN_FIRST_SEGMENTS.has(first);
}
