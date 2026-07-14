import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  buildSalaryIntelligenceView,
  compareSalaryToBenchmark,
  toSalaryBenchmark,
  type SalaryBenchmarkV1,
  type SalaryComparisonResult,
  type SalaryIntelligenceView,
} from "./salary-model";
import {
  aggregateSkillDemand,
  INTELLIGENCE_CALC_VERSION,
  type DemandAggregateItem,
  type DemandInputRow,
} from "./skills-demand-model";
import {
  buildInsightQueryLogRecord,
  type InsightQueryLogRecord,
} from "./privacy";

/**
 * Intelligence READ layer — composes existing canonical reads with honest
 * per-source degradation (style: lib/workforce/workforce.ts):
 *  - market_rate_averages (applied migration, authenticated-readable) feeds
 *    the admin-curated benchmark;
 *  - market_intelligence_observations / market_intelligence_insight_queries
 *    are GATED draft migrations owned by another agent — every read/write
 *    catches 42P01/PGRST205 and degrades to "needs-migration" / soft-false;
 *  - everything stays RLS-scoped (createClient) — no service-role client
 *    here at all; the best-effort query log insert (persistAiRunAudit-style
 *    never-throw semantics) runs as the viewer and fails soft.
 * Nothing here throws for a missing table, and nothing fabricates a number.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTableCode(code: string | null | undefined): boolean {
  return MISSING_TABLE_CODES.has(code ?? "");
}

// ── Curated salary benchmarks (market_rate_averages) ─────────────────────────

export type SalaryBenchmarksResult =
  | { readonly kind: "ok"; readonly benchmarks: readonly SalaryBenchmarkV1[] }
  | { readonly kind: "insufficient_data" };

/**
 * Admin-curated market averages for a profession × country. The table's
 * `basis` is 'monthly_eur' — it does NOT specify gross/net, so the benchmark
 * basis is honestly "unknown" (comparisons then surface "basis_unknown"
 * instead of guessing a tax model). sampleSize is null by design for this
 * curated source (source_note provenance instead) — the salary model carries
 * the "curated_no_sample_size" uncertainty for it.
 */
export async function getSalaryBenchmarksForRole(input: {
  professionId: string;
  country: string;
}): Promise<SalaryBenchmarksResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("market_rate_averages")
    .select("id, avg_rate_eur, basis, country, entered_at, source_note")
    .eq("profession_id", input.professionId)
    .eq("country", input.country)
    .eq("is_active", true)
    .order("entered_at", { ascending: false })
    .limit(10);
  if (error || !Array.isArray(data) || data.length === 0) {
    return { kind: "insufficient_data" };
  }
  const benchmarks: SalaryBenchmarkV1[] = [];
  for (const r of data as {
    id: string;
    avg_rate_eur: unknown;
    basis: string;
    country: string;
    entered_at: string;
  }[]) {
    const built = toSalaryBenchmark({
      valueEur: Number(r.avg_rate_eur),
      // 'monthly_eur' carries no gross/net information — honest "unknown".
      basis: "unknown",
      statMethod: "mean",
      geo: { country: r.country, region: null, city: null },
      sampleSize: null, // curated source — source_note instead of a sample
      sourceKey: "admin_market_rate_averages",
      sourceKind: "internal_aggregated",
      observedAtIso: r.entered_at,
      originKind: "internal",
    });
    if (built.ok) benchmarks.push(built.benchmark);
  }
  return benchmarks.length > 0
    ? { kind: "ok", benchmarks }
    : { kind: "insufficient_data" };
}

// ── Observations store (GATED migration — degrade honestly) ─────────────────

export interface ObservationFilter {
  readonly subjectKind?: string;
  readonly subjectId?: string;
  readonly metricKey?: string;
  readonly country?: string;
  readonly limit?: number;
}

export type ObservationsReadResult =
  | { readonly kind: "ok"; readonly rows: readonly Record<string, unknown>[] }
  | { readonly kind: "unavailable"; readonly reason: "needs-migration" }
  | { readonly kind: "error" };

const OBSERVATIONS_READ_LIMIT = 200;

/**
 * Read market_intelligence_observations — NOT YET APPLIED (gated migration).
 * Missing table (42P01/PGRST205) → honest "needs-migration". RLS is expected
 * to expose only privacy_class = 'public_aggregate' rows to viewers.
 */
