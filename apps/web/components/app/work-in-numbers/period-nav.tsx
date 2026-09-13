import { Link } from "@/lib/i18n/navigation";
import {
  WORK_PERIOD_KEYS,
  type WorkIntelligence,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";
import { formatUtcDate } from "@/lib/time/display";

import { fmtHours, type Translate } from "./format";

/**
 * The period selector — REAL links (`?period=`), server-rendered: every
 * tile shows its own real figure, the chosen one scopes the detail beneath.
 * No client filtering of anything (§T). When the caller asked for an
 * explicit window the model carries a `range` row, rendered as one more
 * tile, current, named by its two days.
 */
export function PeriodNav({
  wi,
  locale,
  t,
  href,
  rangeHref,
}: {
  wi: WorkIntelligence;
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  href: (key: WorkPeriodKey) => string;
  /** Where the active range tile points (itself); omitted = the tile is
   *  static text. */
  rangeHref?: string;
}) {
  const range = wi.focusRange
    ? (wi.periods.find((p) => p.key === "range") ?? null)
    : null;
  const tile = (
    label: string,
    p: { hours: number; entries: number; daysWorked: number; dayUnits: number },
    key: string,
  ) => (
    <>
      <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {label}
      </span>
      <span
        className="font-display text-xl font-bold tabular-nums text-text-primary"
        data-testid={`wi-period-hours-${key}`}
      >
        {t("hours", { hours: fmtHours(p.hours, locale) })}
      </span>
      <span className="text-meta tabular-nums text-text-muted">
        {p.entries > 0
          ? t("glance", { days: p.daysWorked, entries: p.entries })
          : t("glanceNone")}
        {p.dayUnits > 0
          ? ` · ${t("plusDayUnits", { days: fmtHours(p.dayUnits, locale) })}`
          : ""}
      </span>
    </>
  );
  const tileClass = (active: boolean) =>
    `flex min-h-11 flex-col gap-0.5 rounded-md border px-3 py-2.5 transition-colors ${
      active
        ? "border-brand-blue bg-brand-blue/10"
        : "border-border-subtle bg-surface-1/50 hover:border-brand-blue/60"
    }`;
  return (
    <nav
      aria-label={t("periodLabel")}
      className="grid grid-cols-3 gap-2 sm:grid-cols-5"
      data-testid="wi-period-nav"
    >
      {WORK_PERIOD_KEYS.map((key: WorkPeriodKey) => {
        const p = wi.periods.find((x) => x.key === key)!;
        const active = wi.scope === key;
        return (
          <Link
            key={key}
            href={href(key) as "/dashboard"}
            aria-current={active ? "page" : undefined}
            data-testid={`wi-period-${key}`}
            data-hours={p.hours}
            className={tileClass(active)}
          >
            {tile(t(`period.${key}`), p, key)}
          </Link>
        );
      })}
      {range && wi.focusRange ? (
        rangeHref ? (
          <Link
            href={rangeHref as "/dashboard"}
            aria-current="page"
            data-testid="wi-period-range"
            data-hours={range.hours}
            className={tileClass(true)}
          >
            {tile(
              t("numbers.scopeRange", {
                from: formatUtcDate(wi.focusRange.startIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.startIso,
                to: formatUtcDate(wi.focusRange.endIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.endIso,
              }),
              range,
              "range",
            )}
          </Link>
        ) : (
          <div
            aria-current="page"
            data-testid="wi-period-range"
            data-hours={range.hours}
            className={tileClass(true)}
          >
            {tile(
              t("numbers.scopeRange", {
                from: formatUtcDate(wi.focusRange.startIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.startIso,
                to: formatUtcDate(wi.focusRange.endIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.endIso,
              }),
              range,
              "range",
            )}
          </div>
        )
      ) : null}
    </nav>
  );
}

/** The scope in words — "šiandien", "paskutinės 30 dienų", "visas laikas"
 *  or the explicit window's two days. Named beside every figure so a
 *  bounded window is never read as a lifetime total. */
export function scopeText(wi: WorkIntelligence, locale: string, t: Translate): string {
  if (wi.scope === "range" && wi.focusRange) {
    return t("numbers.scopeRange", {
      from: formatUtcDate(wi.focusRange.startIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.startIso,
      to: formatUtcDate(wi.focusRange.endIso, locale, { month: "short", day: "numeric" }) ?? wi.focusRange.endIso,
    });
  }
  return t(`numbers.scope.${wi.focus}`);
}
