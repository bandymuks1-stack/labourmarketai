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
  // v2 (20260813100000): the withdrawn proposal — the worker who saw the
  // offer durably learns it is gone instead of finding a vanished row.
  | "booking_withdrawn"
  | "absence_requested"
  | "absence_approved"
  | "absence_rejected"
  | "engagement_created"
  // v2: the ended relationship — the COUNTERPARTY hears it durably. The
  // label copy is deliberately neutral about visibility: whether the company
  // still sees the worker depends on other relationships (F2), and a
  // notification must not claim what it has not measured.
  | "engagement_ended"
  // v3 (20260817130100): the Workflow & Approval Engine's four durable
  // facts. Escalation is a marked SAFE STATE — the label may say a deadline
  // passed, never that anything was auto-approved (nothing is).
  | "workflow_step_pending"
  | "workflow_decided"
  | "workflow_delegated"
  | "workflow_escalated"
  // v3 documents (20260817140100, Document & Evidence Engine): three durable
  // document facts. All stay INERT until the lead applies the widened
  // constraint — the insert fails its CHECK and the fire-and-forget wrapper
  // reports it to the console, exactly the v2 precedent.
  | "document_ack_assigned"
  | "document_ack_completed"
  | "document_expiring"
  // v4 (20260817153000, train D): a managing role handed a work task to
  // another person — the NEW assignee durably learns a task landed on them.
  // Never emitted for self-assignment (you watched yourself do it).
  | "work_task_assigned"
  // v5 (20260819110000): a worker raised their hand at a company's demand.
  // Production held four such signals with nothing to carry them — the
  // demand owner learned a candidate existed only by opening the scouting
  // page unprompted. Recipient is the demand owner and only the demand
  // owner, which is exactly whom the signal's RLS policy already admits.
  | "demand_interest_expressed";

export type NotificationEntityType =
  | "booking_request"
  | "worker_absence"
  | "engagement"
  | "workflow_instance"
  // v3 documents: all resolve to the EXISTING documents page (no new
  // surface).
  | "worker_document"
  | "org_document"
  | "document_acknowledgement"
  | "work_task"
  // v5: the interest signal resolves to the EXISTING scouting surface, where
  // the demand owner already reviews and acknowledges who raised their hand.
  | "demand_interest_signal";

/**
 * Where a durable event TAKES YOU.
 *
 * A stored event states something that already happened — "your absence was
 * rejected", "your booking was answered". Telling someone that and giving them
 * no way to reach the thing is half a notification, and it is what the first
 * cut shipped: durable rows were merged into the bell with no `href` at all.
 *
 * That was not an oversight so much as a coupling — the panel used "has no
 * href" as its proxy for "this row has a persisted read state", so giving a
 * durable row a link silently removed the mark-all-read control. The two ideas
 * are now separate (`durable` says how it clears, `href` says where it goes),
 * which is what lets a stored event be both readable and reachable.
 *
 * Every target is a route that ALREADY EXISTS and already carries this entity
 * in the derived spine — no new surface, no new nav entry. `engagement` points
 * at the bookings page deliberately: an engagement is minted when a booking is
 * accepted, that page renders it, and both recipients (the company owner and
 * the worker) reach it there.
 *
 * Route existence is pinned by lib/guards/notification-event-links.test.ts.
 */
export const NOTIFICATION_ENTITY_HREF: Record<NotificationEntityType, string> = {
  booking_request: "/dashboard/bookings",
  worker_absence: "/dashboard/absences",
  engagement: "/dashboard/bookings",
  // The approvals area lives ON the network page (constitution: expanded
  // inside an existing surface, the reports?journalWindow precedent — no new
  // route). The section anchor is #approvals; the stored href stays the
  // route, which is what the route-existence guard pins.
  workflow_instance: "/dashboard/network",
  // The documents page is where all three document entities live: the
  // worker inventory, the org register and the acknowledgement inbox.
  worker_document: "/dashboard/documents",
  org_document: "/dashboard/documents",
  document_acknowledgement: "/dashboard/documents",
  // v4: the tasks surface already renders the assignee's list — the row the
  // event points at is in "my tasks" by construction (they are the assignee).
  work_task: "/dashboard/tasks",
  // v5: scouting is where a demand owner already sees interest signals on
  // their own demands (listDemandInterestForCompany feeds it), so the
  // notification lands the reader on the row it is about.
  demand_interest_signal: "/dashboard/company/scouting",
};

/** The canonical surface for a stored event, or undefined for an unknown
 *  entity type — an unmapped type renders as a plain row rather than a link
 *  to nowhere. */
export function notificationEventHref(
  entityType: string,
): string | undefined {
  return NOTIFICATION_ENTITY_HREF[entityType as NotificationEntityType];
}

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
