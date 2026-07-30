/**
 * Conversation Control — canonical RESULT registry (unified premium product v1).
 *
 * The missing architectural slot identified by the unified-product audit: the
 * conversation already exists (`/dashboard` renders `<ConversationChat>`), but a
 * conversation with nowhere to render an answer turns every answer into a ROUTE.
 * That is why the product grew ~72 authenticated routes and a second dashboard.
 *
 * This module is the map from "what the user asked for" to "which canonical
 * result component renders it in the result panel".
 *
 * DELIBERATELY A SATELLITE, NOT A SECOND REGISTRY
 * -----------------------------------------------
 * `action-registry.ts` stays the single source of truth for WHAT the
 * conversation can do (ids, roles, confirmation tiers, preconditions,
 * telemetry, handlers). This module only answers a narrower question: when an
 * action produces something the user should LOOK at, which component shows it,
 * and can it be shown inline instead of navigating away.
 *
 * It therefore:
 *   - never redefines an action id — it REFERENCES ids from the action registry
 *     (`openedBy`), and a guard test pins that every referenced id exists;
 *   - never carries domain logic, data reads or writes — the result components
 *     keep using the SAME `lib/*` readers the routes already use;
 *   - never replaces `advancedRoute` — that route stays the honest fallback and
 *     the "open the full screen" affordance. A result is an ADDITION, never a
 *     removal of the working path (NO REGRESSION, goal doc §2.7).
 *
 * PURITY: like the action registry, this module has no `server-only` import, no
 * supabase and no fetch, so it is safe on both sides of the boundary and is
 * trivially unit-testable. A guard test pins that property.
 */

