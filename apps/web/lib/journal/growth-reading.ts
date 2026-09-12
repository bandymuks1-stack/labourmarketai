/**
 * GROWTH READING — where the person's OWN recorded work indicates potential
 * to deepen a skill or expand into an adjacent direction (issue #1689,
 * owner line 8: "evidence-backed potential to deepen adjacent skills or
 * expand activities, without turning this into an overall human score").
 *
 * ── TWO BLOCKS, KEPT APART ────────────────────────────────────────────────
 *   FACT    `basis` — the skills the person's entries actually back (the
 *           same rows the section lists: attributed hours, involvement,
 *           confirmed hours, entries, last day, trend), the recorded hours
 *           they sit on, and how many DECLARED skills no entry backs (named
 *           as left out — a reading built on what a person merely said
 *           would be the CV-builder collapse).
 *   READING `deepen` / `expand` / `demand` — derived from the facts above,
 *           labelled derived on every surface, and NEVER a score, a rating,
 *           a rank or a tier of the person:
 *           · deepen — evidenced skills whose evidence is thin or moving:
 *             used only alongside other skills (no attributable hours yet),
 *             backed only by untimed entries (no hour reaches it — never
 *             shown as "0 h"), recorded but never confirmed by a manager or
 *             client, rising
 *             in the last 30 days, or not used for 90 days. Each reason is
 *             a closed-set fact about the person's own rows, in words;
 *           · expand — the EXISTING `computeAdjacentDirections` over the
 *             evidenced slugs only (the one canonical skill/profession map,
 *             excluding the declared primary profession);
 *           · demand — what REAL visible demand asks that the person's
 *             evidence does not cover yet, when the caller has read the
 *             opportunities board; `null` when it was not read (UNKNOWN ≠
 *             ZERO, SEP-7) — the section passes null and points at the
 *             board, the chat passes the board's own missing-skill counts.
 *
 * ── HONESTY ───────────────────────────────────────────────────────────────
 *   · pure and deterministic: same model in → same reading out; no IO, no
 *     LLM, no threshold that turns hours into a grade;
 *   · order within a block is by the person's own hours (then slug) — a
 *     listing order, never a ranking of the person;
 *   · fewer than two evidenced skills → `limitation` says so and every
 *     reading block is empty; the fact block is still stated;
 *   · `kind: "derived"` is a literal every consumer must carry into its
 *     copy (guarded in `lib/guards/journal-work-intelligence.test.ts`).
 */

import {
  computeAdjacentDirections,
  type AdjacentDirection,
  type AdjacentDirectionLimitation,
} from "@/lib/opportunities/adjacent-directions";
import {
  evidencedSkillSlugs,
  type SkillWorkTime,
  type WorkIntelligence,
  type WorkTrend,
} from "@/lib/journal/work-intelligence";

/** Days without a linked entry after which a skill's use is read as
 *  dormant — the same order of window the trend compares (30 + 30 + 30). */
const DORMANT_AFTER_DAYS = 90;
const MAX_DEEPEN = 6;
const MAX_DEMAND = 6;

/** Why a skill's OWN evidence could be deepened — closed set, each one a
 *  fact about the person's rows, never a judgement. */
export type DeepenReason =
  | "involvement_only" // used alongside other skills; no entry where it was the work
  | "untimed" // backed only by entries that carry no duration — no hour reaches it yet
  | "unconfirmed" // recorded, never confirmed by a manager or client
  | "rising" // more use in the last 30 days than the 30 before (or new)
  | "dormant"; // no linked entry for 90 days

export type GrowthBasisSkill = {
  readonly slug: string;
  readonly attributedHours: number;
  readonly sharedHours: number;
  readonly confirmedHours: number;
  readonly entries: number;
  readonly lastWorkedDay: string | null;
  readonly trend: WorkTrend;
};

export type GrowthDeepen = {
  readonly slug: string;
  readonly reasons: readonly DeepenReason[];
};

export type GrowthDemand = {
  readonly slug: string;
  /** Visible demands that ask for this skill (the board's own count). */
  readonly demands: number;
};

export type GrowthLimitation = "ok" | AdjacentDirectionLimitation;

