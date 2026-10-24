import {
  allowedActions,
  isClosedOutcome,
  transition,
  type ClosedOutcome,
  type DomainSupport,
  type EntryAction,
  type EntryFacts,
  type EntryState,
} from "./contract";

/**
 * Per-domain adapters onto the ONE lifecycle contract (`./contract.ts`).
 *
 * Each adapter is the single place where a domain's stored status is read
 * as a contract state and where a contract action is written back as that
 * domain's status. Screens, server actions and MCP tools go through these —
 * never their own `status === "…"` rules.
 *
 * `support` states what the domain can store TODAY. An action whose storage
 * is missing is not offered (it is never mapped onto a different state):
 *   - demand has no paused state yet, and published text is not editable;
 *   - a service has a closed state only once the closed-outcome migration is
 *     applied (`closedSupported`);
 *   - listings and services record WHY an entry closed only once their
 *     closed-outcome storage exists.
 */

export const MARKET_DOMAINS = ["demand", "service", "listing"] as const;
export type MarketDomain = (typeof MARKET_DOMAINS)[number];

export interface MarketAdapter {
  readonly domain: MarketDomain;
  readonly support: DomainSupport;
  /** Stored row → contract facts. */
  facts(row: { readonly status: string; readonly closedOutcome?: string | null }): EntryFacts;
  /** Contract target state → the status this domain stores. */
  statusFor(state: EntryState): string;
}

const outcomeOf = (v: string | null | undefined): ClosedOutcome | null =>
  isClosedOutcome(v) ? v : null;

/**
 * `customer_requests`: submitted = active (the worker board serves submitted
 * only, behind the verified-company gate). in_review / needs_followup /
 * approved are the admin pipeline: the owner may not move them, so they read
 * as active-and-locked, never as something the owner can act on.
 */
export function demandAdapter(opts: { closedOutcomeStored: boolean }): MarketAdapter {
  return {
    domain: "demand",
    support: { pause: false, close: true, closedOutcome: opts.closedOutcomeStored, editPublished: false },
    facts(row) {
      switch (row.status) {
        case "draft":
          return { state: "draft", closedOutcome: null };
        case "submitted":
          return { state: "active", closedOutcome: null };
        case "closed":
          return { state: "closed", closedOutcome: outcomeOf(row.closedOutcome) };
        default:
          return { state: "active", closedOutcome: null, ownerLocked: true };
      }
    },
    statusFor(state) {
      if (state === "active") return "submitted";
      if (state === "paused") throw new Error("demand has no paused state");
      return state;
    },
  };
}

/** `service_offerings`: draft | active | paused, plus closed once stored. */
export function serviceAdapter(opts: { closedSupported: boolean }): MarketAdapter {
  return {
    domain: "service",
    support: {
      pause: true,
      close: opts.closedSupported,
      closedOutcome: opts.closedSupported,
      editPublished: true,
    },
    facts(row) {
      const s = row.status;
      if (s === "draft" || s === "active" || s === "paused") return { state: s, closedOutcome: null };
      if (s === "closed") return { state: "closed", closedOutcome: outcomeOf(row.closedOutcome) };
      return { state: "draft", closedOutcome: null, ownerLocked: true };
    },
    statusFor(state) {
      if (state === "closed" && !opts.closedSupported) throw new Error("service has no closed state yet");
      return state;
    },
  };
}

/** `marketplace_listings`: draft | active | paused | closed, one to one. */
export function listingAdapter(opts: { pauseSupported: boolean; closedOutcomeStored: boolean }): MarketAdapter {
  return {
    domain: "listing",
    support: {
      pause: opts.pauseSupported,
      close: true,
      closedOutcome: opts.closedOutcomeStored,
      editPublished: true,
    },
    facts(row) {
      const s = row.status;
      if (s === "draft" || s === "active" || s === "paused") return { state: s, closedOutcome: null };
      if (s === "closed") return { state: "closed", closedOutcome: outcomeOf(row.closedOutcome) };
      return { state: "draft", closedOutcome: null, ownerLocked: true };
    },
    statusFor(state) {
      return state;
    },
  };
}

/** Status-changing actions (edit changes content, not state). */
export function changesState(action: EntryAction): boolean {
  return action !== "edit";
}

/**
 * The contract action a STATUS request stands for — the shape older callers
 * (and MCP `*_status_set` tools) send. Going to a closed status reads as
 * `complete` unless the caller names the outcome. `null` = no contract
 * action produces that status from here, i.e. the request is refused.
 */
export function actionForStatus(
  adapter: MarketAdapter,
  facts: EntryFacts,
  toStatus: string,
  closedOutcome: "completed" | "withdrawn" = "completed",
): EntryAction | null {
  const allowed = allowedActions(adapter.support, facts);
  for (const action of allowed) {
    if (!changesState(action)) continue;
    const target = transition(adapter.support, facts, action);
    if (!target) continue;
    let status: string;
    try {
      status = adapter.statusFor(target.state);
    } catch {
      continue;
    }
    if (status !== toStatus) continue;
    if (target.state === "closed" && facts.state !== "draft") {
      if (action === (closedOutcome === "withdrawn" ? "withdraw" : "complete")) return action;
      continue;
    }
    return action;
  }
  return null;
}
