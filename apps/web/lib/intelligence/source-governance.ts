/**
 * Intelligence SOURCE GOVERNANCE — the registry of every data source the
 * intelligence layer may ever cite, with per-source legal status and
 * activation state.
 *
 * Doctrine (root CLAUDE.md + PLATFORM_DOCTRINE §18):
 *   - LabourMarket.ai NEVER scrapes anything itself — no fetch, no crawler,
 *     no HTTP in this layer (guard-pinned: intelligence-boundary.test.ts).
 *   - An EXTERNAL source may only activate after the owner confirms its
 *     legal/terms status (legalStatus "confirmed") AND flips activation to
 *     "on". Today EVERY external source is proposed-only and OFF.
 *   - Internal derivation from canonical tables (already RLS-scoped, already
 *     cohort-protected by ./privacy.ts) is always allowed.
 *
 * i18n: displayNameCode / termsNoteCode are stable i18n codes — never
 * display strings. `homepage` is a bare hostname (no scheme) — this layer
 * never builds fetchable URLs. Pure module: no IO.
 */
import type { ObservationSourceKind } from "./observation-contract";
import type { SourceMetricImportPolicyV1 } from "./metric-keys";
// Leaf import (eurostat-source-v1 depends only on observation-contract types —
// no cycle back to this module). Used for the ACTIVATED eurostat policy.
import { EUROSTAT_METRIC_KEYS } from "./eurostat-source-v1";

export type SourceLegalStatus = "confirmed" | "unconfirmed" | "refused";
export type SourceActivation = "off" | "owner_review" | "on";

export interface IntelligenceSourceProfile {
  readonly key: string;
  /** i18n code for the display name — never a display string here. */
  readonly displayNameCode: string;
  readonly sourceKind: ObservationSourceKind;
  readonly legalStatus: SourceLegalStatus;
  readonly activation: SourceActivation;
  /** i18n code for the terms/usage note. */
  readonly termsNoteCode: string;
  readonly attributionRequired: boolean;
  /** Bare hostname (no scheme) — informational only, never fetched. */
  readonly homepage: string | null;
  /** True = the source is only ever a PROPOSAL until the owner confirms. */
  readonly proposedOnly: boolean;
  /**
   * The RECORDED metric import policy — the closed set of metric keys this
   * source may ever produce. null = not recorded, and a source without a
   * usable policy validates NOTHING (fail-closed), however active or
   * approved it is. For external sources this stays null until the OWNER
   * records the permitted metrics during the activation process — it is
   * never inferred here. Internal policies below are code facts: they list
   * exactly the metrics the platform's own derivations produce.
   */
  readonly importPolicy: SourceMetricImportPolicyV1 | null;
}

