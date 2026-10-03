import {
  effectiveEndDay,
  isConflictEligible,
  itemCoversDay,
  type PlanningItem,
} from "@/lib/planning/planning-model";
import {
  shiftDay,
  type RosterTimeline,
  type TimelineBar,
  type TimelineKind,
} from "@/lib/planning/roster-timeline-model";
import type { PlanningZoneEntry } from "@/lib/workforce/planning-zone-view";

/**
 * WORK IN TIME — the pure model behind the three perspectives of
 * /dashboard/planning (MY TIME, PEOPLE IN TIME, PROJECTS IN TIME).
 *
 * NO NEW READ, NO NEW STORE, NO INFERENCE. Every function here only re-lays
 * records the planning page already holds (the caller's PlanningItems, the
 * roster timeline, the workforce entries) onto a shared day axis. What this
 * module adds is the *epistemic state* of each thing drawn, because a time
 * surface that paints a plan and a fact the same way lies:
 *
 *   KNOWN        a dated record that binds the person and is in effect now
 *   PLANNED      dated, intended, not yet in effect (or not binding)
 *   RECORDED     work that happened (a journal entry)
 *   CONFIRMED    approved / confirmed by someone other than the author
 *   OPEN NEED    demand that is stated and not yet covered
 *   NOT PROVIDED a field the source never carried (no dates, no headcount)
 *   UNKNOWN      the read failed, or nothing on record — NEVER zero, NEVER free
 *
 * UNKNOWN IS NOT ZERO · NOT REPORTED IS NOT ABSENT · NO RECORD IS NOT NO WORK.
 */

export const TIME_LENSES = ["me", "people", "projects"] as const;
export type TimeLens = (typeof TIME_LENSES)[number];

export function isTimeLens(value: unknown): value is TimeLens {
  return typeof value === "string" && (TIME_LENSES as readonly string[]).includes(value);
}

export const EPISTEMIC_STATES = [
  "known",
  "planned",
  "recorded",
  "confirmed",
  "openNeed",
  "notProvided",
  "unknown",
] as const;
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

/** The state of one planning item. `confirmed` only when the caller holds a
 *  confirmation fact for it (journal confirmations, approved absences). */
export function epistemicForItem(
  item: PlanningItem,
  opts: { readonly today: string; readonly confirmedIds: ReadonlySet<string> | null },
): EpistemicState {
  if (!item.startDate) return "notProvided";
  if (item.sourceType === "journal") {
    return opts.confirmedIds?.has(item.id) ? "confirmed" : "recorded";
  }
  if (item.sourceType === "absence" && item.status === "approved") return "confirmed";
  if (isConflictEligible(item)) {
    return item.startDate > opts.today ? "planned" : "known";
  }
  return "planned";
}

/** The state of one roster bar. An approved absence was decided by a manager
 *  (confirmed); a commitment is known while in effect and planned before. */
export function epistemicForBar(bar: Pick<TimelineBar, "kind" | "startDate">, today: string): EpistemicState {
  if (bar.kind === "absence") return "confirmed";
  return bar.startDate > today ? "planned" : "known";
}

/* ------------------------------------------------------------------ */
/* Lanes — overlapping bars stack instead of covering each other        */
/* ------------------------------------------------------------------ */

export interface Laned<T> {
  readonly bar: T;
  readonly lane: number;
}

/** Greedy interval partition: the fewest lanes such that no two bars of one
 *  lane share a day. Stable (sorted by start, then key). */
export function assignLanes<T extends { readonly key: string; readonly startDate: string; readonly endDate: string }>(
  bars: readonly T[],
): { readonly items: readonly Laned<T>[]; readonly lanes: number } {
  const sorted = [...bars].sort((a, b) =>
    a.startDate === b.startDate ? a.key.localeCompare(b.key) : a.startDate < b.startDate ? -1 : 1,
  );
  const laneEnds: string[] = [];
  const items: Laned<T>[] = [];
  for (const bar of sorted) {
    let lane = laneEnds.findIndex((end) => end < bar.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bar.endDate);
    } else {
      laneEnds[lane] = bar.endDate;
    }
    items.push({ bar, lane });
  }
  return { items, lanes: Math.max(1, laneEnds.length) };
}

/* ------------------------------------------------------------------ */
/* PEOPLE IN TIME — the capacity band                                   */
/* ------------------------------------------------------------------ */

export interface CapacityDay {
  readonly day: string;
  readonly leftPct: number;
  readonly widthPct: number;
  readonly weekend: boolean;
  /** People with a binding commitment (project / booking / trip) this day. */
  readonly committed: number;
  /** People on approved leave this day. */
  readonly away: number;
  /** People with NOTHING on record this day. Not "free" — unknown. */
  readonly noRecord: number;
  /** People with two or more things on the same day (an overlap). */
  readonly overlapping: number;
  readonly total: number;
}

