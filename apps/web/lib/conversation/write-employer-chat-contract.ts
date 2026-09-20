/**
 * "Write to the employer" by sentence — types only (a "use server" module
 * exports async functions alone). The rows behind it are the worker's OWN
 * interest signals (`lib/opportunities/interest` → `listMyInterestSignals`,
 * worker_id-filtered + RLS); the thread itself is opened by the ONE existing
 * `contactEmployerAction`, never here.
 */
export type WriteEmployerChatResult =
  /** Exactly one employer the person can write to: the demand their own
   *  active interest is on. The thread is opened by `contactEmployerAction`. */
  | { readonly kind: "one"; readonly requestId: string }
  /** No active interest on a platform demand — the door is "show interest
   *  first" on the board (a public ad's employer has no inbox here). */
  | { readonly kind: "none" }
  /** Several active interests — the person picks the card on the board. */
  | { readonly kind: "many"; readonly count: number }
  /** This account holds no worker record. */
  | { readonly kind: "no-worker" }
  /** The read could not be made (or the interest table is not applied yet);
   *  UNKNOWN is not ZERO — never rendered as "no interests". */
  | { readonly kind: "unavailable" };