export const INTELLIGENCE_SOURCE_PROFILES: readonly IntelligenceSourceProfile[] =
  [
    {
      key: "internal_platform_aggregates",
      displayNameCode: "intelligence.sources.internalPlatformAggregates",
      sourceKind: "internal_aggregated",
      legalStatus: "confirmed",
      // Internal derivation from canonical tables is always allowed — the
      // cohort policy in ./privacy.ts is what protects individuals.
      activation: "on",
      termsNoteCode: "intelligence.sources.terms.internal",
      attributionRequired: false,
      homepage: null,
      proposedOnly: false,
      // Code fact: skills-demand-model.ts derives exactly these two
      // aggregates from canonical rows — nothing else is produced today.
      importPolicy: {
        metricKeys: [
          "demand.role_request_count",
          "demand.skill_request_count",
        ],
      },
    },
    {
      key: "admin_market_rate_averages",
      displayNameCode: "intelligence.sources.adminMarketRateAverages",
      sourceKind: "internal_aggregated",
      legalStatus: "confirmed",
      // The existing admin-curated market_rate_averages table — internal,
      // owner-entered, carries source_note instead of a sample size.
      activation: "on",
      termsNoteCode: "intelligence.sources.terms.adminCurated",
      attributionRequired: false,
      homepage: null,
      proposedOnly: false,
      // Code fact: curated market rates are salary benchmarks in the four
      // unit shapes the salary-structure check accepts (month/hour ×
      // gross/net) — see SALARY_METRIC_UNITS.
      importPolicy: {
        metricKeys: [
          "salary.month.gross",
          "salary.month.net",
          "salary.hour.gross",
          "salary.hour.net",
        ],
      },
    },
    {
      key: "stat_gov_lt",
      // Statistics Lithuania / State Data Agency — official statistics.
      displayNameCode: "intelligence.sources.statGovLt",
      sourceKind: "public_official",
      legalStatus: "unconfirmed",
      activation: "off",
      termsNoteCode: "intelligence.sources.terms.statGovLt",
      attributionRequired: true,
      homepage: "osp.stat.gov.lt",
      proposedOnly: true,
      // Not recorded — an owner decision during activation. Fail-closed.
      importPolicy: null,
    },
    {
      // ACTIVATED 2026-07-15 (owner authorization) — the first and ONLY
      // external source switched on. Legal basis: Commission Decision
      // 2011/833/EU, commercial reuse with attribution "Source: Eurostat",
      // EU/EFTA scope only (see docs/intelligence/eurostat-legal-evidence-v1.md
      // + eurostat-activation-facts.ts). The DB governance row carries the
      // matching confirmed/on/owner_approved_at/import_policy (dual gate);
      // the EUROSTAT_SOURCE_ENABLED env flag gates WRITES (kill switch).
      key: "eurostat",
      displayNameCode: "intelligence.sources.eurostat",
      sourceKind: "public_official",
      legalStatus: "confirmed",
      activation: "on",
      termsNoteCode: "intelligence.sources.terms.eurostat",
      attributionRequired: true,
      homepage: "ec.europa.eu",
      proposedOnly: false,
      // The recorded metric import policy — exactly the four Eurostat labour
      // metrics its datasets produce (fail-closed: nothing else permitted).
      importPolicy: { metricKeys: [...EUROSTAT_METRIC_KEYS] },
    },
    {
      // EURES — the EU job-mobility portal. PROPOSED only: multi-source
      // contract placeholder, never fetched, activation is an owner decision.
      key: "eures",
      displayNameCode: "intelligence.sources.eures",
      sourceKind: "public_official",
      legalStatus: "unconfirmed",
      activation: "off",
      termsNoteCode: "intelligence.sources.terms.eures",
      attributionRequired: true,
      homepage: "eures.europa.eu",
      proposedOnly: true,
      importPolicy: null,
    },
    {
      // Lithuanian Employment Service (Užimtumo tarnyba) — official labour
      // market statistics. PROPOSED only, same owner gate as every external.
      key: "uzt_lt",
      displayNameCode: "intelligence.sources.uztLt",
      sourceKind: "public_official",
      legalStatus: "unconfirmed",
      activation: "off",
      termsNoteCode: "intelligence.sources.terms.uztLt",
      attributionRequired: true,
      homepage: "uzt.lt",
      proposedOnly: true,
      importPolicy: null,
    },
    {
      // CVbankas may only ever be a PROPOSED external benchmark until access
      // and usage permission are confirmed by the owner. Even then, an
      // external figure must NEVER be labelled a LabourMarket.ai average —
      // it stays a clearly-badged external benchmark (originKind "external").
      key: "cvbankas_salary",
      displayNameCode: "intelligence.sources.cvbankasSalary",
      sourceKind: "approved_public_web",
      legalStatus: "unconfirmed",
      activation: "off",
      termsNoteCode: "intelligence.sources.terms.cvbankas",
      attributionRequired: true,
      homepage: "cvbankas.lt",
      proposedOnly: true,
      importPolicy: null,
    },
  ];

export function getSourceProfile(
  key: string,
): IntelligenceSourceProfile | null {
  return INTELLIGENCE_SOURCE_PROFILES.find((p) => p.key === key) ?? null;
}

/**
 * An EXTERNAL source is active only when all three hold:
 * non-internal kind AND activation "on" AND legalStatus "confirmed".
 * With today's registry this is false for every profile.
 */
export function isExternalSourceActive(key: string): boolean {
  const p = getSourceProfile(key);
  if (!p) return false;
  return (
    p.sourceKind !== "internal_aggregated" &&
    p.activation === "on" &&
    p.legalStatus === "confirmed"
  );
}

/** True while NO external source is active — the expected state today. */
export function allExternalSourcesOff(): boolean {
  return INTELLIGENCE_SOURCE_PROFILES.every(
    (p) => !isExternalSourceActive(p.key),
  );
}

/** Derived governance fact for guards/UI: all external activation is off. */
export const EXTERNAL_ACTIVATION_ALL_OFF = INTELLIGENCE_SOURCE_PROFILES.every(
  (p) => p.sourceKind === "internal_aggregated" || p.activation !== "on",
);
