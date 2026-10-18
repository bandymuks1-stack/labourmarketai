/**
 * First-touch attribution READ BACK from the user's own auth metadata
 * (employer funnel closure, 2026-09-22).
 *
 * PURE module — no `server-only`, no Supabase, no request scope — so the
 * bound is provable by a unit test and the server emitter can import it
 * without dragging a client into a test.
 *
 * WHY THIS EXISTS. Server-emitted funnel events (`lib/telemetry/server-funnel.ts`)
 * carried no campaign attribution at all: first-touch lives in the visitor's
 * localStorage (`lib/telemetry/attribution.ts`), which the server cannot
 * read, and shipping it up from the client on a product action would have
 * created a trusted-input surface for one funnel column. The signup form has
 * ALREADY been writing the same bounded first-touch fields into
 * `auth.users.raw_user_meta_data` (via `signUp({ options: { data } })`) since
 * social-acquisition readiness v1 — so the deliberate, reviewed route the
 * emitter was waiting for is the user's OWN record, as exposed by
 * `supabase.auth.getUser().user_metadata`. No migration, no trigger change,
 * no new write.
 *
 * GUARD. Only the allowlisted keys below survive; every value must be a
 * string, is stripped of ASCII control characters and angle brackets exactly
 * like the client sanitizer, and is capped at the same length. Anything else
 * in the metadata object (locale, names, whatever a future signup stores) is
 * never read into an event.
 */

import type { FunnelMetadata } from "./funnel-events";

/** The six first-touch keys the server may read back — no `utm_term`, which
 *  a search campaign can populate with the visitor's own typed query. */
export const USER_METADATA_FIRST_TOUCH_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "referrer_host",
  "landing_path",
] as const;

export type UserMetadataFirstTouchKey =
  (typeof USER_METADATA_FIRST_TOUCH_KEYS)[number];

/** The bounded shape returned — a subset of the funnel metadata contract. */
export type UserMetadataFirstTouch = Pick<
  FunnelMetadata,
  UserMetadataFirstTouchKey
>;

/** Same cap as the client sanitizer (`lib/telemetry/attribution.ts`). */
export const USER_METADATA_FIRST_TOUCH_VALUE_MAX = 120;

/** Codepoint filter, not a regex: ASCII control chars and DEL are dropped,
 *  `<` / `>` removed, then trimmed and capped. Empty → undefined so an absent
 *  key never becomes an empty-string metadata value. */
function boundedValue(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  let cleaned = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    if (ch === "<" || ch === ">") continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, USER_METADATA_FIRST_TOUCH_VALUE_MAX);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Read the bounded first-touch keys out of an auth `user_metadata` object.
 * Never throws: a non-object, null, array or anything unexpected yields `{}`,
 * so a malformed record can never break the product action that emitted.
 */
export function firstTouchFromUserMetadata(
  userMetadata: unknown,
): UserMetadataFirstTouch {
  if (
    userMetadata === null ||
    typeof userMetadata !== "object" ||
    Array.isArray(userMetadata)
  ) {
    return {};
  }
  const source = userMetadata as Record<string, unknown>;
  const out: UserMetadataFirstTouch = {};
  for (const key of USER_METADATA_FIRST_TOUCH_KEYS) {
    const value = boundedValue(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
