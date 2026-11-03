/**
 * SHIFT PATTERNS / ROTAS (CAL-8) — the pure model.
 *
 * WHAT IT IS. A shift pattern is ONE optional property of an existing work
 * plan window (`work_plan_entries`): "this person works on project P from D1
 * to D2 — on Mondays, Wednesdays and Fridays" or "— four days on, two off".
 * It is the RULE the organization stated. The individual shift days are
 * never stored: they are PROJECTED from the rule whenever the calendar, the
 * reservation check or the utilisation answer asks (TIME is a projection,
 * not a store — the "booking calendar" reduction is the one this refuses).
 *
 * WHAT IT IS NOT.
 *   · Not a second plan table. The window, the worker, the project, the
 *     times, the authority and the cancel path are the work plan's own.
 *   · Not a prohibition (SEP-2). A shift that lands on approved leave or on
 *     another commitment is SAVED and then WARNED about through the one
 *     reservation rule (`lib/workforce/commitment-reservation.ts`); nothing
 *     here can refuse a plan because of an overlap.
 *   · Not "roster". In this product the roster is the active people list;
 *     a rota is what this module describes.
 *
 * TWO SHAPES, both closed and bounded so the database CHECK
 * (`work_plan_recurrence_valid_v1`) can mirror them exactly:
 *   weekly — ISO weekdays (1 = Monday … 7 = Sunday), 1–7 distinct days.
 *   cycle  — `on` working days then `off` rest days, repeating from the
 *            window's first day; `offset` (0 … on+off−1) is which day of the
 *            cycle the first day is, so two crews on the same 4/2 rotation
 *            can be staggered.
 *
 * PURE — no IO, no clock, no locale. Days are "YYYY-MM-DD" UTC calendar
 * days, the same semantics as every other planning source.
 */
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

/** Upper bounds for a cycle — a "28 on / 28 off" rotation is the longest
 *  real offshore pattern we know of; anything longer is a typo. */
export const SHIFT_CYCLE_MAX_ON = 28;
export const SHIFT_CYCLE_MAX_OFF = 28;

export type ShiftPattern =
  | { readonly kind: "weekly"; readonly days: readonly IsoWeekday[] }
  | {
      readonly kind: "cycle";
      readonly on: number;
      readonly off: number;
      readonly offset: number;
    };

