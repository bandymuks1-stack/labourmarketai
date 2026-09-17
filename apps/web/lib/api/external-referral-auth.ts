import "server-only";

import { timingSafeEqual } from "node:crypto";

import {
  findExternalReferralSource,
  type ExternalReferralSource,
} from "@/lib/invitations/external-sources";

/**
 * EXTERNAL REFERRAL AUTH — the one place an approved source proves it is
 * that source (universal network v1).
 *
 * Same family as `lib/api/supply-feed-auth.ts` and `cron-auth.ts`: a MACHINE
 * secret, not a user identity, so it lives beside — not inside —
 * `lib/api/api-identity.ts`, and the route calls it rather than parsing the
 * header itself (api-auth-boundary guard).
 *
 * ONE SECRET PER SOURCE. The caller names itself with `X-Referral-Source:
 * <slug>` and proves it with `Authorization: Bearer <that source's secret>`.
 * The slug selects which secret to compare against; a valid secret for
 * source A presented under slug B is `unauthorized`. A source whose secret is
 * unset is `not_configured` — the door refuses, it never opens on an empty
 * comparison.
 *
 * Constant-time comparison, for the same reason as the supply feed: this is
 * a 401 path an unauthenticated caller may retry indefinitely.
 */
export type ExternalReferralAuthResult =
  | { readonly kind: "ok"; readonly source: ExternalReferralSource }
  | { readonly kind: "unknown_source" }
  | { readonly kind: "not_configured"; readonly source: ExternalReferralSource }
  | { readonly kind: "unauthorized"; readonly source: ExternalReferralSource };

export const REFERRAL_SOURCE_HEADER = "x-referral-source";

/** Minimum length that is worth calling a secret. */
const MIN_TOKEN_LENGTH = 32;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  const size = Math.max(left.length, right.length);
  const padLeft = Buffer.alloc(size);
  const padRight = Buffer.alloc(size);
  left.copy(padLeft);
  right.copy(padRight);
  return timingSafeEqual(padLeft, padRight) && left.length === right.length;
}

export function authorizeExternalReferralRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): ExternalReferralAuthResult {
  const source = findExternalReferralSource(request.headers.get(REFERRAL_SOURCE_HEADER));
  if (!source) return { kind: "unknown_source" };
  const secret = (env[source.tokenEnv] ?? "").trim();
  if (secret.length < MIN_TOKEN_LENGTH) return { kind: "not_configured", source };
  const header = request.headers.get("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return { kind: "unauthorized", source };
  }
  return constantTimeEquals(header.slice("Bearer ".length), secret)
    ? { kind: "ok", source }
    : { kind: "unauthorized", source };
}
