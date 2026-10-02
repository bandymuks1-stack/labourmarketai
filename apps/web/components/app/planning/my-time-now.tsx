import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { EpistemicMark } from "@/components/app/planning/epistemic-mark";
import { createUtcFormatter } from "@/lib/time/display";
import { formatDuration } from "@/lib/journal/format-duration";
import { epistemicForItem, type MyNowNext } from "@/lib/planning/time-lens";
import type { PlanningItem } from "@/lib/planning/planning-model";
import type { RhythmDay } from "@/lib/planning/work-rhythm";
import { cn } from "@/lib/utils";

/**
 * MY TIME — now, next, and the days around them (Work in Time, perspective 1).
 *
 * The page's calendar views (month / week / day / agenda) stay exactly where
 * they were; this is the front of them: what binds me TODAY, what is NEXT, and
 * a strip of days that draws the three kinds of time apart — planned (gold
 * hairlines), recorded (cyan, its height the recorded length) and away
 * (amber) — so a plan is never mistaken for work that happened.
 *
 * "Nothing on record" is said as that. It is not "no work" and not "free":
 * work that nobody has written down is unknown to this surface.
 */

const SOURCE_I18N = "planning";

export async function MyTimeNow({
  nowNext,
  strip,
  confirmedIds,
  today,
  locale,
  dayHref,
}: {
  readonly nowNext: MyNowNext;
  /** Days around today, already projected by `buildWorkRhythm` (today is index `todayIndex`). */
  readonly strip: readonly RhythmDay[];
  readonly confirmedIds: ReadonlySet<string> | null;
  readonly today: string;
  readonly locale: string;
  readonly dayHref: (day: string) => string;
}) {
  const t = await getTranslations("workInTime");
  const tp = await getTranslations(SOURCE_I18N);
  const durLocale = locale === "en" ? "en" : locale === "ru" ? "ru" : "lt";
  const weekdayFmt = createUtcFormatter(locale, { weekday: "long" });
  const dateFmt = createUtcFormatter(locale, { day: "numeric", month: "long" });
  const shortFmt = createUtcFormatter(locale, { day: "numeric", month: "short" });
  const narrowFmt = createUtcFormatter(locale, { weekday: "narrow" });
  const shortWeekdayFmt = createUtcFormatter(locale, { weekday: "short" });

  const todayRhythm = strip.find((d) => d.isToday) ?? null;
  const recordedToday = todayRhythm?.blocks.length ?? 0;
  const recordedMinutes = todayRhythm?.recordedMinutes ?? 0;
  const maxMinutes = Math.max(60, ...strip.map((d) => d.recordedMinutes));
  const state = (it: PlanningItem) => epistemicForItem(it, { today, confirmedIds });
  const itemLabel = (it: PlanningItem) => it.label ?? tp(`fallback.${it.sourceType}`);
  const nextIndex = strip.findIndex((d) => d.isToday);

  const door =
    "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

  return (
    <section className="flex flex-col gap-6" aria-labelledby="wit-me-title" data-testid="wit-me">
      <h2 id="wit-me-title" className="sr-only">
        {t("me.title")}
      </h2>

      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ───── NOW ───── */}
        <div
          className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-brand-blue/30 bg-gradient-to-b from-surface-1/80 to-surface-1/20 p-4 sm:p-6"
          data-testid="wit-now"
        >
          <span aria-hidden className="wit-now absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-brand-blue" />
          <div className="flex flex-col gap-1">
            <span className="text-support font-medium text-brand-blue">{t("me.today")}</span>
            <span className="font-display text-3xl font-bold leading-none tracking-tightest text-text-primary sm:text-4xl">
              {weekdayFmt(today)}, {dateFmt(today)}
            </span>
          </div>

          {nowNext.today.length > 0 ? (
            <ul className="flex flex-col divide-y divide-ink-600/70 border-y border-ink-600/70" data-testid="wit-now-items">
              {nowNext.today.slice(0, 4).map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href as "/dashboard"}
                    className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 py-2 transition-colors hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  >
                    <EpistemicMark state={state(it)} label={t(`state.${state(it)}`)} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{itemLabel(it)}</span>
                    <span className="shrink-0 text-support text-text-muted">{tp(`source.${it.sourceType}`)}</span>
                  </Link>
                </li>
              ))}
              {nowNext.today.length > 4 ? (
                <li className="py-2 text-support text-text-muted">{t("me.moreToday", { count: nowNext.today.length - 4 })}</li>
              ) : null}
            </ul>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary" data-testid="wit-now-empty">
              <EpistemicMark state="unknown" label={t("state.unknown")} />
              {t("me.nothingToday")}
            </p>
          )}

          <p className="text-sm text-text-secondary" data-testid="wit-now-recorded">
            {recordedToday > 0 ? (
              <>
                <EpistemicMark state="recorded" label={t("state.recorded")} className="mr-2" />
                {recordedMinutes > 0
                  ? t("me.recordedTimed", { duration: formatDuration(recordedMinutes, "minutes", durLocale), count: recordedToday })
                  : t("me.recordedUntimed", { count: recordedToday })}
              </>
            ) : (
              t("me.notRecordedYet")
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/journal?date=${today}#journal-composer` as "/dashboard"}
              data-testid="wit-now-record"
              className={cn(door, "border-brand-blue/50 text-brand-blue hover:bg-brand-blue/10")}
            >
              {t("me.recordToday")} →
            </Link>
            <Link
              href={`/dashboard/journal?date=${today}#journal-entries` as "/dashboard"}
              data-testid="wit-now-journal"
              className={cn(door, "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary")}
            >
              {t("me.openJournalDay")}
            </Link>
          </div>
        </div>

        {/* ───── NEXT ───── */}
        <div className="flex flex-col gap-4 rounded-2xl border border-ink-600 bg-ink-800/20 p-4 sm:p-6" data-testid="wit-next">
          <span className="text-support font-medium text-text-muted">{t("me.next")}</span>
          {nowNext.next ? (
            <Link
              href={nowNext.next.href as "/dashboard"}
              data-testid="wit-next-item"
              className="flex flex-col gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <span className="font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary">
                {itemLabel(nowNext.next)}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-support text-text-secondary">
                <EpistemicMark state={state(nowNext.next)} label={t(`state.${state(nowNext.next)}`)} />
                <span className="tabular-nums">
                  {shortFmt(nowNext.next.startDate ?? today)}
                  {nowNext.next.endDate && nowNext.next.endDate !== nowNext.next.startDate ? ` – ${shortFmt(nowNext.next.endDate)}` : ""}
                </span>
                <span className="font-medium text-brand-blue">{t("me.nextIn", { count: nowNext.nextInDays ?? 0 })}</span>
              </span>
              <span className="text-support text-text-muted">
                {[tp(`source.${nowNext.next.sourceType}`), nowNext.next.project, nowNext.next.place].filter(Boolean).join(" · ")}
              </span>
            </Link>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary" data-testid="wit-next-empty">
              <EpistemicMark state="unknown" label={t("state.unknown")} />
              {t("me.nothingNext")}
            </p>
          )}
          {nowNext.undatedCount > 0 ? (
            <p className="flex flex-wrap items-center gap-2 border-t border-ink-600/70 pt-3 text-support text-text-secondary" data-testid="wit-undated">
              <EpistemicMark state="notProvided" label={t("state.notProvided")} />
              {t("me.undated", { count: nowNext.undatedCount })}
            </p>
          ) : null}
        </div>
      </div>

      {/* ───── THE DAYS AROUND NOW ───── */}
      <div className="flex flex-col gap-3" data-testid="wit-strip">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{t("me.stripTitle")}</h3>
          <span className="text-support text-text-muted">{t("me.stripRule")}</span>
        </div>

        {/* desktop / tablet: a strip with a now-line */}
        <ol className="relative hidden gap-1 sm:grid" style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}>
          {strip.map((d) => {
            const planned = d.plans.filter((p) => p.sourceType !== "absence");
            const recorded = d.blocks.length > 0;
            const hPct = recorded && d.recordedMinutes > 0 ? Math.max(14, (d.recordedMinutes / maxMinutes) * 100) : 0;
            return (
              <li key={d.day} className="relative">
                <Link
                  href={dayHref(d.day) as "/dashboard"}
                  data-testid={`wit-strip-${d.day}`}
                  aria-current={d.isToday ? "date" : undefined}
                  className={cn(
                    "relative flex min-h-[8.5rem] flex-col items-center gap-1 rounded-lg border px-1 pb-2 pt-2 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                    d.isToday ? "border-brand-blue/60 bg-brand-blue/5" : "border-ink-600/70",
                    d.hasAbsence && "bg-state-amber/5",
                  )}
                >
                  <span className="text-meta text-text-muted">{shortWeekdayFmt(d.day)}</span>
                  <span className={cn("font-display text-sm font-semibold tabular-nums", d.isToday ? "text-brand-blue" : "text-text-primary")}>
                    {d.day.slice(8, 10)}
                  </span>
                  <span className="relative mt-auto flex h-16 w-full items-end justify-center gap-1">
                    {planned.length > 0 ? (
                      <span className="flex h-full w-1.5 flex-col justify-end gap-0.5" aria-hidden>
                        {planned.slice(0, 4).map((p) => (
                          <span key={p.id} className={cn("wit-bar h-3 w-full rounded-sm border", p.sourceType === "booking" || p.sourceType === "project" ? "border-brand-blue/70 bg-brand-blue/50" : "border-dashed border-brand-blue/60")} />
                        ))}
                      </span>
                    ) : null}
                    {recorded ? (
                      hPct > 0 ? (
                        <span className="wit-grow-y w-3 rounded-t-sm bg-brand-cyan/70" style={{ height: `${hPct}%` }} aria-hidden />
                      ) : (
                        <span className="size-3 rounded-[2px] border border-dashed border-brand-cyan/70" aria-hidden />
                      )
                    ) : null}
                  </span>
                  <span className="flex h-2 items-center gap-1" aria-hidden>
                    {d.hasAbsence ? <span className="h-0.5 w-4 rounded-full bg-state-amber" /> : null}
                    {d.hasConflict ? <span className="size-1.5 rounded-full bg-state-danger" /> : null}
                  </span>
                  <span className="sr-only">
                    {shortFmt(d.day)}: {t("me.stripPlanned", { count: planned.length })}
                    {recorded ? `, ${t("me.stripRecorded", { count: d.blocks.length })}` : `, ${t("me.stripNoRecord")}`}
                    {d.hasAbsence ? `, ${t("me.stripAway")}` : ""}
                    {d.hasConflict ? `, ${t("people.overlap")}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        {/* mobile: today → next → agenda lanes, one row per day */}
        <ol className="flex flex-col sm:hidden" data-testid="wit-lanes">
          {strip.slice(nextIndex >= 0 ? nextIndex : 0, (nextIndex >= 0 ? nextIndex : 0) + 7).map((d) => {
            const planned = d.plans;
            return (
              <li key={d.day} className="border-t border-ink-600/70 first:border-t-0">
                <Link
                  href={dayHref(d.day) as "/dashboard"}
                  aria-current={d.isToday ? "date" : undefined}
                  data-testid={`wit-lane-${d.day}`}
                  className="flex min-h-[44px] items-stretch gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center">
                    <span className="text-meta text-text-muted">{narrowFmt(d.day)}</span>
                    <span className={cn("font-display text-base font-semibold tabular-nums", d.isToday ? "text-brand-blue" : "text-text-primary")}>{d.day.slice(8, 10)}</span>
                  </span>
                  <span className={cn("flex min-w-0 flex-1 flex-col justify-center gap-1 border-l pl-3", d.isToday ? "border-brand-blue" : "border-ink-600/70")}>
                    {planned.length === 0 && d.blocks.length === 0 ? (
                      <span className="text-support text-text-muted">{t("me.stripNoRecord")}</span>
                    ) : null}
                    {planned.slice(0, 3).map((p) => (
                      <span key={p.id} className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
                        <span aria-hidden className={cn("h-3 w-1.5 shrink-0 rounded-sm border", p.sourceType === "absence" ? "border-state-amber bg-state-amber/50" : "border-brand-blue/70 bg-brand-blue/40")} />
                        <span className="truncate">{p.label ?? tp(`fallback.${p.sourceType}`)}</span>
                        <span className="shrink-0 text-support text-text-muted">{tp(`source.${p.sourceType}`)}</span>
                      </span>
                    ))}
                    {d.blocks.length > 0 ? (
                      <span className="flex items-center gap-2 text-sm text-text-primary">
                        <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-brand-cyan" />
                        <span>
                          {d.recordedMinutes > 0
                            ? t("me.recordedTimed", { duration: formatDuration(d.recordedMinutes, "minutes", durLocale), count: d.blocks.length })
                            : t("me.recordedUntimed", { count: d.blocks.length })}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-support text-text-muted" data-testid="wit-strip-legend">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-1.5 rounded-sm border border-brand-blue/70 bg-brand-blue/50" />
            {t("me.legendPlanned")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-2 rounded-t-sm bg-brand-cyan/70" />
            {t("me.legendRecorded")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-[2px] border border-dashed border-brand-cyan/70" />
            {t("me.legendUntimed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-state-amber" />
            {t("me.legendAway")}
          </span>
        </div>
      </div>
    </section>
  );
}
