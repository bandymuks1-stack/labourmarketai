/**
 * Intelligence VIEW MODEL — turns read results into bounded card view
 * models for the three audiences (worker / company / agency).
 *
 * Tenant isolation is a TYPE-LEVEL property: each builder accepts only that
 * audience's OWN (already RLS-scoped or pre-aggregated) data — there is no
 * shared builder that could mix tenants, and the agency builder documents
 * that raw client rows must never be passed in.
 *
 * Honesty: every card carries a state, a valueClass, a full explanation and
 * a source badge. A metric that does not exist yet (e.g. expected
 * time-to-fill) renders ONLY as an "insufficient_data" card that says so —
 * never a fabricated number. All *Code fields are stable i18n codes.
 *
 * Bounded output: max 6 cards per audience, max 8 items per card.
 * Pure module: no IO.
 */
import {
  buildExplanation,
  type InsightExplanationV1,
} from "./explainability";
import type {
  SalaryBenchmarkV1,
  SalaryComparisonResult,
} from "./salary-model";
import type {
  DemandAggregateItem,
  IntelligenceValueClass,
  MissingSkillsRecommendation,
  SupplyDemandGap,
} from "./skills-demand-model";

export const INTELLIGENCE_MAX_CARDS = 6;
export const INTELLIGENCE_MAX_ITEMS_PER_CARD = 8;

export type IntelligenceCardState =
  | "ready"
  | "insufficient_data"
  | "needs_migration"
  | "stale";

export interface IntelligenceCardItemV1 {
  readonly id: string;
  readonly labelCode: string;
  readonly labelParams: Readonly<Record<string, string | number>>;
  readonly valueClass: IntelligenceValueClass;
}

export interface IntelligenceSourceBadge {
  readonly originKind: "external" | "internal" | "blended";
  readonly sourceKey: string;
  readonly observedAtIso: string | null;
}

export interface IntelligenceCardV1 {
  readonly id: string;
  readonly kindCode: string;
  readonly headlineCode: string;
  readonly headlineParams: Readonly<Record<string, string | number>>;
  readonly state: IntelligenceCardState;
  readonly valueClass: IntelligenceValueClass;
  readonly explanation: InsightExplanationV1;
  readonly sourceBadge: IntelligenceSourceBadge;
  readonly nextActionCode: string | null;
  readonly items: readonly IntelligenceCardItemV1[];
}

const INTERNAL_BADGE: IntelligenceSourceBadge = {
  originKind: "internal",
  sourceKey: "internal_platform_aggregates",
  observedAtIso: null,
};

function capCards(cards: IntelligenceCardV1[]): readonly IntelligenceCardV1[] {
  return cards.slice(0, INTELLIGENCE_MAX_CARDS).map((c) => ({
    ...c,
    items: c.items.slice(0, INTELLIGENCE_MAX_ITEMS_PER_CARD),
  }));
}

function emptyStateExplanation(
  meaningCode: string,
  dataBasisCode: string,
): InsightExplanationV1 {
  return buildExplanation({
    meaningCode,
    dataBasisCodes: [dataBasisCode],
    sampleSize: null,
    originKind: "internal",
    uncertaintyCodes: [],
  });
}

// ── Salary card (shared shape for worker + company) ──────────────────────────

export interface SalaryCardInput {
  /** null while the benchmark read degraded (missing table / no rows). */
  readonly benchmark: SalaryBenchmarkV1 | null;
  readonly comparison: SalaryComparisonResult | null;
  /** True when the underlying store is the gated, unapplied migration. */
  readonly needsMigration?: boolean;
}

