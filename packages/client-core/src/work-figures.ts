/**
 * WORK FIGURES — how a client SHOWS what `journal.work_intelligence.get` and
 * `living_cv.skills.get` returned. Pure, framework-free, no arithmetic over
 * journal lines: every number here is a field the server's one reader
 * (`apps/web/lib/journal/work-intelligence.ts`) already derived, picked out
 * and ordered for a screen. Nothing is re-summed, re-scored or defaulted.
 *
 * ONE PRODUCT, ONE TRUTH (owner requirement 17, #1724): the phone's "today"
 * and "profile" show the same figures the web's ŠIANDIEN and Living CV show,
 * in the same order — hours · share · entries per skill, strongest evidence
 * first. The order rule mirrors `apps/web/lib/cv-export/skill-presentation.ts`
 * (confirmed → work-supported → declared → self-stated); it is an ORDER over
 * server facts (`verified`, `source`, the journal's own per-skill figures),
 * not a tier the device awards. The platform's tier WORDS are not claimed
 * here — each group is labelled by the fact it rests on.
 *
 * UNKNOWN ≠ ZERO: when the figures could not be read (`figures === null`)
 * every skill carries `figures: null` and a screen says the figures could
 * not be read — never 0 h.
 */

/** Mirror of one `periods` row of `journal.work_intelligence.get`. */
export type WorkPeriodFigures = {
  readonly key: string;
  readonly startIso: string | null;
  readonly endIso: string;
  readonly hours: number;
  readonly confirmedHours: number;
  readonly dayUnits: number;
  readonly entries: number;
  readonly daysWorked: number;
};

/** Mirror of one `skills` row of `journal.work_intelligence.get`. */
export type WorkSkillFigures = {
  readonly slug: string;
  readonly attributedHours: number;
  readonly confirmedHours: number;
  readonly sharedHours: number;
  /** Share of the person's ATTRIBUTED hours in the scope, 0..1. */
  readonly share: number;
  readonly entries: number;
  readonly days: number;
  readonly contexts: number;
  readonly firstWorkedDay: string | null;
  readonly lastWorkedDay: string | null;
  readonly trend: "up" | "down" | "flat" | "new" | "none";
};

export type WorkActivityFigures = {
  readonly key: string;
  readonly hours: number;
  readonly share: number;
  readonly entries: number;
  readonly lastWorkedDay: string | null;
  readonly trend: "up" | "down" | "flat" | "new" | "none";
};

export type WorkCoverage = {
  readonly entriesRead: number;
  readonly truncated: boolean;
  readonly linksTruncated: boolean;
};

/** The payload of `journal.work_intelligence.get`, as the client reads it. */
export type WorkIntelligenceData = {
  readonly workerId: string;
  readonly scope: string;
  readonly periods: readonly WorkPeriodFigures[];
  readonly skills: readonly WorkSkillFigures[];
  readonly activities: readonly WorkActivityFigures[];
  readonly coverage: WorkCoverage;
};

/** One `living_cv.skills.get` row. */
export type LivingCvSkillRow = {
  readonly skillId: string;
  readonly slug: string | null;
  readonly verified: boolean;
  readonly source: string | null;
};

/** The period row for `key`, or null when the server did not send one —
 *  a missing row is UNKNOWN, never an empty row. */
export function periodFigures(
  data: Pick<WorkIntelligenceData, "periods">,
  key: string,
): WorkPeriodFigures | null {
  return data.periods.find((p) => p.key === key) ?? null;
}

/**
 * The skill that claims the largest share of the person's attributed hours
 * in the payload's scope — the server already orders `skills` by hours,
 * so this is the first row that actually claims hours. `null` when no
 * skill claims any (attribution needs a single linked skill or a fragment
 * link; involvement alone is not a share).
 */
export function dominantSkill(
  skills: readonly WorkSkillFigures[],
): WorkSkillFigures | null {
  let best: WorkSkillFigures | null = null;
  for (const s of skills) {
    if (s.attributedHours <= 0 || s.share <= 0) continue;
    if (best === null || s.share > best.share) best = s;
  }
  return best;
}