export async function getIntelligenceObservations(
  filter: ObservationFilter = {},
): Promise<ObservationsReadResult> {
  const supabase = await createClient();
  let q = asAny(supabase)
    .from("market_intelligence_observations")
    .select("*")
    .limit(Math.min(filter.limit ?? OBSERVATIONS_READ_LIMIT, OBSERVATIONS_READ_LIMIT));
  if (filter.subjectKind) q = q.eq("subject_kind", filter.subjectKind);
  if (filter.subjectId) q = q.eq("subject_id", filter.subjectId);
  if (filter.metricKey) q = q.eq("metric_key", filter.metricKey);
  if (filter.country) q = q.eq("geo_country", filter.country);
  const { data, error } = await q;
  if (error) {
    if (isMissingTableCode(error.code)) {
      return { kind: "unavailable", reason: "needs-migration" };
    }
    return { kind: "error" };
  }
  return { kind: "ok", rows: (data ?? []) as Record<string, unknown>[] };
}

// ── Insight query log (best-effort, NEVER throws) ────────────────────────────

function boundedErrorMessage(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown error";
  // Never echo payloads/keys — keep the log short and structural.
  return message.slice(0, 200);
}

/**
 * Best-effort insert into market_intelligence_insight_queries. NEVER throws;
 * returns true only when the row was persisted. Table missing (gated
 * migration) → soft false, the insight is unaffected.
 *
 * Client choice (deliberate): the RLS-scoped request client, NOT the
 * service-role admin client. The chat-visibility guard pins the exact
 * audited inventory of service-role call sites (§17.2 audit doc); adding
 * a service-role writer is an audited decision, not a drive-by.
 * The gated migration should therefore ship an authenticated INSERT-only
 * policy for this append-only log table (viewer inserts their own query
 * record; no read policy needed for users). Until then this fails soft —
 * exactly like every other best-effort log path.
 */
export async function logInsightQuery(
  record: InsightQueryLogRecord,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await asAny(supabase)
      .from("market_intelligence_insight_queries")
      .insert({
        insight_key: record.insightKey.slice(0, 120),
        observation_ids: [...record.observationIds],
        computation_version: record.computationVersion.slice(0, 40),
        viewer_role: record.viewerRole.slice(0, 40),
        profile_id: record.profileId,
        params_summary: record.paramsSummary,
      });
    if (error) {
      if (!isMissingTableCode(error.code)) {
        console.error("[intelligence/read] query log insert failed", {
          message: (error.message ?? "unknown").slice(0, 200),
        });
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error("[intelligence/read] query log insert failed", {
      message: boundedErrorMessage(err),
    });
    return false;
  }
}

// ── Worker composer ──────────────────────────────────────────────────────────

export type WorkerSalaryIntelligence =
  | {
      readonly kind: "ok";
      readonly benchmark: SalaryBenchmarkV1;
      readonly comparison: SalaryComparisonResult;
      readonly view: SalaryIntelligenceView;
    }
  | {
      readonly kind: "insufficient_data";
      /** Which canonical inputs were missing (honest, never guessed). */
      readonly missingCodes: readonly string[];
    }
  | { readonly kind: "no_viewer" };

/**
 * The signed-in WORKER'S own salary intelligence: their declared expectation
 * (workers.salary_min_eur / salary_max_eur — midpoint when both exist) vs
 * the curated benchmark for their primary profession × country. RLS-scoped
 * via createClient; no other user's rows are readable here. The worker's
 * declared range carries no gross/net basis column → basis "unknown"
 * (comparison degrades honestly to "basis_unknown", never a converted
 * number). Query is logged best-effort.
 */
export async function getWorkerSalaryIntelligence(): Promise<WorkerSalaryIntelligence> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no_viewer" };

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id, salary_min_eur, salary_max_eur, current_location_country")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) {
    return { kind: "insufficient_data", missingCodes: ["intelligence.missing.workerProfile"] };
  }

  const missingCodes: string[] = [];
  const minEur = typeof worker.salary_min_eur === "number" ? worker.salary_min_eur : null;
  const maxEur = typeof worker.salary_max_eur === "number" ? worker.salary_max_eur : null;
  const subjectEur =
    minEur !== null && maxEur !== null
      ? (minEur + maxEur) / 2
      : (minEur ?? maxEur);
  if (subjectEur === null || !Number.isFinite(subjectEur) || subjectEur <= 0) {
    missingCodes.push("intelligence.missing.salaryExpectation");
  }
  const country: string | null = worker.current_location_country ?? null;
  if (!country) missingCodes.push("intelligence.missing.country");

  const { data: wp } = await asAny(supabase)
    .from("worker_professions")
    .select("profession_id")
    .eq("worker_id", worker.id)
    .eq("is_primary", true)
    .maybeSingle();
  const professionId: string | null = wp?.profession_id ?? null;
  if (!professionId) missingCodes.push("intelligence.missing.primaryProfession");

  if (missingCodes.length > 0) {
    return { kind: "insufficient_data", missingCodes };
  }

  const benchmarks = await getSalaryBenchmarksForRole({
    professionId: professionId as string,
    country: country as string,
  });
  if (benchmarks.kind !== "ok") {
    return {
      kind: "insufficient_data",
      missingCodes: ["intelligence.missing.benchmark"],
    };
  }
  const benchmark = benchmarks.benchmarks[0];
  const comparison = compareSalaryToBenchmark(
    subjectEur as number,
    // No basis column exists for the worker's declared range — honest unknown.
    "unknown",
    benchmark,
  );

  const logBuild = buildInsightQueryLogRecord({
    insightKey: "worker_salary_vs_benchmark",
    observationIds: [],
    computationVersion: INTELLIGENCE_CALC_VERSION,
    viewerRole: "worker",
    profileId: user.id,
    paramsSummary: { country: country as string, comparisonKind: comparison.kind },
  });
  if (logBuild.ok) await logInsightQuery(logBuild.record);

  return {
    kind: "ok",
    benchmark,
    comparison,
    // Curated internal benchmark only — no external source is active today,
    // and external/internal results are never blended by design.
    view: buildSalaryIntelligenceView(comparison, null),
  };
}

