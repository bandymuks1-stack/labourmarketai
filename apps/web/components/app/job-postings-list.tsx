import { getTranslations } from "next-intl/server";

import type { JobPostingRow } from "@/lib/job-postings/types";

/**
 * Job Postings v1 — list section (server component).
 *
 * Renders the company's own postings as a compact card stack. No
 * client-side state; status changes are handled by a separate
 * (future) `JobPostingStatusControl` client component that calls
 * `updateJobPostingStatusAction`. v1 keeps the list itself
 * read-only to ship cleanly.
 */
export async function JobPostingsList({
  rows,
}: {
  rows: readonly JobPostingRow[];
}): Promise<React.ReactElement> {
  const t = await getTranslations("jobPostings.list");

  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-text-secondary"
        data-testid="job-postings-empty"
      >
        {t("empty")}
      </p>
    );
  }

  return (
    <ul
      className="flex flex-col gap-2"
      data-testid="job-postings-list"
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className="card-border flex flex-col gap-1 p-3"
          data-testid={`job-posting-row-${row.id}`}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-text-primary">
              {row.roleTitle || t("untitledRole")}
            </h3>
            <span
              className="font-mono text-[10px] uppercase tracking-label text-text-tertiary"
              data-testid={`job-posting-status-${row.id}`}
            >
              {t(`status.${row.status}`)}
            </span>
          </header>
          {row.projectTitle && row.projectTitle !== row.roleTitle && (
            <p className="text-xs text-text-tertiary">
              {t("project")}: {row.projectTitle}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
            {row.headcountNeeded !== null && (
              <div>
                <dt className="text-text-tertiary">{t("headcount")}</dt>
                <dd>{row.headcountNeeded}</dd>
              </div>
            )}
            {row.salaryOfferedEur !== null && (
              <div>
                <dt className="text-text-tertiary">{t("salary")}</dt>
                <dd>{row.salaryOfferedEur.toLocaleString("lt-LT")} €</dd>
              </div>
            )}
            {row.startDate && (
              <div>
                <dt className="text-text-tertiary">{t("startDate")}</dt>
                <dd>{row.startDate}</dd>
              </div>
            )}
            {row.preferredCountries && row.preferredCountries.length > 0 && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-text-tertiary">{t("countries")}</dt>
                <dd>{row.preferredCountries.join(", ")}</dd>
              </div>
            )}
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-text-tertiary">{t("visibility")}</dt>
              <dd>{t(`visibility.${row.visibility}`)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
