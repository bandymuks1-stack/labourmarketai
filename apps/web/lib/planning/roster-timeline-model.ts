import type { RosterCommitmentRow } from "@/lib/planning/roster-commitments-model";
import { rangesOverlapInclusive } from "@/lib/planning/planning-model";

/**
 * THE ROSTER TIMELINE — who is where, when, at a glance.
 *
 * NO NEW READ AND NO NEW STORE. This lays the two reads the company planning
 * zone already makes (per-person commitments and approved absences) out on one
 * shared day axis, so a manager sees busy / away / overlapping across people
 * without reading a list. Nothing is inferred: an empty stretch is "nothing
 * on record", never "free" (SEP-7), and an overlap is a warning, never a
 * prohibition (SEP-2) — both bars always stay.
 *
 * PURE. UTC calendar-day arithmetic only, so a locale or timezone can never
 * move a bar to another day.
 */

export type TimelineKind = "project" | "booking" | "trip" | "absence";

export interface TimelineBar {
  readonly key: string;
  readonly kind: TimelineKind;
  /** Real title or null; absence is ALWAYS null (the reason is never read). */
  readonly label: string | null;
  readonly startDate: string;
  readonly endDate: string;
  /** Position on the axis, percent of the window. */
  readonly leftPct: number;
  readonly widthPct: number;
  /** Shares at least one day with another bar of the same person. */
  readonly conflict: boolean;
  /** The real range continues beyond the visible window. */
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
}

export interface TimelinePerson {
  readonly workerId: string;
  readonly name: string | null;
  readonly bars: readonly TimelineBar[];
  /** Real commitments outside the visible window (so "empty" is not mistaken
   *  for "nothing at all"). */
  readonly outsideWindow: number;
}

export interface TimelineTick {
  readonly day: string;
  readonly leftPct: number;
}

export interface RosterTimeline {
  readonly from: string;
  readonly to: string;
  readonly days: number;
  readonly ticks: readonly TimelineTick[];
  readonly people: readonly TimelinePerson[];
  /** Position of today when it falls inside the window, else null. */
  readonly todayPct: number | null;
}

export interface TimelineAbsence {
  readonly workerId: string;
  readonly workerName: string | null;
  readonly sourceId: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

const DAY_MS = 86_400_000;

function toMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}
function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO day shifted by whole days (UTC). */
export function shiftDay(iso: string, days: number): string {
  return fromMs(toMs(iso) + days * DAY_MS);
}

/** Monday of the ISO week containing `iso`. */
export function mondayOf(iso: string): string {
  const dow = (new Date(toMs(iso)).getUTCDay() + 6) % 7;
  return shiftDay(iso, -dow);
}

