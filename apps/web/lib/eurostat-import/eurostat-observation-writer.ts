import "server-only";

/**
 * EUROSTAT OBSERVATION WRITER — the ONLY path that persists Eurostat
 * observations to market_intelligence_observations, and the last gate before
 * a write:
 *
 *   - the kill switch must be operational (asserted here again);
 *   - the external-import boundary must ALLOW eurostat (validateExternalImport
 *     → requires legalStatus "confirmed" + activation "on" in the code
 *     registry). With eurostat OFF this refuses every write — persistence is
 *     impossible until the owner activates;
 *   - every row is mapped to the exact snake_case DB shape and inserted
 *     idempotently (ignoreDuplicates on the unique content_hash) — a re-run
 *     writes nothing new.
 *
 * The Supabase client is INJECTED (dependency inversion) so both a server
 * route (createAdminClient) and an owner-run tsx script (direct service
 * client) can supply it without this module importing env. Writes use the
 * service role (RLS bypass) exactly as the migration intends
 * (service_role: select/insert/update; delete revoked).
 */
import type { IntelligenceObservationV1 } from "@/lib/intelligence/observation-contract";
import { validateExternalImport } from "@/lib/intelligence/import-boundary";
import { EUROSTAT_SOURCE_KEY } from "@/lib/intelligence/eurostat-source-v1";
import { assertEurostatOperational } from "./eurostat-kill-switch";

/** Minimal insert surface — satisfied by a supabase-js client. Injected so
 *  this module needs no env and no supabase import of its own. */
export interface ObservationInsertClient {
  from(table: string): {
    insert(
      rows: readonly Record<string, unknown>[],
      options?: { readonly count?: "exact" },
    ): Promise<{ error: { message: string; code?: string } | null }>;
  };
}

export type EurostatWriteRefusalCode =
  | "not_operational"
  | "import_boundary_refused"
  | "not_eurostat_row";

export type EurostatWriteResult =
  | { readonly ok: false; readonly reasonCode: EurostatWriteRefusalCode; readonly detail: string }
  | {
      readonly ok: true;
      readonly attempted: number;
      readonly inserted: number;
      readonly duplicates: number;
    };

/** Map a validated observation to the market_intelligence_observations row. */
export function observationToDbRow(
  o: IntelligenceObservationV1,
): Record<string, unknown> {
  return {
    subject_kind: o.subjectKind,
    subject_id: o.subjectId,
    metric_key: o.metricKey,
    geo_country: o.geo.country,
    geo_region: o.geo.region,
    geo_city: o.geo.city,
    window_start: o.window.start,
    window_end: o.window.end,
    value_numeric: o.valueNumeric,
    unit: o.unit,
    stat_method: o.statMethod,
    source_kind: o.sourceKind,
    source_key: o.sourceKey,
    source_url: o.sourceUrl,
    derivation_ids: o.derivationIds,
    captured_at: o.capturedAt,
    valid_from: o.validFrom,
    valid_to: o.validTo,
    sample_size: o.sampleSize,
    confidence: o.confidence,
    transform_version: o.transformVersion,
    privacy_class: o.privacyClass,
    freshness_status: o.freshnessStatus,
    provenance: o.provenance,
    content_hash: o.contentHash,
  };
}

/**
 * Persist accepted Eurostat observations idempotently. Refuses entirely
 * unless the kill switch is operational AND the import boundary allows
 * eurostat. Rows are inserted one snapshot at a time with ignoreDuplicates,
 * so the unique content_hash makes re-runs write nothing new.
 */
export async function writeEurostatObservations(
  client: ObservationInsertClient,
  rows: readonly IntelligenceObservationV1[],
  snapshotRef: string,
): Promise<EurostatWriteResult> {
  try {
    assertEurostatOperational();
  } catch {
    return { ok: false, reasonCode: "not_operational", detail: "kill_switch" };
  }

  // Every row must be a eurostat row, and the boundary must allow eurostat.
  for (const r of rows) {
    if (r.sourceKey !== EUROSTAT_SOURCE_KEY) {
      return { ok: false, reasonCode: "not_eurostat_row", detail: r.sourceKey };
    }
  }
  const boundary = validateExternalImport({
    sourceKey: EUROSTAT_SOURCE_KEY,
    snapshotRef,
    sourceUrl: rows[0]?.sourceUrl ?? "eurostat",
    capturedAt: rows[0]?.capturedAt ?? new Date(0).toISOString(),
    payload: null,
  });
  if (!boundary.ok) {
    return {
      ok: false,
      reasonCode: "import_boundary_refused",
      detail: boundary.reasonCode,
    };
  }

  let inserted = 0;
  let duplicates = 0;
  for (const row of rows) {
    const res = await insertIgnoringDuplicate(client, observationToDbRow(row));
    if (res === "inserted") inserted += 1;
    else duplicates += 1;
  }
  return { ok: true, attempted: rows.length, inserted, duplicates };
}

/** Insert a single row; a unique-violation on content_hash is treated as an
 *  idempotent duplicate, not an error. */
async function insertIgnoringDuplicate(
  client: ObservationInsertClient,
  row: Record<string, unknown>,
): Promise<"inserted" | "duplicate"> {
  const { error } = await client
    .from("market_intelligence_observations")
    .insert([row]);
  if (error === null) return "inserted";
  // 23505 = unique_violation (content_hash already present) → idempotent.
  if (error.code === "23505" || /duplicate key|unique/i.test(error.message)) {
    return "duplicate";
  }
  throw new Error(`eurostat_write_failed:${error.code ?? "unknown"}`);
}