/** Which recorded FACT a profile group rests on. */
export type ProfileSkillGroupKey =
  /** `verified === true` — a manager confirmed the skill (recorded, with a
   *  confirmer behind it). */
  | "manager_confirmed"
  /** The Work Journal backs it: the reader attributes entries to it, or the
   *  row's own `source` is the journal. */
  | "journal_backed"
  /** The person's own declaration, nothing recorded against it yet. */
  | "declared";

export const PROFILE_SKILL_GROUP_ORDER: readonly ProfileSkillGroupKey[] = [
  "manager_confirmed",
  "journal_backed",
  "declared",
];

export type ProfileSkillItem = {
  readonly skillId: string;
  readonly slug: string | null;
  readonly verified: boolean;
  readonly source: string | null;
  /** The journal's own figures for this skill; `null` = none recorded when
   *  figures were readable, or UNKNOWN when they were not (see the group). */
  readonly figures: WorkSkillFigures | null;
};

export type ProfileSkillGroup = {
  readonly key: ProfileSkillGroupKey;
  readonly items: readonly ProfileSkillItem[];
};

export type ProfileSkillPresentation = {
  readonly groups: readonly ProfileSkillGroup[];
  /** False when the figures read failed: no item carries a figure, and the
   *  screen must say so rather than show 0. */
  readonly figuresReadable: boolean;
  /** What this payload cannot show: free-text capabilities the person
   *  noted in their own words (`self_stated` on the web) are not carried by
   *  `living_cv.skills.get`. Always true today; a screen says it. */
  readonly selfStatedMissing: true;
};

function groupOf(row: LivingCvSkillRow, figures: WorkSkillFigures | null): ProfileSkillGroupKey {
  if (row.verified === true) return "manager_confirmed";
  if (row.source === "work_journal") return "journal_backed";
  if (figures !== null && (figures.entries > 0 || figures.attributedHours > 0)) {
    return "journal_backed";
  }
  return "declared";
}

/**
 * Skills for the profile screen: grouped by the fact behind them, strongest
 * first; within a group by attributed hours, then entries, then the stored
 * order (a stable sort keeps it). Two rows for one slug stay two rows —
 * this client never merges what the server stored.
 */
export function presentProfileSkills(
  rows: readonly LivingCvSkillRow[],
  figures: readonly WorkSkillFigures[] | null,
): ProfileSkillPresentation {
  const bySlug = new Map<string, WorkSkillFigures>();
  if (figures !== null) for (const f of figures) bySlug.set(f.slug, f);

  const buckets = new Map<ProfileSkillGroupKey, ProfileSkillItem[]>();
  for (const key of PROFILE_SKILL_GROUP_ORDER) buckets.set(key, []);
  for (const row of rows) {
    const f = row.slug !== null ? (bySlug.get(row.slug) ?? null) : null;
    const item: ProfileSkillItem = {
      skillId: row.skillId,
      slug: row.slug,
      verified: row.verified,
      source: row.source,
      figures: f,
    };
    buckets.get(groupOf(row, f))!.push(item);
  }

  const byMagnitude = (a: ProfileSkillItem, b: ProfileSkillItem): number => {
    const h = (b.figures?.attributedHours ?? 0) - (a.figures?.attributedHours ?? 0);
    if (h !== 0) return h;
    return (b.figures?.entries ?? 0) - (a.figures?.entries ?? 0);
  };

  const groups: ProfileSkillGroup[] = [];
  for (const key of PROFILE_SKILL_GROUP_ORDER) {
    const items = buckets.get(key)!;
    if (items.length === 0) continue;
    groups.push({ key, items: [...items].sort(byMagnitude) });
  }
  return { groups, figuresReadable: figures !== null, selfStatedMissing: true };
}

/** Hours for a screen: at most one decimal, no trailing ".0". A real figure
 *  is never rounded away to nothing — 0.04 h shows as "<0.1", not "0". */
export function formatHours(hours: number): string {
  if (hours > 0 && hours < 0.05) return "<0.1";
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A 0..1 share as a whole percent string ("60%"). A real share below
 *  0.5 % shows as "<1%", never as "0%". */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}
