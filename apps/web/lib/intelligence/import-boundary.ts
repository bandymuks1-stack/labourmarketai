/**
 * External observation IMPORT BOUNDARY — the ONLY entry point through which
 * Agentai OS Crawl4AI snapshot observations could ever enter this codebase.
 *
 * Hard rules:
 *   - NO direct scraping in LabourMarket.ai, ever. This module performs
 *     VALIDATION ONLY — no fetch, no fs, no network, no side effects.
 *   - Imports arrive only as ALREADY-CAPTURED snapshots with provenance
 *     (snapshotRef) from the Agentai OS controlled crawl adapter, and only
 *     AFTER the owner has allowlisted the source in ./source-governance.ts
 *     (legalStatus "confirmed" + activation "on").
 *   - With ALL current source profiles, validateExternalImport REFUSES every
 *     import: every external source is unconfirmed and off, and internal
 *     aggregates never arrive through an import (guard-pinned).
 *
 * Pure module: no IO.
 */
import {
  getSourceProfile,
  type IntelligenceSourceProfile,
} from "./source-governance";

export interface ExternalObservationImportV1 {
  /** Source registry key (must exist in INTELLIGENCE_SOURCE_PROFILES). */
  readonly sourceKey: string;
  /** Agentai crawl snapshot provenance id — traceable capture artefact. */
  readonly snapshotRef: string;
  readonly sourceUrl: string;
  readonly capturedAt: string;
  /** Raw captured payload — parsed/validated downstream, never trusted. */
  readonly payload: unknown;
}

export type ExternalImportRefusalCode =
  | "unknown_source"
  | "source_not_activated"
  | "legal_status_unconfirmed"
  | "activation_off";

export type ExternalImportValidation =
  | { readonly ok: false; readonly reasonCode: ExternalImportRefusalCode }
  | { readonly ok: true; readonly profile: IntelligenceSourceProfile };

/**
 * Validate an external import against source governance. Refusal order:
 * unknown source → internal source (never importable) → unconfirmed legal
 * status → activation not "on". Today every path refuses.
 */
export function validateExternalImport(
  imp: ExternalObservationImportV1,
): ExternalImportValidation {
  const profile = getSourceProfile(imp.sourceKey);
  if (!profile) {
    return { ok: false, reasonCode: "unknown_source" };
  }
  // Internal aggregates are derived in-process from canonical tables — they
  // NEVER arrive through the external import boundary.
  if (profile.sourceKind === "internal_aggregated") {
    return { ok: false, reasonCode: "source_not_activated" };
  }
  if (profile.legalStatus !== "confirmed") {
    return { ok: false, reasonCode: "legal_status_unconfirmed" };
  }
  if (profile.activation !== "on") {
    return { ok: false, reasonCode: "activation_off" };
  }
  return { ok: true, profile };
}
