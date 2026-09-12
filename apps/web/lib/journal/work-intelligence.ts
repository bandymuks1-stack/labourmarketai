/**
 * WORK INTELLIGENCE — what a person's recorded work adds up to. Pure: no IO,
 * no persistence, no AI, no clock of its own (the caller passes `todayIso`).
 *
 * This is the attribution + aggregation layer OVER the one canonical
 * work-time rule (`deriveEntryWorkTime`, owner ruling 2026-08-18). It never
 * re-derives an hour: every figure here is a sum of lines that rule produced,
 * and every entry is counted exactly ONCE in every total. The chain it
 * completes (issue #1689, owner direction §4–§7):
 *
 *   REAL ACTIVITY + DATE + DURATION + CONTEXT   (journal entry + metrics)
 *     → ACTIVITY / WORK PACKAGE                  (fragment activity, direction)
 *     → SKILLS ACTUALLY USED                     (journal_entry_skills links)
 *     → EVIDENCE / PROVENANCE                    (metric source, document,
 *                                                 photo, confirmation)
 *     → CUMULATIVE HOURS · FREQUENCY · RECENCY   (this module)
 *     → LIVING CV · ANALYTICS · ADJACENCY        (this module → consumers)
 *
 * ── FOUR KINDS OF TIME, KEPT APART (owner rule §5) ────────────────────────
 *   ENTRY WORKED TIME      the entry's canonical duration — counted once;
 *   ACTIVITY TIME          hours on the SAME fragment as an activity label,
 *                          or the entry's own direction for an entry-level
 *                          duration — a direct evidence relation;
 *   SKILL INVOLVEMENT      a skill was linked to an entry — counted as
 *                          entries / days / contexts, and as `involvedHours`
 *                          (the worked time of entries it took part in —
 *                          shown as involvement, never summed across skills);
 *   ATTRIBUTABLE PRACTICE  hours a skill can actually claim: entries where
 *                          it is the ONLY linked skill, plus — on any other
 *                          entry — the fragments whose OWN duration the
 *                          link was recognised on (`fragment_skill` rows,
 *                          written by the skill pipeline / the worker's
 *                          confirmation; see fragment-skill-evidence.ts)
 *                          when exactly one linked skill sits on that
 *                          fragment.
 *
 * An 8-hour entry linked to four skills is 8 hours of work, four skills
 * involved, and ZERO attributable hours for each — never 32. There is no
 * evidence for the split and the product refuses to guess one. The same
 * caution runs the other way: an entry whose OWN timed fragments say the
 * time was split ("6 h tiles, 2 h plaster" — or three timed parts with no
 * kind of work named at all) but carries one linked skill is not 8 h of
 * that skill either — the evidence says the time was split, so
 * unless the link says WHERE (a `fragment_skill` row on the 6 h fragment →
 * 6 h of tiling, the 2 h stay MULTI_ACTIVITY) those hours stay involvement
 * and are split by ACTIVITY only. Every hour is still counted once:
 * attributed + shared + multi-activity + unattributed = total.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * Nothing here is a score, a rating, a rank or a tier OF THE PERSON. A share
 * is a fraction of that person's own attributed hours; a tier is the evidence
 * ladder of one skill row (`lib/evidence/evidence-tier.ts`); recency is a
 * date; a trend compares two windows of the person's own hours. `days`-unit
 * durations stay in day units (no invented workday) and a non-time quantity
 * is OUTPUT, never time (`work-time.ts` already refuses both).
 */

import {
  deriveEntryWorkTime,
  isWorkTimeUnit,
  type EntryWorkTime,
  type WorkTimeMetricRow,
} from "@/lib/journal/work-time";
import {
  deriveEvidenceTier,
  EVIDENCE_TIER_RANK,
  type EvidenceTier,
} from "@/lib/evidence/evidence-tier";
import type { EntrySkillProvenance } from "@/lib/journal/entry-skill-source";
import { fragmentSkillsByIndex } from "@/lib/journal/fragment-skill-evidence";
import {
  deriveWorkTimeChecks,
  type WorkTimeCheck,
} from "@/lib/journal/work-time-plausibility";
import { SOURCE_DOCUMENT_METRIC_SLUG } from "@/lib/journal/document-journal-draft-model";

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One live journal entry as this module needs to read it. */
export type WorkIntelligenceEntry = {
  readonly entryId: string;
  readonly createdAt: string;
  readonly originalText?: string | null;
  readonly metrics: readonly WorkTimeMetricRow[];
  readonly engagementContextId: string | null;
  /** The entry's current review result — `approved` is the ONLY value that
   *  counts hours as confirmed. Derived by the caller from the confirmation
   *  rows (`deriveReviewResult`); never inferred here. */
  readonly reviewResult: "submitted" | "approved" | "rejected" | "changes_requested";
  /** The worker's own durable skill links on this entry (skill ids). */
  readonly linkedSkillIds: readonly string[];
  /** Stored write-time provenance per linked skill id (null pre-migration). */
  readonly linkProvenance?: ReadonlyMap<string, EntrySkillProvenance | null>;
  /** Uploaded photos on this entry, when the caller read them (0 = none
   *  read OR none uploaded — the caller decides whether photos were read). */
  readonly photoCount?: number;
};

