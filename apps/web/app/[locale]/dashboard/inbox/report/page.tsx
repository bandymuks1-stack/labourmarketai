import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getReviewReport } from "@/lib/journal/review-report";
import { PrintButton } from "@/components/app/print-button";

/**
 * Company review report preview (v1). Read-only summary of the entries the
 * caller can currently review, grouped by worker, with recognized works,
 * explicit hours, uncertainty notes, and honest totals. No PDF export (browser
 * print only), no project/client layer (honest absence note), no fake totals.
 */
export default async function ReviewReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reviewReport");
  const tSkill = await getTranslations("skillNames");
  const tUnit = await getTranslations("productivityUnits");
  const displayLocale = await getLocale();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const report = await getReviewReport(
    (slug) => tSkill(slug),
    (slug) => tUnit(slug),
  );

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(displayLocale);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("title")}
          </h1>
          <PrintButton label={t("print")} />
        </div>
        <p className="text-xs text-text-secondary">{t("origin")}</p>
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
          data-testid="review-report-totals"
        >
          <span>
            {t("totals.pending")}:{" "}
            <span className="font-semibold text-text-primary">
              {report.totals.pendingEntries}
            </span>
          </span>
          <span>
            {t("totals.workers")}:{" "}
            <span className="font-semibold text-text-primary">{report.totals.workers}</span>
          </span>
          <span>
            {t("totals.confirmations")}:{" "}
            <span className="font-semibold text-text-primary">
              {report.totals.confirmations}
            </span>
          </span>
          <span>
            {t("totals.corrections")}:{" "}
            <span className="font-semibold text-text-primary">
              {report.totals.correctionsRequested}
            </span>
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted" data-testid="review-report-project-note">
          {t("projectNote")}
        </p>
      </header>

      {report.workers.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {report.workers.map((w) => (
            <section key={w.workerName} className="card-border flex flex-col gap-3 p-4">
              <h2 className="font-display text-base font-semibold text-text-primary">
                {w.workerName}
              </h2>
              <ul className="flex flex-col gap-2">
                {w.entries.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 border-t border-border/60 pt-2 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="text-text-muted">{fmtDate(e.date)}</span>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                        {t("status.pending")}
                      </span>
                      {e.hours && (
                        <span className="text-text-secondary">
                          {e.hours.value} {e.hours.unit}
                        </span>
                      )}
                    </div>
                    {e.works.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {e.works.map((name, i) => (
                          <span
                            key={`${e.id}-${i}`}
                            className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 text-[11px] text-brand-blue"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-text-muted">{t("noWorks")}</span>
                    )}
                    {e.needsClarification && (
                      <span className="text-[10px] text-amber-700">{t("uncertaintyNote")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
