/**
 * THE CAREER JOURNEY — the Living CV drawn as a route (Future Experience B,
 * owner decision 2026-10-14): projects and engagements are STOPS, skills are
 * LINES, and the horizon past "now" holds directions the person's own
 * evidence points to. A pure projection of what the Living CV already read
 * (`VerifiedCv`): no new read, no new figure, no score.
 *
 * HONESTY (each rule pinned by `career-journey.test.ts`):
 *   - A line stops at a station ONLY when the journal links them: the skill's
 *     entries belong to that engagement context (`contextIds`). Overlapping
 *     dates never create a stop — temporal proximity is not evidence.
 *   - A line's style is its evidence tier, never a colour judgement:
 *     confirmed (a second party approved work behind it) · recorded (the
 *     person's journal backs it) · declared (said, nothing recorded — such a
 *     line has no stops and is drawn as a hollow stub).
 *   - Organization-provided history is a station with no lines unless the
 *     journal links it; its level is the organization's own proof.
 *   - A stretch of time with no station longer than `GAP_MIN_DAYS` is a GAP:
 *     unknown, never zero, never a failure.
 *   - The horizon is DERIVED (adjacent directions from the growth reading);
 *     every item carries `basis: "derived"` and the evidence it rests on.
 *   - An unreadable journal (`practice === null`) is UNKNOWN: lines are
 *     drawn without stops and the journey says the links could not be read.
 *
 * Pure and deterministic: no IO, no `Date`, no locale.
 */

export type JourneyLevel = "confirmed" | "recorded" | "declared";

export type JourneyStationInput = {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** ISO day the stop began; null = undated. */
  readonly from: string | null;
  /** ISO day it ended; null with `current` = still running. */
  readonly to: string | null;
  readonly current: boolean;
  readonly source: "own" | "organization";
  readonly level: JourneyLevel;
  /** engagement_contexts.id — the key skill lines are joined on. */
  readonly contextId: string | null;
  readonly hours: number | null;
  readonly confirmedHours: number | null;
};

export type JourneySkillInput = {
  readonly slug: string;
  readonly tier: "confirmed" | "evidence" | "declared";
  readonly attributedHours: number;
  readonly confirmedHours: number;
};

/** The journal's per-skill context links, keyed by slug. `null` = unread. */
export type JourneyPractice = Readonly<Record<string, { readonly contextIds: readonly string[] }>> | null;

export type JourneyHorizonInput = {
  readonly professionId: string;
  readonly sharedSkills: readonly string[];
  readonly missingSkills: readonly string[];
};

export type JourneyStation = JourneyStationInput & {
  /** Position on the time axis (days since the first dated stop). */
  readonly startDay: number;
  readonly endDay: number;
  /** Skill lines that truly stop here, by slug. */
  readonly lines: readonly string[];
};

export type JourneyLine = {
  readonly slug: string;
  readonly level: JourneyLevel;
  readonly attributedHours: number;
  readonly confirmedHours: number;
  /** Station keys in time order. Empty for a declared skill or an unread journal. */
  readonly stops: readonly string[];
};

export type JourneyGap = { readonly fromDay: number; readonly toDay: number; readonly from: string; readonly to: string };

export type JourneyHorizonItem = JourneyHorizonInput & { readonly basis: "derived" };

export type CareerJourney = {
  /** Dated stations in time order (the map). */
  readonly stations: readonly JourneyStation[];
  /** Stations with no date — listed, never placed on the axis. */
  readonly undated: readonly JourneyStationInput[];
  readonly lines: readonly JourneyLine[];
  readonly gaps: readonly JourneyGap[];
  readonly horizon: readonly JourneyHorizonItem[];
  /** Total span of the axis in days (0 when fewer than one dated stop). */
  readonly spanDays: number;
  /** The first dated day of the axis (ISO), or null. */
  readonly axisStart: string | null;
  /** The last day of the axis: `todayIso` when a stop is current, else the last end. */
  readonly axisEnd: string | null;
  /** The journal's skill↔context links could not be read. */
  readonly linksUnknown: boolean;
};

