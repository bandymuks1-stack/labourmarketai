/**
 * TRUST CARD model (Contextual Intelligence UI v1) — the ONE view model
 * behind every contextual intelligence card in the product. A card is built
 * ONLY from the existing Trust Layer contracts (trust report, timeline,
 * governance registry) — this module invents no numbers, no trends, no
 * demo observations.
 *
 * Exactly three statuses exist:
 *   - "ready"       → a deterministic figure exists; the FULL trust report
 *                     (confidence, freshness, sources, limitations,
 *                     observation refs) rides along;
 *   - "conflict"    → the trust report carries an exposed conflict; both
 *                     values render side by side, never an average;
 *   - "unavailable" → no deterministic data exists. The card must then say
 *                     WHY, WHAT IS REQUIRED, WHICH SOURCES are not active,
 *                     and WHAT HAPPENS AFTER activation — never "coming
 *                     soon", never a placeholder number.
 *
 * Builders throw on structurally inconsistent input (a ready card without a
 * report, an unavailable card with one…) — a card that cannot justify its
 * own status must never render.
 *
 * i18n codes only. Pure module: no IO, no Date.now (callers pass nowMs).
 */
import type { InsightTrustReportV1 } from "./trust-explainability";
import { buildTrustReport } from "./trust-explainability";
import { buildTimeline, type IntelligenceTimelineV1 } from "./timeline";
import { buildFreshness } from "./freshness";
import { deriveConfidence } from "./confidence";
import { computeFreshness } from "./observation-contract";
import { getSourceProfile } from "./source-governance";
import { deriveSourceLifecycleState } from "./source-lifecycle";
import type { SalaryBenchmarkV1, SalaryComparisonResult } from "./salary-model";
import type { DemandAggregateItem } from "./skills-demand-model";

// ── Kinds and statuses ───────────────────────────────────────────────────────

export const TRUST_INSIGHT_KINDS = [
  "salary_benchmark",
  "demand",
  "supply",
  "skill_gap",
  "market_trend",
  // Official Eurostat macro labour-market context (aggregates only). Each
  // maps to one Eurostat dataset via eurostat-source-v1.ts. Until the owner
  // activates the eurostat source these render as honest unavailable cards.
  "eurostat_employment",
  "eurostat_unemployment",
  "eurostat_vacancy",
  "eurostat_labour_cost",
] as const;
export type TrustInsightKind = (typeof TRUST_INSIGHT_KINDS)[number];

/** The four Eurostat context kinds, in display order. */
export const EUROSTAT_TRUST_KINDS = [
  "eurostat_employment",
  "eurostat_unemployment",
  "eurostat_vacancy",
  "eurostat_labour_cost",
] as const;

export type TrustCardStatus = "ready" | "conflict" | "unavailable";

/** The four honest answers every unavailable card must give (§5 — never
 *  "coming soon"). */
export interface UnavailableStateV1 {
  /** i18n code: WHY no data exists here today. */
  readonly reasonCode: string;
  /** i18n code: WHAT is required for data to appear. */
  readonly requirementCode: string;
  /** Registry keys of relevant sources that are NOT active (may be empty
   *  when the gap is not source-shaped, e.g. missing own profile fields). */
  readonly disabledSourceKeys: readonly string[];
  /** i18n code: WHAT happens after the owner activates the inputs. */
  readonly afterActivationCode: string;
}

export interface TrustCardV1 {
  readonly id: string;
  readonly kind: TrustInsightKind;
  /** i18n code for the card title (`intelligence.trustCard.kind.*`). */
  readonly titleCode: string;
  readonly status: TrustCardStatus;
  /** Headline for ready/conflict cards; null when unavailable. */
  readonly headlineCode: string | null;
  readonly headlineParams: Readonly<Record<string, string | number>>;
  /** Present iff status is ready/conflict. */
  readonly report: InsightTrustReportV1 | null;
  /** Real derivation timeline when one can be built from real timestamps. */
  readonly timeline: IntelligenceTimelineV1 | null;
  /** Present iff status is unavailable. */
  readonly unavailable: UnavailableStateV1 | null;
}

