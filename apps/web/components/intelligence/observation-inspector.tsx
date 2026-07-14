import { getTranslations } from "next-intl/server";

import type { ObservationInspectorRowV1 } from "@/lib/intelligence/observation-inspector-model";
import { ConfidenceBadge } from "./trust-badges";

/**
 * Observation INSPECTOR (Trust Layer v1) — developer-only, READ-ONLY view
 * of raw market_intelligence_observations rows: id, content hash, source,
 * capture timestamp, derived confidence, privacy class and freshness
 * status. Strictly display: no form, no button, no action of any kind.
 *
 * Rendering is gated upstream (superadmin + explicit feature flag — see
 * dashboard/admin/intelligence-observations/page.tsx); the rows arrive
 * pre-projected by lib/intelligence/observation-inspector-model.ts with
 * honest nulls, rendered here as an explicit "unknown".
 */

export async function ObservationInspector({
  rows,
}: {
  rows: readonly ObservationInspectorRowV1[];
}) {
  const t = await getTranslations("intelligence");
  const unknown = t("inspector.unknownValue");
  const show = (v: string | number | null) => (v === null ? unknown : v);

  if (rows.length === 0) {
    return (
      <p
        className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
        data-testid="observation-inspector-empty"
      >
        {t("inspector.empty")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="observation-inspector">
      {rows.map((row, index) => (
        <li
          key={row.id ?? `row-${index}`}
          className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-4"
          data-observation-id={row.id ?? undefined}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {show(row.subjectKind)} · {show(row.subjectId)} ·{" "}
              {show(row.metricKey)}
            </span>
            <ConfidenceBadge level={row.confidence} />
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-text-secondary sm:grid-cols-2">
            {(
              [
                ["inspector.field.id", show(row.id)],
                ["inspector.field.hash", show(row.contentHash)],
                ["inspector.field.source", show(row.sourceKey)],
                ["inspector.field.capturedAt", show(row.capturedAtIso)],
                ["inspector.field.confidenceRaw", show(row.confidenceRaw)],
                ["inspector.field.sampleSize", show(row.sampleSize)],
                ["inspector.field.privacyClass", show(row.privacyClass)],
                ["inspector.field.status", show(row.freshnessStatus)],
              ] as const
            ).map(([labelKey, value]) => (
              <div key={labelKey} className="flex min-w-0 flex-col">
                <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t(labelKey as never) as string}
                </dt>
                <dd className="break-all font-mono text-[11px]">{value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
