import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { formatDuration } from "@/lib/journal/format-duration";
import { createUtcFormatter } from "@/lib/time/display";
import {
  compactHours,
  type RhythmBlock,
  type RhythmDay,
  type RhythmPlan,
  type WorkRhythm,
} from "@/lib/planning/work-rhythm";
import type { PlanningSourceType } from "@/lib/planning/planning-model";

/**
 * THE WORK WEEK — the calendar's week as the RHYTHM of a person's working
 * time (premium calendar, owner command 2026-09-29 §5).
 *
 * It replaced a list of seven date headings with rows under them: the person
 * could read every row and still not see their week. Here the week is one
 * composition — a band of seven bars whose height is each day's recorded
 * time (the shape of the week at a glance), then seven day columns in which
 * every piece of recorded work is a block carrying its ORGANIZATION · PLACE,
 * the worker's own words, its real length and — only when someone other than
 * the worker approved it — the confirmation mark. The plan (bookings, project
 * bands, leave, trips) sits above the work as bands over the same days.
 *
 * Pure presentation of `buildWorkRhythm` (lib/planning/work-rhythm.ts): no
 * read, no second hour rule. Every block links to its REAL source (the
 * journal entry); every day links to the same day in the Work Journal, so
 * the calendar (WHEN) and the journal (WHAT HAPPENED) are one system.
 *
 * Phone: the seven columns become seven rows — the day on the left, its work
 * on the right — never a squeezed seven-column desktop grid.
 */

/** A plan band's tone — the same source tones the calendar rows wear. */
const PLAN_TONE: Record<PlanningSourceType, string> = {
  booking: "border-brand-blue/50 bg-brand-blue/[0.07] text-brand-blue",
  project: "border-brand-orange/40 bg-brand-orange/[0.06] text-brand-orange",
  stage: "border-brand-violet/40 bg-brand-violet/[0.06] text-brand-violet",
  task: "border-state-success/40 bg-state-success/[0.05] text-state-success",
  journal: "border-brand-cyan/40 text-brand-cyan",
  finance: "border-state-warning/40 bg-state-warning/[0.05] text-state-warning",
  invitation: "border-brand-purple/40 bg-brand-purple/[0.06] text-brand-purple",
  absence: "border-state-amber/50 bg-state-amber/[0.08] text-state-amber",
  trip: "border-brand-cyan/40 bg-brand-cyan/[0.05] text-brand-cyan",
};

