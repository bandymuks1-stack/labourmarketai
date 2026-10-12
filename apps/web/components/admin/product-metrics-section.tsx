import "server-only";

import { getTranslations } from "next-intl/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { computeProductMetrics, POPULATIONS, type Metric, type MetricGroup } from "@/lib/ops/product-metrics";
import { SIGNALS } from "@/lib/ops/product-monitor";
import { Card } from "@/components/ui/Card";

/**
 * Operator product metrics (owner programme 2026-10-12 §8), a section of the
 * superadmin launch-readiness page — not a new screen. Every number is computed
 * now from canonical tables by `lib/ops/product-metrics.ts` (the same code the
 * hourly monitor runs) and split REAL / TEST / INTERNAL. "—" is UNKNOWN (the
 * read failed), never zero.
 *
 * SERVER-ONLY and superadmin-only: the ONLY caller is the launch-readiness
 * page, which runs requireSuperadmin() before rendering this.
 */
export async function ProductMetricsSection() {
  const t = await getTranslations("adminMetrics");
  const snapshot = await computeProductMetrics(createAdminClient());
  const groups: MetricGroup[] = ["users", "teams", "b2b", "work", "technical"];
  const cell = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));
  const parts = (v: Metric["value"]) =>
    v !== null && typeof v === "object"
      ? [...POPULATIONS.map((p) => cell(v[p])), cell(v.REAL + v.TEST + v.INTERNAL)]
      : ["", "", "", cell(v as number | null)];

  return (
    <section className="flex flex-col gap-4" data-testid="admin-metrics">
      <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
      <p className="text-sm text-text-secondary">{t("intro")}</p>
      <p className="text-meta text-text-muted" data-testid="admin-metrics-computed-at">
        {t("computedAt", { at: snapshot.computedAt })}
      </p>
      {snapshot.unknown.length > 0 && (
        <p className="text-sm text-state-danger" data-testid="admin-metrics-unknown">
          {t("unknown", { sources: snapshot.unknown.map((u) => u.source).join(", ") })}
        </p>
      )}
      {snapshot.truncated.length > 0 && (
        <p className="text-sm text-text-secondary">{t("truncated", { sources: snapshot.truncated.join(", ") })}</p>
      )}
      {groups.map((g) => (
        <section key={g} data-testid={`admin-metrics-${g}`}>
          <Card compact className="flex flex-col gap-2">
          <h3 className="font-display text-base font-semibold text-text-primary">{t(`groups.${g}`)}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-meta text-text-muted">
                <tr>
                  <th className="py-1 pr-3">{t("col.metric")}</th>
                  <th className="py-1 pr-3 text-right">REAL</th>
                  <th className="py-1 pr-3 text-right">TEST</th>
                  <th className="py-1 pr-3 text-right">INTERNAL</th>
                  <th className="py-1 pr-3 text-right">{t("col.total")}</th>
                  <th className="py-1 pr-3">{t("col.source")}</th>
                  <th className="py-1 pr-3">{t("col.rule")}</th>
                  <th className="py-1">{t("col.window")}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.metrics
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <tr key={m.key} className="border-t border-ink-700" data-testid={`admin-metric-${m.key}`}>
                      <td className="py-1 pr-3 font-mono text-meta text-text-primary">{m.key}</td>
                      {parts(m.value).map((v, i) => (
                        <td key={i} className="py-1 pr-3 text-right tabular-nums text-text-primary">
                          {v}
                        </td>
                      ))}
                      <td className="py-1 pr-3 text-meta text-text-secondary">{m.source}</td>
                      <td className="py-1 pr-3 text-meta text-text-secondary">{m.rule}</td>
                      <td className="py-1 text-meta text-text-muted">{m.window}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </Card>
        </section>
      ))}
      <section data-testid="admin-metrics-signals">
        <Card compact className="flex flex-col gap-2">
        <h3 className="font-display text-base font-semibold text-text-primary">{t("signals.title")}</h3>
        <p className="text-sm text-text-secondary">{t("signals.intro")}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {SIGNALS.map((s) => (
            <li key={s.id} className="text-text-secondary">
              <span className="font-mono text-meta text-text-primary">{s.severity} {s.id}</span> — {s.condition}
            </li>
          ))}
        </ul>
        </Card>
      </section>
    </section>
  );
}
