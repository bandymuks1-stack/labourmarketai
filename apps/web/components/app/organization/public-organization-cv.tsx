import { getTranslations } from "next-intl/server";

import { Stat } from "@/components/app/premium/stat";
import { formatUtcDate } from "@/lib/time/display";
import { readPublicOrganizationCv } from "@/lib/organization-evidence/public-organization-cv";

/** "Mar 2026 – Oct 2026" from two YYYY-MM-01 dates (the member view's form). */
function span(first: string | null, last: string | null, locale: string): string | null {
  if (!first) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const a = formatUtcDate(first, locale, opts);
  const b = last ? formatUtcDate(last, locale, opts) : null;
  return b && b !== a ? `${a} – ${b}` : a;
}

const nf = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * The public company Living CV on /business/<slug> (register 3.36). Renders
 * nothing unless the organization's public profile is on AND at least one
 * figure has 5 or more people behind it (`buildPublicOrganizationCv`). Only
 * aggregates: no name, place, project title or entry text exists in its data.
 */
export async function PublicOrganizationCv({ organizationId, locale }: { organizationId: string; locale: string }) {
  const cv = await readPublicOrganizationCv(organizationId);
  if (!cv) return null;
  const t = await getTranslations("businessProfile.cv");
  const tw = await getTranslations("companyWorkHistory");
  const month = (m: string | null) => (m ? `${m}-01` : null);

  return (
    <section className="flex flex-col gap-4" data-testid="public-organization-cv">
      <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>

      {cv.projects ? (
        <div className="grid grid-cols-2 gap-3" data-testid="public-organization-cv-projects">
          <Stat concept="object" value={String(cv.projects.running)} label={tw("projects.running")} />
          <Stat concept="object" value={String(cv.projects.completed)} label={tw("projects.completed")} />
        </div>
      ) : null}

      {cv.journal ? (
        <div className="flex flex-col gap-2" data-testid="public-organization-cv-journal">
          <h3 className="text-sm font-semibold text-text-secondary">{tw("journal.title")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat concept="time" value={`${nf(cv.journal.hours)} h`} label={tw("journal.hours")} />
            <Stat concept="person" value={String(cv.journal.people)} label={tw("journal.people")} />
            <Stat
              concept="calendar"
              value={span(month(cv.journal.firstMonth), month(cv.journal.lastMonth), locale) ?? "—"}
              label={tw("journal.period")}
            />
          </div>
        </div>
      ) : null}

      {cv.history ? (
        <div className="flex flex-col gap-2" data-testid="public-organization-cv-history">
          <h3 className="text-sm font-semibold text-text-secondary">{tw("title")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat concept="time" value={`${nf(cv.history.dayHours)} h`} label={t("historyHours")} />
            <Stat concept="person" value={String(cv.history.people)} label={t("historyPeople")} />
            <Stat
              concept="calendar"
              value={span(month(cv.history.firstMonth), month(cv.history.lastMonth), locale) ?? "—"}
              label={tw("journal.period")}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
