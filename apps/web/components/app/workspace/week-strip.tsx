import type { CalendarResultWeek } from "@/lib/planning/calendar-result";

/**
 * THIS WEEK, AT A GLANCE — seven bars whose height is each day's recorded
 * time, the week's total beside them; green when someone other than the
 * worker confirmed every entry of the day. The calendar week's grammar,
 * small enough for the chat panel. Drawn from the loader's figures only.
 */
export function WeekStrip({ week, label }: { week: CalendarResultWeek; label: string }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-1/50 p-3"
      data-testid="calendar-result-week"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{label}</span>
        {week.totalLabel ? (
          <span className="font-display text-xl font-bold tabular-nums text-text-primary" data-testid="calendar-result-week-total">
            {week.totalLabel}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-7 items-end gap-1.5" aria-hidden>
        {week.days.map((d, i) => (
          <div key={d.day} className="flex flex-col items-center gap-1">
            <span className="h-3 font-mono text-[0.5625rem] tabular-nums text-text-secondary">{d.hoursLabel ?? ""}</span>
            <div className="flex h-12 w-full items-end justify-center rounded bg-ink-800/50">
              {d.minutes > 0 ? (
                <span
                  className={`rhythm-grow block w-full max-w-6 rounded ${
                    d.confirmed === "all" ? "bg-trust-accent/70" : "bg-brand-cyan/70"
                  }`}
                  style={{ height: `${Math.max(8, (d.minutes / week.scaleMinutes) * 100)}%`, animationDelay: `${i * 40}ms` }}
                />
              ) : null}
            </div>
            <span className={`font-mono text-[0.5625rem] uppercase tracking-label ${d.isToday ? "text-brand-blue" : "text-text-muted"}`}>
              {d.weekday}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Own file, no translations: the chat panel AND the public entry story draw it,
// and the public client tree ships no chat message namespace.