export async function WorkWeek({
  rhythm,
  locale,
  dayViewHref,
}: {
  rhythm: WorkRhythm;
  locale: string;
  /** The calendar's own day view for a day (keeps the view's filter). */
  dayViewHref: (day: string) => string;
}) {
  const t = await getTranslations("planning");
  const durLocale = locale === "en" ? "en" : locale === "ru" ? "ru" : "lt";
  const dur = (minutes: number) => formatDuration(minutes, "minutes", durLocale);
  const weekdayFmt = createUtcFormatter(locale, { weekday: "short" });
  const dayLongFmt = createUtcFormatter(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const shortFmt = createUtcFormatter(locale, { day: "numeric", month: "short" });

  const scale = Math.max(rhythm.maxDayMinutes, 8 * 60);
  // A block line is read against the longest single block in view, so a
  // long day of several entries does not shrink every line to a dot.
  const blockScale = Math.max(
    60,
    ...rhythm.days.flatMap((d) => d.blocks.map((b) => b.minutes ?? 0)),
  );

  return (
    <section
      className="flex flex-col gap-5"
      aria-label={t("rhythm.label")}
      data-testid="planning-week-rhythm"
      data-recorded-minutes={rhythm.recordedMinutes}
    >
      {/* ── THE WEEK AT A GLANCE ─────────────────────────────────────────
          The total, then the seven-bar band. Bars are drawn against the
          longest day in view (never less than an 8 h reference, so one short
          day does not read as a full one). */}
      <div
        className="relative overflow-hidden rounded-xl border border-border-subtle bg-gradient-to-b from-surface-1/80 to-surface-1/20 p-4 sm:p-6"
        data-testid="planning-rhythm-summary"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("rhythm.label")}
            </span>
            <span
              className="font-display text-4xl font-bold leading-none tracking-tightest text-text-primary tabular-nums sm:text-5xl"
              data-testid="planning-rhythm-total"
            >
              {rhythm.recordedMinutes > 0 ? dur(rhythm.recordedMinutes) : "0"}
            </span>
            <span className="text-sm text-text-secondary">
              {rhythm.recordedDays > 0
                ? t("rhythm.daysWorked", { count: rhythm.recordedDays })
                : t("rhythm.empty")}
            </span>
          </div>
          {rhythm.blocks > 0 && rhythm.confirmedBlocks > 0 ? (
            <span
              className="inline-flex items-center gap-2 rounded-full border border-trust-accent/40 bg-trust-accent/[0.06] px-3 py-1.5 font-mono text-meta uppercase tracking-label text-trust-accent"
              data-testid="planning-rhythm-confirmed"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-trust-accent" />
              {t("rhythm.confirmedOf", {
                confirmed: rhythm.confirmedBlocks,
                total: rhythm.blocks,
              })}
            </span>
          ) : null}
        </div>

        <div
          className="mt-5 grid grid-cols-7 items-end gap-1.5 sm:gap-3"
          aria-hidden
          data-testid="planning-rhythm-bars"
        >
          {rhythm.days.map((d, i) => {
            const pct = d.recordedMinutes > 0 ? Math.max(6, (d.recordedMinutes / scale) * 100) : 0;
            return (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <span className="h-4 font-mono text-[0.625rem] tabular-nums text-text-secondary">
                  {d.recordedMinutes > 0 ? compactHours(d.recordedMinutes, locale) : ""}
                </span>
                <div className="relative flex h-20 w-full items-end justify-center rounded-md bg-ink-800/40 sm:h-24">
                  {d.hasAbsence ? (
                    <span className="absolute inset-x-0 top-0 h-1 rounded-t-md bg-state-amber/60" />
                  ) : null}
                  {pct > 0 ? (
                    <span
                      className={`rhythm-grow block w-full max-w-10 rounded-md ${
                        d.confirmation === "all"
                          ? "bg-gradient-to-t from-trust-accent/70 to-trust-accent/30"
                          : "bg-gradient-to-t from-brand-cyan/70 to-brand-cyan/25"
                      }`}
                      style={{ height: `${pct}%`, animationDelay: `${i * 45}ms` }}
                    />
                  ) : null}
                </div>
                <span
                  className={`font-mono text-[0.625rem] uppercase tracking-label ${
                    d.isToday ? "text-brand-blue" : "text-text-muted"
                  }`}
                >
                  {(weekdayFmt(d.day) ?? "").slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── THE SEVEN DAYS ──────────────────────────────────────────────── */}
      <ol className="grid grid-cols-1 gap-2 lg:grid-cols-7 lg:gap-2.5" data-testid="planning-week-days">
        {rhythm.days.map((d) => (
          <DayColumn
            key={d.day}
            d={d}
            t={t}
            dur={dur}
            weekday={(weekdayFmt(d.day) ?? "").slice(0, 2)}
            dayLong={dayLongFmt(d.day) ?? d.day}
            fmtShort={(iso: string) => shortFmt(iso) ?? iso}
            scale={blockScale}
            locale={locale}
            dayHref={dayViewHref(d.day)}
          />
        ))}
      </ol>
    </section>
  );
}

function DayColumn({
  d,
  t,
  dur,
  weekday,
  dayLong,
  fmtShort,
  scale,
  locale,
  dayHref,
}: {
  d: RhythmDay;
  t: Awaited<ReturnType<typeof getTranslations>>;
  dur: (minutes: number) => string;
  weekday: string;
  dayLong: string;
  fmtShort: (iso: string) => string;
  scale: number;
  locale: string;
  dayHref: string;
}) {
  const empty = d.blocks.length === 0 && d.plans.length === 0;
  return (
    <li
      className={`group/day flex min-w-0 flex-row gap-3 rounded-xl border p-3 lg:min-h-64 lg:flex-col lg:gap-2.5 ${
        d.isToday
          ? "border-brand-blue/60 bg-brand-blue/[0.04] shadow-[0_0_32px_-16px_rgb(var(--c-brand-blue)/0.6)]"
          : d.hasConflict
            ? "border-state-danger/40 bg-surface-1/40"
            : empty
              ? "border-border-subtle/60 bg-transparent"
              : "border-border-subtle bg-surface-1/40"
      }`}
      data-testid={`planning-week-day-${d.day}`}
      data-recorded-minutes={d.recordedMinutes}
      data-confirmation={d.confirmation}
    >
      {/* Day head: the date opens the calendar's day; the hours open the same
          day in the Work Journal — WHEN and WHAT HAPPENED, one tap apart. */}
      <div className="flex w-14 shrink-0 flex-col items-start gap-1 lg:w-full lg:flex-row lg:items-baseline lg:justify-between">
        <Link
          href={dayHref as "/dashboard"}
          aria-label={dayLong}
          data-testid={`planning-week-open-day-${d.day}`}
          className="flex flex-col rounded-md outline-none transition-colors hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue lg:flex-row lg:items-baseline lg:gap-2"
        >
          <span
            className={`font-mono text-meta uppercase tracking-label ${
              d.isToday ? "text-brand-blue" : "text-text-muted"
            }`}
          >
            {weekday}
          </span>
          <span
            className={`font-display text-2xl font-bold leading-none tabular-nums ${
              d.isFuture ? "text-text-muted" : "text-text-primary"
            }`}
          >
            {Number(d.day.slice(8, 10))}
          </span>
        </Link>
        {d.recordedMinutes > 0 ? (
          <Link
            href={`/dashboard/journal?date=${d.day}#journal-entries` as "/dashboard"}
            aria-label={`${t("rhythm.openJournal")}: ${dayLong}, ${dur(d.recordedMinutes)}`}
            data-testid={`planning-week-open-journal-${d.day}`}
            className="rounded-md font-mono text-sm font-semibold tabular-nums text-brand-cyan outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {compactHours(d.recordedMinutes, locale)}
            <span className="ml-0.5 text-meta font-normal text-text-muted">{t("rhythm.hoursUnit")}</span>
          </Link>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {d.plans.map((p) => (
          <PlanBand key={p.id} p={p} day={d.day} t={t} fmtShort={fmtShort} />
        ))}
        {d.blocks.map((b, i) => (
          <WorkBlock key={b.id} b={b} t={t} dur={dur} scale={scale} index={i} />
        ))}
        {empty ? (
          <span className="self-center py-1 text-meta text-text-muted/60 lg:mt-auto lg:self-start">
            {d.isFuture ? "" : "—"}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function PlanBand({
  p,
  day,
  t,
  fmtShort,
}: {
  p: RhythmPlan;
  day: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  fmtShort: (iso: string) => string;
}) {
  const continuesBefore = p.startDate !== null && p.startDate < day;
  const continuesAfter = p.endDate !== null && p.endDate > day;
  return (
    <Link
      href={p.href as "/dashboard"}
      data-testid={`planning-week-plan-${p.id}`}
      className={`flex min-w-0 flex-col gap-0.5 border px-2.5 py-1.5 transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
        PLAN_TONE[p.sourceType]
      } ${continuesBefore ? "rounded-l-none border-l-0" : "rounded-l-md"} ${
        continuesAfter ? "rounded-r-none border-r-0" : "rounded-r-md"
      } ${p.conflict ? "ring-1 ring-inset ring-state-danger/60" : ""}`}
    >
      <span className="flex items-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-label">
        {t(`source.${p.sourceType}`)}
        {p.startTime ? <span className="text-text-muted">{p.startTime}</span> : null}
        {p.conflict ? (
          <span className="text-state-danger" data-testid={`planning-conflict-${p.id}`}>
            · {t("conflict.flag")}
          </span>
        ) : null}
      </span>
      <span className="truncate text-xs font-medium text-text-primary">
        {p.label ?? t(`fallback.${p.sourceType}`)}
      </span>
      {(p.place || p.organization) && !continuesBefore ? (
        <span className="truncate text-[0.6875rem] text-text-secondary">
          {[p.organization, p.place].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {continuesAfter && !continuesBefore && p.endDate ? (
        <span className="font-mono text-[0.625rem] text-text-muted">→ {fmtShort(p.endDate)}</span>
      ) : null}
    </Link>
  );
}

function WorkBlock({
  b,
  t,
  dur,
  scale,
  index,
}: {
  b: RhythmBlock;
  t: Awaited<ReturnType<typeof getTranslations>>;
  dur: (minutes: number) => string;
  scale: number;
  index: number;
}) {
  const where = [b.organization, b.project, b.place].filter(Boolean);
  const pct = b.minutes ? Math.min(100, Math.max(8, (b.minutes / scale) * 100)) : 0;
  return (
    <Link
      href={b.href as "/dashboard"}
      data-testid={`planning-item-${b.id}`}
      data-confirmed={b.confirmed === null ? "unknown" : String(b.confirmed)}
      className={`rise-in group/block relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border bg-ink-800/50 py-2.5 pl-3.5 pr-2.5 transition-colors hover:bg-ink-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
        b.confirmed ? "border-trust-accent/35" : "border-brand-cyan/25"
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* The spine: observed work is cyan; confirmed by someone else, green. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${b.confirmed ? "bg-trust-accent" : "bg-brand-cyan/70"}`}
      />
      {where.length > 0 ? (
        <span className="truncate font-mono text-[0.625rem] font-semibold uppercase tracking-label text-text-secondary">
          {where.join(" · ")}
        </span>
      ) : null}
      <span className="line-clamp-3 text-xs leading-snug text-text-primary">
        {b.label ?? t("fallback.journal")}
      </span>
      {b.minutes ? (
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
            <span
              className={`rhythm-grow-x block h-full rounded-full ${b.confirmed ? "bg-trust-accent" : "bg-brand-cyan"}`}
              style={{ width: `${pct}%`, animationDelay: `${120 + index * 60}ms` }}
            />
          </span>
          <span className="shrink-0 font-mono text-meta font-semibold tabular-nums text-text-primary">
            {dur(b.minutes)}
          </span>
        </span>
      ) : b.dayUnits ? (
        <span className="font-mono text-meta tabular-nums text-text-secondary">
          {b.dayUnits} {t("meta.unit.days")}
        </span>
      ) : null}
      {b.confirmed ? (
        <span
          className="inline-flex items-center gap-1 self-start font-mono text-[0.625rem] font-semibold uppercase tracking-label text-trust-accent"
          data-testid={`planning-week-confirmed-${b.id}`}
        >
          <span aria-hidden>✓</span>
          {t("rhythm.confirmed")}
        </span>
      ) : null}
    </Link>
  );
}
