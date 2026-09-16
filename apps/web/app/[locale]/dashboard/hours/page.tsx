import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { WorkHoursQuickEntry } from "@/components/app/work-hours-quick-entry";
import { getHoursPageData, todayKey } from "@/lib/work-hours/hours-page-data";
import { isValidWorkDate } from "@/lib/work-hours/allocations-model";

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

  const sp = await searchParams;
  const requested = typeof sp.d === "string" ? sp.d : "";
  const workDate = isValidWorkDate(requested) ? requested : todayKey();

  const data = await getHoursPageData(workDate);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
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
      ) : data.kind === "no-objects" ? (
        // NOT A WALL (owner human walk 2026-09-16, design/final/03 §3 P0-4).
        // "First create at least one object" asked the human to satisfy a
        // data-model prerequisite by hand. The state is stated as a state,
        // and the two doors that resolve it follow: the historical import,
        // which PREPARES sites and people from the file itself, and the sites
        // register for the person who wants to name one directly.
        <section
          className="flex flex-col gap-3 rounded-md border border-border-subtle p-4 text-sm"
          data-testid={`hours-state-${data.kind}`}
          role="status"
        >
          <p className="text-text-secondary">{t("states.noObjects")}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/company/history"
              data-testid="hours-no-objects-import-door"
              className="inline-flex min-h-11 items-center rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              {t("states.noObjectsImport")} →
            </Link>
            <Link
              href={"/dashboard/projects#company-locations" as "/dashboard"}
              data-testid="hours-no-objects-register-door"
              className="inline-flex min-h-11 items-center rounded-control border border-ink-500 bg-ink-800/40 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-brand-blue"
            >
              {t("states.noObjectsRegister")} →
            </Link>
          </div>
        </section>
      ) : (
        <p
          className="rounded-md border border-border-subtle p-4 text-sm"
          data-testid={`hours-state-${data.kind}`}
          role="status"
        >
          {data.kind === "needs-migration"
            ? t("states.needsMigration")
            : data.kind === "no-company"
              ? t("states.noCompany")
              : t("states.error")}
        </p>
      )}
    </div>
  );
}
