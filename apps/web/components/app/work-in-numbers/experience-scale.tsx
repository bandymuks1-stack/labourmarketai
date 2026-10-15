import { Eyebrow, Figure, FigurePair, Fold } from "@/components/app/premium/grammar";
import {
  organizationAllTime,
  organizationHoursBeyondJournal,
} from "@/lib/journal/organization-all-time";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import { formatMonthSpanLong, monthSpanOf } from "@/lib/organization-evidence/period-provenance";

import { fmtHours, type Translate } from "./format";

/**
 * THE SCALE OF THE PERSON'S WORK — all time, two figures of different
 * provenance as equals (owner P0 2026-10-15, #2169): what the person recorded
 * in their own journal, and the history organizations supplied about them.
 *
 * The two are NEVER summed (owner §19, guard `journal-work-intelligence`):
 * a journal hour is the person's own record; an organization hour is what the
 * organization says, often a total over months with no days. Each figure says
 * who stands behind it. The period tiles below read the journal only, and say
 * so — an organization span is never attributed to a journal window.
 *
 * Organization figure = `organizationHoursBeyondJournal` (the one all-time
 * rule minus day records that describe a live journal entry). It renders only
 * when the ledger holds such hours; an unreadable ledger is said, never zero.
 */
export function ExperienceScale({
  wi,
  locale,
  t,
}: {
  wi: WorkIntelligence;
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
}) {
  const all = wi.periods.find((p) => p.key === "all");
  if (!all) return null;
  const org = organizationAllTime(wi);
  const orgHours = organizationHoursBeyondJournal(wi);
  const span = org ? monthSpanOf(org.from, org.to) : null;
  const unreadable = wi.organizationRecords === null;
  const hasOrg = orgHours !== null && orgHours > 0;
  const hours = (n: number) => t("hours", { hours: fmtHours(n, locale) });

  const journalSub = [
    all.entries > 0 ? t("glance", { days: all.daysWorked, entries: all.entries }) : t("glanceNone"),
    all.dayUnits > 0 ? t("plusDayUnits", { days: fmtHours(all.dayUnits, locale) }) : null,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
  const journalSource =
    all.confirmedHours > 0
      ? t("experience.journalSourceConfirmed", { hours: fmtHours(all.confirmedHours, locale) })
      : t("experience.journalSource");

  return (
    <section className="flex flex-col gap-4" data-testid="wi-experience" aria-labelledby="wi-experience-title">
      <Eyebrow>
        <span id="wi-experience-title">{t("experience.eyebrow")}</span>
      </Eyebrow>
      <FigurePair testId="wi-experience-figures">
        <Figure
          label={t("experience.journalLabel")}
          value={hours(all.hours)}
          sub={journalSub}
          source={journalSource}
          level={all.confirmedHours > 0 ? "confirmed" : "recorded"}
          testId="wi-experience-journal"
          data={{ "data-hours": all.hours, "data-entries": all.entries }}
        />
        {hasOrg ? (
          <Figure
            label={t("experience.orgLabel")}
            value={hours(orgHours)}
            sub={span ? t("experience.orgSpan", { span: formatMonthSpanLong(span, locale, (p) => t("experience.spanSameYear", p)) }) : null}
            source={t("experience.orgSource")}
            level="recorded"
            testId="wi-experience-org"
            data={{
              "data-hours": orgHours,
              "data-from": org?.from ?? "",
              "data-to": org?.to ?? "",
            }}
          />
        ) : null}
      </FigurePair>
      {unreadable ? (
        <p className="text-meta text-text-muted" data-testid="wi-experience-org-unknown">
          {t("numbers.ledgerUnknown")}
        </p>
      ) : null}
      {hasOrg ? (
        <Fold title={t("experience.foldTitle")} testId="wi-experience-how">
          <p className="text-support leading-relaxed text-text-secondary">{t("experience.ruleSeparate")}</p>
          <p className="text-support leading-relaxed text-text-secondary">{t("experience.rulePeriods")}</p>
        </Fold>
      ) : null}
    </section>
  );
}
