import type { ReactNode } from "react";

export interface CvSkillOverviewRow {
  readonly key: string;
  readonly name: string;
  readonly tier: string;
  readonly value: string | null;
  readonly detail: string | null;
  /** Share of attributed journal time, never a proficiency score. */
  readonly share: number | null;
  readonly shareLabel: string | null;
}

/** A compact view of the existing, deduplicated skill presentation. */
export function CvSkillOverview({
  title,
  basis,
  rows,
  action,
}: {
  readonly title: string;
  readonly basis: string | null;
  readonly rows: readonly CvSkillOverviewRow[];
  readonly action: ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-ink-600 bg-ink-800/40 p-4 sm:p-5" data-testid="cv-overview-skills">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
        {action}
      </header>
      {basis ? <p className="text-meta leading-relaxed text-text-muted">{basis}</p> : null}
      <ul className="flex flex-col divide-y divide-ink-600">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0" data-skill-key={row.key}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 font-medium text-text-primary [overflow-wrap:anywhere]">{row.name}</span>
              {row.shareLabel ? <span className="text-meta tabular-nums text-text-secondary">{row.shareLabel}</span> : null}
            </div>
            {row.share !== null ? (
              <div className="h-2 overflow-hidden rounded-full bg-ink-600" aria-hidden="true">
                <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${Math.min(100, Math.max(0, row.share * 100))}%` }} data-testid="cv-skill-time-share" />
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-meta leading-relaxed">
              <span className="text-text-muted">{row.tier}</span>
              {row.value ? <span className="tabular-nums text-text-secondary">{row.value}</span> : null}
            </div>
            {row.detail ? <p className="text-meta leading-relaxed text-text-muted">{row.detail}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface CvEvidenceSlice {
  readonly key: "actual" | "reported" | "estimated" | "confirmed";
  readonly label: string;
  readonly hours: number;
  readonly value: string;
}

const SLICE_STROKE: Record<CvEvidenceSlice["key"], string> = {
  actual: "stroke-text-secondary",
  reported: "stroke-brand-blue",
  estimated: "stroke-ink-500",
  confirmed: "stroke-brand-cyan",
};
const SLICE_DOT: Record<CvEvidenceSlice["key"], string> = {
  actual: "bg-text-secondary",
  reported: "bg-brand-blue",
  estimated: "bg-ink-500",
  confirmed: "bg-brand-cyan",
};

/** Mutually exclusive states from the canonical, capacity-adjusted hours ledger. */
export function CvEvidenceMix({
  title,
  total,
  locale,
  slices,
  scope,
  action,
}: {
  readonly title: string;
  readonly total: number;
  readonly locale: string;
  readonly slices: readonly CvEvidenceSlice[];
  readonly scope: readonly string[];
  readonly action: ReactNode;
}) {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (slices.some((slice) => !Number.isFinite(slice.hours) || slice.hours < 0)) return null;
  const shown = slices.filter((slice) => slice.hours > 0);
  const sum = shown.reduce((value, slice) => value + slice.hours, 0);
  // A composition must describe the actual total, never a second total.
  // Four individually rounded states and a rounded total can differ by up
  // to 0.025 h. Larger differences are not a valid composition.
  if (shown.length === 0 || Math.abs(sum - total) > 0.025) return null;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  let offset = 0;
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-ink-600 bg-ink-800/40 p-4 sm:p-5" data-testid="cv-overview-evidence">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
        {action}
      </header>
      <div className="flex min-w-0 flex-col gap-4 min-[360px]:flex-row min-[360px]:items-center">
        <svg viewBox="0 0 80 80" className="h-24 w-24 shrink-0 self-center" aria-hidden="true">
          {shown.map((slice) => {
            const share = slice.hours / sum * 100;
            const start = offset;
            offset += share;
            return <circle key={slice.key} cx="40" cy="40" r="31" pathLength="100" fill="none" strokeWidth="9" className={SLICE_STROKE[slice.key]} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 40 40)" />;
          })}
        </svg>
        <dl className="flex min-w-0 flex-1 flex-col gap-3">
          {shown.map((slice) => (
            <div key={slice.key} className="flex min-w-0 flex-col gap-1" data-evidence-state={slice.key}>
              <dt className="flex items-baseline gap-2 text-meta text-text-secondary"><span className={`inline-block h-2 w-2 shrink-0 rounded-full ${SLICE_DOT[slice.key]}`} aria-hidden="true" />{slice.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pl-4 tabular-nums"><span className="font-display text-lg font-semibold text-text-primary">{slice.value}</span><span className="text-meta text-text-muted">{percent.format(slice.hours / sum)}</span></dd>
            </div>
          ))}
        </dl>
      </div>
      {scope.length > 0 ? <div className="flex flex-col gap-1.5 border-t border-ink-600 pt-3 text-meta leading-relaxed text-text-muted">{scope.map((line) => <p key={line}>{line}</p>)}</div> : null}
    </section>
  );
}
