import { getTranslations } from "next-intl/server";

import { Eyebrow, Figure, FigurePair, Fold } from "@/components/app/premium/grammar";
import {
  organizationAllTime,
  organizationHoursBeyondJournal,
} from "@/lib/journal/organization-all-time";
import {
  deriveProfessionalExperience,
  type ExperienceHourLine,
  type ExperienceRelationship,
} from "@/lib/journal/professional-experience";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import { formatMonthSpanLong, monthSpanOf } from "@/lib/organization-evidence/period-provenance";
import { formatUtcDate } from "@/lib/time/display";

import { fmtHours, type Translate } from "./format";

/**
 * THE SCALE OF THE PERSON'S WORK — ONE continuous professional history
 * (owner decision 0025, 2026-10-17), read through
 * `deriveProfessionalExperience` over the one work model.
 *
 * First figure: the person's professional experience, all time — every work
 * hour once, whoever recorded it. Under it, the two provenances it is made
 * of as figures of their own (the person's journal; the history organizations
 * supplied), then — folded — how it was counted and what it is made of: per
 * organization (with the person's roles there, ownership and management
 * included, and the organization's earlier business periods), per project,
 * and every line that was listed but NOT added, with its reason.
 *
 * Nothing is summed twice (rule 1 of the reading), no period is spread over
 * days, a role never carries hours, an unreadable ledger is said and never
 * rendered as zero. The period tiles below read the journal only and say so.
 */
