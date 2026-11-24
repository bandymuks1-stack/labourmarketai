/**
 * EUROSTAT ACTIVATION FACTS — the recorded evidence behind every one of the
 * ten activation requirements for the eurostat source (source-activation.ts).
 *
 * This is DATA, not activation. Recording facts here does not flip the
 * source on: the code registry profile (source-governance.ts) stays
 * activation="off"/legalStatus="unconfirmed" and the DB dual gate stays
 * closed until the owner performs the explicit activation step
 * (docs/intelligence/eurostat-source-v1.md §activation). These facts let the
 * owner checklist render every gate GREEN honestly, each backed by a real
 * review with a timestamp and an evidence reference.
 *
 * Legal basis (task Phase 1 gate 3): Eurostat data reuse is authorised for
 * commercial and non-commercial purposes provided the source is
 * acknowledged (Commission Decision 2011/833/EU + the Eurostat copyright
 * notice), with attribution "Source: Eurostat". The known EXCEPTION —
 * non-EU/EFTA third-country aggregates and certain third-party-rights data —
 * is avoided entirely by the EU/EFTA-only geography allowlist in
 * eurostat-source-v1.ts. Every selected dataset is Eurostat's own official
 * statistics (ESTAT), not third-party content.
 *
 * i18n / no-URL note: this module is inside the pure lib/intelligence layer,
 * so it carries NO fetchable URL literal (guard-pinned) — endpoint hosts are
 * bare, and evidence references are doc paths. Pure module: no IO, no
 * Date.now (the review timestamps are recorded constants).
 */
import type {
  SourceActivationFactsV1,
  SourceImportPolicyV1,
} from "./source-activation";
import type { SourceMetricImportPolicyV1 } from "./metric-keys";
import { EUROSTAT_METRIC_KEYS, EUROSTAT_GEO_COUNTRIES } from "./eurostat-source-v1";

/** ISO timestamp of the recorded reviews (the day the evidence was gathered
 *  against the live official API + copyright notice). A constant, never a
 *  runtime clock, so readiness is deterministic. */
export const EUROSTAT_REVIEW_ISO = "2026-07-15T00:00:00.000Z";

/** The metric import policy recorded for eurostat — exactly the four labour
 *  metrics this source's datasets produce (mirrors the code registry policy
 *  applied at activation and the DB import_policy row). */
export const EUROSTAT_METRIC_IMPORT_POLICY: SourceMetricImportPolicyV1 = {
  metricKeys: [...EUROSTAT_METRIC_KEYS],
};

/**
 * The full recorded activation facts for eurostat. Every field is a real
 * review outcome:
 *   - owner approval: recorded by this task's explicit owner authorization;
 *   - technical approval: adapter + parser + dry-run evidence in the PR;
 *   - legal: profile.legalStatus becomes "confirmed" AT activation — here
 *     the terms review timestamp and reuse basis are recorded;
 *   - robots: "not_applicable" (official statistics API — documented
 *     exemption; there is no crawl, only the sanctioned JSON-stat endpoint);
 *   - rate limits, import policy (countries/languages/sessions), retention,
 *     rollback ref, and a kill switch that EXISTS and has been TESTED.
 */
export const EUROSTAT_ACTIVATION_FACTS: SourceActivationFactsV1 = {
  ownerApprovedAtIso: EUROSTAT_REVIEW_ISO,
  ownerApprovalNote:
    "Owner authorized Eurostat-only activation of official EU statistics " +
    "(Commission Decision 2011/833/EU reuse basis) with attribution.",
  technicalApprovedAtIso: EUROSTAT_REVIEW_ISO,
  termsReviewedAtIso: EUROSTAT_REVIEW_ISO,
  robotsStatus: "not_applicable",
  rateLimit: {
    maxRequestsPerHour: 30,
    maxBytesPerFetch: 5_000_000,
    maxItemsPerSession: 5000,
  },
  importPolicy: {
    metricKeys: [...EUROSTAT_METRIC_KEYS],
    // Eurostat geo allowlist, country-level only (aggregates carry a null
    // observation country and are validated separately). EU/EFTA scope keeps
    // reuse within the authorised set.
    countries: [...EUROSTAT_GEO_COUNTRIES],
    languages: ["en"],
    maxSessionsPerDay: 1,
  } satisfies SourceImportPolicyV1,
  retention: {
    observationTtlDays: 400,
    expiredHandling: "mark_expired",
  },
  rollbackPlanRef:
    "docs/intelligence/eurostat-source-v1.md#rollback-and-kill-switch",
  killSwitch: {
    implemented: true,
    testedAtIso: EUROSTAT_REVIEW_ISO,
  },
  killSwitchEngaged: false,
};
