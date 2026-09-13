import { getTranslations } from "next-intl/server";

import type { ActiveLocale } from "@/lib/i18n/config";
import { Link } from "@/lib/i18n/navigation";
import {
  WEEKDAY_ANCHOR_ISO,
  type JournalCalendarGrid,
  type JournalCalendarScale,
} from "@/lib/journal/journal-calendar";
import { formatDuration } from "@/lib/journal/format-duration";

/**
 * THE WORK JOURNAL CALENDAR — the day navigator on `/dashboard/journal`
 * (owner direction 2026-09-13).
 *
 * WHAT IT REPLACES. A horizontal strip of day chips over an endless list of
 * date headings: the person could not see the shape of their own month, and
 * every visit was a scroll. This is a real calendar — month or week, tap a
 * day, and the page below shows exactly that day's records and that day's
 * actions. Quick recording stays where it is, above.
 *
 * WHAT IT IS. Links and text. No client JavaScript, no state, no store: the
 * selected day, the scale and the anchored period all live in the URL
 * (`?date=`, `?cal=`, `?month=`), so a day is shareable, survives a reload
 * and works with JS still loading. Every figure in a cell is the journal's
 * own figure, handed down through `buildJournalCalendar` — this component
 * reads nothing.
 *
 * HONESTY. An empty cell is a real zero over a known day (SEP-7): the
 * journal knows what was recorded, and nothing was. A future day is not a
 * place where recorded work could be, so it is shown and not offered.
 */
export async function JournalCalendar({
  grid,
  locale,
  selected,
  /** The journal's other active query params, preserved on every cell link. */
  carry,
}: {
  grid: JournalCalendarGrid;
  locale: ActiveLocale;
  selected: string | null;
  carry?: Readonly<Record<string, string>>;
}) {
  const t = await getTranslations("journal.calendar");

  const href = (params: Readonly<Record<string, string | null>>): "/dashboard" => {
    const q = new URLSearchParams({ ...(carry ?? {}) });
    for (const [k, v] of Object.entries(params)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    return (`/dashboard/journal${s ? `?${s}` : ""}#journal-entries` as "/dashboard");
  };

  const periodLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${grid.anchor}T00:00:00Z`));
  const weekLabel = `${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${grid.rangeStart}T00:00:00Z`))} – ${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${grid.rangeEnd}T00:00:00Z`))}`;

  const weekdayFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const dayTitleFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const scaleHref = (scale: JournalCalendarScale) =>
    href({ cal: scale === "month" ? null : scale, month: grid.anchor });

  const totalLabel =
    grid.recordedMinutes > 0
      ? formatDuration(grid.recordedMinutes, "minutes", locale === "en" ? "en" : "lt")
      : null;

  return (
    <section
      aria-label={t("title")}
      data-testid="journal-calendar"
      data-scale={grid.scale}
      data-anchor={grid.anchor}
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-2"
    >
      {/* Period header: back · the period · forward, then the scale switch. */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={href({ month: grid.prevAnchor })}
          data-testid="journal-calendar-prev"
          aria-label={t("prev")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
        >
          ‹
        </Link>
        <span
          className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold text-text-primary"
          data-testid="journal-calendar-period"
        >
          {grid.scale === "week" ? weekLabel : periodLabel}
        </span>
        <Link
          href={href({ month: grid.nextAnchor })}
          data-testid="journal-calendar-next"
          aria-label={t("next")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
        >
          ›
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2">
        <nav aria-label={t("scaleLabel")} className="flex items-center gap-1">
          {(["month", "week"] as const).map((scale) => (
            <Link
              key={scale}
              href={scaleHref(scale)}
              data-testid={`journal-calendar-scale-${scale}`}
              aria-current={grid.scale === scale ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                grid.scale === scale
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue"
              }`}
            >
              {t(`scale.${scale}`)}
            </Link>
          ))}
        </nav>
        {selected && (
          <Link
            href={href({ date: null })}
            data-testid="journal-calendar-clear"
            className="rounded-full border border-ink-500 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-brand-blue"
          >
            {t("allDays")}
          </Link>
        )}
      </div>

      {/* The grid. One row of weekday initials, then whole Monday-first weeks. */}
      <div className="grid grid-cols-7 gap-0.5" role="presentation">
        {WEEKDAY_ANCHOR_ISO.map((iso) => (
          <span
            key={iso}
            aria-hidden
            className="py-1 text-center font-mono text-[0.625rem] uppercase tracking-label text-text-muted"
          >
            {weekdayFmt.format(new Date(`${iso}T00:00:00Z`)).slice(0, 2)}
          </span>
        ))}
        {grid.weeks.flat().map((cell) => {
          const dayTitle = dayTitleFmt.format(new Date(`${cell.iso}T00:00:00Z`));
          const shared = [
            "relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-center tabular-nums transition-colors",
          ];
          if (cell.isFuture || !cell.inScope) {
            // Out of the period, or a day that has not happened: shown so the
            // week reads as a week, never offered as a place to look.
            return (
              <span
                key={cell.iso}
                aria-hidden={!cell.inScope}
                data-testid="journal-calendar-day"
                data-day={cell.iso}
                data-state={cell.inScope ? "future" : "outside"}
                className={`${shared.join(" ")} border-transparent text-xs ${
                  cell.inScope ? "text-text-muted" : "text-text-muted/40"
                }`}
              >
                {cell.dayOfMonth}
              </span>
            );
          }
          const state = cell.isSelected
            ? "selected"
            : cell.entryCount > 0
              ? "recorded"
              : "empty";
          return (
            <Link
              key={cell.iso}
              href={href({ date: cell.iso, month: grid.anchor })}
              data-testid="journal-calendar-day"
              data-day={cell.iso}
              data-state={state}
              data-entries={cell.entryCount}
              aria-current={cell.isSelected ? "date" : undefined}
              aria-label={
                cell.entryCount > 0
                  ? t("dayWithRecords", { day: dayTitle, count: cell.entryCount })
                  : t("dayEmpty", { day: dayTitle })
              }
              className={`${shared.join(" ")} text-xs ${
                cell.isSelected
                  ? "border-brand-blue bg-brand-blue/15 font-semibold text-text-primary"
                  : cell.entryCount > 0
                    ? "border-brand-blue/30 bg-brand-blue/5 text-text-primary hover:border-brand-blue"
                    : "border-transparent text-text-secondary hover:border-ink-500"
              } ${cell.isToday && !cell.isSelected ? "ring-1 ring-inset ring-ink-500" : ""}`}
            >
              <span aria-hidden>{cell.dayOfMonth}</span>
              {cell.entryCount > 0 && (
                <span
                  aria-hidden
                  data-testid="journal-calendar-day-marker"
                  className="flex items-center gap-px"
                >
                  {Array.from({ length: Math.min(cell.entryCount, 3) }).map((_, i) => (
                    <span
                      key={i}
                      className={`size-1 rounded-full ${
                        cell.isSelected ? "bg-brand-blue" : "bg-brand-blue/70"
                      }`}
                    />
                  ))}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* What this period actually holds — the honest sum of the cells above. */}
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="journal-calendar-summary"
        data-recorded-days={grid.recordedDays}
      >
        {grid.recordedDays === 0
          ? t("periodEmpty")
          : totalLabel
            ? t("periodSummaryWithTime", {
                days: grid.recordedDays,
                entries: grid.recordedEntries,
                time: totalLabel,
              })
            : t("periodSummary", {
                days: grid.recordedDays,
                entries: grid.recordedEntries,
              })}
      </p>
    </section>
  );
}