/** A declared skill row (worker_skills) as the core reader hands it over. */
export type WorkIntelligenceSkillRow = {
  readonly skillId: string;
  readonly slug: string;
  readonly verified: boolean | null;
  readonly source: string | null;
};

export type WorkPeriodKey = "today" | "week" | "month" | "year" | "all";
export const WORK_PERIOD_KEYS = ["today", "week", "month", "year", "all"] as const;

export type WorkIntelligenceInput = {
  readonly entries: readonly WorkIntelligenceEntry[];
  readonly skills: readonly WorkIntelligenceSkillRow[];
  /** UTC calendar day the periods end on (inclusive). */
  readonly todayIso: string;
  /** The period the skill / activity / context / output / provenance
   *  sections describe. `periods` and `months` are always computed over
   *  everything. Defaults to `all`. */
  readonly focus?: WorkPeriodKey;
};

/** Inclusive UTC calendar-day windows ending today (W12 doctrine: dates are
 *  UTC calendar days; week = 7, month = 30, year = 365 — stated as such). */
const PERIOD_DAYS: Record<Exclude<WorkPeriodKey, "all">, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Totals for one period. Every entry counted once. */
export type WorkPeriodTotals = {
  readonly key: WorkPeriodKey;
  /** First day (inclusive) — null for `all`. */
  readonly startIso: string | null;
  readonly endIso: string;
  readonly hours: number;
  /** `days`-unit durations, kept apart — never converted to hours. */
  readonly dayUnits: number;
  /** Hours on entries a manager/client APPROVED. Self-reported = hours − this. */
  readonly confirmedHours: number;
  /** Of `dayUnits`, the part on approved entries — work recorded in days
   *  has its own confirmed figure, never a converted one (re-audit F5). */
  readonly confirmedDayUnits: number;
  readonly entries: number;
  /** Entries in the period that record no usable duration at all. */
  readonly entriesWithoutDuration: number;
  /** Distinct calendar days that carry at least one duration line — an
   *  hour line or a `days`-unit line. */
  readonly daysWorked: number;
};

export type SkillTimeBasis = "attributed" | "shared" | "multi_activity" | "none";

/** One skill and what the person's own recorded work says about it. */
export type SkillWorkTime = {
  readonly skillId: string;
  readonly slug: string;
  /** The evidence ladder of the skill row itself — never a person tier. */
  readonly tier: EvidenceTier;
  /** ATTRIBUTABLE PRACTICE: hours from entries where this was the ONLY
   *  linked skill, plus fragments the link was recognised on (see the
   *  module header). */
  readonly attributedHours: number;
  /** Of `attributedHours`, the part on approved entries. */
  readonly confirmedHours: number;
  /** INVOLVEMENT: worked time of entries this skill shares with other
   *  linked skills — shown as involvement, never summed into attributed
   *  figures and never into the person's total twice. */
  readonly sharedHours: number;
  /** Distinct entries linked to this skill (frequency). */
  readonly entries: number;
  /** Distinct calendar days with a linked entry (frequency). */
  readonly days: number;
  /** Distinct engagement contexts the linked entries belong to (diversity). */
  readonly contexts: number;
  /** The most recent day a linked entry was worked, or null. */
  readonly lastWorkedDay: string | null;
  /** Share of the person's own ATTRIBUTED hours, 0..1 (0 when none). */
  readonly share: number;
  /** How many of the linked entries were RECOGNIZED from the text, the
   *  worker's MANUAL link, or confirmed — the provenance behind the link. */
  readonly provenance: {
    readonly recognized: number;
    readonly manual: number;
    readonly confirmed: number;
    /** Historic links written before provenance existed. */
    readonly unrecorded: number;
  };
};

