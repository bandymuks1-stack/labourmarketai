"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { loadCalendarResult } from "@/lib/planning/calendar-result";
import type { CalendarResultView, CalendarResultWeek } from "@/lib/planning/calendar-result";

/**
 * THIS WEEK, AT A GLANCE — seven bars whose height is each day's recorded
 * time, the week's total beside them; green when someone other than the
 * worker confirmed every entry of the day. The calendar week's grammar,
 * small enough for the chat panel. Drawn from the loader's figures only.
 */
function WeekStrip({ week, label }: { week: CalendarResultWeek; label: string }) {
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

/**
 * THE CALENDAR RESULT — the Context Panel presentation of the Time Engine.
 *
 * NOT A SECOND CALENDAR. It renders the same canonical agenda projection the
 * `/dashboard/planning` page and the chat's agenda sentence read, re-shaped
 * server-side by `loadCalendarResult` (which is guard-pinned as the one
 * panel adapter of the Time Engine). No view of its own, no table of its
 * own, no event it could invent. The full calendar stays exactly one action away through
 * `onOpenFull` — the panel is the concise active answer, the route is the
 * detail.
 *
 * THE STATE SET, because a result panel is where someone is waiting:
 *
 *   idle     first paint, before the read is requested
 *   loading  the read is in flight (announced, never a blank frame)
 *   error    the action threw — offers RETRY, never a false emptiness
 *   blocked  the read said not-authed — stated, with the full-screen door
 *   empty    the window holds nothing — SAID, with real undated/later counts
 *   partial  a source errored — the degraded sources are NAMED
 *   ready    real day groups with real conflict marks
 *
 * NOTHING IS COMPUTED HERE. Every count is the projection's count; every
 * conflict mark is a detected overlap of real records.
 *
 * NO ROUTING — like every result body, `onOpenFull` is the workspace layer's
 * callback; this component contains no `<Link>` and no router.
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: CalendarResultView };

const FULL_ROUTE = "/dashboard/planning";

export function CalendarResult({
  onOpenFull,
}: {
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Bumping this re-runs the read — that is the whole of RETRY.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadCalendarResult()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        // "We could not read it" and "there is nothing" are different answers.
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const openFull = (
    <button
      type="button"
      onClick={() => onOpenFull(FULL_ROUTE)}
      data-testid="calendar-result-open-full"
      className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
    >
      {t("station.calendar")}
    </button>
  );

  if (phase.kind === "idle" || phase.kind === "loading") {
    return (
      <p
        className="text-basis text-text-muted"
        data-testid="calendar-result-loading"
        aria-busy="true"
      >
        {t("pendingInline")}
      </p>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="calendar-result-error">
        <p className="text-basis text-text-secondary">{t("calendarError")}</p>
        <button
          type="button"
          onClick={retry}
          data-testid="calendar-result-retry"
          className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const { view } = phase;

  if (view.kind === "blocked") {
    return (
      <div className="flex flex-col gap-3" data-testid="calendar-result-blocked">
        <p className="text-basis text-text-secondary">{t("calendarBlocked")}</p>
        {openFull}
      </div>
    );
  }

  const conflictNote =
    view.conflictCount > 0 ? (
      <p
        className="text-support font-medium text-state-warning"
        data-testid="calendar-result-conflicts"
      >
        {t("calendarConflicts", { count: view.conflictCount })}
      </p>
    ) : null;

  // PARTIAL is a first-class banner, not a footnote: a source that failed to
  // read means the answer below may be missing real commitments.
  const partialNote =
    view.degraded.length > 0 ? (
      <p
        className="text-support text-state-warning"
        data-testid="calendar-result-partial"
      >
        {t("calendarPartial", { sources: view.degraded.join(", ") })}
      </p>
    ) : null;

  if (view.days.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-testid="calendar-result-empty">
        <WeekStrip week={view.week} label={t("calendarThisWeek")} />
        {partialNote}
        {conflictNote}
        <p className="text-basis text-text-secondary">
          {t("calendarEmpty", { days: view.windowDays })}
        </p>
        {(view.undatedCount > 0 || view.laterCount > 0) && (
          <p className="text-support text-text-muted">
            {view.undatedCount > 0
              ? t("calendarUndated", { count: view.undatedCount })
              : null}{" "}
            {view.laterCount > 0
              ? t("calendarLater", { count: view.laterCount })
              : null}
          </p>
        )}
        {openFull}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="calendar-result">
      <WeekStrip week={view.week} label={t("calendarThisWeek")} />
      {partialNote}
      {conflictNote}

      <ul className="flex flex-col gap-3">
        {view.days.map((d) => (
          <li key={d.day} className="flex flex-col gap-1.5">
            <span
              className={
                d.isToday
                  ? "font-mono text-meta uppercase tracking-label text-brand-orange"
                  : "font-mono text-meta uppercase tracking-label text-text-muted"
              }
            >
              {d.dayLabel}
              {d.isToday ? ` · ${t("calendarToday")}` : ""}
            </span>
            <ul className="flex flex-col gap-1">
              {d.items.map((item) => (
                <li
                  key={item.id}
                  data-testid={`calendar-result-item-${item.id}`}
                  className="flex items-start gap-2 text-basis text-text-primary"
                >
                  {item.conflict ? (
                    <span aria-hidden className="text-state-warning">
                      ⚠
                    </span>
                  ) : null}
                  <span>{item.text}</span>
                </li>
              ))}
              {d.moreCount > 0 && (
                <li className="text-support text-text-muted">
                  {t("calendarMoreItems", { count: d.moreCount })}
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>

      {(view.hiddenDayCount > 0 ||
        view.undatedCount > 0 ||
        view.laterCount > 0) && (
        <p className="text-support text-text-muted" data-testid="calendar-result-tail">
          {view.hiddenDayCount > 0
            ? t("calendarMoreDays", { count: view.hiddenDayCount })
            : null}{" "}
          {view.undatedCount > 0
            ? t("calendarUndated", { count: view.undatedCount })
            : null}{" "}
          {view.laterCount > 0
            ? t("calendarLater", { count: view.laterCount })
            : null}
        </p>
      )}

      {openFull}
    </div>
  );
}
