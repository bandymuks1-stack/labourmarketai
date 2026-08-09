import "server-only";

/**
 * DURABLE NOTIFICATION EVENTS — the write model behind "this happened to you".
 *
 * Storage: `notification_events` (owner-gated migration
 * 20260810070000_notification_events_v1 — see
 * docs/human-gates/notification-events-gate.md). Until the owner applies it,
 * EVERY function here degrades to the honest `feature_unavailable` and the
 * product behaves exactly as before: derived spine only, no durable feed.
 *
 * Degradation vocabulary: `feature_unavailable`, deliberately the same word
 * `lib/opportunities/seen.ts` uses (the repo currently speaks three dialects —
 * seen.ts `feature_unavailable`, absences `needs_migration`, booking
 * `needs-migration`; a NEW module should not add a fourth, and seen.ts is the
 * closest architectural sibling: an optional attention store beside a
 * canonical domain).
 *
 * WRITE RULES:
 *   - Emitters run SERVER-SIDE with the service-role client, AFTER the domain
 *     write already succeeded — an event is a record of a fact, never the
 *     fact itself. The table grants authenticated no INSERT at all.
 *   - Emitting is FIRE-AND-FORGET at call sites (like funnel events): a
 *     booking accept must never fail because its notification could not be
 *     written. Failures are reported to the console, not to the person.
 *   - Idempotent by construction: (recipient, dedupe_key) is UNIQUE and the
 *     insert swallows the conflict — a retried action re-emits harmlessly.
 *   - metadata carries ONLY the allowlisted safe fields below. No free text,
 *     no names, no notes — a notification row must be safe to render in a
 *     preview without leaking what the parties wrote to each other.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = Pick<SupabaseClient, "from">;

export type NotificationEventType =
  | "booking_proposed"
  | "booking_accepted"
  | "booking_declined"
  | "absence_requested"
  | "absence_approved"
  | "absence_rejected"
  | "engagement_created";

export type NotificationEntityType =
  | "booking_request"
  | "worker_absence"
  | "engagement";

/** The ONLY metadata keys an event may carry — safe render hints, never
 *  free-form text. Widening this list is a reviewable act. */
const SAFE_METADATA_KEYS = ["country", "roleSlug", "startDate"] as const;
export type NotificationEventMetadata = Partial<
  Record<(typeof SAFE_METADATA_KEYS)[number], string>
>;

export interface NotificationEventInput {
  readonly recipientProfileId: string;
  readonly eventType: NotificationEventType;
  readonly entityType: NotificationEntityType;
  readonly entityId: string;
  readonly metadata?: NotificationEventMetadata;
}

/** One event per (type, entity) per recipient — a retried action re-emitting
 *  the same fact is a no-op. Pure; exported for tests and emitters. */
export function notificationDedupeKey(
  eventType: NotificationEventType,
  entityId: string,
): string {
  return `${eventType}:${entityId}`;
}

/** Postgres/PostgREST codes that prove the store is ABSENT (unapplied
 *  migration), as distinct from broken — the same set seen.ts documents. */
const FEATURE_ABSENT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const UNIQUE_VIOLATION = "23505";

export type NotificationWriteOutcome =
  | { readonly kind: "written" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly code: string };

function sanitizeMetadata(
  metadata: NotificationEventMetadata | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!metadata) return out;
  for (const key of SAFE_METADATA_KEYS) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value.slice(0, 120);
    }
  }
  return out;
}

/**
 * Emit one durable event. Call with the ADMIN client, after the domain write
 * succeeded. Never throws.
 */
export async function emitNotificationEvent(
  admin: DbClient,
  input: NotificationEventInput,
): Promise<NotificationWriteOutcome> {
  try {
    const { error } = await admin.from("notification_events").insert({
      recipient_profile_id: input.recipientProfileId,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      dedupe_key: notificationDedupeKey(input.eventType, input.entityId),
      metadata: sanitizeMetadata(input.metadata),
    } as never);
    if (!error) return { kind: "written" };
    if (error.code === UNIQUE_VIOLATION) return { kind: "duplicate" };
    if (error.code && FEATURE_ABSENT_CODES.has(error.code)) {
      return { kind: "feature_unavailable" };
    }
    return { kind: "unexpected_error", code: error.code ?? "unknown" };
  } catch {
    return { kind: "unexpected_error", code: "thrown" };
  }
}

/** Fire-and-forget wrapper for action call sites: report, never propagate. */
export function emitNotificationEventInBackground(
  admin: DbClient,
  input: NotificationEventInput,
): void {
  void emitNotificationEvent(admin, input).then((outcome) => {
    if (outcome.kind === "unexpected_error") {
      // Not swallowed silently — the approved degradation (absent store)
      // never reaches here, so this line only fires on something real.
      console.error(
        `[notifications] emit failed unexpectedly (${input.eventType}): ${outcome.code}`,
      );
    }
  });
}

// ── READ SIDE (the recipient's own client — RLS scopes every row) ───────────

export interface NotificationEventRow {
  readonly id: string;
  readonly eventType: NotificationEventType;
  readonly entityType: NotificationEntityType;
  readonly entityId: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly metadata: NotificationEventMetadata;
}

export type NotificationFeedResult =
  | {
      readonly kind: "ready";
      readonly events: readonly NotificationEventRow[];
      readonly unreadCount: number;
    }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly code: string };

const FEED_LIMIT = 20;

/** The recipient's own feed, newest first, with the true unread count. */
export async function readMyNotificationEvents(
  client: DbClient,
): Promise<NotificationFeedResult> {
  try {
    const { data, error } = await client
      .from("notification_events")
      .select("id, event_type, entity_type, entity_id, created_at, read_at, metadata")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT);
    if (error) {
      if (error.code && FEATURE_ABSENT_CODES.has(error.code)) {
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", code: error.code ?? "unknown" };
    }
    const events = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        eventType: r.event_type as NotificationEventType,
        entityType: r.entity_type as NotificationEntityType,
        entityId: String(r.entity_id),
        createdAt: String(r.created_at),
        readAt: (r.read_at as string | null) ?? null,
        metadata: (r.metadata as NotificationEventMetadata) ?? {},
      };
    });
    return {
      kind: "ready",
      events,
      unreadCount: events.filter((e) => e.readAt === null).length,
    };
  } catch {
    return { kind: "unexpected_error", code: "thrown" };
  }
}

export type MarkReadOutcome =
  | { readonly kind: "persisted" }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly code: string };

/**
 * Mark ALL of the caller's unread events read — PERSISTED, not a client
 * setState. RLS + the column-level grant mean this can only ever touch the
 * caller's own read_at markers, whatever the client sends.
 */
export async function markAllNotificationEventsRead(
  client: DbClient,
  nowIso: string,
): Promise<MarkReadOutcome> {
  try {
    const { error } = await client
      .from("notification_events")
      .update({ read_at: nowIso } as never)
      .is("read_at", null);
    if (error) {
      if (error.code && FEATURE_ABSENT_CODES.has(error.code)) {
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", code: error.code ?? "unknown" };
    }
    return { kind: "persisted" };
  } catch {
    return { kind: "unexpected_error", code: "thrown" };
  }
}
