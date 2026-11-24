/**
 * EUROSTAT LABOUR INTELLIGENCE SOURCE v1 — the closed, deterministic
 * dataset-and-metric contract for the FIRST external intelligence source.
 *
 * This module is the PURE half of the integration: it records exactly which
 * official Eurostat datasets are allowed, how each one maps to exactly one
 * canonical metric key, which dimension values are pinned, which geographies
 * may be imported and which bounds apply. The HTTP half lives OUTSIDE
 * lib/intelligence (apps/web/lib/eurostat-import/) — this layer stays
 * IO-free and URL-free (guard-pinned by intelligence-boundary.test.ts; the
 * `apiPathTemplate` below is a scheme-less path fragment, never fetchable
 * from here).
 *
 * Fail-closed doctrine (mirrors metric-keys.ts / source-governance.ts):
 *   - a dataset code outside EUROSTAT_DATASETS can never be requested,
 *     parsed or imported — there is no wildcard and no prefix rule;
 *   - each dataset maps to EXACTLY ONE metric key and one unit — an
 *     unknown or contradictory unit fails closed in the mapper;
 *   - every non-geo/time dimension is PINNED to one value per dataset —
 *     the comparison identity of every observation is therefore
 *     (metricKey + pinned dimensions + geo + window), and values with
 *     different identities can never be averaged together;
 *   - geographies outside EUROSTAT_GEO_ALLOWLIST are rejected. The list is
 *     EU/EFTA only: the official Eurostat reuse policy (Commission Decision
 *     2011/833/EU) authorises commercial reuse for Eurostat's own data but
 *     NOT for some non-EU/EFTA third-country aggregates — we simply never
 *     import those.
 *
 * Eurostat publishes periodic statistics, NOT live vacancies: nothing in
 * this module may be presented as a job offer, a live vacancy count, an
 * employer fact or a LabourMarket.ai internal average. Pure module: no IO,
 * no Date.now.
 */
import type {
  IntelligenceObservationV1,
  ObservationStatMethod,
} from "./observation-contract";

export const EUROSTAT_SOURCE_KEY = "eurostat";
export const EUROSTAT_TRANSFORM_VERSION = "eurostat_v1";

/** Eurostat labour metric keys introduced by this slice (metric-keys.ts). */
export const EUROSTAT_METRIC_KEYS = [
  "labour.employment_rate",
  "labour.unemployment_rate",
  "labour.job_vacancy_rate",
  "labour.cost_index_yoy",
] as const;
export type EurostatMetricKey = (typeof EUROSTAT_METRIC_KEYS)[number];

/** 1:1 deterministic unit binding for every Eurostat labour metric. */
export const EUROSTAT_METRIC_EXPECTED_UNIT: Readonly<
  Record<EurostatMetricKey, string>
> = {
  // % of the resident population aged 20-64 (Eurostat unit PC_POP).
  "labour.employment_rate": "pc_pop",
  // % of the labour force (Eurostat unit PC_ACT).
  "labour.unemployment_rate": "pc_act",
  // % of total posts: vacancies / (occupied + vacant) — Eurostat JVR.
  "labour.job_vacancy_rate": "pc_posts",
  // % change vs the same quarter of the previous year (Eurostat PCH_SM).
  "labour.cost_index_yoy": "pch_yoy",
};

export type EurostatFrequency = "monthly" | "quarterly";

export interface EurostatDatasetV1 {
  /** Official Eurostat dataset code — the only accepted identifiers. */
  readonly code: string;
  /** Official dataset title as published by Eurostat (EN). */
  readonly officialTitle: string;
  /** The ONE canonical metric this dataset may produce. */
  readonly metricKey: EurostatMetricKey;
  readonly unit: string;
  readonly statMethod: ObservationStatMethod;
  readonly frequency: EurostatFrequency;
  /**
   * PINNED non-geo/time dimension filters — the exact query sent to the
   * official API and the exact comparison identity of every imported value.
   * Keys are Eurostat dimension ids, values are single Eurostat codes.
   */
  readonly pinnedDimensions: Readonly<Record<string, string>>;
  /** Scheme-less official API path fragment (the import layer prefixes the
   *  canonical Eurostat host — never built or fetched here). */
  readonly apiPathTemplate: string;
  /** Freshness SLA in days for computeFreshness (per frequency cadence). */
  readonly freshnessSlaDays: number;
  /** i18n code for the short human meaning of the measure. */
  readonly meaningCode: string;
  /** i18n code for what may NOT be concluded from this dataset. */
  readonly prohibitedClaimCode: string;
}

