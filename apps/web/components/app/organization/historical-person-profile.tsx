import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { CvOrganizationHistory } from "@/components/app/cv/cv-organization-history";
import { JournalWorkIntelligence } from "@/components/app/journal-work-intelligence";
import type { HistoricalPersonProfile } from "@/lib/organization-evidence/company-person-read";

/**
 * THE HISTORICAL PERSON'S LIVING PROFILE (company side, decision 0020, owner
 * 2026-10-07): the Work Intelligence picture and the Living CV's
 * organization-history group, drawn by the SAME components the claimed
 * person's own surfaces use, over what the organization supplied - before any
 * account exists.
 *
 * Presentational. Everything on it is class ORGANIZATION_REPORTED: it is
 * labelled so in the subtitle, and nothing here is presented as the person's
 * own word or as independently verified. A failed read is said, never drawn as
 * "no work"; a fit that cannot be computed is said, never drawn as "no fit".
 */
export async function HistoricalPersonProfileBlock({
  profile,
  locale,
  personId,
}: {
  profile: HistoricalPersonProfile;
  locale: string;
  personId: string;
}) {
  const t = await getTranslations("companyPerson.profile");
  const tStatus = await getTranslations("scouting.status");
  const tSkillNames = await getTranslations("skillNames");
  const tProfessions = await getTranslations("professions");
  const tUnits = await getTranslations("productivityUnits");
  const catalogueName =
    (tr: { has: (k: string) => boolean; (k: string): string }) =>
    (slug: string): string | null =>
      tr.has(slug) ? tr(slug) : null;
  const { intelligence, cvHistory, fit } = profile;

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="company-person-profile"
      data-evidence-class="ORGANIZATION_REPORTED"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-meta leading-relaxed text-text-muted">{t("subtitle")}</p>
      </header>

      {intelligence ? (
        <JournalWorkIntelligence
          wi={intelligence}
          locale={locale}
          audience="organization"
          labels={{
            skillName: catalogueName(tSkillNames),
            professionName: catalogueName(tProfessions),
            unitName: catalogueName(tUnits),
            contextLabel: () => "",
            primaryProfessionSlug: null,
            periodHref: (key) => `/dashboard/company/people/${personId}?period=${key}#work-intelligence`,
          }}
        />
      ) : (
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary" data-testid="company-person-wi-unavailable">
            {t("unavailable")}
          </p>
        </Card>
      )}

      {cvHistory && cvHistory.length > 0 ? (
        <CvOrganizationHistory
          entries={cvHistory}
          headingClassName="font-display text-lg font-semibold text-text-primary"
          bodyClassName="text-sm text-text-primary"
        />
      ) : null}

      <Card compact className="flex flex-col gap-3" data-testid="company-person-fit">
        <h3 className="font-display text-lg font-semibold text-text-primary">{t("fit.title")}</h3>
        <p className="text-meta leading-relaxed text-text-muted">{t("fit.note")}</p>
        {fit.kind === "unavailable" ? (
          <p className="text-sm text-text-secondary" data-testid="company-person-fit-unavailable">
            {t("fit.unavailable")}
          </p>
        ) : fit.kind === "no-signals" ? (
          <p className="text-sm text-text-secondary" data-testid="company-person-fit-no-signals">
            {t("fit.noSignals")}
          </p>
        ) : fit.rows.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="company-person-fit-none">
            {t("fit.none")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fit.rows.map((r) => (
              <li
                key={r.requestId}
                className="flex flex-col gap-0.5"
                data-testid="company-person-fit-row"
                data-status={r.status}
                data-evidence-class="ORGANIZATION_REPORTED"
              >
                <span className="text-sm font-medium text-text-primary">
                  {r.title || "—"} · {tStatus(r.status as never)}
                </span>
                <span className="text-meta text-text-muted">
                  {t("fit.row", { matched: r.matched, total: r.total })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
