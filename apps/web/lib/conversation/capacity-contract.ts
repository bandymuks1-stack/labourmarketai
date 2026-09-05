/**
 * CAPACITY in the chat (owner contract 2026-09-04 §11 — "who is available"):
 * the company's own roster against the employer-side unavailability read
 * (approved absences, minimum-necessary visibility: WHEN, never WHY).
 *
 * Types + constants only (a "use server" module exports async functions
 * alone — same split as `education-workspace-contract.ts`).
 */

import type { CompanyWorkersListResult } from "@/lib/company/company-workers";

/**
 * QA Q-3 — a roster read a server caller has ALREADY issued for the same
 * request (the company page awaits `listActiveCompanyWorkers` for its roster
 * section and composes the home field next to it). Handed to
 * `loadWhoIsAvailableForChat` so the roster is queried once; pending or
 * resolved, the SAME rows the read would otherwise fetch itself.
 */
export interface CapacityPreRead {
  readonly roster: PromiseLike<CompanyWorkersListResult> | CompanyWorkersListResult;
}

/** How many days ahead "who is available" looks (today inclusive). */
export const CAPACITY_WINDOW_DAYS = 7;

/** Display cap for the chat list; the planning page carries the full roster. */
export const CAPACITY_CHAT_LIMIT = 8;

export interface CapacityChatRow {
  readonly workerId: string;
  readonly label: string;
  /** Free for the whole window, or the last unavailable day inside it. */
  readonly state: "free" | "unavailable";
  readonly unavailableUntil: string | null;
}

export type CapacityChatResult =
  | {
      readonly kind: "ok";
      readonly from: string;
      readonly to: string;
      readonly rows: readonly CapacityChatRow[];
      readonly rosterTotal: number;
      /** False when the leave model is not applied — every worker then reads
       *  as "free" only in the sense that nothing says otherwise; the chat
       *  says so. */
      readonly absencesKnown: boolean;
    }
  | { readonly kind: "no-company" }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };
