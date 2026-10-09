import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { PageTitle } from "@/components/app/premium/page-title";

import { WorkHoursQuickEntry } from "@/components/app/work-hours-quick-entry";
import { getHoursPageData } from "@/lib/work-hours/hours-page-data";
import { isValidWorkDate } from "@/lib/work-hours/allocations-model";
import { viewerWorkToday } from "@/lib/time/viewer-day";

/**
 * WORK HOURS — the operator's daily surface.
 *
 * One screen, phone first: who worked, on which date, at which object, for how
 * many hours. The date is a query parameter so a day is a shareable, bookmarkable
 * address — an operator catching up on yesterday should not have to fight the UI
 * to get there.
 *
 * Every not-ok branch says something DIFFERENT and actionable, because
 * "nobody worked today", "you are in the wrong workspace", "no objects exist
 * yet" and "the migration is not applied" need four different responses from
 * the person reading them. Rendering an empty grid for all four would be the
 * dishonest degradation this codebase keeps catching.
 */
export default async function WorkHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workHours");
  const tHome = await getTranslations("companyHome");

  const sp = await searchParams;
  const requested = typeof sp.d === "string" ? sp.d : "";
  const workDate = isValidWorkDate(requested) ? requested : (await viewerWorkToday()).todayIso;

  const data = await getHoursPageData(workDate);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-16">
      <header className="flex flex-col gap-1">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {data.kind === "ok" ? (
        <WorkHoursQuickEntry
          workDate={data.workDate}
          workers={data.workers}
          objects={data.objects}
          entries={data.entries}
          dayTotal={data.dayTotal}
        />
      ) : (
        <div
          className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 p-5"
          data-testid={`hours-state-${data.kind}`}
          role="status"
        >
          <p className="max-w-prose text-base leading-relaxed text-text-primary">
            {data.kind === "needs-migration"
              ? t("states.needsMigration")
              : data.kind === "no-company"
                ? t("states.noCompany")
                : data.kind === "no-objects"
                  ? t("states.noObjects")
                  : t("states.error")}
          </p>
          {/* A person outside a company workspace reaches this screen by link or
              back-navigation and met a sentence with no way on. Their own hours
              live in the Work Journal. */}
          {data.kind === "no-company" ? (
            <Link
              href="/dashboard/journal"
              data-testid="hours-no-company-journal-link"
              className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              {t("states.noCompanyJournalLink")} →
            </Link>
          ) : null}
          {/* No sites yet: say what to do next, one tap — a project is where
              hours are recorded against. */}
          {data.kind === "no-objects" ? (
            <Link
              href="/dashboard/company/projects/new"
              data-testid="hours-no-objects-new-project"
              className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              {tHome("projects.emptyCta")} →
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
