import { getTranslations, setRequestLocale } from "next-intl/server";

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
              : data.kind === "no-objects"
                ? t("states.noObjects")
                : t("states.error")}
        </p>
      )}
    </div>
  );
}
