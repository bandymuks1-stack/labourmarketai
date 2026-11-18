import "server-only";

import { constantTimeEquals } from "./supply-feed-auth";

/**
 * COMMERCIAL REQUESTS FEED AUTH. Its own secret, for the reason
 * `supply-feed-auth.ts` gives: a separate caller can be rotated or cut off alone.
 *
 * FAIL CLOSED: while `COMMERCIAL_REQUESTS_FEED_TOKEN` is unset or too short the
 * answer is `not_configured` and the route refuses.
 */
export type CommercialRequestsFeedAuthResult = "ok" | "not_configured" | "unauthorized";

const MIN_TOKEN_LENGTH = 32;

export function authorizeCommercialRequestsFeed(request: Request): CommercialRequestsFeedAuthResult {
  const secret = (process.env.COMMERCIAL_REQUESTS_FEED_TOKEN ?? "").trim();
  if (secret.length < MIN_TOKEN_LENGTH) return "not_configured";
  const header = request.headers.get("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return "unauthorized";
  return constantTimeEquals(header.slice("Bearer ".length), secret) ? "ok" : "unauthorized";
}
