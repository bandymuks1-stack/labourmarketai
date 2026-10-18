/**
 * THE WORK RHYTHM — the calendar's picture of a person's WORKING TIME
 * (premium calendar, owner command 2026-09-29 §4–§5, §11).
 *
 * WHAT IT RECOVERS. The calendar the owner remembers as good was the journal
 * month grid: the HOURS written on the date and the confirmation state as a
 * mark, almost no words (#1727/#1729, named so in #1897). The canonical
 * calendar (`/dashboard/planning`) drew a COUNT of rows on the date instead,
 * and its week was a plain list. This module gives both views the journal
 * grid's facts again — hours on the day, confirmed or not — plus what the
 * journal grid never had: the plan (bookings, project bands, leave, trips)
 * as bands over the same days, and every work block's organization and place.
 *
 * WHAT IT IS NOT. A second time store, a second hour rule or a read. It is a
 * pure re-shaping of the `PlanningItem`s the calendar already holds: a
 * journal item's `duration` was derived through THE canonical work-time rule
 * (`deriveEntryWorkTime` → `workTimeDurationLabel`, "<value>|<unit>"), and
 * it is only parsed back to minutes here. `days` never becomes hours (there
 * is no approved workday length) — such a block keeps its day figure.
 *
 * NO CLOCK POSITIONS. A journal entry records HOW LONG, not FROM WHEN: its
 * only clock value is the moment the row was typed (`created_at`). Drawing a
 * block at 20:15 because it was logged in the evening would invent a shift.
 * A block's length is its duration; its position is its order in the day.
 *
 * CONFIRMATION (SEP-3). `confirmed` is true only for an entry someone OTHER
 * than the worker approved (`journalConfirmedIds`). When the review rows
 * could not be read it is `null` — shown as nothing, never as "unconfirmed".
 */

import type { PlanningItem, PlanningSourceType } from "@/lib/planning/planning-model";

/** A recorded piece of work on one day — one journal entry. */
export interface RhythmBlock {
  readonly id: string;
  readonly href: string;
  /** The worker's own first line, as the calendar already carries it. */
  readonly label: string | null;
  readonly organization: string | null;
  readonly place: string | null;
  readonly project: string | null;
  /** Minutes from the canonical duration; null when the entry is untimed or day-unit. */
  readonly minutes: number | null;
  /** Day units when the entry was recorded in days (never turned into hours). */
  readonly dayUnits: number | null;
  /** true = approved by someone else · false = not (yet) · null = unknown. */
  readonly confirmed: boolean | null;
}

/** A planned / committed / absence band covering the day. */
export interface RhythmPlan {
  readonly id: string;
  readonly href: string;
  readonly sourceType: PlanningSourceType;
  readonly label: string | null;
  readonly place: string | null;
  readonly organization: string | null;
  /** The band's own first and last day (inclusive), so a view can say "continues". */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly startTime: string | null;
  readonly conflict: boolean;
}

export type RhythmConfirmation = "none" | "partial" | "all" | "unknown";

export interface RhythmDay {
  readonly day: string;
  readonly isToday: boolean;
  readonly isFuture: boolean;
  readonly blocks: readonly RhythmBlock[];
  readonly plans: readonly RhythmPlan[];
  /** Sum of the blocks' minutes — the day's recorded time. 0 when none is timed. */
  readonly recordedMinutes: number;
  readonly confirmation: RhythmConfirmation;
  readonly hasConflict: boolean;
  /** An approved absence covers the day (leave, sickness). */
  readonly hasAbsence: boolean;
}

export interface WorkRhythm {
  readonly days: readonly RhythmDay[];
  readonly recordedMinutes: number;
  readonly recordedDays: number;
  /** The longest recorded day in view — the scale every bar is drawn against. */
  readonly maxDayMinutes: number;
  readonly confirmedBlocks: number;
  readonly blocks: number;
}

