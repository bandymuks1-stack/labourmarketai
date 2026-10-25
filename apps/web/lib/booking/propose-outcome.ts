import type { BookingActionResult } from "@/lib/booking/booking-actions";

/**
 * What the company's "propose booking" form shows after a send — ONE mapping
 * from the server action's answer to the visible state, kept out of the
 * component so it is unit-tested (propose-outcome.test.ts).
 *
 * Why it exists (UX run 2026-10-24, row 5.13): the form awaited the server
 * action bare. A send that never answered (a stalled request, a frozen tab)
 * left the button on "Siunčiama…" for good, and one that THREW (network drop,
 * a server-action error, a redirect answer without a result) escaped the
 * transition into the error boundary instead of the form's own error line.
 * Now every send ends in a visible state and the button is free again:
 *
 *   - an answer         → its own state (`proposeOutcomeState`);
 *   - no answer in time → `unconfirmed`: the proposal MAY already be stored,
 *                         so the copy says "check Bookings, or try again" —
 *                         a retry is safe because the propose RPC upserts the
 *                         same (company, need, worker) row, never a second one;
 *   - a throw           → `error`, retryable.
 *
 * A late answer after `unconfirmed` still lands (the component keeps
 * listening), so a slow success turns into "sent" instead of a stale warning.
 */
export type ProposeOutcomeState =
  | "sent"
  | "unavailable"
  | "not_entitled"
  | "rate_limited"
  | "already_accepted"
  | "refused_not_reachable"
  | "refused_need_closed"
  | "refused_answered"
  | "unconfirmed"
  | "error";

/** The label `withTimeout` is given, so its rejection is recognisable. */
export const PROPOSE_TIMEOUT_LABEL = "propose-booking";

/** True exactly for the rejection `withTimeout(…, PROPOSE_TIMEOUT_LABEL)` makes. */
export function isProposeTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === `${PROPOSE_TIMEOUT_LABEL}-timeout`;
}

/**
 * The server action's answer → the visible state. Anything that is not a
 * known answer (undefined after a redirect, a malformed value) is an error,
 * never a silent success.
 */
export function proposeOutcomeState(
  res: BookingActionResult | null | undefined,
): Exclude<ProposeOutcomeState, "unconfirmed"> {
  if (!res || typeof res !== "object") return "error";
  switch (res.kind) {
    case "ok":
      return "sent";
    case "needs-migration":
      return "unavailable";
    case "not-entitled":
      return "not_entitled";
    case "rate-limited":
      return "rate_limited";
    case "already-accepted":
      return "already_accepted";
    case "refused":
      return res.reason === "worker-not-reachable"
        ? "refused_not_reachable"
        : res.reason === "need-closed"
          ? "refused_need_closed"
          : "refused_answered";
    default:
      return "error";
  }
}
