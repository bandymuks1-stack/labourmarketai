import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import type { LearningCompass } from "@/lib/learning/learning-compass-model";

/**
 * Learning Compass — the student home's five answers (Track C, 2026-09-03).
 * Server component; rendered on the profile for a person on the student path.
 * Every value comes from the person's own records or the explainable match
 * engine (see lib/learning/learning-compass-model.ts). Skill labels resolve
 * through the `skillNames` catalogue; an unknown slug is shown de-hyphenated,
 * never hidden.
 */
export async function LearningCompassSection({
  compass,
}: {
  readonly compass: LearningCompass;
}) {
  const t = await getTranslations("learningCompass");
  const tSkill = await getTranslations("skillNames");
  const tProf = await getTranslations("professions");
  const skillLabel = (slug: string) =>
    tSkill.has(slug as never) ? tSkill(slug as never) : slug.replace(/-/g, " ");
  const professionLabel = (slug: string) =>
    tProf.has(slug as never) ? tProf(slug as never) : slug.replace(/-/g, " ");

  const { becoming, evidence, fitsNow, missing, nextSteps } = compass;

  return (
    <Card compact>
      <section
        id="learning-compass"
        className="flex flex-col gap-4"
        data-testid="learning-compass"
        aria-labelledby="learning-compass-title"
      >
        <header className="flex flex-col gap-1">
          <h2 id="learning-compass-title" className="font-display text-base font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">{t("subtitle")}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1" data-testid="compass-becoming">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("becoming")}</h3>
            <p className="text-sm text-text-primary">
              {becoming.professionSlug ? professionLabel(becoming.professionSlug) : t("becomingNone")}
            </p>
            {becoming.currentEducation ? (
              <p className="text-xs text-text-secondary">
                {t("studyingAt", { institution: becoming.currentEducation.institutionName })}
                {becoming.currentEducation.programOrField
                  ? ` · ${t("program", { program: becoming.currentEducation.programOrField })}`
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1" data-testid="compass-evidence">
            <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("evidence")}</h3>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              <li className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 text-text-primary">
                {t("skills", { count: evidence.skillsTotal })}
              </li>
              {evidence.skillsConfirmed > 0 ? (
                <li className="rounded-full border border-state-success/40 bg-state-success/10 px-2 py-0.5 text-text-primary">
                  {t("confirmed", { count: evidence.skillsConfirmed })}
                </li>
              ) : null}
              {evidence.skillsJournalSupported > 0 ? (
                <li className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 text-text-primary">
                  {t("journalSupported", { count: evidence.skillsJournalSupported })}
                </li>
              ) : null}
              <li className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 text-text-secondary">
                {t("journalEntries", { count: evidence.journalEntries })}
              </li>
              <li className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 text-text-secondary">
                {t("educationEntries", { count: evidence.educationEntries })}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-1" data-testid="compass-fits">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("fits")}</h3>
          {fitsNow.length === 0 ? (
            <p className="text-xs leading-relaxed text-text-muted">{t("fitsNone")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-600">
              {fitsNow.map((o) => (
                <li key={o.requestId} className="flex items-center justify-between gap-3 py-1.5 text-xs" data-testid={`compass-fit-${o.status}`}>
                  <span className="min-w-0 truncate text-text-primary">
                    {o.roleSlug ? professionLabel(o.roleSlug) : "—"}
                    {o.companyName ? ` · ${o.companyName}` : ""}
                    {o.country ? ` · ${o.country}` : ""}
                  </span>
                  <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                    {o.status === "strong" ? t("fitStrong") : t("fitPossible")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/opportunities" className="text-xs text-brand-blue hover:underline" data-testid="compass-open-board">
            {t("openBoard")} →
          </Link>
        </div>

        <div className="flex flex-col gap-1" data-testid="compass-missing">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("missing")}</h3>
          {missing.skills.length === 0 ? (
            <p className="text-xs leading-relaxed text-text-muted">{t("missingNone")}</p>
          ) : (
            <>
              <p className="text-xs text-text-secondary">
                {missing.source === "opportunities" ? t("missingFromOpportunities") : t("missingFromProfession")}
              </p>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {missing.skills.map((m) => (
                  <li key={m.slug} className="rounded-full border border-brand-orange/40 bg-brand-orange/10 px-2 py-0.5 text-text-primary" data-testid="compass-missing-skill">
                    {skillLabel(m.slug)}
                    {m.askedBy > 0 ? (
                      <span className="ml-1 text-text-muted">· {t("askedBy", { count: m.askedBy })}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1" data-testid="compass-next">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("next")}</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-xs text-text-primary">
            {nextSteps.map((step) => (
              <li key={step} data-testid={`compass-step-${step}`}>
                {t(`step_${step}`)}
              </li>
            ))}
          </ol>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/dashboard/journal" className="rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90">
              {t("openJournal")}
            </Link>
          </div>
        </div>
      </section>
    </Card>
  );
}