/** Direction of the person's own hours: the focus window's last 30 days
 *  against the 30 days before them. `new` = nothing before, something now;
 *  `none` = nothing in either. Never a forecast. */
export type WorkTrend = "up" | "down" | "flat" | "new" | "none";

/** Hours per activity / work package — the label the worker's own metric
 *  carried against that duration (a profession slug or free text). */
export type ActivityWorkTime = {
  readonly key: string;
  readonly hours: number;
  /** Share of ALL recorded hours in the focus period, 0..1 — the timed
   *  parts that carry no kind-of-work label stay in the denominator
   *  (`unlabelledHours` names them), so a "main activity" is never chosen
   *  from a partial base (re-audit F2). */
  readonly share: number;
  readonly entries: number;
  readonly contexts: number;
  readonly lastWorkedDay: string | null;
  readonly trend: WorkTrend;
};

export type ContextWorkTime = {
  readonly engagementContextId: string | null;
  readonly hours: number;
  readonly confirmedHours: number;
  readonly entries: number;
};

export type MonthWorkTime = {
  /** `YYYY-MM` */
  readonly month: string;
  readonly hours: number;
  readonly confirmedHours: number;
  readonly entries: number;
};

/** OUTPUT — completed quantities in their RECORDED unit (m², pieces, …).
 *  Never converted, never mixed across units, never time. */
export type OutputTotal = {
  readonly unit: string;
  readonly value: number;
  readonly entries: number;
};

/** Where the derived hours came from, by the metric row's own `source`. */
export type ProvenanceSplit = {
  readonly workerInput: number;
  readonly aiExtracted: number;
  readonly managerCorrected: number;
  readonly unknown: number;
};

/** EVIDENCE STRENGTH — how many entries in the focus window carry each kind
 *  of backing. Counts, not a score: an entry may hold several. */
export type EvidenceStrength = {
  readonly entries: number;
  readonly confirmed: number;
  readonly withPhotos: number;
  readonly fromDocument: number;
  /** Entries with none of the above — the person's own record alone. */
  readonly selfOnly: number;
};

export type WorkIntelligence = {
  /** The period every section below `periods` / `months` describes. */
  readonly focus: WorkPeriodKey;
  readonly periods: readonly WorkPeriodTotals[];
  /** Every declared skill, hours desc (declared-only skills at zero). */
  readonly skills: readonly SkillWorkTime[];
  readonly activities: readonly ActivityWorkTime[];
  readonly contexts: readonly ContextWorkTime[];
  /** Oldest → newest, only months that carry at least one entry. */
  readonly months: readonly MonthWorkTime[];
  readonly outputs: readonly OutputTotal[];
  readonly evidence: EvidenceStrength;
  /** Hours on entries linked to two or more skills (reported once). */
  readonly sharedHours: number;
  readonly sharedEntries: number;
  /** Hours on single-skill entries whose timed fragments say the time was
   *  split (several kinds of work, or timed parts with no kind named) and no
   *  `fragment_skill` row says where — split by activity, never by skill
   *  (reported once). */
  readonly multiActivityHours: number;
  readonly multiActivityEntries: number;
  /** Hours on entries linked to no skill at all (reported once). */
  readonly unattributedHours: number;
  readonly unattributedEntries: number;
  /** Sum of every skill's attributed hours — the denominator of `share`. */
  readonly attributedHours: number;
  /** COVERAGE of the activity reading: hours in the focus period whose
   *  duration line carries a kind-of-work label (the sum of `activities`),
   *  and the timed hours that carry none. `activityHours + unlabelledHours`
   *  = the focus period's hours — nothing vanishes from "kinds of work". */
  readonly activityHours: number;
  readonly unlabelledHours: number;
  /** Entries in the focus period with at least one unlabelled timed hour. */
  readonly unlabelledEntries: number;
  readonly provenance: ProvenanceSplit;
  /** Plausibility checks over the focus period's lines (owner §13): a day
   *  above 24 h, a long day, a single duration longer than a day, an entry-
   *  level duration the rule set aside. Warnings only — no figure above is
   *  changed by them; acknowledged checks stay listed with their reason. */
  readonly checks: readonly WorkTimeCheck[];
  /** All-time hours, for callers that want the one headline figure. */
  readonly totalHours: number;
  readonly totalEntries: number;
};

