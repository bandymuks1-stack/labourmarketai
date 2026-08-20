/**
 * DID THE WORKER'S HOURS SURVIVE THE REVIEW STEP?
 * (field-work operating platform audit v1 — the second FIRST_BROKEN_LINK)
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * The composer parses durations out of the worker's own words, then shows them
 * for review. Only fragments whose status is `confirmed` are posted, and the
 * entry-level duration is posted only when its own status is `confirmed`.
 * Everything still sitting at `pending` is dropped — silently, while the entry
 * saves and looks perfectly successful.
 *
 * Measured in production, 2026-08-20, over the 26 live journal entries:
 *
 *   16  state hours in the worker's own text ("9h", "6,5h betonavimas",
 *       "2,25h nešti smėli", "10h")
 *    4  reached a time metric
 *   14  wrote hours that were LOST
 *   14  of those 14 had NOT ONE confirmed fragment
 *    2  entries in the whole database ever had confirmed fragments
 *
 * One real worker logged twelve entries in the correct organization context,
 * every one stating hours, and their August timesheet computed 0.00. Nothing
 * told them anything had been dropped.
 *
 * ── WHY THE FIX IS NOT "CONFIRM AUTOMATICALLY" ─────────────────────────────
 * Doctrine §7: the platform never presents inferred data as though a human
 * had asserted it. A parsed duration is a machine reading of free text — the
 * worker confirming it is what makes it their claim. Auto-confirming would
 * manufacture assertions nobody made, and would be a worse failure than
 * losing them.
 *
 * So this does not decide. It makes the loss IMPOSSIBLE TO DO BY ACCIDENT:
 * when a save would discard durations the worker wrote, the composer says so
 * and stops, and the worker either keeps them or discards them deliberately.
 * `discarded` is a real answer and is never counted here.
 */

/** The statuses a reviewable suggestion can hold. Only `pending` means "the
 *  worker has not decided yet"; `discarded` is a decision, not an omission. */
export const WORK_TIME_UNREVIEWED_STATUS = "pending";

export type WorkTimeFragmentInput = {
  readonly status: string;
  /** The parsed duration, if the pipeline found one for this fragment. */
  readonly timeValue?: number | null;
};

export type UnconfirmedWorkTimeInput = {
  readonly fragments: readonly WorkTimeFragmentInput[];
  /** Status of the ENTRY-level duration suggestion. */
  readonly entryTimeStatus: string;
  /** Raw entry-level duration as typed/parsed — a string because it comes
   *  straight from the input; anything non-positive is not a duration. */
  readonly entryTimeValue: string;
};

export type UnconfirmedWorkTime = {
  /** Fragment durations still awaiting the worker's decision. */
  readonly fragmentCount: number;
  /** Whether the entry-level duration is still awaiting a decision. */
  readonly entryPending: boolean;
  /** Total durations that saving right now would throw away. */
  readonly unreviewedCount: number;
  /** True when a save would discard time the worker actually wrote. */
  readonly wouldSilentlyDiscard: boolean;
};

function isPositiveNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** A duration typed into the entry-level field. Accepts the comma decimal
 *  Lithuanian workers actually write ("6,5"), because refusing to see it here
 *  would recreate the very loss this module exists to prevent. */
function parseEntryTime(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function reviewUnconfirmedWorkTime(
  input: UnconfirmedWorkTimeInput,
): UnconfirmedWorkTime {
  const fragmentCount = input.fragments.filter(
    (f) =>
      f.status === WORK_TIME_UNREVIEWED_STATUS && isPositiveNumber(f.timeValue),
  ).length;

  const entryPending =
    input.entryTimeStatus === WORK_TIME_UNREVIEWED_STATUS &&
    parseEntryTime(input.entryTimeValue) !== null;

  const unreviewedCount = fragmentCount + (entryPending ? 1 : 0);

  return {
    fragmentCount,
    entryPending,
    unreviewedCount,
    wouldSilentlyDiscard: unreviewedCount > 0,
  };
}
