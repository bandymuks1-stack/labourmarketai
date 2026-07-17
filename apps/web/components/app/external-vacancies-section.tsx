import type { ExternalVacancyDisplayRow } from "@/lib/vacancy-sources/read";

/**
 * External vacancies section (Official Vacancy Source — NAV Norway v1).
 *
 * A SEPARATE, clearly source-badged block on the worker opportunities page —
 * NEVER blended into the internal demand list, never scored by the internal
 * deterministic matching engine, never given an internal interest button.
 * Honesty rules:
 *
 *   - every card carries the official-source badge (attribution required by
 *     the source terms) and the published/expiry facts the source states;
 *   - the ONLY call to action deep-links to the ORIGINAL application page
 *     (source terms: applying must happen in the source's own system) via
 *     target=_blank + rel=noopener noreferrer — LabourMarket.ai is not the
 *     employer and applying never happens in-platform, and the disclaimer
 *     line says so explicitly;
 *   - the parent renders this ONLY when the owner-gated read helper reports
 *     available AND non-empty — otherwise nothing renders (no "coming
 *     soon", no empty shell).
 */

export interface ExternalVacanciesLabels {
  readonly title: string;
  readonly sourceBadge: string;
  readonly intro: string;
  readonly published: (date: string) => string;
  readonly expires: (date: string) => string;
  readonly cta: string;
  readonly externalNote: string;
}

export function ExternalVacanciesSection({
  rows,
  labels,
  locale,
}: {
  rows: readonly ExternalVacancyDisplayRow[];
  labels: ExternalVacanciesLabels;
  locale: string;
}) {
  if (rows.length === 0) return null;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const fmt = (iso: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? dateFmt.format(new Date(ms)) : null;
  };
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/30 p-4"
      data-testid="external-vacancies-section"
      aria-label={labels.title}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {labels.title}
          </h2>
          <span
            className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-brand-blue"
            data-testid="external-vacancies-source-badge"
          >
            {labels.sourceBadge}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-text-secondary">{labels.intro}</p>
      </div>
      <ul className="flex flex-col gap-2" data-testid="external-vacancies-list">
        {rows.map((row) => {
          const published = fmt(row.publishedAt);
          const expires = fmt(row.expiresAt);
          const metaParts: string[] = [];
          if (row.employerDisplayName) metaParts.push(row.employerDisplayName);
          const location = [row.locationCity ?? row.locationMunicipal, row.locationCounty]
            .filter((v): v is string => Boolean(v))
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(", ");
          if (location) metaParts.push(location);
          if (row.engagementType) metaParts.push(row.engagementType);
          const dateParts: string[] = [];
          if (published) dateParts.push(labels.published(published));
          if (expires) dateParts.push(labels.expires(expires));
          return (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid="external-vacancy-card"
            >
              <div className="flex flex-col gap-0.5">
                <p className="font-display text-sm font-bold text-text-primary">
                  {row.title}
                </p>
                {metaParts.length > 0 ? (
                  <p className="text-xs text-text-secondary">{metaParts.join(" · ")}</p>
                ) : null}
                {dateParts.length > 0 ? (
                  <p className="text-[11px] text-text-muted">{dateParts.join(" · ")}</p>
                ) : null}
              </div>
              <a
                href={row.applicationUrl ?? row.canonicalSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[2.75rem] w-fit items-center gap-1.5 rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-brand-blue/10"
                data-testid="external-vacancy-apply-link"
              >
                {labels.cta} ↗
              </a>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] leading-relaxed text-text-muted">
        {labels.externalNote}
      </p>
    </section>
  );
}
