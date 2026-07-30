import type { WorkHistoryEntry } from "./work-history-model";

/**
 * §5.2 PLAYER CARD VISUALS — PURE derivations for the card's real data
 * visualizations (owner visual acceptance 2026, stage 1 after the
 * false-completion postmortem).
 *
 * The owner's §5.2 requirement is explicit: the card must carry professional
 * graphs and data visualizations, not a list of textual statistics. These
 * functions turn ALREADY-FETCHED real rows into geometry. No DB, no RLS, no
 * clock reading of their own (the caller passes `now`), so every output is
 * deterministic and unit-testable.
 *
 * HONESTY RULES BAKED IN (same contract as the rest of the card):
 *  - a month with no entries is a real zero, never smoothed or interpolated;
 *  - a skill with no linked evidence keeps `entries: 0` — the gap is the
 *    information, and it is never padded to make the chart look fuller;
 *  - an engagement without a start date CANNOT be placed on a timeline, so it
 *    is counted separately instead of being invented into a position;
 *  - nothing here produces a score, a rating, a rank or a tier of the person.
 *    A bar length is a COUNT of that person's own records, nothing more.
 */

/** One month of the worker's own work-journal evidence. */
export interface EvidenceMonth {
  /** `YYYY-MM` — the calendar month this count belongs to. */
  readonly month: string;
  /** Real count of the worker's own live journal entries created that month. */
  readonly entries: number;
}

/** The honest evidence ladder. NOT a score and NOT a medal tier. */
export type SkillEvidenceTier = "verified" | "journal" | "declared";

/** One skill and how much of the worker's own journal evidence backs it. */
export interface SkillEvidenceBar {
  /** Canonical catalogue slug — the caller resolves it to a locale name. */
  readonly slug: string;
  /** Real count of the worker's own journal entries linked to this skill. */
  readonly entries: number;
  readonly tier: SkillEvidenceTier;
}

/** One engagement placed on the history band, in 0..1 fractions. */
export interface HistoryLane {
  readonly id: string;
  /** Organization name, else the engagement title. Null is never rendered. */
  readonly label: string;
  readonly startFraction: number;
  readonly endFraction: number;
  readonly current: boolean;
}

