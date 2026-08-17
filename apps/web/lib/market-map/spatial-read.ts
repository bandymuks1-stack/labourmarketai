import "server-only";

import { getOwnMarketSignals } from "./signals";
import { getCompanyTerritoryFromObjects } from "@/lib/objects/objects";
import {
  buildSpatialCollections,
  emptySpatialCollections,
  type SpatialEntityCollections,
} from "./spatial-entities";
import type { NormalizedSignal } from "./signal-model";

/**
 * Owner-scoped composer for the three-entity spatial read layer.
 *
 * Composes the EXISTING owner-only sources — getOwnMarketSignals() (RLS-scoped,
 * six sources, no privileged path) and getCompanyTerritoryFromObjects()
 * (the canonical work_objects entity, train D — REWIRED from the superseded,
 * never-applied company_locations draft per the Train M verdict; honest
 * needs-migration state until the LEAD applies 20260817150000) — into the
 * typed SpatialEntityCollections. No new DB read beyond the caller's own
 * RLS-scoped rows, no privileged key, no cross-user access.
 *
 * The person layer therefore aggregates only the caller's own shareable
 * signals today; a cross-user person-presence feed is a separate owner-gated
 * step (same boundary as ./signals.ts) and would feed the same pure builders
 * unchanged. The UI shows an honest per-layer empty state until then.
 */

export type CompanyTerritorySourceState =
  | "ok"
  | "needs-migration"
  | "error";

export interface OwnSpatialRead {
  collections: SpatialEntityCollections;
  /** Honest state of the work_objects source (LEAD-gated migration). */
  companyTerritorySource: CompanyTerritorySourceState;
}

export async function getOwnSpatialCollections(): Promise<OwnSpatialRead | null> {
  const signals = await getOwnMarketSignals();
  if (signals === null) return null; // unauthenticated

  const companyRead = await getCompanyTerritoryFromObjects();
  const companyTerritorySource: CompanyTerritorySourceState = companyRead.state;

  const collections = buildSpatialCollections({
    signals,
    companyLocations: companyRead.rows,
    // Demand anchors require verified/manual coordinates; the owner-scoped
    // demand signals carry no coordinates (by design), so no demand anchor
    // can appear from this composer today — honest, never a fake territory.
    demandLocations: [],
    projects: projectRowsFromSignals(signals),
  });

  return { collections, companyTerritorySource };
}

/**
 * The owner fetcher already normalizes the caller's project rows into
 * NormalizedSignals; project them back into the typed source shape so the
 * project layer is built from the same real rows (no second DB read).
 */
function projectRowsFromSignals(signals: readonly NormalizedSignal[]) {
  return signals
    .filter((s) => s.signalType === "project_location")
    .map((s) => ({
      id: s.signalId.replace(/^project:/, ""),
      country: s.country,
      city: s.city,
      granularity: s.granularity,
      locationConfirmed: s.canShowExact === true,
      status: s.sourceStatus,
    }));
}

export { emptySpatialCollections };