const DAY_MS = 86_400_000;
function dow(iso: string): number {
  return new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay();
}

/** `extraNoRecord`: roster people absent from the timeline because nothing is
 *  on record for them. They count toward the roster, as NO RECORD. */
export function buildCapacityBand(timeline: RosterTimeline, extraNoRecord = 0): readonly CapacityDay[] {
  const total = timeline.people.length + extraNoRecord;
  const out: CapacityDay[] = [];
  for (let i = 0; i < timeline.days; i++) {
    const day = shiftDay(timeline.from, i);
    let committed = 0;
    let away = 0;
    let overlapping = 0;
    let withAny = 0;
    for (const p of timeline.people) {
      const onDay = p.bars.filter((b) => b.startDate <= day && day <= b.endDate);
      if (onDay.length === 0) continue;
      withAny += 1;
      if (onDay.some((b) => b.kind !== "absence")) committed += 1;
      if (onDay.some((b) => b.kind === "absence")) away += 1;
      if (onDay.length > 1) overlapping += 1;
    }
    const d = dow(day);
    out.push({
      day,
      leftPct: (i / timeline.days) * 100,
      widthPct: (1 / timeline.days) * 100,
      weekend: d === 0 || d === 6,
      committed,
      away,
      noRecord: total - withAny,
      overlapping,
      total,
    });
  }
  return out;
}

/** The person's right-now and next-up bars — for the compact (mobile) row. */
export function nowAndNext(
  bars: readonly TimelineBar[],
  today: string,
): { readonly now: TimelineBar | null; readonly next: TimelineBar | null } {
  const sorted = [...bars].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  const now = sorted.find((b) => b.startDate <= today && today <= b.endDate) ?? null;
  const next = sorted.find((b) => b.startDate > today) ?? null;
  return { now, next };
}

/* ------------------------------------------------------------------ */
/* PROJECTS IN TIME                                                     */
/* ------------------------------------------------------------------ */

export interface ProjectStageBar {
  readonly id: string;
  readonly label: string | null;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly leftPct: number;
  readonly widthPct: number;
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
  readonly state: EpistemicState;
}

export interface ProjectStaffedPerson {
  readonly workerId: string;
  readonly name: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly conflict: boolean;
}

export type ProjectNeed =
  | { readonly kind: "open"; readonly missing: number; readonly required: number; readonly covered: number }
  | { readonly kind: "covered"; readonly required: number }
  | { readonly kind: "notProvided" };

export interface ProjectInTime {
  readonly projectId: string;
  readonly label: string | null;
  readonly status: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** The band, clipped to the window; null = not dated / outside the window. */
  readonly band: { readonly leftPct: number; readonly widthPct: number; readonly clippedStart: boolean; readonly clippedEnd: boolean } | null;
  readonly stages: readonly ProjectStageBar[];
  /** People assigned (from the roster timeline's project bars). */
  readonly staffed: readonly ProjectStaffedPerson[];
  /** Headcount per window day — the staffing density the lane is drawn with. */
  readonly staffingByDay: readonly number[];
  readonly peakStaffing: number;
  readonly need: ProjectNeed;
  /** Staffed people who are also somewhere else on the same days. */
  readonly conflictPeople: number;
  readonly state: EpistemicState;
}

export interface OpenNeedLane {
  readonly id: string;
  readonly label: string | null;
  readonly href: string | null;
  readonly missing: number;
  readonly required: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly band: { readonly leftPct: number; readonly widthPct: number } | null;
}

export interface ProjectsInTime {
  readonly projects: readonly ProjectInTime[];
  /** Stated demand that no project row accounts for (customer requests). */
  readonly needs: readonly OpenNeedLane[];
  /** Entries of demand that carry no dates at all — NOT PROVIDED, listed. */
  readonly undatedNeeds: number;
  /** Staffing without a project date window. */
  readonly projectsWithoutDates: number;
}

