import {
  notificationEventHref,
  notificationRenderedType,
  type NotificationEventRow,
} from "@/lib/notifications/events";
import type {
  TodayGrowth,
  TodayModel,
  TodayNext,
  TodayOpenItem,
  TodayOpenItems,
  TodayOpportunity,
  TodayWork,
} from "@/lib/today/today-model";

/**
 * THE HOME STATE — the PURE model behind the four regions of the one
 * authenticated home (frozen design class 4e695e261, owner decision 0017).
 *
 *   WAITING FOR YOU          what needs THIS context's decision or action
 *   RUNNING NOW              work genuinely in motion
 *   BECAUSE OF WHAT HAPPENED event → consequence → product state change
 *   OUTSIDE YOUR WALLS       market signals relevant to this context
 *
 * WHAT THIS IS NOT. It is not a second priority engine, a second ledger or
 * a second notification system. The PERSON's regions are a PROJECTION of the
 * canonical `TodayModel` (`deriveTodayModel`: work-card next action, work
 * intelligence, attention doors, growth reading, opportunity bands) plus the
 * two reads the old home never showed — the assigned projects
 * (`listWorkerProjects`) and the notification feed
 * (`readMyNotificationEvents`). This module only decides which region each
 * fact belongs to.
 *
 * Honesty rules (all pinned by `home-state.test.ts`):
 *   - A reader that answered `null`/unknown yields `{ kind: "unknown" }`,
 *     never an empty list: UNKNOWN ≠ ZERO (SEP-7). "Could not read" is not
 *     "nothing". An EMPTY real result stays a known-empty region.
 *   - A causal chain exists ONLY for the closed set of events whose
 *     consequence the event itself states (`CAUSAL_CHAINS`). Any other event
 *     is kept as a plain event with NO consequence — a consequence is never
 *     invented, never inferred from time, never inferred about capability.
 *   - No KPI, no score, no figure that a reader did not return.
 *   - Subjects carry `label: null` rather than a guessed name.
 *
 * Pure and deterministic: no IO, no `Date`, no locale. Copy is resolved by
 * the view from the keys carried here.
 */

export type HomeRegionId = "waiting" | "running" | "because" | "outside";

export const HOME_REGION_ORDER: readonly HomeRegionId[] = ["waiting", "running", "because", "outside"];

/** The identity family a change belongs to (people, companies, teams,
 *  projects and market objects share ONE visual family in the view). */
export type HomeSubjectKind =
  | "person"
  | "company"
  | "team"
  | "project"
  | "need"
  | "offer"
  | "service"
  | "conversation"
  | "booking"
  | "invitation"
  | "document"
  | "work"
  | "relationship";

export type HomeSubject = {
  readonly kind: HomeSubjectKind;
  readonly id: string | null;
  /** A name the reader supplied. `null` = not known — never guessed. */
  readonly label: string | null;
};

/** One thing waiting on the person: the work-card's next action or an open
 *  item (an offer, an invitation, unread messages, journal items). */
export type WaitingItem =
  | { readonly kind: "next"; readonly next: Extract<TodayNext, { kind: "action" }> }
  | { readonly kind: "open"; readonly item: TodayOpenItem };

export type WaitingRegion =
  | { readonly kind: "known"; readonly items: readonly WaitingItem[] }
  | { readonly kind: "unknown" };

export type HomeProject = {
  readonly projectId: string;
  readonly title: string | null;
  readonly city: string | null;
};

export type RunningRegion =
  | {
      readonly kind: "known";
      readonly work: TodayWork;
      /** `null` = the assignments could not be read (not "no projects"). */
      readonly projects: readonly HomeProject[] | null;
      /** A READING of the person's own rows — not an event, never causal. */
      readonly growth: TodayGrowth;
    }
  | { readonly kind: "unknown" };

export type HomeCauseChain = {
  /** i18n key under `home.chain.consequence`. */
  readonly consequenceKey: string;
  /** i18n key under `home.chain.state`. */
  readonly stateKey: string;
};

export type HomeChange = {
  readonly id: string;
  readonly eventType: string;
  /** The key under `auth.notifications.types` that labels this event — the
   *  SAME copy the bell and the activity page use, never a second wording. */
  readonly renderedType: string;
  readonly subject: HomeSubject;
  readonly occurredAt: string;
  readonly href: string;
  readonly read: boolean;
};

/** A change WITH a supported causal consequence — the "because" ledger. */
export type HomeCause = HomeChange & { readonly chain: HomeCauseChain };

export type BecauseRegion =
  | {
      readonly kind: "known";
      /** Events whose own fact IS a state change (closed set below). */
      readonly causes: readonly HomeCause[];
      /** Everything else in the feed — plain events, never given a
       *  consequence. The activity centre keeps the complete list. */
      readonly events: readonly HomeChange[];
    }
  | { readonly kind: "unknown" };

export type OutsideRegion =
  | { readonly kind: "known"; readonly opportunity: TodayOpportunity }
  | { readonly kind: "unknown" };

export type HomeInputs = {
  readonly today: TodayModel;
  /** Active assignments / projects; `null` = the reader failed. */
  readonly projects: readonly HomeProject[] | null;
  /** The notification feed; `null` = unavailable. */
  readonly events: readonly NotificationEventRow[] | null;
};

export type HomeState = {
  readonly waiting: WaitingRegion;
  readonly running: RunningRegion;
  readonly because: BecauseRegion;
  readonly outside: OutsideRegion;
};

