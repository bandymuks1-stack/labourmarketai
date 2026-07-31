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

/**
 * What "find work" hands back to the chat.
 *
 * `ChatEmployerMatch` and `ChatInterestLabels` used to live here — a row shape
 * and a label bag for the thread's own job cards. Both are gone: the Context
 * Panel's `opportunities` result is the single renderer and the single action
 * surface, so the chat no longer receives rows to draw or labels to draw them
 * with. It receives a COUNT and a SENTENCE, and it opens the panel.
 *
 * The three cases stay distinct. "Nothing matched", "there is no demand data
 * at all" and "here is the answer" are three different things to tell a person,
 * and collapsing any two of them would be the dishonesty this contract exists
 * to prevent.
 */
export type FindWorkResult =
  | {
      kind: "matches";
      /** How many rows the panel will render — the chat states it, the panel
       *  proves it. Never a number this module invented. */
      count: number;
      intro: string;
    }
  | { kind: "empty"; message: string }
  | { kind: "blocked"; message: string };