const PROJECT_HREF_RE = /^\/dashboard\/projects\/([^/?#]+)/;

/** The project id a stage item belongs to (its href is built from it). */
export function projectIdOfStage(item: Pick<PlanningItem, "href">): string | null {
  const m = PROJECT_HREF_RE.exec(item.href);
  return m ? m[1] : null;
}

function clip(
  start: string,
  end: string,
  from: string,
  to: string,
  days: number,
): { leftPct: number; widthPct: number; clippedStart: boolean; clippedEnd: boolean } | null {
  if (end < from || start > to) return null;
  const vs = start < from ? from : start;
  const ve = end > to ? to : end;
  const left = (Date.parse(`${vs}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  const span = (Date.parse(`${ve}T00:00:00Z`) - Date.parse(`${vs}T00:00:00Z`)) / DAY_MS + 1;
  return {
    leftPct: (left / days) * 100,
    widthPct: (span / days) * 100,
    clippedStart: start < from,
    clippedEnd: end > to,
  };
}

export function buildProjectsInTime(input: {
  readonly items: readonly PlanningItem[];
  readonly timeline: RosterTimeline | null;
  readonly entries: readonly PlanningZoneEntry[];
  readonly today: string;
}): ProjectsInTime {
  const { today } = input;
  const from = input.timeline?.from;
  const days = input.timeline?.days ?? 0;
  const to = from && days > 0 ? shiftDay(from, days - 1) : null;

  type MutableRow = { -readonly [K in keyof ProjectInTime]: ProjectInTime[K] } & {
    _staged: ProjectStageBar[];
    _people: ProjectStaffedPerson[];
  };
  const rows = new Map<string, MutableRow>();
  const ensure = (projectId: string, label: string | null) => {
    const cur = rows.get(projectId);
    if (cur) {
      if (!cur.label && label) cur.label = label;
      return cur;
    }
    const fresh: MutableRow = {
      projectId,
      label,
      status: null,
      startDate: null,
      endDate: null,
      band: null,
      stages: [],
      staffed: [],
      staffingByDay: [],
      peakStaffing: 0,
      need: { kind: "notProvided" } as ProjectNeed,
      conflictPeople: 0,
      state: "notProvided" as EpistemicState,
      _staged: [] as ProjectStageBar[],
      _people: [] as ProjectStaffedPerson[],
    };
    rows.set(projectId, fresh);
    return fresh;
  };

  // 1. Projects and their stages come from the caller's own planning items.
  for (const it of input.items) {
    if (it.sourceType === "project") {
      const r = ensure(it.sourceId, it.label);
      Object.assign(r, { status: it.status, startDate: it.startDate, endDate: effectiveEndDay(it) });
    }
  }
  for (const it of input.items) {
    if (it.sourceType !== "stage" || !it.startDate || !from || !to) continue;
    const pid = projectIdOfStage(it);
    if (!pid) continue;
    const end = effectiveEndDay(it) ?? it.startDate;
    const c = clip(it.startDate, end, from, to, days);
    if (!c) continue;
    const r = ensure(pid, it.project);
    r._staged.push({
      id: it.id,
      label: it.label,
      status: it.status,
      startDate: it.startDate,
      endDate: end,
      ...c,
      state: it.status === "done" ? "recorded" : it.startDate > today ? "planned" : "known",
    });
  }

  // 2. Staffing comes from the roster timeline's project bars.
  if (input.timeline && from && to) {
    for (const person of input.timeline.people) {
      for (const b of person.bars) {
        if (b.kind !== "project") continue;
        const pid = b.key.slice("project:".length);
        const r = ensure(pid, b.label);
        r._people.push({
          workerId: person.workerId,
          name: person.name,
          startDate: b.startDate,
          endDate: b.endDate,
          conflict: b.conflict,
        });
      }
    }
  }

  // 3. Needs come from the workforce entries (project-sourced join the row).
  const needs: OpenNeedLane[] = [];
  let undatedNeeds = 0;
  for (const e of input.entries) {
    // Only a headcount a PERSON stated (typed, or confirmed after a suggestion)
    // is a need. A system-suggested default of "1" is a suggestion, not demand:
    // drawing it as OPEN NEED would invent a gap on every project.
    const stated = e.userEnteredHeadcount ?? e.confirmedHeadcount;
    const required = stated !== null && stated > 0 ? e.requiredHeadcount : 0;
    const missing = Math.max(0, required - e.coveredHeadcount);
    if (e.id.startsWith("project:")) {
      const pid = e.id.slice("project:".length);
      const r = rows.get(pid);
      if (!r) continue;
      r.need =
        required <= 0
          ? { kind: "notProvided" }
          : missing > 0
            ? { kind: "open", missing, required, covered: e.coveredHeadcount }
            : { kind: "covered", required };
      continue;
    }
    // Demand-sourced: a stated need with no project row of its own.
    if (required <= 0 || missing === 0) continue;
    if (!e.startDate) {
      undatedNeeds += 1;
      continue;
    }
    const end = e.endDate && e.endDate >= e.startDate ? e.endDate : e.startDate;
    needs.push({
      id: e.id,
      label: e.title,
      href: e.href,
      missing,
      required,
      startDate: e.startDate,
      endDate: end,
      band: from && to ? clip(e.startDate, end, from, to, days) : null,
    });
  }

  const projects: ProjectInTime[] = [];
  let projectsWithoutDates = 0;
  for (const r of rows.values()) {
    const people = r._people;
    const staffingByDay: number[] = [];
    for (let i = 0; i < days && from; i++) {
      const day = shiftDay(from, i);
      staffingByDay.push(people.filter((p) => p.startDate <= day && day <= p.endDate).length);
    }
    const band =
      r.startDate && r.endDate && from && to ? clip(r.startDate, r.endDate, from, to, days) : null;
    if (!r.startDate) projectsWithoutDates += 1;
    const visible = band !== null || r._staged.length > 0 || people.length > 0;
    if (!visible && r.need.kind === "notProvided" && r.startDate) {
      // Dated but entirely outside the window and unstaffed: not on this axis.
      continue;
    }
    projects.push({
      projectId: r.projectId,
      label: r.label,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      band,
      stages: r._staged.sort((a, b) => a.startDate.localeCompare(b.startDate)),
      staffed: people,
      staffingByDay,
      peakStaffing: Math.max(0, ...staffingByDay),
      need: r.need,
      conflictPeople: new Set(people.filter((p) => p.conflict).map((p) => p.workerId)).size,
      state: !r.startDate
        ? "notProvided"
        : r.startDate > today
          ? "planned"
          : r.endDate && r.endDate < today
            ? "recorded"
            : "known",
    });
  }
  projects.sort((a, b) => {
    const as = a.startDate ?? "9999";
    const bs = b.startDate ?? "9999";
    return as === bs ? (a.label ?? "").localeCompare(b.label ?? "") : as < bs ? -1 : 1;
  });
  return { projects, needs, undatedNeeds, projectsWithoutDates };
}

/* ------------------------------------------------------------------ */
/* MY TIME — now and next                                               */
/* ------------------------------------------------------------------ */

/** Sources that are things to be at / do, as opposed to money or invitations. */
const PRESENCE_SOURCES: ReadonlySet<string> = new Set(["booking", "project", "stage", "absence", "trip", "task"]);

export interface MyNowNext {
  /** Dated rows (not journal) that cover today, binding ones first. */
  readonly today: readonly PlanningItem[];
  /** The next dated row after today, if any. */
  readonly next: PlanningItem | null;
  /** Days until `next` starts; null when there is none. */
  readonly nextInDays: number | null;
  /** Rows with no date — shown as NOT PROVIDED, never as "today". */
  readonly undatedCount: number;
}

export function buildMyNowNext(items: readonly PlanningItem[], today: string): MyNowNext {
  const presence = items.filter((i) => PRESENCE_SOURCES.has(i.sourceType));
  const todayItems = presence
    .filter((i) => itemCoversDay(i, today))
    .sort((a, b) => Number(isConflictEligible(b)) - Number(isConflictEligible(a)));
  const upcoming = presence
    .filter((i) => i.startDate !== null && i.startDate > today)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : a.startDate! > b.startDate! ? 1 : Number(isConflictEligible(b)) - Number(isConflictEligible(a))));
  const next = upcoming[0] ?? null;
  const nextInDays = next?.startDate
    ? Math.round((Date.parse(`${next.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
    : null;
  return {
    today: todayItems,
    next,
    nextInDays,
    undatedCount: items.filter((i) => !i.startDate).length,
  };
}

export type { TimelineKind };

/* ------------------------------------------------------------------ */
/* URL state — the URL is the whole state (no client state)             */
/* ------------------------------------------------------------------ */

/** A selection that survives navigation: `person:<workerId>` or `project:<id>`. */
export type TimeFocus =
  | { readonly kind: "person"; readonly id: string }
  | { readonly kind: "project"; readonly id: string };

const FOCUS_RE = /^(person|project):([A-Za-z0-9_-]{1,64})$/;

export function parseTimeFocus(raw: string | undefined): TimeFocus | null {
  const m = raw ? FOCUS_RE.exec(raw) : null;
  return m ? { kind: m[1] as "person" | "project", id: m[2] } : null;
}

export function focusParam(focus: TimeFocus): string {
  return `${focus.kind}:${focus.id}`;
}

/** Canonical lens href. Defaults are omitted so the clean URL stays canonical. */
export function lensHref(opts: {
  readonly lens: TimeLens;
  readonly date?: string | null;
  readonly today: string;
  readonly focus?: TimeFocus | null;
  readonly anchor?: string;
}): string {
  const params = new URLSearchParams();
  if (opts.lens !== "me") params.set("lens", opts.lens);
  if (opts.date && opts.date !== opts.today) params.set("date", opts.date);
  if (opts.focus) params.set("focus", focusParam(opts.focus));
  const qs = params.toString();
  return `/dashboard/planning${qs ? `?${qs}` : ""}${opts.anchor ? `#${opts.anchor}` : ""}`;
}
