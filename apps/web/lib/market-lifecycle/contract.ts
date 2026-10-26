/**
 * ONE lifecycle contract for every need, offer and listing a person or an
 * organization publishes (owner architecture decision 2026-10-24).
 *
 * Applies to the domains that already exist and keep their own tables, data
 * and integrations — this is a contract, not a merged table:
 *
 *   demand    `customer_requests`     job offers, worker / subcontractor /
 *                                     team / partner search, project and
 *                                     service needs
 *   service   `service_offerings`     services a provider offers
 *   listing   `marketplace_listings`  goods, rentals, work resources, wanted
 *
 * and to every future category: a new domain adds an adapter
 * (`./adapters.ts`), never its own state logic.
 *
 * FOUR THINGS STAY APART (owner §4):
 *   1. LIFECYCLE   — the state below and the actions that move it;
 *   2. VISIBILITY  — `isPubliclyVisible`: a FUNCTION of the lifecycle plus the
 *                    domain's own facts (expiry, a verified company), never a
 *                    stored second truth;
 *   3. ACCESS      — who may act: the owner or a properly authorized person,
 *                    decided server-side by each domain's RLS / gated RPC;
 *                    this module never grants anything;
 *   4. ERASURE     — permanent deletion is NOT a lifecycle action. Hiding a
 *                    row (pause, complete, withdraw) never destroys it, and
 *                    nothing here touches work hours, journal entries,
 *                    project evidence, agreements or audit history.
 *
 * Pure: no IO, no server-only imports — the UI, the server actions, the MCP
 * tools and the guards read the same rules.
 */

export const ENTRY_STATES = ["draft", "active", "paused", "closed"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];

/**
 * Why a closed entry is closed. `completed`: the need was met / the offer
 * delivered / no longer relevant. `withdrawn`: taken off the public market
 * without being met. `discarded`: a draft that was never published — it can
 * never be "reopened" into the market, because it was never in it.
 * `null`: closed before outcomes were recorded (legacy rows).
 */
export const CLOSED_OUTCOMES = ["completed", "withdrawn", "discarded"] as const;
export type ClosedOutcome = (typeof CLOSED_OUTCOMES)[number];

/** The owner-facing actions, the same words in every category. */
export const ENTRY_ACTIONS = [
  "publish",
  "edit",
  "pause",
  "resume",
  "complete",
  "withdraw",
] as const;
export type EntryAction = (typeof ENTRY_ACTIONS)[number];

/** What a domain can store today. Missing support hides the action — it is
 *  never faked by mapping it onto a different state. */
export interface DomainSupport {
  /** A paused state distinct from closed exists. */
  readonly pause: boolean;
  /** A closed state exists. */
  readonly close: boolean;
  /** The closed outcome (completed / withdrawn / discarded) is stored. */
  readonly closedOutcome: boolean;
  /** The published text can be edited after publishing. */
  readonly editPublished: boolean;
}

export interface EntryFacts {
  readonly state: EntryState;
  readonly closedOutcome: ClosedOutcome | null;
  /** The domain holds the row in a pipeline the owner may not move
   *  (e.g. a demand under admin review). */
  readonly ownerLocked?: boolean;
}

export interface EntryTarget {
  readonly state: EntryState;
  readonly closedOutcome: ClosedOutcome | null;
}

/** The whole state machine. `null` = the action does not apply there. */
const TRANSITIONS: Readonly<Record<EntryState, Partial<Record<EntryAction, EntryTarget>>>> = {
  draft: {
    publish: { state: "active", closedOutcome: null },
    edit: { state: "draft", closedOutcome: null },
    // Withdrawing a draft discards it: out of the form, never in the market.
    withdraw: { state: "closed", closedOutcome: "discarded" },
  },
  active: {
    edit: { state: "active", closedOutcome: null },
    pause: { state: "paused", closedOutcome: null },
    complete: { state: "closed", closedOutcome: "completed" },
    withdraw: { state: "closed", closedOutcome: "withdrawn" },
  },
  paused: {
    edit: { state: "paused", closedOutcome: null },
    resume: { state: "active", closedOutcome: null },
    complete: { state: "closed", closedOutcome: "completed" },
    withdraw: { state: "closed", closedOutcome: "withdrawn" },
  },
  closed: {
    edit: { state: "closed", closedOutcome: null },
    // Publish again. Never for a discarded draft (see `allowedActions`).
    resume: { state: "active", closedOutcome: null },
  },
};

/** The actions the owner may take on an entry, in display order. */
export function allowedActions(support: DomainSupport, facts: EntryFacts): EntryAction[] {
  if (facts.ownerLocked) return [];
  const row = TRANSITIONS[facts.state];
  return ENTRY_ACTIONS.filter((action) => {
    if (!row[action]) return false;
    if (action === "pause" && !support.pause) return false;
    if ((action === "complete" || action === "withdraw") && !support.close) return false;
    if (action === "edit" && facts.state !== "draft" && !support.editPublished) return false;
    if (action === "resume" && facts.state === "closed" && facts.closedOutcome === "discarded") return false;
    return true;
  });
}

/** Where `action` takes the entry, or `null` when the contract forbids it. */
export function transition(
  support: DomainSupport,
  facts: EntryFacts,
  action: EntryAction,
): EntryTarget | null {
  if (!allowedActions(support, facts).includes(action)) return null;
  const target = TRANSITIONS[facts.state][action]!;
  if (action === "edit") return { state: facts.state, closedOutcome: facts.closedOutcome };
  // A domain that cannot store the outcome keeps the state change and the
  // outcome stays unrecorded — never a different state standing in for it.
  return support.closedOutcome ? target : { state: target.state, closedOutcome: null };
}

/** The domain's own visibility facts, beyond the lifecycle. */
export interface VisibilityFacts {
  /** The entry's own end date has passed. */
  readonly expired?: boolean;
  /** A domain gate the entry does not meet yet (e.g. demand of an
   *  unverified company). `true` = the gate is met or there is none. */
  readonly accessGateMet?: boolean;
}

/**
 * Can people other than the owner find it in the market right now? The ONE
 * rule; the database discovery policies implement the same predicate per
 * domain (active, not expired, the domain gate) and a guard pins them.
 */
export function isPubliclyVisible(facts: Pick<EntryFacts, "state">, v: VisibilityFacts = {}): boolean {
  return facts.state === "active" && !v.expired && v.accessGateMet !== false;
}

/** Why it is not visible, for the owner's one line of copy. */
export type VisibilityReason =
  | "visible"
  | "draft"
  | "paused"
  | "completed"
  | "withdrawn"
  | "discarded"
  | "closed"
  | "expired"
  | "gated"
  | "locked";

export function visibilityReason(facts: EntryFacts, v: VisibilityFacts = {}): VisibilityReason {
  if (facts.ownerLocked) return "locked";
  if (facts.state === "draft") return "draft";
  if (facts.state === "paused") return "paused";
  if (facts.state === "closed") return facts.closedOutcome ?? "closed";
  if (v.expired) return "expired";
  if (v.accessGateMet === false) return "gated";
  return "visible";
}

export function isEntryState(v: unknown): v is EntryState {
  return typeof v === "string" && (ENTRY_STATES as readonly string[]).includes(v);
}

export function isClosedOutcome(v: unknown): v is ClosedOutcome {
  return typeof v === "string" && (CLOSED_OUTCOMES as readonly string[]).includes(v);
}

export function isEntryAction(v: unknown): v is EntryAction {
  return typeof v === "string" && (ENTRY_ACTIONS as readonly string[]).includes(v);
}
