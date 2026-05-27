import { getTranslations } from "next-intl/server";

import type { JobPostingRow } from "@/lib/job-postings/types";

/**
 * Worker-facing job postings list (server component).
 *
 * Renders the read-only list returned by listOpenPublicJobPostings.
 * No client state, no application affordance, and no fabricated
 * relevance ranking — honest until the matches-table writer ships
 * (Sprint A3).
 *
 * Empty state explicitly says no postings yet, never invents
 * placeholder cards.
 */
export async function PublicJobPostingsList({
  rows,
}: {
  rows: readonly JobPostingRow[];
}): Promise<React.ReactElement> {
  const t = await getTranslations("jobDiscovery.list");

  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-text-secondary"
        data-testid="public-job-postings-empty"
      >
        {t("empty")}
      </p>
    );
  }

  return (
    <ul
      className="flex flex-col gap-2"
      data-testid="public-job-postings-list"
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className="card-border flex flex-col gap-2 p-4"
          data-testid={`public-job-posting-${row.id}`}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-text-primary">
              {row.roleTitle || t("untitledRole")}
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-label text-text-tertiary">
              {t("postedAt", { date: row.createdAtIso.slice(0, 10) })}
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
          </dl>
          <p
            className="text-[11px] text-text-tertiary"
            data-testid="public-job-postings-honest-note"
          >
            {t("honestNote")}
          </p>
        </li>
      ))}
    </ul>
  );
}
