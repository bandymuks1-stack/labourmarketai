/**
 * Conversation find-work contract — PURE.
 *
 * Lives outside the `"use server"` module because a server-action file may only
 * export async functions (a runtime `const` there fails the production build).
 * Types and the display limit therefore sit here, importable from the server
 * action, the chat UI and tests alike.
 *
 * Nothing in this file loads, ranks or explains anything: the canonical
 * marketplace use case (`lib/marketplace/worker-opportunities.ts`) owns all of
 * that. These are the shapes the conversation renders.
 */

import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import type { JobRecommendation } from "@/lib/opportunities/recommendations-model";

/** How many opportunities the conversation shows before deferring to the full
 *  board. Small on purpose — the conversation is the primary work journal, not
 *  a listing screen. It is passed to the canonical use case as its `limit`;
 *  nothing slices the result again afterwards. */
export const CONVERSATION_FIND_WORK_LIMIT = 3;

export type ChatEmployerMatch = {
  /** The REAL demand id (`JobRecommendation.requestId`) — never a list index.
   *  It is what opens the opportunity, what the shown-marker reports, and what
   *  save / interest / (later) provenance links hang off. */
  id: string;
  name: string;
  fitLabel: string;
  /** The canonical match status behind `fitLabel`. Carried so the badge can be
   *  coloured HONESTLY — a weak fit painted success-green tells the worker the
   *  opposite of what the use case said. A label lookup, not a score. */
  fitStatus: JobRecommendation["status"];
  /** Bounded human bullets. The first is the canonical §19 basis line — the
   *  same localized form every other marketplace surface renders. */
  reasons: string[];
  /** The worker's OWN interest status on this demand, straight from the
   *  canonical use case. `null` = no signal yet. Never guessed. */
  interestStatus: InterestStatus | null;
};

/** Labels for the CANONICAL express-interest control (`WorkerInterestButton`),
 *  resolved once server-side. The chat renders that exact component — it owns
 *  no interest state machine, no second write path and no second copy set. */
export type ChatInterestLabels = {
  express: string;
  sent: string;
  reviewed: string;
  contacted: string;
  withdraw: string;
  internalNote: string;
  error: string;
  contactedLink: string;
  contactEmployer: string;
  contactError: string;
};

export type FindWorkResult =
  | {
      kind: "matches";
      intro: string;
      matches: ChatEmployerMatch[];
      /** Present ONLY when the owner-gated interest table exists. `null` keeps
       *  the cards read-only rather than rendering a dead button. */
      interestLabels: ChatInterestLabels | null;
    }
  | { kind: "empty"; message: string }
  | { kind: "blocked"; message: string };
