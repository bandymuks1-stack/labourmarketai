/**
 * ENTITY CONTEXT — what the Context Panel shows for one selected entity (W3).
 *
 * The lock (`lib/product-gate/world-state.ts`, owner text 2026-07-28) lists
 * exactly what a panel shows when an object is clicked:
 *
 *   "Atidaroma Context Panel. Joje rodoma: pavadinimas · aprašymas ·
 *    atlyginimas · grafikas · kontaktai · reikalavimai · istorija · susiję
 *    objektai · AI rekomendacijos · galimi veiksmai."
 *
 * `CONTEXT_PANEL_CONTENT` is that list. This file is its typed form — one
 * section per entry, so the panel can never quietly drop half the contract, and
 * the guard asserts the mapping stays 1:1.
 *
 * HONESTY (doctrine §7, §18). Every section is allowed to be EMPTY, and empty
 * means "this is not known", never "there is none". A section carries only
 * strings the server built from real rows the caller may already see; the panel
 * renders them and computes nothing. There is no score, no percentage, no
 * generated prose and no LLM anywhere in this path.
 *
 * REGISTRATION, NOT ARCHITECTURE. A second entity type joins by registering a
 * resolver (`ENTITY_CONTEXT_RESOLVERS`) — no new panel, no new branch in the
 * UI, no map change. That is the growth mechanism `registrationIsEnough`
 * promises, expressed as code rather than as a claim.
 *
 * Pure types + a pure registry. No IO.
 */

import type { InterestLabelBag } from "@/lib/marketplace/worker-opportunities-contract";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import type { EntityRef } from "./world-state";

// ═══════════════════════════════════════════════════════════════════════════
// The sections
// ═══════════════════════════════════════════════════════════════════════════

/** One labelled fact. Both sides are already localized by the server. */
export interface ContextFact {
  readonly label: string;
  readonly value: string;
  /** `true` when the value is an honest "not stated" rather than a real fact —
   *  the panel renders it muted so a gap never reads as data. */
  readonly unknown?: boolean;
}

/** A requirement the person meets, or does not. Never a score. */
export interface ContextRequirement {
  readonly label: string;
  readonly met: boolean;
}

/** One dated thing that really happened. `at` is an ISO date or null. */
export interface ContextHistoryEntry {
  readonly text: string;
  readonly at: string | null;
}

/** Another entity this one is connected to. `ref` present ⇒ the panel can open
 *  it (still no navigation — it is another `open_object`). */
export interface ContextRelated {
  readonly label: string;
  readonly ref: EntityRef | null;
}

/**
 * A next step the REAL data supports. `basis` is the fact it was derived from,
 * shown to the user: a recommendation whose reason cannot be stated is exactly
 * the fake-AI this platform forbids.
 */
export interface ContextRecommendation {
  readonly text: string;
  readonly basis: string;
  /** An EXISTING conversation chip id (`logwork`, `f:worker.*`, …) — the panel
   *  owns no action of its own; it dispatches into the canonical chat
   *  handler. `null` = information only. */
  readonly chipId: string | null;
}

/**
 * An action offered for this entity. Deliberately a closed union: every member
 * must name a REAL canonical control that already has one write path. A new
 * action kind is a deliberate decision, not an accident of a string.
 */
export type ContextAction =
  /** The canonical `WorkerInterestButton` — one interest state machine, one
   *  write path (`lib/opportunities/interest-actions.ts`). The label bag is the
   *  SAME `InterestLabelBag` the conversation already resolves, so the panel
   *  invents no interest wording of its own. */
  | {
      readonly kind: "express_interest";
      readonly requestId: string;
      readonly initialStatus: InterestStatus | null;
      readonly labels: InterestLabelBag;
    }
  /** An existing conversation chip, dispatched through the chat's own handler. */
  | { readonly kind: "chip"; readonly chipId: string; readonly label: string };

/** The whole panel payload for one entity. */
export interface EntityContextView {
  readonly ref: EntityRef;
  /** CONTEXT_PANEL_CONTENT: title */
  readonly title: string;
  /**
   * A trust marker shown beside the title, or null. It may be set ONLY from a
   * real signal on a real row (for a demand: the admin-verified supply route) —
   * never from copy, a default, or the absence of evidence.
   */
  readonly badge: string | null;
  /** CONTEXT_PANEL_CONTENT: description — null when the source has none. */
  readonly description: string | null;
  /** CONTEXT_PANEL_CONTENT: salary + schedule + anything else factual. */
  readonly facts: readonly ContextFact[];
  /** CONTEXT_PANEL_CONTENT: contacts. On this platform contact happens ONLY
   *  through the workflow (spatial-entities: `platform_workflow_only`), so this
   *  is the honest note explaining that — never a phone number or an email. */
  readonly contactNote: string;
  /** CONTEXT_PANEL_CONTENT: requirements */
  readonly requirements: readonly ContextRequirement[];
  /** CONTEXT_PANEL_CONTENT: history */
  readonly history: readonly ContextHistoryEntry[];
  /** CONTEXT_PANEL_CONTENT: related_objects */
  readonly related: readonly ContextRelated[];
  /** CONTEXT_PANEL_CONTENT: ai_recommendations — deterministic, each with its
   *  basis. Capped; an entity with nothing to say yields none. */
  readonly recommendations: readonly ContextRecommendation[];
  /** CONTEXT_PANEL_CONTENT: available_actions */
  readonly actions: readonly ContextAction[];
}

/**
 * The panel's answer for a selection. `unavailable` is a first-class outcome:
 * an entity the caller may not see, or a capability that is not applied yet,
 * says so — it never renders an empty shell that implies emptiness.
 */
export type EntityContextResult =
  | { readonly kind: "context"; readonly view: EntityContextView }
  | { readonly kind: "unavailable"; readonly reason: string };

/** At most this many derived recommendations. Assistance, not noise — the same
 *  cap the Context Intelligence Engine uses for next-best actions. */
export const CONTEXT_RECOMMENDATION_LIMIT = 2;

// ═══════════════════════════════════════════════════════════════════════════
// The resolver registry — a new entity type is a registration
// ═══════════════════════════════════════════════════════════════════════════

/** Resolve one entity of one type into its panel payload. */
export type EntityContextResolver = (id: string) => Promise<EntityContextResult>;

/**
 * Entity type → resolver.
 *
 * W3 registers ONE: `job` (a company's open demand — the only entity a person
 * can select in the workspace today). That is not the architecture's limit, it
 * is the honest extent of what exists: registering `person`, `organization` or
 * `project` here is a one-line change and the panel needs no edit at all,
 * which is precisely what the unified world model requires.
 */
export const ENTITY_CONTEXT_RESOLVERS = new Map<string, EntityContextResolver>();

export function registerEntityContextResolver(
  type: string,
  resolver: EntityContextResolver,
): void {
  ENTITY_CONTEXT_RESOLVERS.set(type, resolver);
}

export function resolverFor(type: string): EntityContextResolver | null {
  return ENTITY_CONTEXT_RESOLVERS.get(type) ?? null;
}
