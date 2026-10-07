import { useLocale, useTranslations } from "next-intl";

import type { CvOrganizationHistoryEntry } from "@/lib/cv-export/organization-history";
import { formatUtcDate } from "@/lib/time/display";

import { organizationHistoryLines } from "./organization-history-lines";

/**
 * WORK HISTORY SUPPLIED BY ORGANIZATIONS - the Living CV's second history
 * group. Presentational: renders entries the CV read model already holds.
 *
 * Kept visibly APART from the person's own work history: these are the
 * organizations' records, not self-declared, and not independently verified
 * either. The block says so, and each entry shows its proof facts as separate
 * lines (never one "verified" badge). Only what the records carry is shown;
 * hours are the stated hours and nothing is converted to days.
 */

const SOURCE_KINDS = new Set([
  "xlsx", "csv", "pdf", "api", "agent", "erp", "payroll", "sis", "lms", "email", "drive", "manual",
]);
const ROLES = new Set([
  "employer", "agency", "client", "end_client", "project_owner", "subcontractor",
  "education_provider", "training_provider", "assessor", "verifier", "placement_provider",
  "public_body", "sector_body", "other",
]);
const RELATIONSHIPS = new Set([
  "candidate", "employee", "former_employee", "agency_worker", "subcontractor", "contractor",
  "student", "graduate", "trainee", "apprentice", "programme_participant", "volunteer", "other",
]);

/** Entries shown before the rest fold into a count. */
const SHOWN = 8;

export function CvOrganizationHistory({
  entries,
  headingClassName,
  bodyClassName,
}: {
  entries: readonly CvOrganizationHistoryEntry[];
  headingClassName: string;
  bodyClassName: string;
}) {
  const locale = useLocale();
  const t = useTranslations("cvOrganizationHistory");
  const h = useTranslations("historyContext");
  const tRole = useTranslations("evidenceImport.role");
  const tKind = useTranslations("evidenceImport.sourceKind");
  const tRel = useTranslations("evidenceImport.relationship");
  if (entries.length === 0) return null;

  const words = {
    t: (k: string, v?: Record<string, string | number>) => t(k as never, v as never),
    h: (k: string, v?: Record<string, string | number>) => h(k as never, v as never),
    role: (s: string) => (ROLES.has(s) ? tRole(s as never) : null),
    sourceKind: (s: string) => (SOURCE_KINDS.has(s) ? tKind(s as never) : null),
    relationship: (s: string) => (RELATIONSHIPS.has(s) ? tRel(s as never) : null),
    hours: (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n),
    date: (iso: string) => formatUtcDate(iso, locale),
  };
  const shown = entries.slice(0, SHOWN);
  const folded = entries.length - shown.length;

  return (
    <section
      id="cv-organization-history"
      className="flex flex-col gap-3 scroll-mt-20"
      data-testid="cv-organization-history"
    >
      <h2 className={headingClassName}>{t("title")}</h2>
      <p className="text-xs text-text-muted" data-testid="cv-organization-history-note">
        {t("note")}
      </p>
      <ul className="flex flex-col gap-3">
        {shown.map((e) => {
          const l = organizationHistoryLines(e, words);
          return (
            <li
              key={e.key}
              className="flex flex-col gap-1 border-l-2 border-ink-600 pl-3"
              data-testid="cv-organization-history-entry"
              data-provenance="organization_provided"
              data-proof={l.proof.map((p) => p.concept).join(" ")}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className={`font-semibold ${bodyClassName}`}>{l.heading}</span>
                {l.period ? (
                  <span className="font-mono text-xs text-text-secondary">{l.period}</span>
                ) : null}
              </div>
              {l.subheading ? (
                <span className="text-xs text-text-secondary">{l.subheading}</span>
              ) : null}
              {l.details.length > 0 ? (
                <dl className="flex flex-col gap-0.5">
                  {l.details.map((d, i) => (
                    <div key={i} className="flex flex-wrap gap-x-2 text-xs text-text-secondary">
                      <dt className="text-text-muted">{d.term}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {l.proof.length > 0 || l.contested ? (
                <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
                  {l.proof.map((p) => (
                    <li key={p.concept} data-concept={p.concept}>
                      {p.text}
                    </li>
                  ))}
                  {l.contested ? <li data-concept="CONTESTED">{t("contested")}</li> : null}
                </ul>
              ) : null}
            </li>
          );
        })}
        {folded > 0 ? (
          <li className="text-xs text-text-muted" data-testid="cv-organization-history-more">
            {t("more", { count: folded })}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