import {
  getConversationAction,
  type ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";

/**
 * The canonical result surfaces. One entry per ANSWER SHAPE, not per route —
 * `/documents`, `/gallery` and `/assets` are three routes but ONE answer
 * ("show me my evidence"), so they collapse to a single `evidence` result.
 */
export type ResultKind =
  | "player-card"
  | "journal"
  | "calendar"
  | "market"
  | "project"
  | "evidence"
  | "reputation"
  | "invoice";

/**
 * Which work context a result is meaningful in. A result offered in a context
 * where it cannot be honest is simply not offered — we never render an empty
 * shell to look complete.
 */
export type ResultContext = "personal" | "organization" | "project";

/**
 * Readiness of the underlying data source. This is the REAL DATA ONLY gate
 * (goal doc §2.5) expressed in code rather than in a document, so a result can
 * never quietly ship on placeholder data.
 *
 *   - `real`       — reads a verified canonical `lib/*` source. Safe to render.
 *   - `unverified` — the source has NOT been confirmed to return real rows yet.
 *                    The panel must NOT render it as a finished result; it
 *                    falls back to `advancedRoute`.
 *
 * Downgrading an entry to `unverified` is always safe. Promoting one to `real`
 * requires having actually read its data path.
 */
export type ResultDataReadiness = "real" | "unverified";

export interface ResultDescriptor {
  /** Stable kind — also the `?result=` deep-link value. */
  readonly kind: ResultKind;
  /** i18n key (namespace `conversation.results`) for the panel title. */
  readonly titleKey: string;
  /**
   * Action ids from `action-registry.ts` that open this result. Every id here
   * MUST exist in that registry — pinned by a guard test so a rename in the
   * action registry cannot silently orphan a result.
   */
  readonly openedBy: readonly string[];
  /**
   * The existing route that performs this today. Kept as the honest fallback
   * and the "open full screen" affordance. NEVER removed by this work.
   */
  readonly advancedRoute: string;
  /** Contexts where this result is meaningful. */
  readonly contexts: readonly ResultContext[];
  /** REAL DATA ONLY gate — see `ResultDataReadiness`. */
  readonly dataReadiness: ResultDataReadiness;
}

/**
 * The canonical result set.
 *
 * `dataReadiness` reflects what has ACTUALLY been verified in the source tree,
 * not what is planned. Entries whose data path has not been read end up
 * `unverified` and therefore keep routing to `advancedRoute` — an honest
 * degradation rather than an empty premium-looking panel.
 */
export const CONVERSATION_RESULTS: readonly ResultDescriptor[] = [
  {
    kind: "player-card",
    titleKey: "conversation.results.playerCard.title",
    openedBy: ["worker.complete-profile", "worker.save-work-card"],
    advancedRoute: "/dashboard/profile",
    contexts: ["personal"],
    // lib/player-card/* — 8 modules, already feeding the restored charts.
    dataReadiness: "real",
  },
  {
    kind: "journal",
    titleKey: "conversation.results.journal.title",
    openedBy: ["worker.log-work"],
    advancedRoute: "/dashboard/journal",
    contexts: ["personal", "organization", "project"],
    // lib/journal/* — the richest domain in the tree (50+ modules).
    dataReadiness: "real",
  },
  {
    kind: "calendar",
    titleKey: "conversation.results.calendar.title",
    openedBy: ["worker.review-bookings", "worker.respond-booking"],
    advancedRoute: "/dashboard/planning",
    contexts: ["personal", "organization", "project"],
    // lib/planning + lib/booking + lib/leave.
    dataReadiness: "real",
  },
  {
    kind: "market",
    titleKey: "conversation.results.market.title",
    openedBy: ["worker.express-interest", "worker.what-next"],
    advancedRoute: "/dashboard/market-map",
    contexts: ["personal", "organization"],
    // GATED: 8 of the 9 market components named in the owner command have zero
    // importers and their data paths are NOT yet verified (dependency map U2).
    // Stays `unverified` until phase E1 confirms real sources — otherwise this
    // is exactly how placeholder data reaches the authenticated product.
    dataReadiness: "unverified",
  },
  {
    kind: "project",
    titleKey: "conversation.results.project.title",
    openedBy: ["company.assign-worker", "company.who-waits"],
    advancedRoute: "/dashboard/projects",
    contexts: ["organization", "project"],
    dataReadiness: "real",
  },
  {
    kind: "evidence",
    titleKey: "conversation.results.evidence.title",
    openedBy: ["worker.add-work-history", "worker.add-achievement"],
    advancedRoute: "/dashboard/documents",
    contexts: ["personal", "project"],
    dataReadiness: "real",
  },
  {
    kind: "reputation",
    titleKey: "conversation.results.reputation.title",
    openedBy: ["worker.what-next"],
    advancedRoute: "/dashboard/profile",
    contexts: ["personal"],
    // GATED: the canonical reputation model (one positive / one negative, no
    // stars, no single human score) is NOT confirmed to have real rows yet
    // (dependency map U1). Rendering it now risks inventing a score — the exact
    // thing the owner command forbids.
    dataReadiness: "unverified",
  },
  {
    kind: "invoice",
    titleKey: "conversation.results.invoice.title",
    openedBy: ["worker.log-work"],
    advancedRoute: "/dashboard/finance",
    contexts: ["personal", "organization", "project"],
    // lib/finance + journal aggregation. NOTE: preview/export only — any
    // payment, Stripe or billing behaviour is an explicit owner gate (§16).
    dataReadiness: "real",
  },
] as const;

/** All result kinds (guard: unique, stable). */
export const RESULT_KINDS: readonly ResultKind[] = CONVERSATION_RESULTS.map(
  (r) => r.kind,
);

/** Narrowing type guard — used to validate the `?result=` deep-link value. */
export function isResultKind(value: unknown): value is ResultKind {
  return typeof value === "string" && RESULT_KINDS.includes(value as ResultKind);
}

/** Lookup by kind. Unknown kind → undefined (an invented kind never renders). */
export function getResult(kind: string): ResultDescriptor | undefined {
  return CONVERSATION_RESULTS.find((r) => r.kind === kind);
}

/**
 * Which result (if any) an action opens. Unknown or result-less action →
 * undefined, and the caller keeps its existing `deep_link` behaviour.
 */
export function resultForAction(actionId: string): ResultDescriptor | undefined {
  return CONVERSATION_RESULTS.find((r) => r.openedBy.includes(actionId));
}

/**
 * Results meaningful in a context AND safe to render on real data.
 *
 * This is the function the panel should use — it applies the REAL DATA ONLY
 * gate, so an `unverified` result is never offered as a finished surface.
 */
export function renderableResultsForContext(
  context: ResultContext,
): readonly ResultDescriptor[] {
  return CONVERSATION_RESULTS.filter(
    (r) => r.contexts.includes(context) && r.dataReadiness === "real",
  );
}

/**
 * Whether the panel may render this result inline, or must fall back to the
 * existing route.
 *
 * Honest degradation: an unverified result is NOT hidden from the user — they
 * still reach the working screen through `advancedRoute`. They simply do not
 * get a premium-looking panel built on unconfirmed data.
 */
export function canRenderInline(kind: ResultKind, context: ResultContext): boolean {
  const r = getResult(kind);
  if (!r) return false;
  return r.dataReadiness === "real" && r.contexts.includes(context);
}

/**
 * The action descriptors that open a result — resolved through the action
 * registry so roles, preconditions and confirmation tiers keep coming from the
 * single source of truth.
 */
export function actionsOpeningResult(
  kind: ResultKind,
): readonly ConversationActionDescriptor[] {
  const r = getResult(kind);
  if (!r) return [];
  return r.openedBy
    .map((id) => getConversationAction(id))
    .filter((a): a is ConversationActionDescriptor => a !== undefined);
}