function salaryCard(
  id: string,
  kindCode: string,
  input: SalaryCardInput | null,
): IntelligenceCardV1 {
  const base = {
    id,
    kindCode,
    items: [] as IntelligenceCardItemV1[],
  };
  if (input?.needsMigration) {
    return {
      ...base,
      headlineCode: "intelligence.cards.state.needsMigration",
      headlineParams: {},
      state: "needs_migration",
      valueClass: "system_suggestion",
      explanation: emptyStateExplanation(
        "intelligence.cards.state.needsMigration",
        "intelligence.basis.gatedMigration",
      ),
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: null,
    };
  }
  if (!input || !input.benchmark || !input.comparison) {
    return {
      ...base,
      headlineCode: "intelligence.cards.salary.noBenchmark",
      headlineParams: {},
      state: "insufficient_data",
      valueClass: "system_suggestion",
      explanation: emptyStateExplanation(
        "intelligence.cards.salary.noBenchmark",
        "intelligence.basis.marketRateAverages",
      ),
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: null,
    };
  }
  const badge: IntelligenceSourceBadge = {
    originKind: input.benchmark.originKind,
    sourceKey: input.benchmark.sourceKey,
    observedAtIso: input.benchmark.observedAtIso,
  };
  if (input.comparison.kind === "compared") {
    return {
      ...base,
      headlineCode: `intelligence.cards.salary.band.${input.comparison.band}`,
      headlineParams: { positionPct: input.comparison.positionPct },
      state: "ready",
      valueClass: "system_suggestion",
      explanation: input.comparison.explanation,
      sourceBadge: badge,
      nextActionCode: null,
    };
  }
  const reasonCode =
    input.comparison.kind === "not_comparable"
      ? `intelligence.cards.salary.${input.comparison.reasonCode}`
      : "intelligence.cards.salary.insufficientData";
  return {
    ...base,
    headlineCode: reasonCode,
    headlineParams: {},
    state: "insufficient_data",
    valueClass: "system_suggestion",
    explanation: buildExplanation({
      meaningCode: reasonCode,
      dataBasisCodes: [`intelligence.sources.key.${input.benchmark.sourceKey}`],
      geoLabel: input.benchmark.geo.country,
      sampleSize: input.benchmark.sampleSize,
      originKind: input.benchmark.originKind,
      uncertaintyCodes: input.benchmark.uncertaintyCodes,
    }),
    sourceBadge: badge,
    nextActionCode: null,
  };
}

// ── Worker cards ─────────────────────────────────────────────────────────────

export interface WorkerIntelligenceInput {
  /** The WORKER'S OWN salary intelligence (RLS-scoped read). */
  readonly salary: SalaryCardInput | null;
  /** Missing-skill suggestions from the worker's own recommendations. */
  readonly recommendations: MissingSkillsRecommendation | null;
  /** The worker's own skills with stale journal evidence (slugs only). */
  readonly skillFreshness: readonly { readonly skillSlug: string }[] | null;
}

export function buildWorkerIntelligenceCards(
  input: WorkerIntelligenceInput,
): readonly IntelligenceCardV1[] {
  const cards: IntelligenceCardV1[] = [];

  cards.push(salaryCard("worker-salary", "intelligence.cards.kind.salary", input.salary));

  if (input.recommendations && input.recommendations.missingSlugs.length > 0) {
    cards.push({
      id: "worker-missing-skills",
      kindCode: "intelligence.cards.kind.missingSkills",
      headlineCode: "intelligence.cards.missingSkills.headline",
      headlineParams: { count: input.recommendations.missingSlugs.length },
      state: "ready",
      valueClass: input.recommendations.valueClass,
      explanation: input.recommendations.explanation,
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: "intelligence.nextAction.logJournalEvidence",
      items: input.recommendations.missingSlugs.map((slug) => ({
        id: `missing-${slug}`,
        labelCode: "intelligence.cards.missingSkills.item",
        labelParams: { skillSlug: slug },
        valueClass: "system_suggestion" as const,
      })),
    });
  }

  if (input.skillFreshness && input.skillFreshness.length > 0) {
    cards.push({
      id: "worker-skill-freshness",
      kindCode: "intelligence.cards.kind.skillFreshness",
      headlineCode: "intelligence.cards.skillFreshness.headline",
      headlineParams: { count: input.skillFreshness.length },
      state: "stale",
      valueClass: "system_suggestion",
      explanation: emptyStateExplanation(
        "intelligence.cards.skillFreshness.headline",
        "intelligence.basis.journalEvidence",
      ),
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: "intelligence.nextAction.logJournalEvidence",
      items: input.skillFreshness.map((s) => ({
        id: `stale-${s.skillSlug}`,
        labelCode: "intelligence.cards.skillFreshness.item",
        labelParams: { skillSlug: s.skillSlug },
        valueClass: "system_suggestion" as const,
      })),
    });
  }

  return capCards(cards);
}

// ── Company cards ────────────────────────────────────────────────────────────

export interface CompanyIntelligenceInput {
  /** Comparison of the COMPANY'S OWN offer against a benchmark. */
  readonly salaryCompetitiveness: SalaryCardInput | null;
  /** Gaps computed over the company's own demand + visible aggregate supply. */
  readonly supplyDemandGaps: readonly SupplyDemandGap[];
  /** Cohort-banded demand aggregates (skill scarcity signals). */
  readonly skillScarcity: readonly DemandAggregateItem[];
}