/**
 * The complete closed set — at most FOUR datasets in the first slice
 * (owner bound). Dimension codes were pinned against live official API
 * responses on 2026-07-15 (see docs/intelligence/eurostat-source-v1.md).
 */
export const EUROSTAT_DATASETS: readonly EurostatDatasetV1[] = [
  {
    code: "lfsi_emp_q",
    officialTitle: "Employment and labour force by sex and age - quarterly data",
    metricKey: "labour.employment_rate",
    unit: "pc_pop",
    statMethod: "ratio",
    frequency: "quarterly",
    pinnedDimensions: {
      indic_em: "EMP_LFS",
      s_adj: "SA",
      sex: "T",
      age: "Y20-64",
      unit: "PC_POP",
    },
    apiPathTemplate: "statistics/1.0/data/lfsi_emp_q",
    freshnessSlaDays: 150,
    meaningCode: "intelligence.eurostat.meaning.employmentRate",
    prohibitedClaimCode: "intelligence.eurostat.prohibited.employmentRate",
  },
  {
    code: "une_rt_m",
    officialTitle: "Unemployment by sex and age - monthly data",
    metricKey: "labour.unemployment_rate",
    unit: "pc_act",
    statMethod: "ratio",
    frequency: "monthly",
    pinnedDimensions: {
      s_adj: "SA",
      age: "TOTAL",
      sex: "T",
      unit: "PC_ACT",
    },
    apiPathTemplate: "statistics/1.0/data/une_rt_m",
    freshnessSlaDays: 60,
    meaningCode: "intelligence.eurostat.meaning.unemploymentRate",
    prohibitedClaimCode: "intelligence.eurostat.prohibited.unemploymentRate",
  },
  {
    code: "ei_lmjv_q_r2",
    officialTitle: "Job vacancy rate - quarterly data",
    metricKey: "labour.job_vacancy_rate",
    unit: "pc_posts",
    statMethod: "ratio",
    frequency: "quarterly",
    pinnedDimensions: {
      s_adj: "SA",
      nace_r2: "B-S",
      sizeclas: "TOTAL",
      indic: "JVR",
    },
    apiPathTemplate: "statistics/1.0/data/ei_lmjv_q_r2",
    freshnessSlaDays: 150,
    meaningCode: "intelligence.eurostat.meaning.jobVacancyRate",
    prohibitedClaimCode: "intelligence.eurostat.prohibited.jobVacancyRate",
  },
  {
    code: "lc_lci_r2_q",
    officialTitle:
      "Labour cost index by NACE Rev. 2 activity - nominal value, quarterly data",
    metricKey: "labour.cost_index_yoy",
    unit: "pch_yoy",
    statMethod: "ratio",
    frequency: "quarterly",
    pinnedDimensions: {
      unit: "PCH_SM",
      s_adj: "CA",
      nace_r2: "B-S",
      lcstruct: "D1_D4_MD5",
    },
    apiPathTemplate: "statistics/1.0/data/lc_lci_r2_q",
    freshnessSlaDays: 150,
    meaningCode: "intelligence.eurostat.meaning.labourCostIndex",
    prohibitedClaimCode: "intelligence.eurostat.prohibited.labourCostIndex",
  },
];

export function getEurostatDataset(code: string): EurostatDatasetV1 | null {
  return EUROSTAT_DATASETS.find((d) => d.code === code) ?? null;
}

/**
 * Geography allowlist — Eurostat geo codes, EU/EFTA scope only (reuse-policy
 * safe). Aggregates first, then EU-27 members, then EFTA. NOTE: Eurostat
 * uses "EL" for Greece (not ISO "GR"); observations retain the Eurostat
 * code, and the recorded import policy lists the same codes so the country
 * check compares like with like.
 */
