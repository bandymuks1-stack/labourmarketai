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

/**
 * WHAT KIND OF THING STANDS BETWEEN THIS PERSON AND NEW WORK.
 * (Owner correction, 2026-09-07: "Do not silently convert COMMITTED into
 * BLOCKED/UNAVAILABLE.")
 *
 * The distinction this type exists to hold is the difference between a fact
 * about reality and a decision about work:
 *
 *   `hard_constraint`  approved leave — the person is not at work at all.
 *                      Still not a prohibition the system enforces; it is the
 *                      strongest thing the system KNOWS.
 *   `commitment`       an accepted booking or an active project assignment.
 *                      Real, and NOT a bar to more work. Construction and
 *                      services run at variable rates and in parallel; a
 *                      project booked A→B does not consume a person A→B. An
 *                      overlap here is a WARNING with an authorized override,
 *                      never an automatic refusal.
 *   `none`             nothing known stands in the way.
 *
 * The failure this replaces is one I shipped earlier the same day: capacity
 * correctly stopped calling a booked worker "free", and then the project
 * field's candidate list silently dropped everyone who was not `free` — which
 * turned a commitment into a prohibition without anyone deciding to.
 */
export type CapacityConstraint = "none" | "commitment" | "hard_constraint";

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
  /** WHAT KIND of thing this is — see `CapacityConstraint`. The field a
   *  planning decision should read, because `state` is a display word. */
  readonly constraint: CapacityConstraint;
  /**
   * May a legitimate actor go ahead anyway?
   *
   * True for a commitment: the person, their manager or their organization may
   * accept overlapping work, and the system's job is to WARN and record, not to
   * refuse. False for approved leave, which is the strongest fact the system
   * holds — and even then nothing here deletes the option, it only says the
   * system will not present it as available.
   */
  readonly overridable: boolean;
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
