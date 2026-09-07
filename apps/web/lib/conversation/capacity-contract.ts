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
  /**
   * THREE STATES, NOT TWO (2026-09-07).
   *
   * "Not free" was never one thing. A person on approved leave and a person
   * already working on your project are both unavailable and are not the same
   * fact: one you cannot plan around, the other you may reprioritise.
   * Collapsing them would replace a false "free" with a vague "busy" — a
   * smaller lie rather than none.
   *
   * `unavailable` (an absence) outranks `committed` (booked or assigned work),
   * because leave is the harder constraint.
   */
  readonly state: "free" | "committed" | "unavailable";
  /** The last day inside the window on which the person is not free, for
   *  whichever state won. Null when free. */
  readonly unavailableUntil: string | null;
  /** What the person is committed to, when `state` is `committed`. Null
   *  otherwise, and null when the source row carries no title — never an
   *  invented name. */
  readonly committedTo: string | null;
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
      /**
       * False when the committed-work read failed or is not provisioned.
       *
       * It exists for the same reason `absencesKnown` does, and its absence is
       * what let this defect run: production carries ZERO absence rows and
       * three real commitments, so "everybody is free" was produced entirely
       * from signals nobody had checked. A surface must be able to say which
       * of its inputs actually answered.
       */
      readonly commitmentsKnown: boolean;
    }
  | { readonly kind: "no-company" }
  | { readonly kind: "empty" }
  | { readonly kind: "error" };