/** One run of consecutive shift days (inclusive). */
export interface ShiftRun {
  readonly startDate: string;
  readonly endDate: string;
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function epochDay(iso: string): number | null {
  if (!DAY_RX.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  // Reject impossible days (2026-02-30 parses to March 2nd).
  if (new Date(t).toISOString().slice(0, 10) !== iso) return null;
  return Math.round(t / DAY_MS);
}

function isoFromEpochDay(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday (ISO 8601), the same numbering as Postgres
 *  `extract(isodow …)` so the database mirror agrees day for day. */
function isoWeekdayOfEpochDay(n: number): IsoWeekday {
  // 1970-01-01 was a Thursday (ISO 4).
  const w = (((n + 3) % 7) + 7) % 7; // 0 = Monday
  return (w + 1) as IsoWeekday;
}

function isWholeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Validate a stored / transported pattern. Strict on purpose: extra keys,
 * fractional numbers, strings-for-numbers and duplicates are all refused,
 * exactly like the database CHECK, so a pattern that passes here is one the
 * database will accept and vice versa. Returns the canonical form (weekly
 * days sorted ascending, cycle offset always present).
 */
export function parseShiftPattern(raw: unknown): ShiftPattern | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (o.kind === "weekly") {
    if (keys.some((k) => k !== "kind" && k !== "days")) return null;
    if (!Array.isArray(o.days)) return null;
    const days = o.days as unknown[];
    if (days.length < 1 || days.length > 7) return null;
    if (!days.every((d) => isWholeNumber(d) && d >= 1 && d <= 7)) return null;
    if (new Set(days).size !== days.length) return null;
    return {
      kind: "weekly",
      days: [...(days as IsoWeekday[])].sort((a, b) => a - b),
    };
  }
  if (o.kind === "cycle") {
    if (keys.some((k) => k !== "kind" && k !== "on" && k !== "off" && k !== "offset")) {
      return null;
    }
    const offset = o.offset === undefined ? 0 : o.offset;
    if (!isWholeNumber(o.on) || !isWholeNumber(o.off) || !isWholeNumber(offset)) return null;
    if (o.on < 1 || o.on > SHIFT_CYCLE_MAX_ON) return null;
    if (o.off < 1 || o.off > SHIFT_CYCLE_MAX_OFF) return null;
    if (offset < 0 || offset > o.on + o.off - 1) return null;
    return { kind: "cycle", on: o.on, off: o.off, offset };
  }
  return null;
}

/** The JSON the RPC stores — the canonical form, nothing else. */
export function shiftPatternToJson(p: ShiftPattern): Record<string, unknown> {
  return p.kind === "weekly"
    ? { kind: "weekly", days: [...p.days] }
    : { kind: "cycle", on: p.on, off: p.off, offset: p.offset };
}

export const SHIFT_REPEAT_MODES = ["none", "weekly", "cycle"] as const;
export type ShiftRepeatMode = (typeof SHIFT_REPEAT_MODES)[number];

/**
 * Read the plan form's repeat fields. `none` (or an absent field) is a
 * one-off window — today's behaviour, unchanged. Anything else must be a
 * complete, valid pattern; a half-filled one is invalid, never silently
 * turned into "every day".
 */
export function shiftPatternFromForm(raw: {
  repeat?: unknown;
  weekdays?: readonly unknown[];
  cycleOn?: unknown;
  cycleOff?: unknown;
  cycleOffset?: unknown;
}):
  | { readonly ok: true; readonly pattern: ShiftPattern | null }
  | { readonly ok: false } {
  const mode = typeof raw.repeat === "string" ? raw.repeat.trim() : "";
  if (mode === "" || mode === "none") return { ok: true, pattern: null };
  const int = (v: unknown): number | null => {
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    return /^\d{1,2}$/.test(s) ? Number(s) : null;
  };
  if (mode === "weekly") {
    const days = (raw.weekdays ?? []).map(int);
    if (days.some((d) => d === null)) return { ok: false };
    const pattern = parseShiftPattern({ kind: "weekly", days: [...new Set(days)] });
    return pattern ? { ok: true, pattern } : { ok: false };
  }
  if (mode === "cycle") {
    const on = int(raw.cycleOn);
    const off = int(raw.cycleOff);
    const offsetRaw = typeof raw.cycleOffset === "string" ? raw.cycleOffset.trim() : raw.cycleOffset;
    const offset = offsetRaw === undefined || offsetRaw === null || offsetRaw === "" ? 0 : int(offsetRaw);
    if (on === null || off === null || offset === null) return { ok: false };
    const pattern = parseShiftPattern({ kind: "cycle", on, off, offset });
    return pattern ? { ok: true, pattern } : { ok: false };
  }
  return { ok: false };
}

/** Is `day` a working day of the pattern anchored on the window's first day? */
export function isShiftDay(pattern: ShiftPattern, anchorIso: string, dayIso: string): boolean {
  const a = epochDay(anchorIso);
  const d = epochDay(dayIso);
  if (a === null || d === null || d < a) return false;
  if (pattern.kind === "weekly") return pattern.days.includes(isoWeekdayOfEpochDay(d));
  const period = pattern.on + pattern.off;
  return (d - a + pattern.offset) % period < pattern.on;
}

/**
 * The runs of consecutive shift days of a plan window [planStart, planEnd],
 * optionally clipped to [clipStart, clipEnd] (a calendar range). A run cut by
 * the clip edge ends at the edge — the same intersection the reservation
 * rule computes, so the calendar and the warning agree.
 *
 * A null pattern is the one-off window itself: one run, the whole window.
 */
export function expandShiftRuns(
  pattern: ShiftPattern | null,
  planStart: string,
  planEnd: string,
  clip?: { readonly startDate: string; readonly endDate: string },
): ShiftRun[] {
  const s = epochDay(planStart);
  const e = epochDay(planEnd);
  if (s === null || e === null || e < s) return [];
  const cs = clip ? epochDay(clip.startDate) : s;
  const ce = clip ? epochDay(clip.endDate) : e;
  if (cs === null || ce === null) return [];
  const from = Math.max(s, cs);
  const to = Math.min(e, ce);
  if (to < from) return [];
  if (pattern === null) return [{ startDate: isoFromEpochDay(from), endDate: isoFromEpochDay(to) }];

  const runs: ShiftRun[] = [];
  let runStart: number | null = null;
  for (let d = from; d <= to; d++) {
    const on = isShiftDay(pattern, planStart, isoFromEpochDay(d));
    if (on && runStart === null) runStart = d;
    if (!on && runStart !== null) {
      runs.push({ startDate: isoFromEpochDay(runStart), endDate: isoFromEpochDay(d - 1) });
      runStart = null;
    }
  }
  if (runStart !== null) {
    runs.push({ startDate: isoFromEpochDay(runStart), endDate: isoFromEpochDay(to) });
  }
  return runs;
}

/** How many shift days a window holds (a SET of days — never hours). */
export function countShiftDays(pattern: ShiftPattern | null, planStart: string, planEnd: string): number {
  let n = 0;
  for (const r of expandShiftRuns(pattern, planStart, planEnd)) {
    const a = epochDay(r.startDate);
    const b = epochDay(r.endDate);
    if (a !== null && b !== null) n += b - a + 1;
  }
  return n;
}

/**
 * Narrow a reservation verdict computed over the WHOLE plan window to the
 * days the pattern actually works. A leave week that falls entirely on a
 * rotation's rest days is not a collision; one that touches two shift runs
 * is two collisions, each with its own first and last shared day.
 *
 * Still a warning and never a refusal (SEP-2), and still honest about gaps
 * (SEP-7): a verdict that had gaps stays `unknown` when no collision
 * survives, exactly as `reserveCapacity` would answer.
 */
export function narrowVerdictToShiftRuns(
  verdict: ReservationVerdict,
  runs: readonly ShiftRun[],
): ReservationVerdict {
  if (verdict.state !== "collides") return verdict;
  const collisions: ReservationVerdict["collisions"][number][] = [];
  for (const c of verdict.collisions) {
    for (const r of runs) {
      const start = c.overlapStart > r.startDate ? c.overlapStart : r.startDate;
      const end = c.overlapEnd < r.endDate ? c.overlapEnd : r.endDate;
      if (start <= end) collisions.push({ ...c, overlapStart: start, overlapEnd: end });
    }
  }
  if (collisions.length > 0) return { state: "collides", collisions, gaps: verdict.gaps };
  return verdict.gaps.length > 0
    ? { state: "unknown", collisions: [], gaps: verdict.gaps }
    : { state: "clear", collisions: [], gaps: [] };
}