export function buildRosterTimeline(input: {
  readonly rows: readonly RosterCommitmentRow[];
  readonly absences: readonly TimelineAbsence[];
  /** First visible day (YYYY-MM-DD). */
  readonly from: string;
  readonly days: number;
  readonly today: string;
}): RosterTimeline {
  const { from, days, today } = input;
  const startMs = toMs(from);
  const to = shiftDay(from, days - 1);

  type Raw = {
    key: string;
    kind: TimelineKind;
    label: string | null;
    startDate: string;
    endDate: string;
  };
  const byPerson = new Map<string, { name: string | null; raw: Raw[] }>();
  const person = (id: string, name: string | null) => {
    const cur = byPerson.get(id);
    if (cur) {
      if (!cur.name && name) cur.name = name;
      return cur;
    }
    const fresh = { name, raw: [] as Raw[] };
    byPerson.set(id, fresh);
    return fresh;
  };

  for (const row of input.rows) {
    const p = person(row.workerId, row.workerName);
    for (const c of row.commitments) {
      if (!c.startDate) continue;
      const end = c.endDate && c.endDate >= c.startDate ? c.endDate : c.startDate;
      p.raw.push({
        key: `${c.kind}:${c.sourceId}`,
        kind: c.kind,
        label: c.label,
        startDate: c.startDate,
        endDate: end,
      });
    }
  }
  for (const a of input.absences) {
    if (!a.startDate) continue;
    const end = a.endDate && a.endDate >= a.startDate ? a.endDate : a.startDate;
    person(a.workerId, a.workerName).raw.push({
      key: `absence:${a.sourceId}`,
      kind: "absence",
      label: null,
      startDate: a.startDate,
      endDate: end,
    });
  }

  const people: TimelinePerson[] = [];
  for (const [workerId, p] of byPerson) {
    const bars: TimelineBar[] = [];
    let outsideWindow = 0;
    for (const r of p.raw) {
      if (r.endDate < from || r.startDate > to) {
        outsideWindow += 1;
        continue;
      }
      const visStart = r.startDate < from ? from : r.startDate;
      const visEnd = r.endDate > to ? to : r.endDate;
      const left = (toMs(visStart) - startMs) / DAY_MS;
      const span = (toMs(visEnd) - toMs(visStart)) / DAY_MS + 1;
      const conflict = p.raw.some(
        (o) =>
          o !== r &&
          rangesOverlapInclusive(r.startDate, r.endDate, o.startDate, o.endDate),
      );
      bars.push({
        key: r.key,
        kind: r.kind,
        label: r.label,
        startDate: r.startDate,
        endDate: r.endDate,
        leftPct: (left / days) * 100,
        widthPct: (span / days) * 100,
        conflict,
        clippedStart: r.startDate < from,
        clippedEnd: r.endDate > to,
      });
    }
    bars.sort((a, b) => (a.startDate === b.startDate ? a.key.localeCompare(b.key) : a.startDate < b.startDate ? -1 : 1));
    people.push({ workerId, name: p.name, bars, outsideWindow });
  }
  // People with something visible first, then by first bar; stable by name.
  people.sort((a, b) => {
    const av = a.bars.length > 0 ? 0 : 1;
    const bv = b.bars.length > 0 ? 0 : 1;
    if (av !== bv) return av - bv;
    const as = a.bars[0]?.startDate ?? "";
    const bs = b.bars[0]?.startDate ?? "";
    if (as !== bs) return as < bs ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  const ticks: TimelineTick[] = [];
  for (let i = 0; i < days; i++) {
    const day = shiftDay(from, i);
    // A tick on every Monday and on the first visible day.
    if (i === 0 || (new Date(toMs(day)).getUTCDay() + 6) % 7 === 0) {
      ticks.push({ day, leftPct: (i / days) * 100 });
    }
  }
  const todayIdx = (toMs(today) - startMs) / DAY_MS;
  const todayPct = todayIdx >= 0 && todayIdx < days ? ((todayIdx + 0.5) / days) * 100 : null;
  return { from, to, days, ticks, people, todayPct };
}

export interface ProjectTimelineBar {
  readonly key: string;
  readonly workerId: string;
  readonly name: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly leftPct: number;
  readonly widthPct: number;
  /** This person has an overlapping commitment or absence elsewhere. */
  readonly conflict: boolean;
}

export interface ProjectTimelineRow {
  readonly projectId: string;
  readonly label: string | null;
  readonly bars: readonly ProjectTimelineBar[];
}

/**
 * THE SAME TIMELINE, READ BY PROJECT — which project has whom, when. A pure
 * regrouping of the per-person bars (no new read): each `project` bar becomes
 * a person-bar on its project's row. The conflict flag stays the person's, so
 * a project row shows that someone assigned to it is also somewhere else.
 */
export function groupTimelineByProject(timeline: RosterTimeline): ProjectTimelineRow[] {
  const rows = new Map<string, { label: string | null; bars: ProjectTimelineBar[] }>();
  for (const person of timeline.people) {
    for (const b of person.bars) {
      if (b.kind !== "project") continue;
      const projectId = b.key.slice("project:".length);
      const row = rows.get(projectId) ?? { label: b.label, bars: [] };
      if (!row.label && b.label) row.label = b.label;
      row.bars.push({
        key: `${projectId}:${person.workerId}`,
        workerId: person.workerId,
        name: person.name,
        startDate: b.startDate,
        endDate: b.endDate,
        leftPct: b.leftPct,
        widthPct: b.widthPct,
        conflict: b.conflict,
      });
      rows.set(projectId, row);
    }
  }
  return [...rows.entries()]
    .map(([projectId, r]) => ({ projectId, label: r.label, bars: r.bars }))
    .sort(
      (a, b) =>
        (a.bars[0]?.startDate ?? "").localeCompare(b.bars[0]?.startDate ?? "") ||
        (a.label ?? "").localeCompare(b.label ?? ""),
    );
}
