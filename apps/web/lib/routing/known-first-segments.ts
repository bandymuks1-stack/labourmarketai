/**
 * The first path segment of every page under `app/[locale]`, with how many segments its
 * deepest route has. Anything else cannot be answered by a route, so the middleware can
 * give it a real 404 page without letting the catch-all throw (UX-9).
 * `lib/guards/unknown-address-404.test.ts` compares this list with the directories, so a
 * new page cannot be turned into a 404 by forgetting it. The dashboard has no limit: a
 * signed-out visitor to any address under it is sent to sign in.
 */
export const KNOWN_FIRST_SEGMENTS: ReadonlyMap<string, number> = new Map([
  // app/[locale]
  ["auth", 2],
  ["business", 2],
  ["cv", 1],
  ["dashboard", Infinity],
  ["focus-landing", 0],
  ["invite", 2],
  ["oauth", 2],
  ["onboarding", 1],
  ["opengraph-image", 1],
  ["twitter-image", 1],
  // app/[locale]/(marketing)
  ["about", 1],
  ["calculators", 2],
  ["company-need", 1],
  ["create-cv", 1],
  ["for-agencies", 1],
  ["for-companies", 1],
  ["for-workers", 1],
  ["jobs", 2],
  ["labour-market", 2],
  ["legal", 2],
  ["match-preview", 1],
  ["pricing", 1],
  ["professions", 1],
  ["questions", 3],
  ["skills", 1],
  ["vision", 1],
  ["work-abroad", 1],
  ["work-opportunities", 1],
  ["worker-intake", 1],
]);

/** Where the middleware sends an address no route can answer: handled by the catch-all. */
export const UNKNOWN_ADDRESS_SEGMENT = "unknown-address";

/** `rest` is the path without its locale: "" or "/" is the landing. */
export function isUnknownAddress(rest: string): boolean {
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  const deepest = KNOWN_FIRST_SEGMENTS.get(segments[0]);
  return deepest === undefined || segments.length > deepest;
}