// ── Company composer ─────────────────────────────────────────────────────────

export type CompanyDemandIntelligence =
  | {
      readonly kind: "ok";
      readonly demandAggregates: readonly DemandAggregateItem[];
      readonly windowStart: string;
      readonly windowEnd: string;
    }
  | { readonly kind: "insufficient_data" }
  | { readonly kind: "no_viewer" };

const COMPANY_DEMAND_WINDOW_DAYS = 90;
const COMPANY_DEMAND_READ_LIMIT = 500;

/**
 * The signed-in COMPANY viewer's demand intelligence over their OWN
 * customer_requests (RLS keeps other tenants' rows invisible), aggregated
 * with cohort policy over the trailing 90-day window. Query is logged
 * best-effort.
 */
export async function getCompanyDemandIntelligence(): Promise<CompanyDemandIntelligence> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no_viewer" };

  const nowMs = Date.now();
  const windowStart = new Date(
    nowMs - COMPANY_DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEnd = new Date(nowMs).toISOString();

  const { data, error } = await asAny(supabase)
    .from("customer_requests")
    .select("role_or_work_type, country, location, team_size, created_at")
    .gte("created_at", windowStart)
    .limit(COMPANY_DEMAND_READ_LIMIT);
  if (error || !Array.isArray(data) || data.length === 0) {
    return { kind: "insufficient_data" };
  }

  const rows: DemandInputRow[] = (data as {
    role_or_work_type: string | null;
    country: string | null;
    location: string | null;
    team_size: number | null;
    created_at: string;
  }[]).map((r) => ({
    roleText: r.role_or_work_type,
    country: r.country,
    city: r.location,
    teamSize: r.team_size,
    createdAtIso: r.created_at,
  }));

  const demandAggregates = aggregateSkillDemand(rows, {
    windowStart,
    windowEnd,
  });
  if (demandAggregates.length === 0) {
    return { kind: "insufficient_data" };
  }

  const logBuild = buildInsightQueryLogRecord({
    insightKey: "company_demand_aggregates",
    observationIds: [],
    computationVersion: INTELLIGENCE_CALC_VERSION,
    viewerRole: "company",
    profileId: user.id,
    paramsSummary: {
      windowDays: COMPANY_DEMAND_WINDOW_DAYS,
      buckets: demandAggregates.length,
    },
  });
  if (logBuild.ok) await logInsightQuery(logBuild.record);

  return { kind: "ok", demandAggregates, windowStart, windowEnd };
}
