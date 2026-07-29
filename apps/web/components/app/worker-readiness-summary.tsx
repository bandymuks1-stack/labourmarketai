import { getTranslations, getLocale } from "next-intl/server";
import type { WorkerReadiness } from "@/lib/company/worker-readiness";

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

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.workerName}
            className="flex flex-col gap-1 border-t border-border/60 pt-2 first:border-0 first:pt-0"
            data-testid="worker-readiness-row"
          >
            <span className="break-words text-sm font-medium text-text-primary">
              {r.workerName}
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text-secondary">
              <span>
                {t("journalEntries")}:{" "}
                <span className="font-semibold text-text-primary">{r.readiness.journalEntries}</span>
              </span>
              <span>
                {t("declaredSkills")}:{" "}
                <span className="font-semibold text-text-primary">{r.readiness.declaredSkills}</span>
              </span>
              <span>
                {t("confirmedSkills")}:{" "}
                <span className="font-semibold text-text-primary">{r.readiness.confirmedSkills}</span>
              </span>
              <span>
                {t("openReview")}:{" "}
                <span className="font-semibold text-text-primary">{r.readiness.openReviewItems}</span>
              </span>
              {r.readiness.lastActivity && (
                <span>
                  {t("lastActivity")}:{" "}
                  <span className="font-semibold text-text-primary">
                    {new Date(r.readiness.lastActivity).toLocaleDateString(locale)}
                  </span>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
