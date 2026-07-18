/**
 * Project stage Gantt — a PURE PROJECTION over the canonical project_stages
 * (Wagon 6 slice: Gantt). No new data, no stored Gantt events: bar positions
 * are computed from the real planned/actual dates on each stage. Deterministic
 * (today is passed in), so it is fully unit-tested. No fabricated completion
 * percentage — a bar reflects only real dates + real status.
 */

import type { ProjectStage, StageStatus } from "@/lib/projects/stages-model";

export interface GanttBar {
  readonly id: string;
  readonly name: string;
  readonly status: StageStatus;
  /** left edge, 0–100 (% of the project window) */
  readonly offsetPct: number;
  /** width, >0–100 */
  readonly widthPct: number;
  readonly start: string;
  readonly end: string;
  readonly overdue: boolean;
}

export type StageGantt =
  | { hasTimeline: false }
  | {
      hasTimeline: true;
      windowStart: string;
      windowEnd: string;
      /** today marker 0–100, or null when today is outside the window */
      todayPct: number | null;
      bars: GanttBar[];
    };

const DONE_STATES: ReadonlySet<StageStatus> = new Set(["done", "cancelled"]);

function toDay(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length > 10 ? iso.slice(0, 10) : iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/** Effective [start, end] day pair for a stage — actual overrides planned; a
 *  stage with only a start renders as a minimal 1-day marker. Returns null when
 *  the stage has no usable date. */
function stageSpan(s: ProjectStage): { start: number; end: number } | null {
  const start = toDay(s.actualStart) ?? toDay(s.plannedStart);
  if (start === null) return null;
  const end =
    toDay(s.actualEnd) ?? toDay(s.plannedEnd) ?? start;
  return { start, end: Math.max(end, start) };
}

export function buildStageGantt(
  stages: readonly ProjectStage[],
  todayIso: string,
): StageGantt {
  const spans = stages
    .map((s) => ({ s, span: stageSpan(s) }))
    .filter((x): x is { s: ProjectStage; span: { start: number; end: number } } => x.span !== null);

  if (spans.length === 0) return { hasTimeline: false };

  const windowStart = Math.min(...spans.map((x) => x.span.start));
  const windowEndRaw = Math.max(...spans.map((x) => x.span.end));
  // Guarantee a non-zero span so a single-day project still renders.
  const windowEnd = Math.max(windowEndRaw, windowStart + 1);
  const total = windowEnd - windowStart;
  const today = toDay(todayIso);

  const bars: GanttBar[] = spans.map(({ s, span }) => {
    const offsetPct = ((span.start - windowStart) / total) * 100;
    const widthPct = Math.max(((span.end - span.start) / total) * 100, 1.5);
    const overdue =
      today !== null && span.end < today && !DONE_STATES.has(s.status);
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      offsetPct: Math.min(Math.max(offsetPct, 0), 100),
      widthPct: Math.min(widthPct, 100 - Math.min(Math.max(offsetPct, 0), 100)) || widthPct,
      start: s.actualStart ?? s.plannedStart ?? "",
      end: s.actualEnd ?? s.plannedEnd ?? s.actualStart ?? s.plannedStart ?? "",
      overdue,
    };
  });

  const dayToIso = (day: number): string =>
    new Date(day * 86_400_000).toISOString().slice(0, 10);

  const todayPct =
    today !== null && today >= windowStart && today <= windowEnd
      ? ((today - windowStart) / total) * 100
      : null;

  return {
    hasTimeline: true,
    windowStart: dayToIso(windowStart),
    windowEnd: dayToIso(windowEnd),
    todayPct,
    bars,
  };
}