export async function ExperienceScale({
  wi,
  locale,
  t,
  relationships,
  projectNames = null,
}: {
  wi: WorkIntelligence;
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  /** The person's relationships to organizations (jobs, ownership,
   *  management). Omitted = the surface does not read them (an organization's
   *  view of a member); `null` = the read failed — the block then says the
   *  roles could not be listed and the hours are unchanged. */
  relationships?: readonly ExperienceRelationship[] | null;
  projectNames?: ReadonlyMap<string, string> | null;
}) {
  const all = wi.periods.find((p) => p.key === "all");
  if (!all) return null;
  const tRel = await getTranslations("relationshipTypes");
  // The legal-entity relation words of a stated business period are the
  // business history's own vocabulary — one statement, one wording.
  const tRelation = await getTranslations("companyWorkHistory.business.relation");
  const org = organizationAllTime(wi);
  const orgHours = organizationHoursBeyondJournal(wi);
  const span = org ? monthSpanOf(org.from, org.to) : null;
  const unreadable = wi.organizationRecords === null;
  const hasOrg = orgHours !== null && orgHours > 0;
  const hours = (n: number) => t("hours", { hours: fmtHours(n, locale) });
  const day = (iso: string | null) => (iso ? (formatUtcDate(iso, locale, { month: "short", year: "numeric" }) ?? iso) : null);
  const spanWords = (from: string | null, to: string | null): string | null => {
    const f = day(from);
    const tt = day(to);
    if (!f && !tt) return null;
    if (f && tt && f !== tt) return t("experience.rowSpan", { from: f, to: tt });
    return f ?? tt;
  };
  const relName = (slug: string) => (tRel.has(slug as never) ? tRel(slug as never) : slug);

  const experience = deriveProfessionalExperience({ wi, relationships, projectNames });
  const total = experience.hours;
  const hasTotal = total !== null && total.total > 0;
  const notCounted = experience.lines.filter((l) => !l.counted && l.hours > 0);
  const reasonWords = (l: ExperienceHourLine) =>
    l.notCountedReason ? t(`experience.notCounted.${l.notCountedReason}`) : "";
  const sourceWords = (l: ExperienceHourLine) => t(`experience.source.${l.source}`);

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

  const totalSub =
    total === null
      ? null
      : total.organizationUnknown
        ? t("experience.totalSubJournalOnly")
        : t("experience.totalSub", {
            journal: fmtHours(total.journal, locale),
            org: fmtHours(total.organizationDays + total.organizationPeriods, locale),
          });
  const totalSource =
    total !== null && total.journalConfirmed > 0
      ? t("experience.totalSourceConfirmed", { confirmed: fmtHours(total.journalConfirmed, locale) })
      : t("experience.totalSource");

  return (
    <section className="flex flex-col gap-4" data-testid="wi-experience" aria-labelledby="wi-experience-title">
      <Eyebrow>
        <span id="wi-experience-title">{t("experience.eyebrow")}</span>
      </Eyebrow>
      {hasTotal && total ? (
        <Figure
          label={t("experience.totalLabel")}
          value={hours(total.total)}
          sub={totalSub}
          source={totalSource}
          level={total.journalConfirmed > 0 ? "confirmed" : "recorded"}
          testId="wi-experience-total"
          data={{
            "data-hours": total.total,
            "data-journal-hours": total.journal,
            "data-organization-hours": total.organizationDays + total.organizationPeriods,
            "data-not-counted-hours": total.notCounted,
            "data-from": experience.from ?? "",
            "data-to": experience.to ?? "",
          }}
        />
      ) : null}
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
      {hasTotal || experience.organizations.length > 0 ? (
        <Fold title={t("experience.foldTitle")} testId="wi-experience-how">
          <p className="text-support leading-relaxed text-text-secondary">{t("experience.ruleOnce")}</p>
          <p className="text-support leading-relaxed text-text-secondary">{t("experience.rulePeriods")}</p>
          <p className="text-support leading-relaxed text-text-secondary">{t("experience.ruleRoles")}</p>

          {experience.organizations.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3" data-testid="wi-experience-breakdown">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">{t("experience.breakdownTitle")}</h3>
              <ol className="flex flex-col divide-y divide-ink-600/70">
                {experience.organizations.map((o) => {
                  const roleWords = o.roles.map((r) => {
                    const when =
                      r.startedAt || r.endedAt
                        ? (spanWords(r.startedAt, r.current ? null : r.endedAt) ?? "") +
                          (r.current && r.startedAt ? ` – ${t("experience.roleNow")}` : "")
                        : t("experience.roleDatesNotRecorded");
                    return `${relName(r.relationship)}${r.title ? ` · ${r.title}` : ""} · ${when}`;
                  });
                  const rowSpan = spanWords(o.from, o.to);
                  return (
                    <li
                      key={o.key}
                      className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                      data-testid="wi-experience-org-row"
                      data-organization={o.organizationId ?? ""}
                      data-hours={o.totalHours}
                      data-former-names={o.formerNames.join(" | ")}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="font-medium text-text-primary">
                          {o.organizationName ?? (o.organizationId ? t("experience.orgUnnamed") : t("experience.personalRecords"))}
                          {/* ONE organization identity with a name history: an
                              earlier period the owner states as the SAME legal
                              entity is a former name, said beside the current one. */}
                          {o.formerNames.length > 0 ? (
                            <span className="ml-1 font-normal text-text-muted" data-testid="wi-experience-org-formerly">
                              ({t("experience.formerly", { names: o.formerNames.join(", ") })})
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono text-support text-text-primary [font-feature-settings:'tnum']">
                          {o.totalHours > 0 ? hours(o.totalHours) : t("experience.rowNoHours")}
                        </span>
                      </div>
                      {roleWords.length > 0 ? (
                        <ul className="flex flex-col gap-0.5" data-testid="wi-experience-roles">
                          {roleWords.map((w, i) => (
                            <li key={i} className="text-meta text-text-secondary" data-testid="wi-experience-role">
                              {w}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {o.businessPeriods.map((p) => (
                        <p
                          key={p.id}
                          className="text-meta text-text-secondary"
                          data-testid="wi-experience-business-period"
                          data-relation={p.legalEntityRelation}
                        >
                          {t("experience.businessPeriod", { label: p.label })} ·{" "}
                          {spanWords(p.from, p.to) ?? t("experience.datesNotDocumented")} ·{" "}
                          {tRelation(p.legalEntityRelation as never)}
                        </p>
                      ))}
                      {/* Organization hours per stated period — the record's own
                          source label resolved against the statements; "no stated
                          period" is said, never folded into a period by guess. */}
                      {o.byPeriod.some((b) => b.periodLabel !== null) ? (
                        <ul className="flex flex-col gap-0.5" data-testid="wi-experience-by-period">
                          {o.byPeriod.map((b) => (
                            <li key={b.periodLabel ?? ""} className="text-meta text-text-secondary" data-period={b.periodLabel ?? ""}>
                              {b.periodLabel
                                ? t("experience.periodBand", { label: b.periodLabel })
                                : t("experience.byPeriodUnplaced")}
                              {" · "}
                              {t("experience.rowOrganization", { hours: fmtHours(b.hours, locale), records: b.records })}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="text-meta text-text-muted">
                        {[
                          o.journalHours > 0 || o.entries > 0
                            ? o.journalConfirmedHours > 0
                              ? t("experience.rowJournalConfirmed", {
                                  hours: fmtHours(o.journalHours, locale),
                                  confirmed: fmtHours(o.journalConfirmedHours, locale),
                                  entries: o.entries,
                                })
                              : t("experience.rowJournal", { hours: fmtHours(o.journalHours, locale), entries: o.entries })
                            : null,
                          o.organizationHours > 0
                            ? t("experience.rowOrganization", { hours: fmtHours(o.organizationHours, locale), records: o.records })
                            : null,
                          rowSpan,
                        ]
                          .filter((x): x is string => !!x)
                          .join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {experience.projects.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2" data-testid="wi-experience-projects">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">{t("experience.projectsTitle")}</h3>
              <ul className="flex flex-col gap-1">
                {experience.projects.map((p) => (
                  <li key={p.key} className="flex flex-wrap justify-between gap-x-3 text-meta text-text-secondary" data-testid="wi-experience-project">
                    <span>
                      {p.projectName ?? t("experience.projectUnnamed")}
                      {p.organizationName ? ` · ${p.organizationName}` : ""}
                      {spanWords(p.from, p.to) ? ` · ${spanWords(p.from, p.to)}` : ""}
                    </span>
                    <span className="font-mono [font-feature-settings:'tnum']">{hours(p.totalHours)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {notCounted.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2" data-testid="wi-experience-not-counted">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">{t("experience.notCountedTitle")}</h3>
              <ul className="flex flex-col gap-1">
                {notCounted.map((l) => (
                  <li key={l.key} className="text-meta text-text-secondary" data-testid="wi-experience-not-counted-line" data-reason={l.notCountedReason ?? ""}>
                    {[
                      l.organizationName ?? t("experience.personalRecords"),
                      sourceWords(l),
                      spanWords(l.from, l.to),
                      hours(l.hours),
                    ]
                      .filter((x): x is string => !!x)
                      .join(" · ")}
                    {" — "}
                    {reasonWords(l)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {relationships === null ? (
            <p className="mt-3 text-meta text-text-muted" data-testid="wi-experience-roles-unknown">
              {t("experience.rolesUnknown")}
            </p>
          ) : null}
        </Fold>
      ) : null}
    </section>
  );
}
