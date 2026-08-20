/**
 * DID THIS ENTRY MENTION HOURS THAT WERE NEVER RECORDED AS TIME?
 * (field-work operating platform audit v1 — recovery UX for the historical 14)
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Until 2026-08-20 the composer posted a parsed duration only when the worker
 * had confirmed it. Anything still awaiting review was dropped SILENTLY while
 * the entry saved and looked successful. Measured over the 26 live production
 * entries: 16 stated hours, 4 kept them, 14 lost them.
 *
 * `20260820`'s composer fix stops any NEW entry joining that set. It is
 * forward-only: those 14 keep their words and their missing time until a
 * worker acts.
 *
 * This module lets the app TELL that worker — on their own entries only —
 * that hours they wrote were never recorded, so they can review the entry and
 * add them.
 *
 * ── WHAT IT MUST NEVER DO ──────────────────────────────────────────────────
 * It reports; it does not repair. It writes nothing, submits nothing, and
 * never turns matched text into a number the app then treats as a claim.
 * Re-parsing "3h staliaus darbai / 6,5h betonavimas" and posting 6.5 hours
 * onto a timesheet that will be approved — and may be paid — would manufacture
 * an assertion the worker never made (doctrine §7). The worker confirms their
 * own hours through the normal edit flow, which supersedes rather than
 * overwrites, so the original entry stays intact and readable.
 *
 * The matched text IS returned, so the UI can show the worker the words their
 * hours were in. That is evidence for a human to act on, never an auto-filled
 * value.
 */

/** Unit slugs that make a metric a DURATION. Mirrors WORK_TIME_UNIT_SLUGS in
 *  `work-time.ts`; kept as a local set so this module stays dependency-free
 *  and safe to run in a list render. */
const TIME_UNIT_SLUGS = new Set(["hours", "minutes", "days"]);

/** Metric slugs that carry a worker's work duration. */
const TIME_METRIC_SLUGS = new Set(["fragment_time", "quantity"]);

/**
 * Durations as workers actually write them, in the languages this product is
 * used in. Deliberately broad on the NUMBER (comma decimals: `6,5h`) and
 * narrow on the UNIT, so prose is not mistaken for a duration.
 *
 * Real examples this must catch, taken from production entries whose hours
 * were lost: `9h` · `6,5h betonavimas` · `2,25h nešti smėli` · `10h` ·
 * `3.5h dažiau` · `4 val` · `Montavau langa 2h`.
 */
const HOUR_CLAIM_RX =
  /(^|[^\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(h|val(?:andas?|andos|andų|andą)?|hours?|hrs?)(?![\p{L}])/giu;

export type UnrecordedHoursMetric = {
  readonly metric_slug: string;
  readonly value_numeric?: number | string | null;
  readonly unit_slug?: string | null;
};

export type UnrecordedHours = {
  /** The entry mentions a duration that never became a time metric. */
  readonly hasUnrecordedHours: boolean;
  /** The exact phrases the worker wrote, for the UI to show back as evidence.
   *  NEVER a value to submit — a human reads these and decides. */
  readonly mentions: readonly string[];
};

const NONE: UnrecordedHours = { hasUnrecordedHours: false, mentions: [] };

/** True when the entry already carries a real, positive duration metric. */
export function hasRecordedTime(
  metrics: readonly UnrecordedHoursMetric[] | null | undefined,
): boolean {
  return (metrics ?? []).some((m) => {
    if (!TIME_METRIC_SLUGS.has(m.metric_slug)) return false;
    if (!m.unit_slug || !TIME_UNIT_SLUGS.has(m.unit_slug)) return false;
    const n = typeof m.value_numeric === "string" ? Number(m.value_numeric) : m.value_numeric;
    return typeof n === "number" && Number.isFinite(n) && n > 0;
  });
}

/** Duration phrases present in the worker's own words. */
export function findHourMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  // `matchAll` on a /g/ regex — reset because the literal is module-scoped.
  HOUR_CLAIM_RX.lastIndex = 0;
  for (const m of text.matchAll(HOUR_CLAIM_RX)) {
    const phrase = `${m[2]}${m[3].length <= 2 ? "" : " "}${m[3]}`;
    if (!out.includes(phrase)) out.push(phrase);
    if (out.length >= 6) break; // a hint, not a transcript
  }
  return out;
}

/**
 * Report whether an entry mentions hours it never recorded.
 *
 * Call this ONLY for entries the caller already legitimately reads — it adds
 * no query and widens no visibility. On the journal page that is the worker's
 * own entries, fetched under their own RLS.
 */
export function detectUnrecordedHours(
  originalText: string | null | undefined,
  metrics: readonly UnrecordedHoursMetric[] | null | undefined,
): UnrecordedHours {
  if (hasRecordedTime(metrics)) return NONE;
  const mentions = findHourMentions(originalText);
  if (mentions.length === 0) return NONE;
  return { hasUnrecordedHours: true, mentions };
}
