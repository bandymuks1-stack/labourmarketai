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
    },
    {
      key: "eurostat",
      displayNameCode: "intelligence.sources.eurostat",
      sourceKind: "public_official",
      legalStatus: "unconfirmed",
      activation: "off",
      termsNoteCode: "intelligence.sources.terms.eurostat",
      attributionRequired: true,
      homepage: "ec.europa.eu",
      proposedOnly: true,
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
