import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { formatDuration } from "@/lib/journal/format-duration";
import { createUtcFormatter } from "@/lib/time/display";
import type { RhythmDay } from "@/lib/planning/work-rhythm";

/**
 * THE WORK DAY — the calendar's day as a stage (premium calendar day view,
 * owner command 2026-09-29 §5, §11).
 *
 * The calendar answers WHEN; the journal answers WHAT HAPPENED. On one day
 * the two meet here: the date in display type, the day's recorded length,
 * the day's COMPOSITION (one bar, each segment one journal entry — its
 * organization and its real length), who confirmed it in words, and the two
 * doors that make them one system — this day in the Work Journal, and
 * recording work on this day.
 *
 * Pure presentation of ONE `RhythmDay` from `buildWorkRhythm` (the same
 * model the week and the month draw). No read, no second hour rule, no
 * clock position (an entry records how long, not from when). The detailed
 * rows below this stage — conflicts, statuses, every context field — stay
 * exactly as they were.
 */
const SEGMENT_TONES = ["bg-brand-cyan/80", "bg-brand-cyan/55", "bg-brand-cyan/35", "bg-brand-cyan/65", "bg-brand-cyan/45"];

export async function WorkDay({ day, locale }: { day: RhythmDay; locale: string }) {
  const t = await getTranslations("planning");
  const durLocale = locale === "en" ? "en" : locale === "ru" ? "ru" : "lt";
  const dur = (m: number) => formatDuration(m, "minutes", durLocale);
  const weekday = createUtcFormatter(locale, { weekday: "long" })(day.day) ?? "";
  const dateLong = createUtcFormatter(locale, { day: "numeric", month: "long", year: "numeric" })(day.day) ?? day.day;
  const timed = day.blocks.filter((b) => (b.minutes ?? 0) > 0);
  const confirmedBlocks = day.blocks.filter((b) => b.confirmed === true).length;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-b from-surface-1/80 to-surface-1/20 p-4 sm:p-6"
      data-testid="planning-work-day"
      data-recorded-minutes={day.recordedMinutes}
      data-confirmation={day.confirmation}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1">
          <span className={`font-mono text-meta uppercase tracking-label ${day.isToday ? "text-brand-blue" : "text-text-muted"}`}>
            {day.isToday ? t("today") : weekday}
          </span>
          <span className="font-display text-3xl font-bold leading-none tracking-tightest text-text-primary sm:text-4xl">
            {dateLong}
          </span>
        </div>
        {day.recordedMinutes > 0 ? (
          <span
            className="font-display text-4xl font-bold leading-none tracking-tightest text-text-primary tabular-nums sm:text-5xl"
            data-testid="planning-work-day-total"
          >
            {dur(day.recordedMinutes)}
          </span>
        ) : null}
      </div>

      {/* THE DAY'S COMPOSITION — one segment per timed entry, its length its
          share of the day; the words under it say whose work it was. */}
      {timed.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2" data-testid="planning-work-day-composition">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-800" aria-hidden>
            {timed.map((b, i) => (
              <span
                key={b.id}
                className={`rhythm-grow-x h-full border-r border-ink-900 last:border-r-0 ${b.confirmed ? "bg-trust-accent/80" : SEGMENT_TONES[i % SEGMENT_TONES.length]}`}
                style={{ width: `${((b.minutes ?? 0) / day.recordedMinutes) * 100}%`, animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {timed.map((b, i) => (
              <li key={b.id} className="inline-flex min-w-0 items-center gap-2 text-support text-text-secondary">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${b.confirmed ? "bg-trust-accent" : SEGMENT_TONES[i % SEGMENT_TONES.length]}`} />
                <span className="truncate">
                  {[b.organization, b.place].filter(Boolean).join(" · ") || (b.label ?? t("fallback.journal"))}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-text-primary">{dur(b.minutes ?? 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-secondary" data-testid="planning-work-day-none">
          {day.isFuture ? t("rhythm.dayFuture") : t("rhythm.dayNoWork")}
        </p>
      )}

      {day.blocks.length > 0 && day.confirmation !== "unknown" ? (
        <p className="mt-3 font-mono text-meta uppercase tracking-label text-text-muted" data-testid="planning-work-day-confirmed">
          {t("rhythm.dayConfirmed", { confirmed: confirmedBlocks, total: day.blocks.length })}
        </p>
      ) : null}

      {/* THE TWO DOORS — this day in the Work Journal, and recording work on
          it. A day that has not happened is not a place to record work. */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/journal?date=${day.day}#journal-entries` as "/dashboard"}
          data-testid="planning-work-day-open-journal"
          className="inline-flex min-h-11 items-center rounded-full border border-brand-blue/50 px-4 text-sm font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
        >
          {t("rhythm.openJournal")} →
        </Link>
        {!day.isFuture ? (
          <Link
            href={`/dashboard/journal?date=${day.day}#journal-composer` as "/dashboard"}
            data-testid="planning-work-day-record"
            className="inline-flex min-h-11 items-center rounded-full border border-ink-500 px-4 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            {t("rhythm.recordOnDay")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
