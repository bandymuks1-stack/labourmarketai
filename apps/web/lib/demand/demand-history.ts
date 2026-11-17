/**
 * THE NEED'S HISTORY — what was decided about one need, by whom and when
 * (function register 4.30: candidate → decision → need closed).
 *
 * PURE. It orders facts the owner can already read under RLS:
 *   - the need itself: when it was created, its stored status and, once
 *     closed, the outcome the owner chose (filled / withdrawn);
 *   - every booking event of the owner's proposals for this need
 *     (`booking_request_events`: proposed, accepted, declined, withdrawn,
 *     expired), each with its actor and time.
 *
 * Nothing is invented:
 *   - The actor is named only as far as the facts tell it: "you" when the
 *     event's actor is the reader, "the candidate" for an accept or decline
 *     (only the worker can answer a proposal), "automatic" for an expiry,
 *     otherwise "someone else".
 *   - The close carries NO time and NO actor: neither is stored on the need
 *     (only in the admin-only audit log). It is shown as the need's current
 *     outcome, last, never with a guessed date.
 *   - The hire decision is what the facts say: the candidates whose proposal
 *     was accepted, on a need closed as filled.
 */

export type DemandHistoryEventType = "proposed" | "accepted" | "declined" | "withdrawn" | "expired";

export type DemandHistoryActor = "you" | "candidate" | "automatic" | "other";

export interface DemandHistoryBookingEvent {
  readonly workerId: string;
  readonly type: DemandHistoryEventType;
  /** The event's actor profile id (compared with the reader, never shown). */
  readonly actorId: string;
  /** ISO time the event was recorded. */
  readonly at: string;
}

export type DemandHistoryEntry =
  | { readonly kind: "created"; readonly at: string }
  | {
      readonly kind: "booking";
      readonly type: DemandHistoryEventType;
      readonly workerId: string;
      readonly actor: DemandHistoryActor;
      readonly at: string;
    }
  | { readonly kind: "closed"; readonly outcome: "completed" | "withdrawn" | null };

export interface DemandHistory {
  readonly entries: readonly DemandHistoryEntry[];
  /** Workers whose proposal for this need is accepted now (latest event). */
  readonly hired: readonly string[];
  /** The need is closed as filled and someone accepted: the hire decision stands. */
  readonly decided: boolean;
}

const EVENT_TYPES: ReadonlySet<string> = new Set(["proposed", "accepted", "declined", "withdrawn", "expired"]);

function actorFor(event: DemandHistoryBookingEvent, readerId: string): DemandHistoryActor {
  if (event.actorId === readerId) return "you";
  if (event.type === "accepted" || event.type === "declined") return "candidate";
  if (event.type === "expired") return "automatic";
  return "other";
}

export function isDemandHistoryEventType(value: string): value is DemandHistoryEventType {
  return EVENT_TYPES.has(value);
}

export function buildDemandHistory({
  readerId,
  need,
  events,
}: {
  readonly readerId: string;
  readonly need: {
    readonly createdAt: string;
    readonly status: string;
    readonly closedOutcome: string | null;
  };
  readonly events: readonly DemandHistoryBookingEvent[];
}): DemandHistory {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));

  const latest = new Map<string, DemandHistoryEventType>();
  for (const e of ordered) latest.set(e.workerId, e.type);
  const hired = [...latest].filter(([, type]) => type === "accepted").map(([workerId]) => workerId);

  const closed = need.status === "closed";
  const outcome =
    need.closedOutcome === "completed" || need.closedOutcome === "withdrawn" ? need.closedOutcome : null;

  const entries: DemandHistoryEntry[] = [
    { kind: "created", at: need.createdAt },
    ...ordered.map(
      (e): DemandHistoryEntry => ({
        kind: "booking",
        type: e.type,
        workerId: e.workerId,
        actor: actorFor(e, readerId),
        at: e.at,
      }),
    ),
  ];
  if (closed) entries.push({ kind: "closed", outcome });

  return { entries, hired, decided: closed && outcome === "completed" && hired.length > 0 };
}
