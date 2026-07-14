/**
 * Skills & demand intelligence — PURE deterministic aggregation over plain
 * input shapes (the server layer feeds real RLS-scoped rows; no DB here).
 *
 * VALUE-CLASS honesty (§18): every numeric output carries a valueClass so
 * the UI can never present a system suggestion or a calculated gap as a
 * user-entered fact:
 *   user_entered        — a number a human typed (e.g. teamSize on a need);
 *   system_suggestion   — derived/heuristic output (trend, missing skills);
 *   confirmed           — human-confirmed facts;
 *   available_capacity  — counted real supply rows;
 *   calculated_gap      — arithmetic over the two above.
 *
 * Cohort policy (./privacy.ts) applies to every person-derived count.
 * No matching is re-implemented: missing skills reuse the canonical
 * match-v1 FitBasis shape. Deterministic — same inputs, same outputs.
 */
import {
  applyCohortPolicy,
  type CohortBand,
} from "./privacy";
import {
  buildExplanation,
  type InsightExplanationV1,
} from "./explainability";

/** Single computation-version constant for the whole intelligence layer. */
export const INTELLIGENCE_CALC_VERSION = "1";

export type IntelligenceValueClass =
  | "user_entered"
  | "system_suggestion"
  | "confirmed"
  | "available_capacity"
  | "calculated_gap";

// ── Plain input shapes (no DB types) ─────────────────────────────────────────

export interface DemandInputRow {
  /** Free-text role as entered on the request (no profession FK exists). */
  readonly roleText: string | null;
  readonly country: string | null;
  readonly city: string | null;
  /** Company-entered team size (valueClass user_entered), or null. */
  readonly teamSize: number | null;
  readonly createdAtIso: string;
  readonly skillSlugs?: readonly string[];
}

export interface SupplyInputRow {
  readonly professionSlug: string | null;
  readonly country: string | null;
  readonly confirmedSkillSlugs: readonly string[];
  readonly selfDeclaredSkillSlugs: readonly string[];
}

// ── Demand aggregation ───────────────────────────────────────────────────────

export interface DemandAggregateItem {
  readonly metricKey: string;
  /** Role text (normalized) or skill slug the bucket counts. */
  readonly subjectId: string;
  readonly country: string | null;
  /** Cohort-policy band — an exact count only when n >= the cohort floor.
   *  Suppressed buckets are dropped before this list is built. */
  readonly band: Exclude<CohortBand, { kind: "suppressed" }>;
  readonly valueClass: "user_entered";
  readonly window: { readonly start: string; readonly end: string };
  readonly computationVersion: string;
  readonly explanation: InsightExplanationV1;
}

