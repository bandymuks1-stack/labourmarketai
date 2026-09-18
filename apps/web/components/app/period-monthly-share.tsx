import { projectPeriodAggregateByMonth } from "@/lib/organization-evidence/period-projection";
import { PeriodBand } from "@/components/app/work-world/primitives";

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
      className={className ?? "flex flex-col gap-1.5"}
      data-testid="period-monthly-share"
      data-method={p.method}
      data-months={p.monthCount}
      data-total={p.totalHours}
    >
      {/* The period as a TIME RIBBON (work-world PeriodBand): the total is one
          real figure, split visually across the months it touches — so the
          800 h reads as a temporal shape, never one undifferentiated lump. The
          `label` is the reader's "derived · not source days" warning. */}
      <PeriodBand
        totalLabel={`${p.totalHours.toFixed(2)} h`}
        derivedLabel={label}
        months={p.months}
      />
      {/* The exact month figures stay available as text beneath the ribbon —
          the ribbon shows the shape, the list states the numbers. */}
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
