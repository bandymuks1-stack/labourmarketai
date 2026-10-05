import type { NotificationEventRow } from "@/lib/notifications/events";
import type { OpportunitiesResultMatch } from "@/lib/marketplace/worker-opportunities-contract";
import { TODAY_DOOR_HREFS, type TodayAttention, type TodayState } from "@/lib/today/today-model";

/**
 * THE HOME STATE — the PURE model behind the four regions of the one
 * authenticated home (frozen design class 4e695e261, owner decision 0017).
 *
 *   WAITING FOR YOU          what needs THIS context's decision or action
 *   RUNNING NOW              work genuinely in motion
 *   BECAUSE OF WHAT HAPPENED event → consequence → product state change
 *   OUTSIDE YOUR WALLS       market signals relevant to this context
 *
 * WHAT THIS IS NOT. It is not a second priority engine, a second ledger or a
 * second notification system. Every item is lifted from a model a canonical
 * reader already produced (`loadTodayAttention`, `listWorkerProjects`,
 * `readMyNotificationEvents`, `loadOpportunitiesResultAction`); this module
 * only decides what the home says about them.
 *
 * Honesty rules (all pinned by `home-state.test.ts`):
 *   - A reader that answered `null` yields `{ kind: "unknown" }`, never an
 *     empty list: UNKNOWN ≠ ZERO (SEP-7). "Could not read" is not "nothing".
 *   - A causal chain exists ONLY for the closed set of events whose
 *     consequence the event itself states (`CAUSAL_CHAINS`). Any other event
 *     is shown as an event with `chain: null` — a consequence is never
 *     invented to make the region look explanatory.
 *   - No KPI, no score, no figure that a reader did not return.
 *   - Subjects carry `label: null` rather than a guessed name, and an
 *     anonymous subject never gets one (privacy rules stay with the reader).
 *
 * The model is context-neutral: person, working person, employer, agency and
 * institution all compose the same four regions from whichever readers their
 * context has; a context without a reader for a region passes `null`.
 *
 * Pure and deterministic: no IO, no `Date`, no locale. Copy is resolved by
 * the view from the i18n keys carried here.
 */

export type HomeRegionId = "waiting" | "running" | "because" | "outside";

export const HOME_REGION_ORDER: readonly HomeRegionId[] = [
  "waiting",
  "running",
  "because",
  "outside",
];

/** The identity family a region item belongs to (people, companies, teams,
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

export type HomeItem = {
  readonly id: string;
  readonly region: HomeRegionId;
  readonly subject: HomeSubject;
  /** i18n key under `home.items`; the view supplies `count`. */
  readonly titleKey: string;
  readonly count: number | null;
  /** A real route. The direct action is always the faster path than chat. */
  readonly href: string;
  /** `true` when the item can be answered without leaving the home (the
   *  view then offers the direct action next to the conversation). */
  readonly actionable: boolean;
};

export type HomeCauseChain = {
  /** i18n key under `home.chain.consequence`. */
  readonly consequenceKey: string;
  /** i18n key under `home.chain.state`. */
  readonly stateKey: string;
};

export type HomeChange = HomeItem & {
  readonly occurredAt: string;
  /** `null` = the event is shown as an event only (no supported consequence). */
  readonly chain: HomeCauseChain | null;
};

export type HomeRegion<T extends HomeItem = HomeItem> =
  | { readonly kind: "known"; readonly items: readonly T[]; readonly total: number }
  | { readonly kind: "unknown" };

export type HomeProject = {
  readonly projectId: string;
  readonly title: string | null;
  readonly city: string | null;
};

export type HomeInputs = {
  /** `loadTodayAttention` — each counter is independently nullable. */
  readonly attention: TodayAttention | null;
  /** Active assignments / projects; `null` = the reader failed. */
  readonly projects: readonly HomeProject[] | null;
  /** Today's recorded work; `null`/unknown = the journal was unreadable. */
  readonly today: TodayState | null;
  /** The notification feed; `null` = unavailable. */
  readonly events: readonly NotificationEventRow[] | null;
  /** The ranked opportunity rows; `null` = unavailable. */
  readonly opportunities: readonly OpportunitiesResultMatch[] | null;
};

export type HomeState = {
  readonly waiting: HomeRegion;
  readonly running: HomeRegion;
  readonly because: HomeRegion<HomeChange>;
  readonly outside: HomeRegion;
};

/** Each region shows at most this many items; the rest is one link away. */
export const HOME_REGION_SHOWN = 4;

const UNKNOWN: { readonly kind: "unknown" } = { kind: "unknown" };

function known<T extends HomeItem>(items: readonly T[]): HomeRegion<T> {
  return { kind: "known", items: items.slice(0, HOME_REGION_SHOWN), total: items.length };
}

