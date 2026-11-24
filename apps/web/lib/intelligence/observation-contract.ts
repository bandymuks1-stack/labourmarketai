/**
 * Labour Market Intelligence — versioned OBSERVATION contract (v1).
 *
 * An intelligence observation is one sourced, dated, versioned market DATA
 * POINT (e.g. "median declared monthly salary for profession X in LT over
 * window W was N EUR, from source S"). Observations are NOT user facts:
 *
 *   - they must be stored in their OWN table (market_intelligence_observations,
 *     owner-gated migration owned by another agent — field names here mirror
 *     that table EXACTLY) and never written into canonical tables
 *     (workers / customer_requests / worker_skills / …);
 *   - they must be DISPLAYED separately from canonical data, always with
 *     their source badge and window — an external benchmark figure must
 *     never be presented as a LabourMarket.ai average (§18 no-fake-data);
 *   - every observation carries full provenance (sourceKind/sourceKey/
 *     sourceUrl or internal derivationIds), a capture timestamp, a transform
 *     version and a content hash, so any displayed number is traceable.
 *
 * i18n: this layer emits stable codes and machine values only — never
 * display strings. Pure module: no IO, no Date.now, no fetch.
 */
import { z } from "zod";

export const INTELLIGENCE_CONTRACT_VERSION = "1";

// ── Closed vocabularies (mirror the DB CHECK constraints) ───────────────────

export const OBSERVATION_SUBJECT_KINDS = [
  "role",
  "skill",
  "profession",
  "geo_market",
  "company_need",
  "platform",
] as const;
export type ObservationSubjectKind = (typeof OBSERVATION_SUBJECT_KINDS)[number];

export const OBSERVATION_STAT_METHODS = [
  "mean",
  "median",
  "p25",
  "p75",
  "count",
  "ratio",
] as const;
export type ObservationStatMethod = (typeof OBSERVATION_STAT_METHODS)[number];

export const OBSERVATION_SOURCE_KINDS = [
  "internal_aggregated",
  "public_official",
  "licensed_partner",
  "approved_public_web",
] as const;
export type ObservationSourceKind = (typeof OBSERVATION_SOURCE_KINDS)[number];

export const OBSERVATION_PRIVACY_CLASSES = [
  "public_aggregate",
  "tenant_aggregate",
  "internal_only",
] as const;
export type ObservationPrivacyClass =
  (typeof OBSERVATION_PRIVACY_CLASSES)[number];

export const OBSERVATION_FRESHNESS_STATUSES = [
  "fresh",
  "stale",
  "expired",
  "unverified",
] as const;
export type ObservationFreshnessStatus =
  (typeof OBSERVATION_FRESHNESS_STATUSES)[number];

// ── Field schemas ────────────────────────────────────────────────────────────

const METRIC_KEY_RE = /^[a-z0-9_.]+$/;
const ISO_COUNTRY_RE = /^[A-Z]{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE_RE, "expected ISO date (YYYY-MM-DD)")
  .refine((s) => Number.isFinite(Date.parse(s)), "invalid calendar date");

const isoDateTime = z
  .string()
  .min(1)
  .refine((s) => Number.isFinite(Date.parse(s)), "invalid ISO datetime");

export const observationGeoSchema = z
  .object({
    /** ISO-3166 alpha-2, uppercase — or honest null (no geography). */
    country: z.string().regex(ISO_COUNTRY_RE).nullable(),
    region: z.string().min(1).nullable(),
    city: z.string().min(1).nullable(),
  })
  .strict();
export type ObservationGeo = z.infer<typeof observationGeoSchema>;

export const observationWindowSchema = z
  .object({
    start: isoDate,
    end: isoDate,
  })
  .strict()
  .refine((w) => Date.parse(w.end) >= Date.parse(w.start), {
    message: "window end must be >= window start",
  });
export type ObservationWindow = z.infer<typeof observationWindowSchema>;

export const observationProvenanceStepSchema = z
  .object({
    step: z.string().min(1).max(120),
    ref: z.string().min(1).max(400),
  })
  .strict();
export type ObservationProvenanceStep = z.infer<
  typeof observationProvenanceStepSchema
>;

// ── The observation ──────────────────────────────────────────────────────────

export const intelligenceObservationSchema = z
  .object({
    subjectKind: z.enum(OBSERVATION_SUBJECT_KINDS),
    /** Canonical id or slug of the subject (profession slug, skill slug…). */
    subjectId: z.string().min(1).max(200),
    metricKey: z.string().regex(METRIC_KEY_RE).max(120),
    geo: observationGeoSchema,
    window: observationWindowSchema,
    valueNumeric: z.number().finite(),
    /** e.g. "eur_month_gross", "eur_month_net", "count", "percent". */
    unit: z.string().min(1).max(60),
    statMethod: z.enum(OBSERVATION_STAT_METHODS),
    sourceKind: z.enum(OBSERVATION_SOURCE_KINDS),
    /** Source registry key (see ./source-governance.ts). */
    sourceKey: z.string().min(1).max(120),
    /** REQUIRED (non-null) for every non-internal source — refined below. */
    sourceUrl: z.string().min(1).max(2000).nullable(),
    /** Internal derivation ids — required non-empty for internal sources. */
    derivationIds: z.array(z.string().min(1).max(200)).max(200),
    capturedAt: isoDateTime,
    validFrom: isoDateTime,
    validTo: isoDateTime.nullable(),
    sampleSize: z.number().int().min(0).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    transformVersion: z.string().min(1).max(40),
    privacyClass: z.enum(OBSERVATION_PRIVACY_CLASSES),
    freshnessStatus: z.enum(OBSERVATION_FRESHNESS_STATUSES),
    /** Provenance chain, first step = origin. */
    provenance: z.array(observationProvenanceStepSchema).max(50),
    contentHash: z.string().min(1).max(128),
  })
  .strict()
  .refine(
    (o) => o.sourceKind === "internal_aggregated" || o.sourceUrl !== null,
    {
      message:
        "sourceUrl is required for every non-internal source (traceability)",
      path: ["sourceUrl"],
    },
  )
  .refine(
    (o) => o.sourceKind !== "internal_aggregated" || o.derivationIds.length > 0,
    {
      message:
        "internal_aggregated observations must carry at least one derivationId",
      path: ["derivationIds"],
    },
  );

export type IntelligenceObservationV1 = z.infer<
  typeof intelligenceObservationSchema
>;

// ── Freshness ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Freshness from capture age against a per-metric SLA:
 * fresh within `slaDays`, stale within 3×`slaDays`, expired after.
 * Deterministic — the caller supplies `nowMs`, never Date.now() here.
 * An unparsable timestamp is treated as expired (never optimistically fresh).
 */
export function computeFreshness(
  capturedAtIso: string,
  nowMs: number,
  slaDays: number,
): "fresh" | "stale" | "expired" {
  const capturedMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(capturedMs) || slaDays <= 0) return "expired";
  const ageDays = (nowMs - capturedMs) / DAY_MS;
  if (ageDays <= slaDays) return "fresh";
  if (ageDays <= 3 * slaDays) return "stale";
  return "expired";
}
