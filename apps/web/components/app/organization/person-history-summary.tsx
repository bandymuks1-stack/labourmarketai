import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { SemanticIcon } from "@/components/app/semantic-icon";
import { formatUtcDate } from "@/lib/time/display";
import type { PersonHistorySummary } from "@/lib/organization-evidence/person-history-summary";
import type { PersonCompetencySignalsRead } from "@/lib/organization-evidence/competency-signals-read";
import { Stat, nf, span } from "@/components/app/organization/company-work-history";

/**
 * THE HISTORICAL PERSON CARD'S SUMMARY (company side, 2026-10-07): stated
 * hours, where the work was, hours by month, and the skills the organization's
 * own words point to. Presentational over `summarizePersonHistory` and
 * `readCompetencySignalsForPerson`; the records themselves are drawn by
 * `PersonImportedHistory` (one record renderer, not two).
 *
 * Honesty carried on screen: hours are the STATED hours; records that state
 * none are counted, not zeroed; a period total is kept apart from days and
 * months; a record with no project/place stays in the history under its source
 * label or under "not recorded"; skills are DERIVED and not verified; a failed
 * skill read is said, never rendered as "no skills".
 */
export async function PersonHistorySummaryBlock({
  summary,
  signals,
  locale,
}: {
  summary: PersonHistorySummary;
  signals: PersonCompetencySignalsRead;
  locale: string;
}) {
  const t = await getTranslations("companyPerson");
  const tSkill = await getTranslations("skillNames");
  const { history } = summary;
  const when = span(history.firstDate, history.lastDate, locale);

  return (
    <div className="flex flex-col gap-5" data-testid="company-person-summary">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat concept="object" value={String(summary.liveRecords)} label={t("stats.records")} />
        <Stat concept="time" value={`${nf(summary.statedHours)} h`} label={t("stats.hours")} />
        <Stat concept="calendar" value={when ?? "—"} label={t("stats.period")} />
      </div>
      <div className="flex flex-col gap-1 text-meta leading-relaxed text-text-muted">
        {summary.recordsWithoutHours > 0 ? (
          <p data-testid="company-person-no-hours">{t("noHours", { count: summary.recordsWithoutHours })}</p>
        ) : null}
        {summary.recordsUndated > 0 ? (
          <p data-testid="company-person-undated">{t("undated", { count: summary.recordsUndated })}</p>
        ) : null}
        {summary.periodHours > 0 ? (
          <p data-testid="company-person-period-apart">{t("periodApart", { hours: nf(summary.periodHours) })}</p>
        ) : null}
        {summary.recordsWithoutWorkObject > 0 ? (
          <p data-testid="company-person-no-work-object">
            {t("noWorkObject", { count: summary.recordsWithoutWorkObject })}
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-2" aria-label={t("places.title")} data-testid="company-person-places">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("places.title")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {history.places.map((p) => (
            <li key={p.key}>
              <Card compact className="flex items-start justify-between gap-3" data-testid="company-person-place" data-place={p.key}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {p.name ?? t("places.none")}
                  </span>
                  <span className="text-meta text-text-muted">
                    {t("places.records", { count: p.records.length })}
                    {p.firstDate ? ` · ${span(p.firstDate, p.lastDate, locale)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm text-text-primary">
                  {nf(p.dayHours + p.periodHours)} h
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {summary.byMonth.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label={t("months.title")} data-testid="company-person-months">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("months.title")}</h2>
          <ul className="flex flex-wrap gap-2">
            {summary.byMonth.map((m) => (
              <li
                key={m.month}
                className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/40 px-3 py-1 text-sm text-text-primary"
              >
                {formatUtcDate(`${m.month}-01`, locale, { month: "short", year: "numeric" }) ?? m.month}
                <span className="font-mono text-meta text-text-muted">{nf(m.hours)} h</span>
              </li>
            ))}
          </ul>
          <p className="text-meta text-text-muted">{t("months.note")}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-label={t("skills.title")} data-testid="company-person-skills">
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <SemanticIcon concept="evidence" label={t("skills.title")} className="h-3.5 w-3.5" />
          {t("skills.title")}
        </h2>
        {signals.kind === "ok" ? (
          signals.signals.length === 0 ? (
            <p className="text-sm text-text-secondary" data-testid="company-person-skills-empty">
              {t("skills.empty")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {signals.signals.map((s) => (
                <li
                  key={s.slug}
                  data-testid="company-person-skill"
                  data-skill={s.slug}
                  className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/40 px-3 py-1 text-sm text-text-primary"
                >
                  {tSkill.has(s.slug) ? tSkill(s.slug) : s.slug}
                  <span className="font-mono text-meta text-text-muted">{t("skills.records", { count: s.records })}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-text-muted" data-testid="company-person-skills-unavailable">
            {t("skills.unavailable")}
          </p>
        )}
        <p className="text-meta text-text-muted" data-testid="company-person-skills-note">
          {t("skills.note")}
        </p>
        {signals.kind === "ok" && signals.truncated ? (
          <p className="text-meta text-text-muted">{t("skills.truncated")}</p>
        ) : null}
      </section>
    </div>
  );
}