export type GrowthReading = {
  /** A literal every consumer carries into its copy: this is a reading of
   *  the person's own evidence, not a fact about the person. */
  readonly kind: "derived";
  /** FACT block. */
  readonly basis: {
    readonly skills: readonly GrowthBasisSkill[];
    /** Declared skills no entry backs — left out of every reading, named. */
    readonly declaredOnly: number;
    /** The person's recorded hours / entries in the focus window. */
    readonly recordedHours: number;
    readonly entries: number;
  };
  /** READING block. */
  readonly deepen: readonly GrowthDeepen[];
  readonly expand: readonly AdjacentDirection[];
  /** `null` = demand was not read for this reading (UNKNOWN, not zero). */
  readonly demand: readonly GrowthDemand[] | null;
  readonly limitation: GrowthLimitation;
};

function isoDayMinus(dayIso: string, days: number): string {
  const d = new Date(`${dayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function deepenReasons(s: SkillWorkTime, dormantBefore: string): DeepenReason[] {
  const reasons: DeepenReason[] = [];
  if (s.attributedHours <= 0 && s.sharedHours > 0) reasons.push("involvement_only");
  // an entry with no duration is COUNTED, never timed (SEP-7): the skill it
  // backs has no hour at all — said as such, never as "0 h"
  if (s.attributedHours <= 0 && s.sharedHours <= 0 && s.entries > 0) reasons.push("untimed");
  if (s.attributedHours > 0 && s.confirmedHours <= 0) reasons.push("unconfirmed");
  if (s.trend === "up" || s.trend === "new") reasons.push("rising");
  if (s.lastWorkedDay !== null && s.lastWorkedDay < dormantBefore) reasons.push("dormant");
  return reasons;
}

/**
 * Pure derivation over the ONE work-intelligence model. `demandBySkill` is
 * the opportunities board's count of visible demands per MISSING skill slug
 * (the same `skillFit.missingUris` the skill-gap answer aggregates), or
 * `null` when the caller did not read the board.
 */
export function deriveGrowthReading(
  wi: WorkIntelligence,
  input: {
    readonly primaryProfessionSlug: string | null;
    readonly demandBySkill?: ReadonlyMap<string, number> | null;
  },
): GrowthReading {
  const evidencedSlugs = new Set(evidencedSkillSlugs(wi));
  const evidenced = wi.skills.filter((s) => evidencedSlugs.has(s.slug));
  const focus = wi.periods.find((p) => p.key === wi.focus) ?? wi.periods[wi.periods.length - 1]!;
  const dormantBefore = isoDayMinus(focus.endIso, DORMANT_AFTER_DAYS);

  const basis: GrowthReading["basis"] = {
    skills: evidenced.map((s) => ({
      slug: s.slug,
      attributedHours: s.attributedHours,
      sharedHours: s.sharedHours,
      confirmedHours: s.confirmedHours,
      entries: s.entries,
      lastWorkedDay: s.lastWorkedDay,
      trend: s.trend,
    })),
    declaredOnly: wi.skills.length - evidenced.length,
    recordedHours: focus.hours,
    entries: focus.entries,
  };

  const adjacency = computeAdjacentDirections({
    workerSkillSlugs: [...evidencedSlugs],
    primaryProfessionSlug: input.primaryProfessionSlug,
  });
  const demandRead = input.demandBySkill ?? null;

  if (evidenced.length < 2) {
    return {
      kind: "derived",
      basis,
      deepen: [],
      expand: [],
      demand: demandRead === null ? null : [],
      limitation: "insufficient_skills",
    };
  }

  // deepen — listed in the person's own hours order (the section's), never
  // re-ranked by the number of reasons
  const deepen: GrowthDeepen[] = evidenced
    .map((s) => ({ slug: s.slug, reasons: deepenReasons(s, dormantBefore) }))
    .filter((d) => d.reasons.length > 0)
    .slice(0, MAX_DEEPEN);

  // demand — only skills the person's evidence does NOT cover, by the
  // board's own count, then slug; the board's figures, never re-derived
  const demand: readonly GrowthDemand[] | null =
    demandRead === null
      ? null
      : [...demandRead.entries()]
          .filter(([slug, n]) => n > 0 && !evidencedSlugs.has(slug))
          .map(([slug, n]) => ({ slug, demands: n }))
          .sort((a, b) => b.demands - a.demands || a.slug.localeCompare(b.slug))
          .slice(0, MAX_DEMAND);

  return {
    kind: "derived",
    basis,
    deepen,
    expand: adjacency.directions,
    demand,
    limitation: adjacency.limitationState,
  };
}