const KIND_TITLE_LEAF: Record<TrustInsightKind, string> = {
  salary_benchmark: "salaryBenchmark",
  demand: "demand",
  supply: "supply",
  skill_gap: "skillGap",
  market_trend: "marketTrend",
  eurostat_employment: "eurostatEmployment",
  eurostat_unemployment: "eurostatUnemployment",
  eurostat_vacancy: "eurostatVacancy",
  eurostat_labour_cost: "eurostatLabourCost",
};

export function trustCardTitleCode(kind: TrustInsightKind): string {
  return `intelligence.trustCard.kind.${KIND_TITLE_LEAF[kind]}`;
}

// ── Validating constructor ───────────────────────────────────────────────────

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Build (and validate) a trust card. Throws on any status/payload mismatch:
 * ready/conflict require a report (conflict additionally requires the
 * report's conflict state to BE a conflict); unavailable requires the four
 * honest answers and forbids a report — an "unavailable" card that secretly
 * carries a figure would be dishonest in both directions.
 */
export function buildTrustCard(input: {
  id: string;
  kind: TrustInsightKind;
  status: TrustCardStatus;
  headlineCode?: string | null;
  headlineParams?: Readonly<Record<string, string | number>>;
  report?: InsightTrustReportV1 | null;
  timeline?: IntelligenceTimelineV1 | null;
  unavailable?: UnavailableStateV1 | null;
}): TrustCardV1 {
  if (!isNonEmpty(input.id)) {
    throw new Error("TrustCardV1: id must be non-empty");
  }
  const report = input.report ?? null;
  const unavailable = input.unavailable ?? null;
  if (input.status === "unavailable") {
    if (report !== null) {
      throw new Error("TrustCardV1: unavailable card must not carry a report");
    }
    if (
      unavailable === null ||
      !isNonEmpty(unavailable.reasonCode) ||
      !isNonEmpty(unavailable.requirementCode) ||
      !isNonEmpty(unavailable.afterActivationCode)
    ) {
      throw new Error(
        "TrustCardV1: unavailable card requires reason, requirement and after-activation codes",
      );
    }
  } else {
    if (report === null) {
      throw new Error(`TrustCardV1: ${input.status} card requires a report`);
    }
    if (unavailable !== null) {
      throw new Error(
        "TrustCardV1: ready/conflict card must not carry an unavailable state",
      );
    }
    if (!isNonEmpty(input.headlineCode ?? null)) {
      throw new Error("TrustCardV1: ready/conflict card requires a headline");
    }
    if (
      input.status === "conflict" &&
      report.conflict?.kind !== "conflict"
    ) {
      throw new Error(
        "TrustCardV1: conflict status requires the report to carry a conflict",
      );
    }
  }
  return {
    id: input.id,
    kind: input.kind,
    titleCode: trustCardTitleCode(input.kind),
    status: input.status,
    headlineCode: input.headlineCode ?? null,
    headlineParams: input.headlineParams ?? {},
    report,
    timeline: input.timeline ?? null,
    unavailable,
  };
}

// ── Unavailable defaults (deterministic, honest) ─────────────────────────────

/** Which registry sources COULD feed each kind once the owner approves
 *  them. Deterministic mapping — used to name the disabled sources. */
const KIND_SOURCE_KEYS: Record<TrustInsightKind, readonly string[]> = {
  salary_benchmark: ["stat_gov_lt", "eurostat", "cvbankas_salary"],
  demand: ["uzt_lt", "eures"],
  supply: ["uzt_lt", "eures"],
  skill_gap: ["uzt_lt", "eures"],
  market_trend: ["stat_gov_lt", "eurostat"],
  eurostat_employment: ["eurostat"],
  eurostat_unemployment: ["eurostat"],
  eurostat_vacancy: ["eurostat"],
  eurostat_labour_cost: ["eurostat"],
};

const KIND_REASON_LEAF: Record<TrustInsightKind, string> = {
  salary_benchmark: "salaryNoBenchmark",
  demand: "demandNotPublished",
  supply: "supplyNotMeasured",
  skill_gap: "skillGapNeedsBoth",
  market_trend: "trendNeedsHistory",
  eurostat_employment: "eurostatNeedsActivation",
  eurostat_unemployment: "eurostatNeedsActivation",
  eurostat_vacancy: "eurostatNeedsActivation",
  eurostat_labour_cost: "eurostatNeedsActivation",
};

/** Registry keys from the kind mapping whose derived lifecycle state is not
 *  "active" — i.e. the sources honestly named as disabled today. */
export function disabledSourceKeysFor(
  kind: TrustInsightKind,
): readonly string[] {
  return KIND_SOURCE_KEYS[kind].filter((key) => {
    const profile = getSourceProfile(key);
    return profile !== null && deriveSourceLifecycleState(profile) !== "active";
  });
}

/**
 * The default honest unavailable card for a kind: why there is no figure,
 * what is required, which sources are off, what activation will change.
 */
export function buildUnavailableTrustCard(
  kind: TrustInsightKind,
  options: { id?: string; reasonCode?: string; requirementCode?: string } = {},
): TrustCardV1 {
  return buildTrustCard({
    id: options.id ?? `${kind}-unavailable`,
    kind,
    status: "unavailable",
    unavailable: {
      reasonCode:
        options.reasonCode ??
        `intelligence.trustCard.reason.${KIND_REASON_LEAF[kind]}`,
      requirementCode:
        options.requirementCode ??
        "intelligence.trustCard.requirement.ownerEnableStore",
      disabledSourceKeys: disabledSourceKeysFor(kind),
      afterActivationCode: "intelligence.trustCard.after.activation",
    },
  });
}

// ── Eurostat context cards ───────────────────────────────────────────────────

/** Visible attribution required by the Eurostat reuse terms — a stable i18n
 *  code, never an endorsement/partnership claim. */
export const EUROSTAT_ATTRIBUTION_CODE = "intelligence.eurostat.attribution";

/** The Eurostat dataset code each context kind draws from (documentation /
 *  card subtitle). Kept in lock-step with eurostat-source-v1.ts. */
export const EUROSTAT_KIND_DATASET: Record<
  (typeof EUROSTAT_TRUST_KINDS)[number],
  string
> = {
  eurostat_employment: "lfsi_emp_q",
  eurostat_unemployment: "une_rt_m",
  eurostat_vacancy: "ei_lmjv_q_r2",
  eurostat_labour_cost: "lc_lci_r2_q",
};

/**
 * The four European labour-market context cards. Until the owner activates
 * the eurostat source (and one bounded import writes public_aggregate rows)
 * there is no deterministic figure, so every card is an HONEST unavailable
 * card: WHY (source not yet activated), WHAT is required (owner activation),
 * WHICH source is off (eurostat), and WHAT changes after activation — never
 * a placeholder number, never "coming soon".
 *
 * This is the smallest useful Eurostat surface and reuses the canonical
 * Trust Card engine (buildUnavailableTrustCard) exactly.
 */
export function buildEurostatContextCards(): readonly TrustCardV1[] {
  return EUROSTAT_TRUST_KINDS.map((kind) =>
    buildUnavailableTrustCard(kind, {
      id: `${kind}-context`,
      requirementCode:
        "intelligence.trustCard.requirement.eurostatActivation",
    }),
  );
}

// ── Worker salary benchmark card ─────────────────────────────────────────────

/** SLA for the admin-curated benchmark: fresh within 90 days, stale within
 *  270, expired after — a documented policy default, not a measurement. */
export const CURATED_BENCHMARK_SLA_DAYS = 90;

/**
 * The worker's own salary-vs-benchmark card, composed ONLY from the existing
 * deterministic read result (benchmark + comparison). Honest paths:
 *  - compared            → ready card with a full trust report;
 *  - not_comparable /
 *    insufficient / null → unavailable card that says why.
 * Confidence is DERIVED (curated benchmarks carry no sample size, so it is
 * honestly "unknown" today — never upgraded). The timeline uses only REAL
 * timestamps (the benchmark's entry date, the render request time).
 */
export function buildWorkerSalaryTrustCard(
  input: {
    benchmark: SalaryBenchmarkV1 | null;
    comparison: SalaryComparisonResult | null;
  } | null,
  nowMs: number,
): TrustCardV1 {
  if (
    !input ||
    !input.benchmark ||
    !input.comparison ||
    input.comparison.kind !== "compared"
  ) {
    // A benchmark EXISTS but the comparison honestly refused — say the real
    // reason (basis unknown/mismatch, or missing own inputs). Claiming "no
    // curated rate exists" here would be false (§18 honesty).
    if (input?.benchmark && input.comparison) {
      if (input.comparison.kind === "not_comparable") {
        return buildUnavailableTrustCard("salary_benchmark", {
          id: "salary-benchmark",
          reasonCode:
            "intelligence.trustCard.reason.salaryBasisNotComparable",
          requirementCode: "intelligence.trustCard.requirement.salaryBasis",
        });
      }
      if (input.comparison.kind === "insufficient_data") {
        return buildUnavailableTrustCard("salary_benchmark", {
          id: "salary-benchmark",
          reasonCode: "intelligence.trustCard.reason.salaryInputsMissing",
          requirementCode: "intelligence.trustCard.requirement.salaryInputs",
        });
      }
    }
    // Genuinely no benchmark — the salary-specific reason + requirement.
    return buildUnavailableTrustCard("salary_benchmark", {
      id: "salary-benchmark",
      requirementCode: "intelligence.trustCard.requirement.salaryBenchmark",
    });
  }
  const { benchmark, comparison } = input;
  const profile = getSourceProfile(benchmark.sourceKey);
  const freshness = buildFreshness(
    { observedAtIso: benchmark.observedAtIso },
    nowMs,
  );
  const report = buildTrustReport({
    // The comparison's existing V1 explanation is revalidated verbatim.
    explanation: comparison.explanation,
    whyVisibleCode: "intelligence.trust.whyVisible.roleMatched",
    // The observation store is a gated migration — there are no observation
    // rows to reference yet, and the report must ADMIT that.
    observationRefs: [],
    freshness,
    confidence: deriveConfidence({
      sampleSize: benchmark.sampleSize,
      freshness: computeFreshness(
        benchmark.observedAtIso,
        nowMs,
        CURATED_BENCHMARK_SLA_DAYS,
      ),
      sourceLegalStatus: profile?.legalStatus ?? null,
      // The curated benchmark carries no provenance chain — honest null.
      provenanceStepCount: null,
    }),
    sourceKeys: [benchmark.sourceKey],
    notKnownCodes: [
      "intelligence.trust.notKnown.noObservationStore",
      ...benchmark.uncertaintyCodes,
    ],
    conflict: null,
  });
  const nowIso = new Date(nowMs).toISOString();
  const timeline = buildTimeline([
    {
      stage: "observation",
      timestampIso: benchmark.observedAtIso,
      actorCode: "intelligence.timeline.actor.admin",
      provenanceRef: benchmark.sourceKey,
      explanationCode: "intelligence.timeline.explain.curatedEntry",
    },
    {
      stage: "insight",
      timestampIso: nowIso,
      actorCode: "intelligence.timeline.actor.system",
      provenanceRef: "salary-model/compareSalaryToBenchmark",
      explanationCode: "intelligence.timeline.explain.deterministicComparison",
    },
    {
      stage: "visible",
      timestampIso: nowIso,
      actorCode: "intelligence.timeline.actor.system",
      provenanceRef: "trust-card/salary-benchmark",
      explanationCode: "intelligence.timeline.explain.renderedForYou",
    },
  ]);
  return buildTrustCard({
    id: "salary-benchmark",
    kind: "salary_benchmark",
    status: report.conflict?.kind === "conflict" ? "conflict" : "ready",
    headlineCode: `intelligence.cards.salary.band.${comparison.band}`,
    headlineParams: { positionPct: comparison.positionPct },
    report,
    // A timeline only renders when it validated — never a broken flow.
    timeline: timeline.ok ? timeline.timeline : null,
  });
}

// ── Company demand card ──────────────────────────────────────────────────────

/**
 * The organisation's own demand-aggregate card (cohort-banded counts over
 * its OWN rows). Sample size = the sum of exact (cohort-passed) band counts;
 * when every band is small-sample the sample is honestly null → confidence
 * "unknown". Provenance is the single documented derivation step (own rows →
 * aggregate), so provenanceStepCount is 1 by construction.
 */
export function buildCompanyDemandTrustCard(
  input: {
    demandAggregates: readonly DemandAggregateItem[];
    windowStart: string;
    windowEnd: string;
  } | null,
  nowMs: number,
): TrustCardV1 {
  if (!input || input.demandAggregates.length === 0) {
    return buildUnavailableTrustCard("demand", {
      id: "company-demand",
      reasonCode: "intelligence.trustCard.reason.demandNoOwnRows",
      requirementCode: "intelligence.trustCard.requirement.demandOwnRows",
    });
  }
  const { demandAggregates, windowStart, windowEnd } = input;
  const exactCounts = demandAggregates
    .map((a) => (a.band.kind === "exact" ? a.band.count : null))
    .filter((n): n is number => n !== null);
  const sampleSize =
    exactCounts.length > 0 ? exactCounts.reduce((a, b) => a + b, 0) : null;
  const nowIso = new Date(nowMs).toISOString();
  const report = buildTrustReport({
    explanation: demandAggregates[0].explanation,
    whyVisibleCode: "intelligence.trust.whyVisible.ownDemandRows",
    observationRefs: [],
    freshness: buildFreshness(
      { sourceDateIso: windowEnd, computedAtIso: nowIso },
      nowMs,
    ),
    confidence: deriveConfidence({
      sampleSize,
      // Computed on request over the trailing window — fresh by definition
      // of the read (the window ends today); a stored observation would
      // instead carry its own persisted freshness status.
      freshness: "fresh",
      sourceLegalStatus:
        getSourceProfile("internal_platform_aggregates")?.legalStatus ?? null,
      provenanceStepCount: 1,
    }),
    sourceKeys: ["internal_platform_aggregates"],
    notKnownCodes: [
      "intelligence.trust.notKnown.noObservationStore",
      // The drawer's step-by-step derivation describes the FIRST bucket;
      // with several buckets that limitation is disclosed, not hidden.
      ...(demandAggregates.length > 1
        ? ["intelligence.trust.notKnown.demandMultiBucket"]
        : []),
    ],
    conflict: null,
  });
  const timeline = buildTimeline([
    {
      stage: "aggregation",
      timestampIso: nowIso,
      actorCode: "intelligence.timeline.actor.system",
      provenanceRef: `customer_requests ${windowStart}..${windowEnd}`,
      explanationCode: "intelligence.timeline.explain.aggregatedOwnRows",
    },
    {
      stage: "insight",
      timestampIso: nowIso,
      actorCode: "intelligence.timeline.actor.system",
      provenanceRef: demandAggregates[0].computationVersion,
      explanationCode: "intelligence.timeline.explain.deterministicComparison",
    },
    {
      stage: "visible",
      timestampIso: nowIso,
      actorCode: "intelligence.timeline.actor.system",
      provenanceRef: "trust-card/company-demand",
      explanationCode: "intelligence.timeline.explain.renderedForYou",
    },
  ]);
  return buildTrustCard({
    id: "company-demand",
    kind: "demand",
    status: "ready",
    headlineCode: "intelligence.cards.skillScarcity.headline",
    headlineParams: { count: demandAggregates.length },
    report,
    timeline: timeline.ok ? timeline.timeline : null,
  });
}

// ── Opportunity context row ──────────────────────────────────────────────────

/**
 * The five market-context cards for the worker opportunities surface: the
 * salary benchmark card from the worker's own deterministic read, plus the
 * four honest unavailable placeholders (demand / supply / skill gap /
 * market trend) — each explaining why it is empty and what activation will
 * change. NOTHING here fabricates a figure.
 */
export function buildOpportunityInsightRow(
  salary: {
    benchmark: SalaryBenchmarkV1 | null;
    comparison: SalaryComparisonResult | null;
  } | null,
  nowMs: number,
): readonly TrustCardV1[] {
  return [
    buildWorkerSalaryTrustCard(salary, nowMs),
    buildUnavailableTrustCard("demand"),
    buildUnavailableTrustCard("supply"),
    buildUnavailableTrustCard("skill_gap"),
    buildUnavailableTrustCard("market_trend"),
  ];
}
