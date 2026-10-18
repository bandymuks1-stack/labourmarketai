import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { topWorkDescriptions } from "@/lib/organization-evidence/company-work-history";
import type { PersonHistorySummary } from "@/lib/organization-evidence/person-history-summary";
import type { PersonCompetencySignalsRead } from "@/lib/organization-evidence/competency-signals-read";
import { nf, span } from "@/components/app/organization/company-work-history";

/**
 * THE SAME PERSON, TWO CVs (owner P0.2, 2026-10-13) — for the organization
 * that holds the history, on its own historical person card.
 *
 * LEFT is what a traditional CV says about this person, built from the SAME
 * facts and nothing more: name, role, employer, years. RIGHT is what the
 * organization's own records document: projects, the documented span,
 * recorded days, stated hours, the work as the timesheet described it, and
 * the skills those words named. Nothing is invented on either side; a fact
 * the data does not carry is said to be absent.
 *
 * This is the ORGANIZATION's internal view of history it recorded — not the
 * person's public profile and not something they manage until they claim it
 * (said on screen). Hours are day hours; period totals stay apart.
 */
export async function CvComparison({
  personName,
  relationship,
  organizationName,
  summary,
  signals,
  locale,
}: {
  personName: string;
  relationship: string | null;
  organizationName: string;
  summary: PersonHistorySummary;
  signals: PersonCompetencySignalsRead;
  locale: string;
}) {
  const t = await getTranslations("companyPerson.cvCompare");
  const tSkill = await getTranslations("skillNames");
  const { history } = summary;
  const firstYear = history.firstDate?.slice(0, 4) ?? null;
  const lastYear = history.lastDate?.slice(0, 4) ?? null;
  const years = firstYear ? (firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`) : null;

  const projectPlaces = history.places.filter((p) => p.scope.projectId);
  // Distinct projects, not places: several places (and merged fragments,
  // already re-pointed to their canonical) can belong to one project.
  const projectCount = new Set(projectPlaces.map((p) => p.scope.projectId)).size;
  const allRecords = history.places.flatMap((p) => p.records);
  const recordedDays = new Set(allRecords.map((r) => r.activityDate).filter((d): d is string => !!d)).size;
  const topProjects = [...projectPlaces].sort((a, b) => b.dayHours - a.dayHours).slice(0, 3);
  const work = topWorkDescriptions(allRecords, 3);
  const skills = signals.kind === "ok" ? signals.signals.slice(0, 5) : [];

  return (
    <section className="flex flex-col gap-3" data-testid="cv-compare" aria-label={t("title")}>
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-meta leading-relaxed text-text-muted" data-testid="cv-compare-scope">
          {t("scope", { organization: organizationName })}
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {/* LEFT — the traditional CV, from the same facts. */}
        <Card compact className="flex flex-col gap-2" data-testid="cv-compare-traditional">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("traditional.label")}</p>
          <p className="font-display text-lg font-semibold text-text-primary">{personName}</p>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("traditional.role")}</dt>
              <dd className="text-text-primary">{relationship ?? t("absent")}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("traditional.employer")}</dt>
              <dd className="text-text-primary">{organizationName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("traditional.years")}</dt>
              <dd className="text-text-primary">{years ?? t("absent")}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("traditional.skills")}</dt>
              <dd className="text-text-secondary">{t("traditional.skillsSelf")}</dd>
            </div>
          </dl>
          <p className="mt-auto text-meta leading-relaxed text-text-muted">{t("traditional.note")}</p>
        </Card>

        {/* RIGHT — what the records document. */}
        <Card compact className="flex flex-col gap-2 border-brand-blue/40" data-testid="cv-compare-living">
          <p className="font-mono text-meta uppercase tracking-label text-brand-blue">{t("living.label")}</p>
          <div className="grid grid-cols-3 gap-2">
            <span className="flex flex-col" data-testid="cv-compare-projects">
              <span className="font-mono text-2xl font-bold text-text-primary">{projectCount}</span>
              <span className="text-meta text-text-muted">{t("living.projects")}</span>
            </span>
            <span className="flex flex-col" data-testid="cv-compare-days">
              <span className="font-mono text-2xl font-bold text-text-primary">{recordedDays}</span>
              <span className="text-meta text-text-muted">{t("living.days")}</span>
            </span>
            <span className="flex flex-col" data-testid="cv-compare-hours">
              <span className="font-mono text-2xl font-bold text-text-primary">{nf(history.dayHours)}</span>
              <span className="text-meta text-text-muted">{t("living.hours")}</span>
            </span>
          </div>
          {history.firstDate ? (
            <p className="text-sm text-text-secondary" data-testid="cv-compare-span">
              {t("living.span", { span: span(history.firstDate, history.lastDate, locale) ?? "" })}
            </p>
          ) : null}
          {topProjects.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="cv-compare-top-projects">
              {topProjects.map((p) => (
                <li key={p.key} className="flex items-baseline justify-between gap-2 text-sm">
                  <Link
                    href={`/dashboard/projects/${p.scope.projectId}` as "/dashboard"}
                    className="min-w-0 truncate text-brand-blue hover:underline"
                  >
                    {p.name ?? t("absent")}
                  </Link>
                  <span className="shrink-0 font-mono text-meta text-text-muted">
                    {p.firstDate ? span(p.firstDate, p.lastDate, locale) : ""} · {nf(p.dayHours)} h
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {work.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-meta text-text-muted">{t("living.work")}</p>
              {work.map((w) => (
                <p key={w.text} className="text-meta leading-relaxed text-text-secondary">
                  {w.text}
                  <span className="font-mono text-text-muted"> ×{w.records}</span>
                </p>
              ))}
            </div>
          ) : null}
          {skills.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s.slug} className="rounded-full border border-ink-600 px-2 py-0.5 text-meta text-text-secondary">
                  {tSkill.has(s.slug) ? tSkill(s.slug) : s.slug}
                  <span className="font-mono text-text-muted"> {s.records}</span>
                </span>
              ))}
            </span>
          ) : null}
          <p className="mt-auto text-meta leading-relaxed text-text-muted">{t("living.note")}</p>
        </Card>
      </div>
    </section>
  );
}