export const JOURNEY_LINES_MAX = 6;
export const JOURNEY_HORIZON_MAX = 3;
/** A stretch without any stop longer than this is drawn as a gap. */
export const GAP_MIN_DAYS = 90;

const DAY = /^\d{4}-\d{2}-\d{2}/;
const dayNum = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

const TIER_LEVEL: Record<JourneySkillInput["tier"], JourneyLevel> = {
  confirmed: "confirmed",
  evidence: "recorded",
  declared: "declared",
};
const LEVEL_RANK: Record<JourneyLevel, number> = { confirmed: 0, recorded: 1, declared: 2 };

export function deriveCareerJourney(input: {
  readonly stations: readonly JourneyStationInput[];
  readonly skills: readonly JourneySkillInput[];
  readonly practice: JourneyPractice;
  readonly horizon: readonly JourneyHorizonInput[];
  /** UTC day "now" is drawn at. */
  readonly todayIso: string;
}): CareerJourney {
  const today = dayNum(input.todayIso);
  const dated = input.stations.filter((s) => s.from && DAY.test(s.from));
  const undated = input.stations.filter((s) => !(s.from && DAY.test(s.from)));

  const first = dated.length > 0 ? Math.min(...dated.map((s) => dayNum(s.from!))) : today;
  const placed = dated
    .map((s) => {
      const start = dayNum(s.from!);
      const endRaw = s.current || !s.to || !DAY.test(s.to) ? (s.current ? today : start) : dayNum(s.to);
      const end = Math.max(start, endRaw);
      return { s, start: start - first, end: end - first };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.s.key.localeCompare(b.s.key));

  // Lines: evidence first, then the person's own hours; a listing order,
  // never a rank of the person.
  const chosen = [...input.skills]
    .sort(
      (a, b) =>
        LEVEL_RANK[TIER_LEVEL[a.tier]] - LEVEL_RANK[TIER_LEVEL[b.tier]] ||
        b.attributedHours - a.attributedHours ||
        a.slug.localeCompare(b.slug),
    )
    .slice(0, JOURNEY_LINES_MAX);

  const linesAt = new Map<string, string[]>();
  const lines: JourneyLine[] = chosen.map((skill) => {
    const level = TIER_LEVEL[skill.tier];
    const contexts =
      level === "declared" || input.practice === null
        ? new Set<string>()
        : new Set(input.practice[skill.slug]?.contextIds ?? []);
    const stops = placed
      .filter((p) => p.s.contextId !== null && contexts.has(p.s.contextId))
      .map((p) => p.s.key);
    for (const key of stops) linesAt.set(key, [...(linesAt.get(key) ?? []), skill.slug]);
    return {
      slug: skill.slug,
      level,
      attributedHours: skill.attributedHours,
      confirmedHours: skill.confirmedHours,
      stops,
    };
  });

  const stations: JourneyStation[] = placed.map((p) => ({
    ...p.s,
    startDay: p.start,
    endDay: p.end,
    lines: linesAt.get(p.s.key) ?? [],
  }));

  // Gaps: uncovered stretches between stops (coverage merged over overlaps).
  const gaps: JourneyGap[] = [];
  let coveredUntil = stations.length > 0 ? stations[0].endDay : 0;
  for (const st of stations.slice(1)) {
    if (st.startDay - coveredUntil > GAP_MIN_DAYS) {
      gaps.push({
        fromDay: coveredUntil,
        toDay: st.startDay,
        from: isoOf(first + coveredUntil),
        to: isoOf(first + st.startDay),
      });
    }
    coveredUntil = Math.max(coveredUntil, st.endDay);
  }

  const spanDays = stations.length > 0 ? Math.max(...stations.map((s) => s.endDay)) : 0;
  return {
    stations,
    undated,
    lines,
    gaps,
    horizon: input.horizon.slice(0, JOURNEY_HORIZON_MAX).map((h) => ({ ...h, basis: "derived" as const })),
    spanDays,
    axisStart: stations.length > 0 ? isoOf(first) : null,
    axisEnd: stations.length > 0 ? isoOf(first + spanDays) : null,
    linksUnknown: input.practice === null,
  };
}