/** Each list region shows at most this many rows; the rest is one link away. */
export const HOME_REGION_SHOWN = 4;

const UNKNOWN = { kind: "unknown" } as const;

/**
 * The closed set of event types whose consequence the event itself states.
 * Extending this map is a product decision: add an entry only when the
 * notification's own fact IS the state change named by `stateKey`. Temporal
 * proximity never creates an entry; neither does a guess about capability.
 */
export const CAUSAL_CHAINS: Readonly<Record<string, HomeCauseChain>> = {
  engagement_created: { consequenceKey: "relationshipStarted", stateKey: "engagementActive" },
  engagement_ended: { consequenceKey: "relationshipEnded", stateKey: "engagementClosed" },
  booking_accepted: { consequenceKey: "bookingAgreed", stateKey: "bookingConfirmed" },
  booking_declined: { consequenceKey: "bookingRefused", stateKey: "bookingClosed" },
  booking_withdrawn: { consequenceKey: "bookingWithdrawn", stateKey: "bookingClosed" },
  absence_approved: { consequenceKey: "absenceApproved", stateKey: "absenceDecided" },
  absence_rejected: { consequenceKey: "absenceRefused", stateKey: "absenceDecided" },
  workflow_decided: { consequenceKey: "decisionRecorded", stateKey: "workflowClosed" },
  document_ack_completed: { consequenceKey: "acknowledgementRecorded", stateKey: "documentAcknowledged" },
  invitation_accepted: { consequenceKey: "invitationAnswered", stateKey: "relationshipFormed" },
};

const EVENT_SUBJECT: Readonly<Record<string, HomeSubjectKind>> = {
  booking_request: "booking",
  worker_absence: "relationship",
  engagement: "relationship",
  workflow_instance: "work",
  worker_document: "document",
  org_document: "document",
  document_acknowledgement: "document",
  conversation: "conversation",
};

export function deriveWaiting(next: TodayNext, open: TodayOpenItems): WaitingRegion {
  // The work-card engine and the doors are independent reads: the region is
  // unknown only when NEITHER could answer. A failed half is never "nothing".
  if (next.kind === "unknown" && open.kind === "unknown") return UNKNOWN;
  const items: WaitingItem[] = [];
  if (next.kind === "action") items.push({ kind: "next", next });
  if (open.kind === "known") for (const item of open.items) items.push({ kind: "open", item });
  return { kind: "known", items };
}

export function deriveRunning(
  work: TodayWork,
  projects: readonly HomeProject[] | null,
  growth: TodayGrowth,
): RunningRegion {
  if (work.kind === "unknown" && projects === null) return UNKNOWN;
  return { kind: "known", work, projects, growth };
}

export function deriveBecause(events: readonly NotificationEventRow[] | null): BecauseRegion {
  if (events === null) return UNKNOWN;
  const ordered = [...events].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  const causes: HomeCause[] = [];
  const plain: HomeChange[] = [];
  for (const e of ordered) {
    const change: HomeChange = {
      id: e.id,
      eventType: e.eventType,
      renderedType: notificationRenderedType(e.eventType, e.metadata),
      subject: { kind: EVENT_SUBJECT[e.entityType] ?? "relationship", id: e.entityId, label: null },
      occurredAt: e.createdAt,
      href: notificationEventHref(e.entityType, e.metadata) ?? "/dashboard/activity",
      read: e.readAt !== null,
    };
    const chain = CAUSAL_CHAINS[e.eventType];
    if (chain) causes.push({ ...change, chain });
    else plain.push(change);
  }
  return {
    kind: "known",
    causes: causes.slice(0, HOME_REGION_SHOWN),
    events: plain.slice(0, HOME_REGION_SHOWN),
  };
}

export function deriveOutside(opportunity: TodayOpportunity): OutsideRegion {
  // "unknown" = the reader failed. "none" / "no-worker" / "unavailable" are
  // honest, DISTINCT answers the view states in its own words.
  if (opportunity.kind === "unknown") return UNKNOWN;
  return { kind: "known", opportunity };
}

export function composeHomeState(inputs: HomeInputs): HomeState {
  const t = inputs.today;
  return {
    waiting: deriveWaiting(t.next, t.openItems),
    running: deriveRunning(t.work, inputs.projects, t.growth),
    because: deriveBecause(inputs.events),
    outside: deriveOutside(t.opportunity),
  };
}

/** Whether a region has something for the person to look at. */
export function regionHasContent(state: HomeState, id: HomeRegionId): boolean {
  switch (id) {
    case "waiting":
      return state.waiting.kind === "known" && state.waiting.items.length > 0;
    case "running": {
      const r = state.running;
      if (r.kind !== "known") return false;
      const hasWork = r.work.kind === "known" && r.work.today.entries + r.work.week.entries > 0;
      return hasWork || (r.projects?.length ?? 0) > 0;
    }
    case "because":
      return state.because.kind === "known" && state.because.causes.length + state.because.events.length > 0;
    case "outside":
      return state.outside.kind === "known" && state.outside.opportunity.kind === "bands";
  }
}

/** The region the home leads with: what needs the person, then what is
 *  moving, then what changed, then the market. A home with nothing in any
 *  region leads with none (the view says so in words — never a blank). */
export function leadingRegion(state: HomeState): HomeRegionId | null {
  return HOME_REGION_ORDER.find((id) => regionHasContent(state, id)) ?? null;
}
