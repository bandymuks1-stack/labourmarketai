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
 *             board, the chat passes the board's own missing-skill counts;
 *           · directions — the KINDS (owner requirement 5, #1689): each
 *             evidenced skill read as core_strength / growing / underused,
 *             each declared-only skill as self_stated, each adjacency as
 *             adjacent_opportunity — every one with the facts (`why`) it was
 *             decided on, so a surface names the evidence, never a trait.
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
/** A core strength is the largest attributed share AND spread: entries over
 *  at least this many contexts, or at least this many entries. One context
 *  and one entry is a single day's work, not a strength. */
const CORE_MIN_CONTEXTS = 2;
const CORE_MIN_ENTRIES = 3;

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

/**
 * GROWTH KINDS (owner requirement 5, #1689) — what the person's OWN rows show
 * about each skill or direction, named as a KIND with its evidence attached.
 *
 * A kind is a closed-set reading, never a grade of the person: each one is
 * decided by a plain rule over the facts in `why`, and the facts travel with
 * it so every sentence a surface renders can name its evidence.
 *
 *   core_strength        the largest share of the person's ATTRIBUTED hours,
 *                        backed by entries over ≥ 2 contexts or ≥ 3 entries
 *   growing              used more in the last 30 days than the 30 before,
 *                        or new in the window
 *   underused            evidenced earlier, no linked entry for 90 days
 *   self_stated          declared by the person; 0 entries and 0 hours back it
 *   adjacent_opportunity the EXISTING adjacency reading — a profession the
 *                        evidenced skills already partly cover
 *
 * `qualification_gap` (a formal requirement the requirement ledger says is
 * missing) is deliberately NOT a kind here: this model receives no
 * requirement-ledger input, and a kind the evidence cannot back would be an
 * invented career fact. It is omitted, not guessed.
 *
 * One kind per skill, decided in the order above (a core strength that is
 * also rising is `core_strength`; its `why.trend` still says "up").
 */
export type GrowthKind =
  | "core_strength"
  | "growing"
  | "underused"
  | "self_stated"
  | "adjacent_opportunity";

/** The facts a skill-kind stands on — the model's own figures for the skill. */
export type GrowthSkillFacts = {
  readonly attributedHours: number;
  readonly sharedHours: number;
  readonly confirmedHours: number;
  /** Share of the person's own ATTRIBUTED hours, 0..1. */
  readonly share: number;
  readonly entries: number;
  readonly contexts: number;
  readonly lastWorkedDay: string | null;
  readonly trend: WorkTrend;
};

export type GrowthDirection =
  | { readonly kind: "core_strength"; readonly slug: string; readonly why: GrowthSkillFacts }
  | { readonly kind: "growing"; readonly slug: string; readonly why: GrowthSkillFacts }
  | {
      readonly kind: "underused";
      readonly slug: string;
      readonly why: GrowthSkillFacts & {
        /** Days since the last linked entry, at the focus window's end. */
        readonly dormantDays: number;
      };
    }
  | {
      readonly kind: "self_stated";
      readonly slug: string;
      /** Stated as the zeros they are: no entry, no hour, backs this skill. */
      readonly why: { readonly entries: 0; readonly hours: 0 };
    }
  | {
      readonly kind: "adjacent_opportunity";
      readonly professionId: string;
      readonly why: {
        readonly sharedSkills: readonly string[];
        readonly missingSkills: readonly string[];
        readonly sharedCount: number;
      };
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
  /** How many evidenced skills HAD a deepen reason before the list was
   *  capped at MAX_DEEPEN — so a surface can say "6 of 9", never imply the
   *  six are all (#1689, 2026-09-12). */
  readonly deepenTotal: number;
  readonly expand: readonly AdjacentDirection[];
  /** `null` = demand was not read for this reading (UNKNOWN, not zero). */
  readonly demand: readonly GrowthDemand[] | null;
  /** Demand rows before the MAX_DEMAND cap; `null` when demand was not read. */
  readonly demandTotal: number | null;
  /**
   * The KINDS (owner requirement 5): one entry per skill that reads as a
   * core strength / growing / underused, one per declared-only skill
   * (self_stated), one per adjacent profession — each with its `why`. Listed
   * by kind in the order the type declares, then in the model's own hours
   * order. Uncapped here; a surface caps and says so.
   */
  readonly directions: readonly GrowthDirection[];
  readonly limitation: GrowthLimitation;
};

function isoDayMinus(dayIso: string, days: number): string {
  const d = new Date(`${dayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDayIso: string, toDayIso: string): number {
  const a = new Date(`${fromDayIso}T00:00:00Z`).getTime();
  const b = new Date(`${toDayIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function skillFacts(s: SkillWorkTime): GrowthSkillFacts {
  return {
    attributedHours: s.attributedHours,
    sharedHours: s.sharedHours,
    confirmedHours: s.confirmedHours,
    share: s.share,
    entries: s.entries,
    contexts: s.contexts,
    lastWorkedDay: s.lastWorkedDay,
    trend: s.trend,
  };
}

/**
 * The kinds over the evidenced skills, the declared-only skills and the
 * adjacency directions. One kind per skill, decided in the declared order;
 * every entry carries the facts it was decided on.
 */
function deriveDirections(
  evidenced: readonly SkillWorkTime[],
  declaredOnly: readonly SkillWorkTime[],
  adjacency: readonly AdjacentDirection[],
  focusEndIso: string,
  dormantBefore: string,
): GrowthDirection[] {
  // core strength — the largest attributed share among evidenced skills,
  // and only when the entries are spread (ties all qualify: two skills at
  // the same share are two core strengths, not a ranking of one over the other)
  const topShare = Math.max(0, ...evidenced.map((s) => s.share));
  const isCore = (s: SkillWorkTime) =>
    s.attributedHours > 0 &&
    s.share === topShare &&
    (s.contexts >= CORE_MIN_CONTEXTS || s.entries >= CORE_MIN_ENTRIES);
  const isGrowing = (s: SkillWorkTime) => s.trend === "up" || s.trend === "new";
  const isUnderused = (s: SkillWorkTime) =>
    s.lastWorkedDay !== null && s.lastWorkedDay < dormantBefore;

  const core: GrowthDirection[] = [];
  const growing: GrowthDirection[] = [];
  const underused: GrowthDirection[] = [];
  for (const s of evidenced) {
    if (isCore(s)) core.push({ kind: "core_strength", slug: s.slug, why: skillFacts(s) });
    else if (isGrowing(s)) growing.push({ kind: "growing", slug: s.slug, why: skillFacts(s) });
    else if (isUnderused(s)) {
      underused.push({
        kind: "underused",
        slug: s.slug,
        why: { ...skillFacts(s), dormantDays: daysBetween(s.lastWorkedDay!, focusEndIso) },
      });
    }
  }
  const selfStated: GrowthDirection[] = declaredOnly.map((s) => ({
    kind: "self_stated",
    slug: s.slug,
    why: { entries: 0, hours: 0 },
  }));
  const adjacent: GrowthDirection[] = adjacency.map((d) => ({
    kind: "adjacent_opportunity",
    professionId: d.professionId,
    why: {
      sharedSkills: d.sharedSkills,
      missingSkills: d.missingSkills,
      sharedCount: d.sharedCount,
    },
  }));
  return [...core, ...growing, ...underused, ...selfStated, ...adjacent];
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
      deepenTotal: 0,
      expand: [],
      demand: demandRead === null ? null : [],
      demandTotal: demandRead === null ? null : 0,
      directions: [],
      limitation: "insufficient_skills",
    };
  }

  // deepen — listed in the person's own hours order (the section's), never
  // re-ranked by the number of reasons
  const deepenAll: GrowthDeepen[] = evidenced
    .map((s) => ({ slug: s.slug, reasons: deepenReasons(s, dormantBefore) }))
    .filter((d) => d.reasons.length > 0);
  const deepen = deepenAll.slice(0, MAX_DEEPEN);

  // demand — only skills the person's evidence does NOT cover, by the
  // board's own count, then slug; the board's figures, never re-derived
  const demandAll: readonly GrowthDemand[] | null =
    demandRead === null
      ? null
      : [...demandRead.entries()]
          .filter(([slug, n]) => n > 0 && !evidencedSlugs.has(slug))
          .map(([slug, n]) => ({ slug, demands: n }))
          .sort((a, b) => b.demands - a.demands || a.slug.localeCompare(b.slug));
  const demand = demandAll === null ? null : demandAll.slice(0, MAX_DEMAND);

  // kinds — over the SAME evidenced rows, the declared-only rows named as
  // self-stated, and the adjacency already computed above (one read)
  const directions = deriveDirections(
    evidenced,
    wi.skills.filter((s) => !evidencedSlugs.has(s.slug)),
    adjacency.directions,
    focus.endIso,
    dormantBefore,
  );

  return {
    kind: "derived",
    basis,
    deepen,
    deepenTotal: deepenAll.length,
    expand: adjacency.directions,
    demand,
    demandTotal: demandAll === null ? null : demandAll.length,
    directions,
    limitation: adjacency.limitationState,
  };
}