export function buildCompanyIntelligenceCards(
  input: CompanyIntelligenceInput,
): readonly IntelligenceCardV1[] {
  const cards: IntelligenceCardV1[] = [];

  cards.push(
    salaryCard(
      "company-salary-competitiveness",
      "intelligence.cards.kind.salaryCompetitiveness",
      input.salaryCompetitiveness,
    ),
  );

  if (input.supplyDemandGaps.length > 0) {
    const first = input.supplyDemandGaps[0];
    cards.push({
      id: "company-supply-demand-gap",
      kindCode: "intelligence.cards.kind.supplyDemandGap",
      headlineCode: "intelligence.cards.supplyDemandGap.headline",
      headlineParams: { gap: first.gap },
      state: "ready",
      valueClass: "calculated_gap",
      explanation: first.explanation,
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: null,
      items: input.supplyDemandGaps.map((g, i) => ({
        id: `gap-${i}`,
        labelCode: "intelligence.cards.supplyDemandGap.item",
        labelParams: {
          demand: g.demand.count,
          supply: g.supply.count,
          gap: g.gap,
        },
        valueClass: g.valueClass,
      })),
    });
  }

  if (input.skillScarcity.length > 0) {
    cards.push({
      id: "company-skill-scarcity",
      kindCode: "intelligence.cards.kind.skillScarcity",
      headlineCode: "intelligence.cards.skillScarcity.headline",
      headlineParams: { count: input.skillScarcity.length },
      state: "ready",
      valueClass: "user_entered",
      explanation: input.skillScarcity[0].explanation,
      sourceBadge: INTERNAL_BADGE,
      nextActionCode: null,
      items: input.skillScarcity.map((s) => ({
        id: `scarcity-${s.metricKey}-${s.subjectId}-${s.country ?? ""}`,
        labelCode:
          s.band.kind === "exact"
            ? "intelligence.cards.skillScarcity.itemExact"
            : "intelligence.cards.skillScarcity.itemSmallSample",
        labelParams: (s.band.kind === "exact"
          ? { subjectId: s.subjectId, count: s.band.count }
          : { subjectId: s.subjectId }) as Readonly<
          Record<string, string | number>
        >,
        valueClass: s.valueClass,
      })),
    });
  }

  // Expected time-to-fill: measured fill-time data DOES NOT EXIST yet in the
  // platform, so the ONLY honest card is an insufficient_data card saying
  // exactly that. A number here would be fabricated (§18) — never emitted.
  cards.push({
    id: "company-time-to-fill",
    kindCode: "intelligence.cards.kind.timeToFill",
    headlineCode: "intelligence.cards.timeToFill.notMeasuredYet",
    headlineParams: {},
    state: "insufficient_data",
    valueClass: "system_suggestion",
    explanation: emptyStateExplanation(
      "intelligence.cards.timeToFill.notMeasuredYet",
      "intelligence.basis.fillTimeMeasurementsMissing",
    ),
    sourceBadge: INTERNAL_BADGE,
    nextActionCode: null,
    items: [],
  });

  return capCards(cards);
}

// ── Agency cards ─────────────────────────────────────────────────────────────

/** One PRE-AGGREGATED, tenant-isolated figure. The aggregation (with cohort
 *  policy) happens upstream per tenant — this type carries no row data. */
export interface AgencyCrossClientAggregate {
  readonly id: string;
  readonly headlineCode: string;
  readonly headlineParams: Readonly<Record<string, string | number>>;
  readonly valueClass: IntelligenceValueClass;
  readonly explanation: InsightExplanationV1;
}

export interface AgencyIntelligenceInput {
  /**
   * Pre-aggregated per-tenant-isolated inputs ONLY. Raw client rows must
   * NEVER be passed in — the type has no field that could carry them, and
   * upstream aggregation is where cohort policy + tenant isolation are
   * enforced.
   */
  readonly crossClientAggregates: readonly AgencyCrossClientAggregate[];
}

export function buildAgencyIntelligenceCards(
  input: AgencyIntelligenceInput,
): readonly IntelligenceCardV1[] {
  const cards: IntelligenceCardV1[] = input.crossClientAggregates.map((a) => ({
    id: a.id,
    kindCode: "intelligence.cards.kind.agencyAggregate",
    headlineCode: a.headlineCode,
    headlineParams: a.headlineParams,
    state: "ready" as const,
    valueClass: a.valueClass,
    explanation: a.explanation,
    sourceBadge: INTERNAL_BADGE,
    nextActionCode: null,
    items: [],
  }));
  return capCards(cards);
}
