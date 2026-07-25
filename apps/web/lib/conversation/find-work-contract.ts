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
  /** Bounded human bullets. The first is the canonical §19 basis line — the
   *  same localized form every other marketplace surface renders. */
  reasons: string[];
};

export type FindWorkResult =
  | { kind: "matches"; intro: string; matches: ChatEmployerMatch[] }
  | { kind: "empty"; message: string }
  | { kind: "blocked"; message: string };