/** "<value>|<unit>" → minutes (hours / minutes only). Anything else → null. */
export function durationMinutes(raw: string | null | undefined): number | null {
  if (!raw || !raw.includes("|")) return null;
  const [value, unit] = raw.split("|", 2);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "hours") return Math.round(n * 60);
  if (unit === "minutes") return Math.round(n);
  return null;
}

/** "<value>|days" → day units; anything else → null. */
export function durationDayUnits(raw: string | null | undefined): number | null {
  if (!raw || !raw.includes("|")) return null;
  const [value, unit] = raw.split("|", 2);
  const n = Number(value);
  return unit === "days" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Sources that are a BAND over the day rather than recorded work. */
const PLAN_SOURCES: ReadonlySet<PlanningSourceType> = new Set([
  "booking",
  "project",
  "stage",
  "absence",
  "trip",
  "plan",
  "task",
  "invitation",
  "finance",
]);

export function buildWorkRhythm({
  days,
  todayIso,
  confirmedIds,
  conflictIds,
}: {
  /** The days in view, each with the items covering it (the page's own projection). */
  readonly days: readonly { readonly day: string; readonly items: readonly PlanningItem[] }[];
  readonly todayIso: string;
  readonly confirmedIds: ReadonlySet<string> | null;
  readonly conflictIds: ReadonlySet<string>;
}): WorkRhythm {
  const out: RhythmDay[] = [];
  let recordedMinutes = 0;
  let recordedDays = 0;
  let maxDayMinutes = 0;
  let confirmedBlocks = 0;
  let blockCount = 0;

  for (const { day, items } of days) {
    const blocks: RhythmBlock[] = [];
    const plans: RhythmPlan[] = [];
    for (const it of items) {
      if (it.sourceType === "journal") {
        blocks.push({
          id: it.id,
          href: it.href,
          label: it.label,
          organization: it.organization ?? it.workspace,
          place: it.place,
          project: it.project,
          minutes: durationMinutes(it.duration),
          dayUnits: durationDayUnits(it.duration),
          confirmed: confirmedIds ? confirmedIds.has(it.id) : null,
        });
      } else if (PLAN_SOURCES.has(it.sourceType)) {
        plans.push({
          id: it.id,
          href: it.href,
          sourceType: it.sourceType,
          label: it.label,
          place: it.place ?? it.detail,
          organization: it.organization ?? it.workspace,
          startDate: it.startDate,
          endDate: it.endDate,
          startTime: it.startTime,
          conflict: conflictIds.has(it.id),
        });
      }
    }
    const minutes = blocks.reduce((s, b) => s + (b.minutes ?? 0), 0);
    const confirmedHere = blocks.filter((b) => b.confirmed === true).length;
    const confirmation: RhythmConfirmation =
      blocks.length === 0
        ? "none"
        : confirmedIds === null
          ? "unknown"
          : confirmedHere === 0
            ? "none"
            : confirmedHere >= blocks.length
              ? "all"
              : "partial";
    out.push({
      day,
      isToday: day === todayIso,
      isFuture: day > todayIso,
      blocks,
      plans,
      recordedMinutes: minutes,
      confirmation,
      hasConflict: plans.some((p) => p.conflict),
      hasAbsence: plans.some((p) => p.sourceType === "absence"),
    });
    if (blocks.length > 0) recordedDays += 1;
    recordedMinutes += minutes;
    maxDayMinutes = Math.max(maxDayMinutes, minutes);
    confirmedBlocks += confirmedHere;
    blockCount += blocks.length;
  }

  return {
    days: out,
    recordedMinutes,
    recordedDays,
    maxDayMinutes,
    confirmedBlocks,
    blocks: blockCount,
  };
}

/**
 * Compact hours for a date cell: "8", "7.5", never a rounded-up lie —
 * one or two minutes read "<0.1" rather than "0.1" (the journal grid's rule).
 */
export function compactHours(minutes: number, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const hours = Math.round((minutes / 60) * 10) / 10;
  return hours === 0 ? `<${fmt.format(0.1)}` : fmt.format(hours);
}
