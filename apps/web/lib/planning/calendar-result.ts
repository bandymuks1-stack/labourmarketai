"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { getPlanning, type PlanningSources } from "@/lib/planning/planning";
import {
  PLANNING_WINDOW_DAYS,
  buildAgenda,
  visibleRange,
} from "@/lib/planning/planning-model";

/**
 * THE CALENDAR RESULT (W3 — the panel presentation of the Time Engine).
 *
 * "Parodyk mano kalendorių" already had a SENTENCE (`loadContextBrief` renders
 * the agenda into the chat thread) and a FULL SCREEN (`/dashboard/planning`).
 * What it did not have was the panel presentation — `ResultBody` had no
 * `calendar` case, so the `?result=calendar` deep link fell through to the
 * honest "pending" line. This loader is that missing presentation's read.
 *
 * ONE CALCULATION, TWO PRESENTATIONS. This module reads the SAME canonical
 * projection the planning page and the chat sentence read — `getPlanning` →
 * `buildAgenda` — and builds NO view of its own, reads NO table of its own,
 * and adds NO second truth store. The anti-second-calendar rule survives by
 * construction: everything below is a bounded re-shaping of the same items.
 *
 * Honesty contract (same as the chat sentence):
 *   - every line is a real record from the caller's own RLS-scoped sources;
 *   - an empty window says so — never invented items;
 *   - REAL conflicts are marked on the item and counted;
 *   - sources that could not be read are NAMED (`degraded`), so a partial
 *     answer can never present itself as a complete one.
 *
 * All copy is resolved server-side (like `agenda-summary.ts`) so the client
 * component renders plain strings and stays presentation-only.
 */

/** The panel shows at most this many day groups… */
const PANEL_DAY_LIMIT = 7;
/** …and at most this many items per day. Bounded output, honest "+n". */
const PANEL_ITEMS_PER_DAY = 4;

export interface CalendarResultItem {
  /** Stable id from the projection (`${sourceType}:${sourceId}`). */
  readonly id: string;
  /** "Source: name (status)" — localized server-side. */
  readonly text: string;
  /** This item participates in a REAL overlap conflict. */
  readonly conflict: boolean;
}

export interface CalendarResultDay {
  /** "YYYY-MM-DD" (UTC). */
  readonly day: string;
  /** Localized short label (e.g. "08-04, pr."). */
  readonly dayLabel: string;
  readonly isToday: boolean;
  readonly items: readonly CalendarResultItem[];
  /** Items beyond the per-day bound — shown as an honest "+n". */
  readonly moreCount: number;
}

export type CalendarResultView =
  | { readonly kind: "blocked" }
  | {
      readonly kind: "ready";
      readonly windowDays: number;
      readonly days: readonly CalendarResultDay[];
      /** Day groups beyond the panel bound. */
      readonly hiddenDayCount: number;
      readonly conflictCount: number;
      readonly undatedCount: number;
      readonly laterCount: number;
      /** Localized nouns of sources whose read ERRORED — the partial marker. */
      readonly degraded: readonly string[];
    };

/** Sources whose read state is an ERROR (not an owner-gated absence — an
 *  unapplied migration is an honest 0, not a failed read). */
function degradedSourceKeys(sources: PlanningSources): string[] {
  return (Object.keys(sources) as Array<keyof PlanningSources>).filter(
    (k) => sources[k].status === "error",
  );
}

export async function loadCalendarResult(): Promise<CalendarResultView> {
  const locale = await getLocale();
  const todayIso = new Date().toISOString().slice(0, 10);
  const range = visibleRange("agenda", todayIso);
  const planning = await getPlanning({
    rangeStart: range.start,
    rangeEnd: range.end,
  });
  if (planning.status !== "ok") return { kind: "blocked" };

  const [tPlanning, tAll] = await Promise.all([
    getTranslations({ locale, namespace: "planning" }),
    getTranslations({ locale }),
  ]);

  const agenda = buildAgenda(planning.items, new Date(), PLANNING_WINDOW_DAYS);

  const dayFmt = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  });

  const days: CalendarResultDay[] = agenda.days
    .slice(0, PANEL_DAY_LIMIT)
    .map((group) => ({
      day: group.day,
      dayLabel: dayFmt.format(new Date(`${group.day}T00:00:00Z`)),
      isToday: group.isToday,
      items: group.items.slice(0, PANEL_ITEMS_PER_DAY).map((item) => {
        const source = tPlanning(`source.${item.sourceType}`);
        const name = item.label ?? tPlanning(`fallback.${item.sourceType}`);
        const status = tAll(item.statusKey);
        return {
          id: item.id,
          text: `${source}: ${name} (${status})`,
          conflict: agenda.conflictIds.has(item.id),
        };
      }),
      moreCount: Math.max(0, group.items.length - PANEL_ITEMS_PER_DAY),
    }));

  return {
    kind: "ready",
    windowDays: PLANNING_WINDOW_DAYS,
    days,
    hiddenDayCount: Math.max(0, agenda.days.length - PANEL_DAY_LIMIT),
    conflictCount: agenda.conflicts.length,
    undatedCount: agenda.undated.length,
    laterCount: agenda.later.length,
    degraded: degradedSourceKeys(planning.sources).map((k) =>
      tPlanning(`source.${k}`),
    ),
  };
}