/**
 * The closed set of event types whose consequence the event itself states.
 * Extending this map is a product decision: add an entry only when the
 * notification's own fact IS the state change named by `stateKey`.
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
};

export function deriveWaiting(attention: TodayAttention | null): HomeRegion {
  if (!attention) return UNKNOWN;
  const { offers, invitations, unread } = attention;
  // Every counter unreadable → the region is unknown, not empty.
  if (offers === null && invitations === null && unread === null) return UNKNOWN;
  const items: HomeItem[] = [];
  if (offers !== null && offers > 0) {
    items.push({
      id: "waiting:offers",
      region: "waiting",
      subject: { kind: "booking", id: null, label: null },
      titleKey: "offers",
      count: offers,
      href: TODAY_DOOR_HREFS.offers,
      actionable: true,
    });
  }
  if (invitations !== null && invitations > 0) {
    items.push({
      id: "waiting:invitations",
      region: "waiting",
      subject: { kind: "invitation", id: null, label: null },
      titleKey: "invitations",
      count: invitations,
      href: TODAY_DOOR_HREFS.invitations,
      actionable: true,
    });
  }
  if (unread !== null && unread.count > 0) {
    items.push({
      id: "waiting:unread",
      region: "waiting",
      subject: { kind: "conversation", id: unread.onlyId, label: null },
      titleKey: "unread",
      count: unread.count,
      href: unread.onlyId ? `${TODAY_DOOR_HREFS.unread}/${unread.onlyId}` : TODAY_DOOR_HREFS.unread,
      actionable: true,
    });
  }
  // A partial read still reports what it did read; a counter that failed is
  // simply absent — the view marks the region "partly unread" via `partial`.
  return known(items);
}

/** `true` when some, but not all, attention counters could not be read. */
export function isWaitingPartial(attention: TodayAttention | null): boolean {
  if (!attention) return false;
  const answered = [attention.offers, attention.invitations, attention.unread].filter((v) => v !== null).length;
  return answered > 0 && answered < 3;
}

export function deriveRunning(projects: readonly HomeProject[] | null, today: TodayState | null): HomeRegion {
  const todayUnknown = !today || today.kind === "unknown";
  if (projects === null && todayUnknown) return UNKNOWN;
  const items: HomeItem[] = [];
  if (today && today.kind === "recorded") {
    items.push({
      id: "running:today",
      region: "running",
      subject: { kind: "work", id: null, label: null },
      titleKey: "workToday",
      count: today.entries,
      href: "/dashboard/journal",
      actionable: false,
    });
  }
  for (const p of projects ?? []) {
    items.push({
      id: `running:project:${p.projectId}`,
      region: "running",
      subject: { kind: "project", id: p.projectId, label: p.title?.trim() || null },
      titleKey: "project",
      count: null,
      href: `/dashboard/projects/${p.projectId}`,
      actionable: false,
    });
  }
  return known(items);
}

export function deriveBecause(events: readonly NotificationEventRow[] | null): HomeRegion<HomeChange> {
  if (events === null) return UNKNOWN;
  const changes = [...events]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((e): HomeChange => {
      const chain = CAUSAL_CHAINS[e.eventType] ?? null;
      return {
        id: `because:${e.id}`,
        region: "because",
        subject: { kind: EVENT_SUBJECT[e.entityType] ?? "relationship", id: e.entityId, label: null },
        titleKey: e.eventType,
        count: null,
        href: "/dashboard/activity",
        actionable: false,
        occurredAt: e.createdAt,
        chain,
      };
    });
  return known(changes);
}

export function deriveOutside(rows: readonly OpportunitiesResultMatch[] | null): HomeRegion {
  if (rows === null) return UNKNOWN;
  const items: HomeItem[] = rows.map((m) => ({
    id: `outside:need:${m.requestId}`,
    region: "outside",
    subject: { kind: "need", id: m.requestId, label: m.companyName?.trim() || null },
    titleKey: "need",
    count: null,
    href: "/dashboard/opportunities",
    actionable: false,
  }));
  return known(items);
}

export function composeHomeState(inputs: HomeInputs): HomeState {
  return {
    waiting: deriveWaiting(inputs.attention),
    running: deriveRunning(inputs.projects, inputs.today),
    because: deriveBecause(inputs.events),
    outside: deriveOutside(inputs.opportunities),
  };
}

/** The region the home leads with: the first that has something for the
 *  person to do, then what is moving, then what changed, then the market.
 *  An all-unknown home leads with nothing (the view says it could not read). */
export function leadingRegion(state: HomeState): HomeRegionId | null {
  for (const id of HOME_REGION_ORDER) {
    const r = state[id];
    if (r.kind === "known" && r.total > 0) return id;
  }
  return null;
}
