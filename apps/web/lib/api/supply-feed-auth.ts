import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * FIRST-PARTY SUPPLY FEED AUTH — the one place the partner network's pull
 * request proves it is the partner network.
 *
 * Same reasoning as `lib/api/cron-auth.ts`, and deliberately a SEPARATE secret
 * rather than a second use of `CRON_SECRET`: these two callers have different
 * blast radii. A leaked cron secret triggers a digest job; a leaked supply-feed
 * secret hands over every authorised person's availability projection at once.
 * Sharing one secret would mean rotating both to fix either, which in practice
 * means rotating neither.
 *
 * A machine secret is NOT a user identity, so this lives beside — not inside —
 * `lib/api/api-identity.ts`, and the route calls it rather than parsing the
 * header itself (api-auth-boundary guard).
 *
 * FAIL CLOSED. While `SUPPLY_FEED_BEARER_TOKEN` is unset the answer is
 * `not_configured` and the route refuses. A secretless comparison would turn
 * the feed into a public worker API, which is the one thing the owner
 * authorisation for this bridge explicitly does not permit.
 *
 * The comparison is constant-time. A byte-by-byte early exit on a 401 path
 * that an unauthenticated caller may retry indefinitely is exactly the shape
 * that leaks a secret one character at a time.
 */
export type SupplyFeedAuthResult = "ok" | "not_configured" | "unauthorized";

/** Minimum length that is worth calling a secret. A short token here would be
 *  brute-forceable against an endpoint that answers in milliseconds. */
const MIN_TOKEN_LENGTH = 32;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on a length mismatch, and the throw itself is the
  // early exit we are trying to avoid. Compare a fixed-size digest-shaped pair
  // instead: pad both to the longer length so length differences do not
  // short-circuit, then AND in the real length check.
  const size = Math.max(left.length, right.length);
  const padLeft = Buffer.alloc(size);
  const padRight = Buffer.alloc(size);
  left.copy(padLeft);
  right.copy(padRight);
  return timingSafeEqual(padLeft, padRight) && left.length === right.length;
}

export function authorizeSupplyFeedRequest(request: Request): SupplyFeedAuthResult {
  const secret = (process.env.SUPPLY_FEED_BEARER_TOKEN ?? "").trim();
  if (secret.length < MIN_TOKEN_LENGTH) return "not_configured";
  const header = request.headers.get("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return "unauthorized";
  }
  return constantTimeEquals(header.slice("Bearer ".length), secret)
    ? "ok"
    : "unauthorized";
}
