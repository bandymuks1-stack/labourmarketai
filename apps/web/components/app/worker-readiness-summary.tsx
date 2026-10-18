import { getTranslations, getLocale } from "next-intl/server";
import type { WorkerReadiness } from "@/lib/company/worker-readiness";
import { formatUtcDate } from "@/lib/time/display";

export type ReadinessRow = {
  workerName: string;
  readiness: WorkerReadiness;
};

/**
 * Company-facing worker readiness summary (v1). Shows per-worker SIGNALS
 * (journal entries, declared/confirmed skills, open review items, last
 * activity) drawn from existing data. Labelled "Darbo pasirengimo signalai" —
 * explicitly NOT a rating, score, or ranking. No matching, no ordering by
 * "best worker"; rows stay in the given order.
 */
export async function WorkerReadinessSummary({ rows }: { rows: ReadinessRow[] }) {
  const t = await getTranslations("workerReadiness");
  const locale = await getLocale();
  if (rows.length === 0) return null;

  return (
    <section className="card-border flex flex-col gap-3 p-4" data-testid="worker-readiness-summary">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-meta leading-relaxed text-text-muted">{t("note")}</p>
      </header>

      {/* One table: the five signal names are column headers ONCE, not
          repeated as "Label: n" on every person (premium density pass). Rows
          keep the given order — still not a ranking. Scrolls inside itself on
          a phone so the page never scrolls sideways. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-collapse text-left text-meta">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium" />
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">{t("journalEntries")}</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">{t("declaredSkills")}</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">{t("confirmedSkills")}</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">{t("openReview")}</th>
              <th scope="col" className="py-1.5 font-medium">{t("lastActivity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.workerName}
                className="border-t border-border/60 text-text-secondary"
                data-testid="worker-readiness-row"
              >
                <th scope="row" className="break-words py-2 pr-3 text-sm font-medium text-text-primary">
                  {r.workerName}
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{r.readiness.journalEntries}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.readiness.declaredSkills}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.readiness.confirmedSkills}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.readiness.openReviewItems}</td>
                <td className="py-2">
                  {r.readiness.lastActivity ? formatUtcDate(r.readiness.lastActivity, locale) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
