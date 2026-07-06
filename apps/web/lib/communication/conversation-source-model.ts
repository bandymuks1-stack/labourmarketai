/**
 * Conversation source relation — PURE model (owner-approved decision,
 * docs/launch/conversation-source-relation-owner-decision-v1.md; design per
 * docs/launch/conversation-source-relation-review-pack-v1.md §3-4).
 *
 * A conversation MAY carry a typed source relation: which sanctioned context
 * caller opened it (source_type) + the id of the row it came from (source_id,
 * server-side only). This module is the single source of truth for:
 *   - the CLOSED source-type set (mirrors the CHECK constraint in migration
 *     20260706210000_conversation_source_relation.sql — guard-pinned);
 *   - the sourceHint shape the four gated context callers stamp through
 *     createConversation (and nobody else — guard-pinned);
 *   - the CLOSED route-hint → app-route map the reader RPC's
 *     source_route_hint token resolves against. An unknown token maps to
 *     null (label without a link) — never a guessed route.
 *
 * Pure + deterministic: no IO, no supabase, importable from the display
 * model and from tests. The server-side reader lives in
 * conversation-source.ts. RAW source_id NEVER reaches the client — the
 * reader RPC returns title + route hint only, and this module deliberately
 * has no field for it on the read side.
 */

/** Closed set — mirrors the migration's CHECK constraint exactly. */
export const CONVERSATION_SOURCE_TYPES = [
  "scouting",
  "accepted_service_request",
  "demand_interest",
  "accepted_booking",
] as const;

export type ConversationSourceType = (typeof CONVERSATION_SOURCE_TYPES)[number];

export function isConversationSourceType(
  value: unknown,
): value is ConversationSourceType {
  return (
    typeof value === "string" &&
    (CONVERSATION_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * The write-side hint a sanctioned context caller passes to
 * createConversation AFTER its own server-side gate held (§5.6 of the review
 * pack: stamping cannot mint permission — the hint only labels a thread the
 * caller was already allowed to open).
 */
export interface ConversationSourceHint {
  readonly type: ConversationSourceType;
  readonly id: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default-closed hint validation: an off-set type or a non-uuid id yields
 *  null (the thread is created WITHOUT a source stamp — never a bad row,
 *  never a failed creation). */
export function normalizeConversationSourceHint(
  hint: { type?: unknown; id?: unknown } | null | undefined,
): ConversationSourceHint | null {
  if (!hint) return null;
  if (!isConversationSourceType(hint.type)) return null;
  if (typeof hint.id !== "string" || !UUID_RE.test(hint.id)) return null;
  return { type: hint.type, id: hint.id };
}

/**
 * READ-side context resolved by the participant-scoped reader RPC
 * (conversation_source_context) — title + route only. There is deliberately
 * NO id field: the raw source_id never reaches the client.
 */
export interface ConversationSourceContext {
  readonly sourceType: ConversationSourceType;
  /** Display title resolved LIVE from the source row by the RPC. */
  readonly title: string;
  /** In-app route for the link-back, or null when no route applies for this
   *  viewer (e.g. the worker side of a scouting thread). */
  readonly href: string | null;
}

/**
 * CLOSED route-hint token → app-route map. The RPC returns a discriminator
 * token, NOT a path (and NOT an id); the app owns the routing. Unknown or
 * null token → null href: the UI renders the typed label without a link
 * (honest degradation — no dead ends, no invented destinations).
 */
const SOURCE_ROUTE_BY_HINT: Readonly<Record<string, string>> = {
  bookings: "/dashboard/bookings",
  service_requests: "/dashboard/service-requests",
  company_scouting: "/dashboard/company/scouting",
};

export function resolveSourceRoute(
  routeHint: string | null | undefined,
): string | null {
  if (!routeHint) return null;
  return SOURCE_ROUTE_BY_HINT[routeHint] ?? null;
}