/** ISO day `days` calendar days before `todayIso` (UTC — never local time). */
function isoDayMinus(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Pure period bounds: inclusive UTC calendar days ending on `todayIso`. */
export function workPeriodBounds(
  key: WorkPeriodKey,
  todayIso: string,
): { startIso: string | null; endIso: string } {
  if (key === "all") return { startIso: null, endIso: todayIso };
  return {
    startIso: isoDayMinus(todayIso, PERIOD_DAYS[key] - 1),
    endIso: todayIso,
  };
}

/** How one entry's hours divide between its linked skills and the rest. */
type EntryAttribution = {
  /** Hours a single linked skill can claim, by skill id. */
  readonly bySkill: ReadonlyMap<string, number>;
  /** Hours no single linked skill can claim (kept as involvement). */
  readonly remainderHours: number;
};

type DerivedEntry = {
  readonly entry: WorkIntelligenceEntry;
  readonly time: EntryWorkTime;
  readonly basis: SkillTimeBasis;
  readonly attribution: EntryAttribution;
};

function inPeriod(
  day: string,
  bounds: { startIso: string | null; endIso: string },
): boolean {
  if (!DAY_RX.test(day)) return false;
  if (bounds.startIso && day < bounds.startIso) return false;
  return day <= bounds.endIso;
}

/**
 * Whether one linked skill may claim the WHOLE entry. It may not when the
 * entry's own timed fragments say the time was split: two or more timed
 * parts that do not all carry the SAME kind-of-work label. The brake keys
 * on the timed parts, not on the labels — three unlabelled parts ("5 h X,
 * 2 h Y, 2 h Z" with no recognised kind of work) are still three parts,
 * and the unlabelled path is the majority case in production (re-audit
 * 2026-09-11, F4). Only a `fragment_skill` row can then say WHERE the
 * skill was used; the rest stays involvement.
 */
function skillBasis(entry: WorkIntelligenceEntry, time: EntryWorkTime): SkillTimeBasis {
  const n = new Set(entry.linkedSkillIds).size;
  if (n > 1) return "shared";
  if (n === 0) return "none";
  const fragments = time.lines.filter((l) => l.hours > 0 && l.derivedFrom === "fragment_time");
  if (fragments.length > 1) {
    const labels = new Set(fragments.map((l) => (l.workTypeKey ?? "").trim()));
    const oneKindOfWork = labels.size === 1 && !labels.has("");
    if (!oneKindOfWork) return "multi_activity";
  }
  return "attributed";
}

/**
 * Divide an entry's hours between its linked skills. `attributed` basis:
 * the one linked skill claims everything. Otherwise ONLY a fragment line
 * whose `fragment_skill` rows name exactly ONE linked skill is claimed by
 * that skill; every other hour (entry-level lines, fragments with no row,
 * fragments two linked skills sit on) stays in the remainder. A row naming a
 * skill that is no longer linked is inert — the link is the evidence.
 */
function attributeEntry(
  entry: WorkIntelligenceEntry,
  time: EntryWorkTime,
  basis: SkillTimeBasis,
  idBySlug: ReadonlyMap<string, string>,
): EntryAttribution {
  const ids = [...new Set(entry.linkedSkillIds)];
  if (basis === "none" || time.totalHours <= 0) {
    return { bySkill: new Map(), remainderHours: time.totalHours };
  }
  if (basis === "attributed") {
    return { bySkill: new Map([[ids[0]!, time.totalHours]]), remainderHours: 0 };
  }
  const linked = new Set(ids);
  const byIndex = fragmentSkillsByIndex(entry.metrics);
  const bySkill = new Map<string, number>();
  let remainder = 0;
  for (const line of time.lines) {
    if (line.hours <= 0) continue;
    const slugs =
      line.derivedFrom === "fragment_time" && line.fragmentIndex !== null
        ? byIndex.get(line.fragmentIndex)
        : undefined;
    const claimants = new Set<string>();
    for (const slug of slugs ?? []) {
      const id = idBySlug.get(slug);
      if (id && linked.has(id)) claimants.add(id);
    }
    if (claimants.size === 1) {
      const id = [...claimants][0]!;
      bySkill.set(id, (bySkill.get(id) ?? 0) + line.hours);
    } else {
      remainder += line.hours;
    }
  }
  return { bySkill, remainderHours: remainder };
}

/** The entry's own `work_direction` (a profession slug), latest row wins. */
function directionOf(metrics: readonly WorkTimeMetricRow[]): string | null {
  const rows = metrics.filter(
    (m) => m.metric_slug === "work_direction" && typeof m.value_text === "string",
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const v = rows[0]!.value_text!.trim();
  return v || null;
}

/** The entry's completed OUTPUT: its latest `quantity` / `area_done` row in
 *  a NON-time unit, or null. A time unit is work time, handled elsewhere. */
function outputOf(
  metrics: readonly WorkTimeMetricRow[],
): { unit: string; value: number } | null {
  const rows = metrics
    .filter(
      (m) =>
        (m.metric_slug === "quantity" || m.metric_slug === "area_done") &&
        typeof m.value_numeric === "number" &&
        Number.isFinite(m.value_numeric) &&
        m.value_numeric > 0 &&
        typeof m.unit_slug === "string" &&
        m.unit_slug.trim() !== "" &&
        !isWorkTimeUnit(m.unit_slug),
    )
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const row = rows[0];
  return row ? { unit: row.unit_slug!.trim(), value: row.value_numeric as number } : null;
}

function hasDocumentSource(metrics: readonly WorkTimeMetricRow[]): boolean {
  return metrics.some(
    (m) =>
      m.metric_slug === SOURCE_DOCUMENT_METRIC_SLUG &&
      typeof m.value_text === "string" &&
      m.value_text.trim() !== "",
  );
}

function trendOf(recent: number, prior: number): WorkTrend {
  if (recent <= 0 && prior <= 0) return "none";
  if (prior <= 0) return "new";
  if (recent <= 0) return "down";
  const ratio = recent / prior;
  if (ratio >= 1.15) return "up";
  if (ratio <= 0.85) return "down";
  return "flat";
}

/**
 * Derive everything the person's recorded work supports. Deterministic:
 * same rows in → same figures out, independent of input order.
 */
export function deriveWorkIntelligence(
  input: WorkIntelligenceInput,
): WorkIntelligence {
  // Declared rows carry the tier and the slug; a skill that appears only
  // through a link (slug unknown here) is skipped rather than invented.
  const rowsById = new Map<string, { slug: string; tier: EvidenceTier }>();
  for (const s of input.skills) {
    const slug = (s.slug ?? "").trim();
    if (!slug || !s.skillId) continue;
    const tier = deriveEvidenceTier({ verified: s.verified, source: s.source });
    const existing = rowsById.get(s.skillId);
    // Several rows for one skill: the strongest REAL tier wins, never an
    // averaged one.
    if (!existing || EVIDENCE_TIER_RANK[tier] > EVIDENCE_TIER_RANK[existing.tier]) {
      rowsById.set(s.skillId, { slug, tier });
    }
  }
  const idBySlug = new Map<string, string>();
  for (const [id, row] of rowsById) idBySlug.set(row.slug, id);

  const derived: DerivedEntry[] = input.entries.map((entry) => {
    const time = deriveEntryWorkTime({
      entryId: entry.entryId,
      createdAt: entry.createdAt,
      originalText: entry.originalText ?? null,
      metrics: entry.metrics,
    });
    const basis = skillBasis(entry, time);
    return { entry, time, basis, attribution: attributeEntry(entry, time, basis, idBySlug) };
  });

  // ── periods ───────────────────────────────────────────────────────────
  const periods: WorkPeriodTotals[] = WORK_PERIOD_KEYS.map((key) => {
    const bounds = workPeriodBounds(key, input.todayIso);
    let hours = 0;
    let dayUnits = 0;
    let confirmedHours = 0;
    let confirmedDayUnits = 0;
    let entries = 0;
    let entriesWithoutDuration = 0;
    const days = new Set<string>();
    for (const d of derived) {
      if (!inPeriod(d.time.day, bounds)) continue;
      entries += 1;
      if (d.time.lines.length === 0) {
        entriesWithoutDuration += 1;
        continue;
      }
      hours += d.time.totalHours;
      dayUnits += d.time.totalDayUnits;
      if (d.entry.reviewResult === "approved") {
        confirmedHours += d.time.totalHours;
        confirmedDayUnits += d.time.totalDayUnits;
      }
      if (d.time.totalHours > 0 || d.time.totalDayUnits > 0) days.add(d.time.day);
    }
    return {
      key,
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      hours: round2(hours),
      dayUnits: round2(dayUnits),
      confirmedHours: round2(confirmedHours),
      confirmedDayUnits: round2(confirmedDayUnits),
      entries,
      entriesWithoutDuration,
      daysWorked: days.size,
    };
  });

  // Everything from here on describes the FOCUS period only — the same
  // inclusive bounds the matching `periods` row states.
  const focus: WorkPeriodKey = input.focus ?? "all";
  const focusBounds = workPeriodBounds(focus, input.todayIso);
  const scoped = derived.filter((d) => inPeriod(d.time.day, focusBounds));

  // ── skills ────────────────────────────────────────────────────────────
  type SkillAcc = {
    attributed: number;
    confirmed: number;
    shared: number;
    entries: Set<string>;
    days: Set<string>;
    contexts: Set<string>;
    last: string | null;
    prov: { recognized: number; manual: number; confirmed: number; unrecorded: number };
  };
  const skillAcc = new Map<string, SkillAcc>();
  const accFor = (skillId: string): SkillAcc => {
    let a = skillAcc.get(skillId);
    if (!a) {
      a = {
        attributed: 0,
        confirmed: 0,
        shared: 0,
        entries: new Set(),
        days: new Set(),
        contexts: new Set(),
        last: null,
        prov: { recognized: 0, manual: 0, confirmed: 0, unrecorded: 0 },
      };
      skillAcc.set(skillId, a);
    }
    return a;
  };

  let sharedHours = 0;
  let sharedEntries = 0;
  let multiActivityHours = 0;
  let multiActivityEntries = 0;
  let unattributedHours = 0;
  let unattributedEntries = 0;

  for (const d of scoped) {
    const ids = [...new Set(d.entry.linkedSkillIds)];
    for (const id of ids) {
      const a = accFor(id);
      a.entries.add(d.entry.entryId);
      a.contexts.add(d.entry.engagementContextId ?? "");
      if (DAY_RX.test(d.time.day)) {
        a.days.add(d.time.day);
        if (a.last === null || d.time.day > a.last) a.last = d.time.day;
      }
      const p = d.entry.linkProvenance?.get(id) ?? null;
      if (p === "recognized") a.prov.recognized += 1;
      else if (p === "manual") a.prov.manual += 1;
      else if (p === "confirmed") a.prov.confirmed += 1;
      else a.prov.unrecorded += 1;
    }
    if (d.time.totalHours <= 0) continue;
    // Hours a single linked skill can claim — the whole entry (single
    // skill, one kind of work) or the fragments its link was recognised on.
    for (const [id, hours] of d.attribution.bySkill) {
      const a = accFor(id);
      a.attributed += hours;
      if (d.entry.reviewResult === "approved") a.confirmed += hours;
    }
    // The rest stays involvement, named by why it could not be attributed.
    const remainder = d.attribution.remainderHours;
    if (remainder <= 0) continue;
    if (d.basis === "shared") {
      sharedHours += remainder;
      sharedEntries += 1;
      for (const id of ids) accFor(id).shared += remainder;
    } else if (d.basis === "multi_activity") {
      multiActivityHours += remainder;
      multiActivityEntries += 1;
      accFor(ids[0]!).shared += remainder;
    } else if (d.basis === "none") {
      unattributedHours += remainder;
      unattributedEntries += 1;
    }
  }

  const attributedHours = round2(
    [...skillAcc.values()].reduce((sum, a) => sum + a.attributed, 0),
  );

  const skills: SkillWorkTime[] = [...rowsById.entries()].map(([skillId, row]) => {
    const a = skillAcc.get(skillId);
    const attributed = round2(a?.attributed ?? 0);
    return {
      skillId,
      slug: row.slug,
      tier: row.tier,
      attributedHours: attributed,
      confirmedHours: round2(a?.confirmed ?? 0),
      sharedHours: round2(a?.shared ?? 0),
      entries: a?.entries.size ?? 0,
      days: a?.days.size ?? 0,
      contexts: a?.contexts.size ?? 0,
      lastWorkedDay: a?.last ?? null,
      share: attributedHours > 0 ? round2(attributed / attributedHours) : 0,
      provenance: a?.prov ?? { recognized: 0, manual: 0, confirmed: 0, unrecorded: 0 },
    };
  });
  skills.sort(
    (x, y) =>
      y.attributedHours - x.attributedHours ||
      y.sharedHours - x.sharedHours ||
      y.entries - x.entries ||
      x.slug.localeCompare(y.slug),
  );

  // ── activities (direct evidence relation: same fragment, or the entry's
  //    own direction for an entry-level duration) ────────────────────────
  const recentStart = isoDayMinus(focusBounds.endIso, 29);
  const priorStart = isoDayMinus(focusBounds.endIso, 59);
  type ActAcc = {
    hours: number;
    entries: Set<string>;
    contexts: Set<string>;
    last: string | null;
    recent: number;
    prior: number;
  };
  const actAcc = new Map<string, ActAcc>();
  let activityHours = 0;
  let unlabelledHours = 0;
  let unlabelledEntries = 0;
  for (const d of scoped) {
    const direction = directionOf(d.entry.metrics);
    let entryUnlabelled = false;
    for (const line of d.time.lines) {
      if (line.hours <= 0) continue;
      const key =
        line.derivedFrom === "fragment_time"
          ? (line.workTypeKey ?? "").trim()
          : (direction ?? "");
      if (!key) {
        // A timed part with no kind of work: counted in the denominator,
        // named as unlabelled — never dropped from the reading.
        unlabelledHours += line.hours;
        entryUnlabelled = true;
        continue;
      }
      activityHours += line.hours;
      let a = actAcc.get(key);
      if (!a) {
        a = { hours: 0, entries: new Set(), contexts: new Set(), last: null, recent: 0, prior: 0 };
        actAcc.set(key, a);
      }
      a.hours += line.hours;
      a.entries.add(d.entry.entryId);
      a.contexts.add(d.entry.engagementContextId ?? "");
      if (DAY_RX.test(line.day)) {
        if (a.last === null || line.day > a.last) a.last = line.day;
        if (line.day >= recentStart) a.recent += line.hours;
        else if (line.day >= priorStart) a.prior += line.hours;
      }
    }
    if (entryUnlabelled) unlabelledEntries += 1;
  }
  // The activity share's base is EVERY recorded hour of the focus period —
  // the same figure the period tile shows — not only the labelled ones.
  const focusHours = periods.find((p) => p.key === focus)?.hours ?? 0;
  const activities: ActivityWorkTime[] = [...actAcc.entries()]
    .map(([key, a]) => ({
      key,
      hours: round2(a.hours),
      share: focusHours > 0 ? round2(a.hours / focusHours) : 0,
      entries: a.entries.size,
      contexts: a.contexts.size,
      lastWorkedDay: a.last,
      trend: trendOf(a.recent, a.prior),
    }))
    .sort((x, y) => y.hours - x.hours || x.key.localeCompare(y.key));

  // ── contexts ──────────────────────────────────────────────────────────
  const ctxAcc = new Map<string | null, { hours: number; confirmed: number; entries: number }>();
  for (const d of scoped) {
    const key = d.entry.engagementContextId ?? null;
    let a = ctxAcc.get(key);
    if (!a) {
      a = { hours: 0, confirmed: 0, entries: 0 };
      ctxAcc.set(key, a);
    }
    a.entries += 1;
    a.hours += d.time.totalHours;
    if (d.entry.reviewResult === "approved") a.confirmed += d.time.totalHours;
  }
  const contexts: ContextWorkTime[] = [...ctxAcc.entries()]
    .map(([engagementContextId, a]) => ({
      engagementContextId,
      hours: round2(a.hours),
      confirmedHours: round2(a.confirmed),
      entries: a.entries,
    }))
    .sort(
      (x, y) =>
        y.hours - x.hours ||
        y.entries - x.entries ||
        String(x.engagementContextId ?? "").localeCompare(String(y.engagementContextId ?? "")),
    );

  // ── months (always all-time — the evolution axis) ─────────────────────
  const monthAcc = new Map<string, { hours: number; confirmed: number; entries: number }>();
  for (const d of derived) {
    if (!DAY_RX.test(d.time.day)) continue;
    const month = d.time.day.slice(0, 7);
    let a = monthAcc.get(month);
    if (!a) {
      a = { hours: 0, confirmed: 0, entries: 0 };
      monthAcc.set(month, a);
    }
    a.entries += 1;
    a.hours += d.time.totalHours;
    if (d.entry.reviewResult === "approved") a.confirmed += d.time.totalHours;
  }
  const months: MonthWorkTime[] = [...monthAcc.entries()]
    .map(([month, a]) => ({
      month,
      hours: round2(a.hours),
      confirmedHours: round2(a.confirmed),
      entries: a.entries,
    }))
    .sort((x, y) => x.month.localeCompare(y.month));

  // ── outputs (completed quantities in their recorded unit) ─────────────
  const outAcc = new Map<string, { value: number; entries: number }>();
  for (const d of scoped) {
    const o = outputOf(d.entry.metrics);
    if (!o) continue;
    const a = outAcc.get(o.unit) ?? { value: 0, entries: 0 };
    a.value += o.value;
    a.entries += 1;
    outAcc.set(o.unit, a);
  }
  const outputs: OutputTotal[] = [...outAcc.entries()]
    .map(([unit, a]) => ({ unit, value: round2(a.value), entries: a.entries }))
    .sort((x, y) => y.entries - x.entries || x.unit.localeCompare(y.unit));

  // ── evidence strength ─────────────────────────────────────────────────
  const evidence = { entries: 0, confirmed: 0, withPhotos: 0, fromDocument: 0, selfOnly: 0 };
  for (const d of scoped) {
    evidence.entries += 1;
    const confirmed = d.entry.reviewResult === "approved";
    const photos = (d.entry.photoCount ?? 0) > 0;
    const doc = hasDocumentSource(d.entry.metrics);
    if (confirmed) evidence.confirmed += 1;
    if (photos) evidence.withPhotos += 1;
    if (doc) evidence.fromDocument += 1;
    if (!confirmed && !photos && !doc) evidence.selfOnly += 1;
  }

  // ── provenance of the hours themselves ────────────────────────────────
  const provenance = { workerInput: 0, aiExtracted: 0, managerCorrected: 0, unknown: 0 };
  for (const d of scoped) {
    for (const line of d.time.lines) {
      if (line.hours <= 0) continue;
      if (line.metricSource === "worker_input") provenance.workerInput += line.hours;
      else if (line.metricSource === "ai_extracted") provenance.aiExtracted += line.hours;
      else if (line.metricSource === "manager_corrected") provenance.managerCorrected += line.hours;
      else provenance.unknown += line.hours;
    }
  }

  // ── plausibility checks (warn, never corrupt) ─────────────────────────
  const checks = deriveWorkTimeChecks(
    scoped.map((d) => ({ time: d.time, metrics: d.entry.metrics })),
  );

  const all = periods.find((p) => p.key === "all")!;
  return {
    focus,
    periods,
    skills,
    activities,
    contexts,
    months,
    outputs,
    evidence,
    sharedHours: round2(sharedHours),
    sharedEntries,
    multiActivityHours: round2(multiActivityHours),
    multiActivityEntries,
    unattributedHours: round2(unattributedHours),
    unattributedEntries,
    attributedHours,
    activityHours: round2(activityHours),
    unlabelledHours: round2(unlabelledHours),
    unlabelledEntries,
    provenance: {
      workerInput: round2(provenance.workerInput),
      aiExtracted: round2(provenance.aiExtracted),
      managerCorrected: round2(provenance.managerCorrected),
      unknown: round2(provenance.unknown),
    },
    checks,
    totalHours: all.hours,
    totalEntries: all.entries,
  };
}

/**
 * Evidence-backed adjacency input: the slugs whose OWN recorded work backs
 * them (attributed or shared hours, or at least one linked entry). Declared-
 * only skills are excluded on purpose — a growth reading built on what the
 * person merely said would be the CV-builder collapse, not intelligence.
 */
export function evidencedSkillSlugs(wi: WorkIntelligence): string[] {
  return wi.skills
    .filter((s) => s.attributedHours > 0 || s.sharedHours > 0 || s.entries > 0)
    .map((s) => s.slug);
}

/** Hours per skill slug for consumers that key on slugs (Living CV chips).
 *  Attributed hours only — shared hours are not a per-skill figure. */
export function attributedHoursBySlug(wi: WorkIntelligence): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of wi.skills) if (s.attributedHours > 0) out.set(s.slug, s.attributedHours);
  return out;
}

/** Involvement per skill slug — entries / days / contexts a skill took part
 *  in, for the Living CV's evidence-backed history line. */
export function involvementBySlug(
  wi: WorkIntelligence,
): Map<string, { entries: number; days: number; contexts: number; lastWorkedDay: string | null }> {
  const out = new Map<string, { entries: number; days: number; contexts: number; lastWorkedDay: string | null }>();
  for (const s of wi.skills) {
    if (s.entries > 0) {
      out.set(s.slug, {
        entries: s.entries,
        days: s.days,
        contexts: s.contexts,
        lastWorkedDay: s.lastWorkedDay,
      });
    }
  }
  return out;
}