/** The work-history band: placed engagements + real year ticks. */
export interface HistoryTimeline {
  readonly lanes: readonly HistoryLane[];
  readonly ticks: readonly { readonly year: number; readonly fraction: number }[];
  /** Engagements that exist but carry no start date, so cannot be placed. */
  readonly undatedCount: number;
  /** The real span the band covers, ISO dates. */
  readonly fromIso: string | null;
  readonly toIso: string | null;
}

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM` for a date, in UTC (the storage timezone of `created_at`). */
function monthKey(d: Date): string {
  const m = d.getUTCMonth() + 1;
  return `${d.getUTCFullYear()}-${m < 10 ? "0" : ""}${m}`;
}

/**
 * Bucket real `journal_entries.created_at` values into the last `months`
 * calendar months, ending with the month `now` falls in.
 *
 * Every returned month is a real calendar month in ascending order, so the
 * chart's x-axis is continuous even where the worker logged nothing. Values
 * outside the window are ignored rather than folded into the edge bucket —
 * folding would overstate the first column.
 */
export function deriveEvidenceTimeline(
  createdAtIso: readonly string[],
  now: Date,
  months = 12,
): EvidenceMonth[] {
  const span = Math.max(1, Math.floor(months));
  const keys: string[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    keys.push(
      monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))),
    );
  }
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const iso of createdAtIso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue; // unparseable → not counted
    const k = monthKey(d);
    const current = counts.get(k);
    if (current === undefined) continue; // outside the window, not folded in
    counts.set(k, current + 1);
  }
  return keys.map((month) => ({ month, entries: counts.get(month) ?? 0 }));
}

/** A skill link row as the server read hands it over. */
export interface SkillEvidenceLink {
  readonly slug: string | null;
}

/** A declared/catalogued skill row as the core reader hands it over. */
export interface DeclaredSkillRow {
  readonly slug: string | null;
  readonly verified: boolean | null;
  readonly source: string | null;
}

/**
 * Build the skill-evidence bars: every catalogued skill the worker has, with
 * the REAL number of their own journal entries linked to it.
 *
 * Sorted by evidence descending, then alphabetically so the order is stable
 * between renders. Skills with zero linked entries are KEPT (bounded by
 * `limit`) because "declared, no evidence yet" is exactly the gap the card is
 * supposed to make visible — but they can never outrank a skill that has
 * evidence.
 */
export function deriveSkillEvidence(
  links: readonly SkillEvidenceLink[],
  declared: readonly DeclaredSkillRow[],
  limit = 8,
): SkillEvidenceBar[] {
  const counts = new Map<string, number>();
  for (const l of links) {
    const slug = (l.slug ?? "").trim();
    if (slug === "") continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  const tiers = new Map<string, SkillEvidenceTier>();
  for (const d of declared) {
    const slug = (d.slug ?? "").trim();
    if (slug === "") continue;
    const tier: SkillEvidenceTier = d.verified
      ? "verified"
      : d.source === "work_journal"
        ? "journal"
        : "declared";
    // A worker can hold several rows for one skill; the strongest real tier
    // wins — never the weakest, and never an averaged/invented one.
    const rank: Record<SkillEvidenceTier, number> = {
      declared: 0,
      journal: 1,
      verified: 2,
    };
    const existing = tiers.get(slug);
    if (existing === undefined || rank[tier] > rank[existing]) {
      tiers.set(slug, tier);
    }
  }

  const slugs = new Set<string>([...counts.keys(), ...tiers.keys()]);
  const bars: SkillEvidenceBar[] = [...slugs].map((slug) => ({
    slug,
    entries: counts.get(slug) ?? 0,
    // A skill that only appears through a journal link is journal-backed by
    // definition; without a declared row it cannot be "verified".
    tier: tiers.get(slug) ?? "journal",
  }));

  bars.sort((a, b) =>
    b.entries !== a.entries ? b.entries - a.entries : a.slug < b.slug ? -1 : 1,
  );
  return bars.slice(0, Math.max(0, Math.floor(limit)));
}

/**
 * Place real engagements on a single time band.
 *
 * The band spans from the earliest real start date to the latest real end
 * date (or `now` while something is still running). Rows without a start date
 * are counted in `undatedCount` — the timeline never guesses a position.
 * A single-day span still renders a visible segment rather than a zero-width
 * artefact, but the label carries the real dates, so nothing is overstated.
 */
export function deriveWorkHistoryTimeline(
  entries: readonly WorkHistoryEntry[],
  now: Date,
): HistoryTimeline {
  const placeable = entries.filter(
    (e) =>
      e.startedAt !== null &&
      !Number.isNaN(new Date(e.startedAt).getTime()) &&
      ((e.organizationName ?? e.title ?? "").trim().length > 0),
  );
  const undatedCount = entries.length - placeable.length;
  if (placeable.length === 0) {
    return { lanes: [], ticks: [], undatedCount, fromIso: null, toIso: null };
  }

  const startMs = placeable.map((e) => new Date(e.startedAt as string).getTime());
  const endMs = placeable.map((e) => {
    if (e.current || e.endedAt === null) return now.getTime();
    const t = new Date(e.endedAt).getTime();
    return Number.isNaN(t) ? now.getTime() : t;
  });

  const min = Math.min(...startMs);
  const max = Math.max(...endMs, min + MS_PER_DAY);
  const span = max - min;
  const frac = (t: number): number =>
    Math.max(0, Math.min(1, (t - min) / span));

  const lanes: HistoryLane[] = placeable.map((e, i) => {
    const s = frac(startMs[i]);
    const raw = frac(endMs[i]);
    return {
      id: e.id,
      label: (e.organizationName ?? e.title ?? "").trim(),
      startFraction: s,
      // Keep a minimum visible width for a short engagement, capped at 1.
      endFraction: Math.min(1, Math.max(raw, s + 0.02)),
      current: e.current,
    };
  });

  const ticks: { year: number; fraction: number }[] = [];
  const firstYear = new Date(min).getUTCFullYear();
  const lastYear = new Date(max).getUTCFullYear();
  for (let y = firstYear; y <= lastYear; y += 1) {
    const t = Date.UTC(y, 0, 1);
    if (t < min || t > max) continue;
    ticks.push({ year: y, fraction: frac(t) });
  }

  return {
    lanes,
    ticks,
    undatedCount,
    fromIso: new Date(min).toISOString().slice(0, 10),
    toIso: new Date(max).toISOString().slice(0, 10),
  };
}

/** True when there is genuinely something to draw. Used by the card to decide
 *  between a chart and an honest empty line — never to hide a real zero. */
export function hasEvidenceToPlot(timeline: readonly EvidenceMonth[]): boolean {
  return timeline.some((m) => m.entries > 0);
}
