/**
 * THE BILLABLE ROWS OF ONE JOURNAL ENTRY, as the invoice lifecycle reads them (pure).
 *
 * This is NOT a second work-time rule. Hours come straight from `deriveEntryWorkTime`
 * (lib/journal/work-time.ts) - the single TypeScript definition. The only code here is the
 * OUTPUT-QUANTITY rule (latest value per non-time unit, `days` included and never converted to hours)
 * and the mapping of work-time lines to invoice source keys. The SQL function
 * `_invoice_period_evidence_v1` implements the same contract in the database; both are pinned to
 * ONE shared fixture (fixtures/work-time-parity.json) by this module's test and by the SQL proof
 * script, so the two definitions cannot drift apart silently.
 *
 *   source key  f<n>        hours of fragment n        (unit hours / minutes only; a `days` fragment
 *                                                       claims the index and yields no hours)
 *               e           entry-level hours          (only when no usable fragment exists)
 *               q:<unit>    output quantity per unit   (latest value; `q:days` = recorded work-days)
 */

import {
  deriveEntryWorkTime,
  resolveWorkDay,
  type WorkTimeMetricRow,
} from "@/lib/journal/work-time";

export type EvidenceRow = {
  readonly key: string;
  readonly kind: "hours" | "quantity";
  readonly unit: string;
  readonly hours?: number;
  readonly quantity?: number;
};

export type EvidenceDerivation = {
  readonly day: string;
  readonly rows: readonly EvidenceRow[];
};

function latestFirst(a: WorkTimeMetricRow, b: WorkTimeMetricRow): number {
  const at = a.created_at ?? "";
  const bt = b.created_at ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function deriveInvoiceEvidenceRows(input: {
  readonly createdAt: string;
  readonly metrics: readonly WorkTimeMetricRow[];
}): EvidenceDerivation {
  const work = deriveEntryWorkTime({ entryId: "parity", createdAt: input.createdAt, metrics: input.metrics });
  const rows: EvidenceRow[] = [];

  for (const line of work.lines) {
    if (line.unit !== "hours" && line.unit !== "minutes") continue; // a `days` line is quantity, not hours
    rows.push({
      key: line.fragmentIndex !== null ? `f${line.fragmentIndex}` : "e",
      kind: "hours",
      unit: "hours",
      hours: line.hours,
    });
  }

  const latestPerUnit = new Map<string, WorkTimeMetricRow>();
  for (const m of [...input.metrics].sort(latestFirst)) {
    if (m.metric_slug !== "quantity") continue;
    if (typeof m.value_numeric !== "number" || !Number.isFinite(m.value_numeric) || m.value_numeric <= 0) continue;
    if (!m.unit_slug || m.unit_slug === "hours" || m.unit_slug === "minutes") continue;
    if (!latestPerUnit.has(m.unit_slug)) latestPerUnit.set(m.unit_slug, m);
  }
  for (const [unit, m] of latestPerUnit) {
    rows.push({ key: `q:${unit}`, kind: "quantity", unit, quantity: m.value_numeric as number });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return { day: resolveWorkDay(input.metrics, input.createdAt), rows };
}