export const EUROSTAT_GEO_AGGREGATES = ["EU27_2020", "EA20"] as const;
export const EUROSTAT_GEO_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES",
  "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  // EFTA
  "CH", "IS", "LI", "NO",
] as const;
export const EUROSTAT_GEO_ALLOWLIST: readonly string[] = [
  ...EUROSTAT_GEO_AGGREGATES,
  ...EUROSTAT_GEO_COUNTRIES,
];

const TWO_LETTER_GEO = /^[A-Z]{2}$/;

export function isAllowedEurostatGeo(code: string): boolean {
  return EUROSTAT_GEO_ALLOWLIST.includes(code);
}

/** Observation geo mapping: two-letter Eurostat codes ride in geo.country;
 *  supranational aggregates carry an honest null country (the aggregate
 *  identity lives in subjectId). */
export function toObservationGeoCountry(geoCode: string): string | null {
  return TWO_LETTER_GEO.test(geoCode) ? geoCode : null;
}

// ── Import bounds (owner-approved, encoded — not advisory) ──────────────────

export const EUROSTAT_IMPORT_BOUNDS = {
  /** Latest N periods per series — never a full historical backfill. */
  maxPeriodsPerSeries: 24,
  /** Hard cap on accepted observations per import session. */
  maxAcceptedPerSession: 5000,
  /** One request per dataset per session; at most one session per day. */
  maxRequestsPerSession: EUROSTAT_DATASETS.length,
  maxSessionsPerDay: 1,
  /** Conservative application limits (Eurostat publishes no numeric rate
   *  limit — absence is not permission): sequential requests only, with a
   *  minimum spacing, bounded response size and bounded retries. */
  minRequestSpacingMs: 1500,
  maxRequestsPerHour: 30,
  requestTimeoutMs: 30_000,
  maxResponseBytes: 5_000_000,
  maxRetries: 2,
  retryBackoffMs: 5_000,
} as const;

// ── Period → observation window mapping ─────────────────────────────────────

const MONTH_PERIOD = /^(\d{4})-(\d{2})$/;
const QUARTER_PERIOD = /^(\d{4})-Q([1-4])$/;

export interface EurostatWindow {
  readonly start: string;
  readonly end: string;
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Deterministic mapping from an official Eurostat time code to the
 * observation window. Unknown period shapes return null (fail closed) —
 * they are never guessed.
 */
export function eurostatPeriodToWindow(period: string): EurostatWindow | null {
  const m = MONTH_PERIOD.exec(period);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return {
      start: `${m[1]}-${m[2]}-01`,
      end: `${m[1]}-${m[2]}-${pad2(lastDayOfMonth(year, month))}`,
    };
  }
  const q = QUARTER_PERIOD.exec(period);
  if (q) {
    const year = q[1];
    const quarter = Number(q[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      start: `${year}-${pad2(startMonth)}-01`,
      end: `${year}-${pad2(endMonth)}-${pad2(lastDayOfMonth(Number(year), endMonth))}`,
    };
  }
  return null;
}

// ── Eurostat observation-status flags ────────────────────────────────────────

/** Official flags we disclose (JSON-stat `status`). A flagged value is
 *  imported WITH its flag preserved in provenance — never silently cleaned.
 *  Confidential/suppressed values are never imported at all. */
export const EUROSTAT_DISCLOSED_FLAGS: Readonly<Record<string, string>> = {
  p: "provisional",
  e: "estimated",
  b: "break_in_series",
  d: "definition_differs",
  f: "forecast",
  u: "low_reliability",
};

/** Flags that make a value unusable — the point is rejected, never zeroed. */
export const EUROSTAT_REJECT_FLAGS: ReadonlySet<string> = new Set([
  "c", // confidential
  ":", // missing marker used by some SDMX renderings
  "n", // not significant / not applicable
]);

// ── Typed observation guard for read-side consumers ─────────────────────────

export function isEurostatObservation(o: IntelligenceObservationV1): boolean {
  return (
    o.sourceKey === EUROSTAT_SOURCE_KEY &&
    (EUROSTAT_METRIC_KEYS as readonly string[]).includes(o.metricKey)
  );
}