function normRole(roleText: string | null): string | null {
  const t = (roleText ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function normCountry(country: string | null): string | null {
  const c = (country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

/**
 * Per role×geo and per skill×geo demand counts over a window, cohort policy
 * applied (suppressed buckets dropped, small buckets banded). Counts are of
 * user-entered demand rows → valueClass "user_entered".
 */
export function aggregateSkillDemand(
  demandRows: readonly DemandInputRow[],
  opts: { windowStart: string; windowEnd: string },
): readonly DemandAggregateItem[] {
  const startMs = Date.parse(opts.windowStart);
  const endMs = Date.parse(opts.windowEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }

  const buckets = new Map<
    string,
    { metricKey: string; subjectId: string; country: string | null; n: number }
  >();
  const bump = (metricKey: string, subjectId: string, country: string | null) => {
    const key = `${metricKey}::${subjectId}::${country ?? ""}`;
    const cell = buckets.get(key) ?? { metricKey, subjectId, country, n: 0 };
    cell.n += 1;
    buckets.set(key, cell);
  };

  for (const row of demandRows) {
    if (!inWindow(row.createdAtIso, startMs, endMs)) continue;
    const country = normCountry(row.country);
    const role = normRole(row.roleText);
    if (role) bump("demand.role_request_count", role, country);
    for (const slug of row.skillSlugs ?? []) {
      const s = slug.trim().toLowerCase();
      if (s) bump("demand.skill_request_count", s, country);
    }
  }

  const window = { start: opts.windowStart, end: opts.windowEnd };
  const out: DemandAggregateItem[] = [];
  for (const b of buckets.values()) {
    const band = applyCohortPolicy(b.n);
    if (band.kind === "suppressed") continue;
    out.push({
      metricKey: b.metricKey,
      subjectId: b.subjectId,
      country: b.country,
      band,
      valueClass: "user_entered",
      window,
      computationVersion: INTELLIGENCE_CALC_VERSION,
      explanation: buildExplanation({
        meaningCode: "intelligence.demand.requestCount",
        dataBasisCodes: ["intelligence.basis.customerRequests"],
        window,
        geoLabel: b.country,
        sampleSize: band.kind === "exact" ? band.count : null,
        originKind: "internal",
        uncertaintyCodes:
          band.kind === "small_sample"
            ? ["intelligence.uncertainty.smallSample"]
            : [],
      }),
    });
  }
  // Deterministic order: metric, subject, country.
  return out.sort(
    (a, b) =>
      a.metricKey.localeCompare(b.metricKey) ||
      a.subjectId.localeCompare(b.subjectId) ||
      (a.country ?? "").localeCompare(b.country ?? ""),
  );
}

// ── Supply/demand gap ────────────────────────────────────────────────────────

export interface SupplyDemandGap {
  readonly demand: {
    readonly count: number;
    readonly valueClass: "user_entered";
  };
  readonly supply: {
    readonly count: number;
    readonly valueClass: "available_capacity";
  };
  /** demand − supply (negative = surplus). */
  readonly gap: number;
  readonly valueClass: "calculated_gap";
  readonly computationVersion: string;
  readonly explanation: InsightExplanationV1;
}

/**
 * Row-count gap: demand rows minus supply rows, both already scoped by the
 * CALLER to the same subject×geo (this module never pretends a free-text
 * role joins a profession slug — that FK does not exist).
 */
export function computeSupplyDemandGap(
  demand: readonly DemandInputRow[],
  supply: readonly SupplyInputRow[],
): SupplyDemandGap {
  const demandCount = demand.length;
  const supplyCount = supply.length;
  return {
    demand: { count: demandCount, valueClass: "user_entered" },
    supply: { count: supplyCount, valueClass: "available_capacity" },
    gap: demandCount - supplyCount,
    valueClass: "calculated_gap",
    computationVersion: INTELLIGENCE_CALC_VERSION,
    explanation: buildExplanation({
      meaningCode: "intelligence.gap.supplyDemandRowCount",
      dataBasisCodes: [
        "intelligence.basis.customerRequests",
        "intelligence.basis.workerRows",
      ],
      sampleSize: demandCount + supplyCount,
      originKind: "internal",
      uncertaintyCodes: [
        // The demand role is free text — no profession FK exists, so the
        // caller's scoping is the only join. Said honestly, always.
        "intelligence.uncertainty.noRoleProfessionJoin",
      ],
    }),
  };
}

// ── Emerging skills ──────────────────────────────────────────────────────────

export const EMERGING_SKILLS_DEFAULT_MIN_SAMPLE = 5;

export interface EmergingSkillItem {
  readonly skillSlug: string;
  /** Window-over-window growth in percent (rounded to 0.1). */
  readonly growthPct: number;
  readonly currentCount: number;
  readonly previousCount: number;
  readonly valueClass: "system_suggestion";
  readonly computationVersion: string;
  readonly explanation: InsightExplanationV1;
}

export type EmergingSkillsResult =
  | { readonly kind: "ok"; readonly items: readonly EmergingSkillItem[] }
  | { readonly kind: "insufficient_window" };

/**
 * Window-over-window skill demand growth. Refuses to trend without BOTH
 * windows (a single window has no trend), and emits an item only when the
 * CURRENT sample reaches `minSample` and the previous count is non-zero
 * (growth from zero is undefined, never fabricated as a percentage).
 */
export function detectEmergingSkills(
  currentWindowCounts: Readonly<Record<string, number>> | null | undefined,
  previousWindowCounts: Readonly<Record<string, number>> | null | undefined,
  opts: { minSample?: number } = {},
): EmergingSkillsResult {
  if (!currentWindowCounts || !previousWindowCounts) {
    return { kind: "insufficient_window" };
  }
  const minSample = opts.minSample ?? EMERGING_SKILLS_DEFAULT_MIN_SAMPLE;
  const items: EmergingSkillItem[] = [];
  for (const [skillSlug, currentCount] of Object.entries(currentWindowCounts)) {
    if (!Number.isFinite(currentCount) || currentCount < minSample) continue;
    const previousCount = previousWindowCounts[skillSlug];
    if (!Number.isFinite(previousCount) || (previousCount as number) <= 0) {
      continue;
    }
    const growthPct =
      Math.round(
        ((currentCount - (previousCount as number)) /
          (previousCount as number)) *
          1000,
      ) / 10;
    if (growthPct <= 0) continue;
    items.push({
      skillSlug,
      growthPct,
      currentCount,
      previousCount: previousCount as number,
      valueClass: "system_suggestion",
      computationVersion: INTELLIGENCE_CALC_VERSION,
      explanation: buildExplanation({
        meaningCode: "intelligence.skills.emergingDemandGrowth",
        dataBasisCodes: ["intelligence.basis.demandWindowCounts"],
        sampleSize: currentCount,
        originKind: "internal",
        uncertaintyCodes: ["intelligence.uncertainty.trendIsSuggestion"],
      }),
    });
  }
  items.sort(
    (a, b) => b.growthPct - a.growthPct || a.skillSlug.localeCompare(b.skillSlug),
  );
  return { kind: "ok", items };
}

// ── Missing skills (reuse of the canonical match-v1 FitBasis) ────────────────

export interface MissingSkillsRecommendation {
  readonly matchedSlugs: readonly string[];
  readonly missingSlugs: readonly string[];
  readonly valueClass: "system_suggestion";
  readonly computationVersion: string;
  readonly explanation: InsightExplanationV1;
}

/**
 * Pass-through over the canonical match engine's FitBasis (matched/missing
 * URIs) — matching is NEVER re-implemented here. The output is a suggestion,
 * never a fact.
 */
export function missingSkillsForRecommendation(fitBasis: {
  readonly matchedUris: readonly string[];
  readonly missingUris: readonly string[];
}): MissingSkillsRecommendation {
  return {
    matchedSlugs: [...fitBasis.matchedUris],
    missingSlugs: [...fitBasis.missingUris],
    valueClass: "system_suggestion",
    computationVersion: INTELLIGENCE_CALC_VERSION,
    explanation: buildExplanation({
      meaningCode: "intelligence.skills.missingForRecommendation",
      dataBasisCodes: ["intelligence.basis.matchFitBasis"],
      sampleSize: null,
      originKind: "internal",
      nextActionCode: "intelligence.nextAction.logJournalEvidence",
      uncertaintyCodes: [],
    }),
  };
}
