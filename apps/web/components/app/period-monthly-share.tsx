import { projectPeriodAggregateByMonth } from "@/lib/organization-evidence/period-projection";

/**
 * The even monthly share of ONE confirmed period aggregate, beside the
 * period record it derives from — never instead of it, never on a day.
 *
 * Owner decision 2026-09-17 (B1): "800 h, 2025-06 → 2025-11" reads as six
 * equal monthly shares. This is a DERIVED view of the canonical period
 * record (`lib/organization-evidence/period-projection.ts`): it stores
 * nothing, it sums to the record's total exactly, and it carries its own
 * label saying so, so a reader never mistakes a share for a source-observed
 * month, let alone a day. Renders nothing when there is nothing honest to
 * derive (no period, no total).
 */
export function PeriodMonthlyShare({
  hours,
  periodStart,
  periodEnd,
  label,
  className,
}: {
  hours: number | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
  /** "Derived equal monthly share · not source days" — the reader's warning. */
  label: string;
  className?: string;
}) {
  const p = projectPeriodAggregateByMonth({ hours, periodStart, periodEnd });
  if (!p) return null;
  return (
    <div
      className={className ?? "flex flex-col gap-0.5"}
      data-testid="period-monthly-share"
      data-method={p.method}
      data-months={p.monthCount}
      data-total={p.totalHours}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">{label}</span>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-meta tabular-nums text-text-secondary">
        {p.months.map((m) => (
          <li key={m.month} data-month={m.month}>
            {m.month} · {m.hours.toFixed(2)} h
          </li>
        ))}
      </ul>
    </div>
  );
}
