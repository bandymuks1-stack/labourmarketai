import type { WorkPeriodTotals } from "@/lib/journal/work-intelligence";
import type { DominantAnswer } from "@/lib/journal/work-in-numbers-view";

import { fmtHours, fmtPct, type Translate } from "./format";

/**
 * THE FIRST ANSWER — "Kokie įgūdžiai užima didžiausią mano veiklos dalį?"
 * in one sentence, with the scope named in the same breath, then the
 * period's hours. Rendered identically by the station's lead and the
 * journal page's compact summary (one composition of the figure).
 *
 * Each `DominantAnswer` kind is its own sentence: UNKNOWN says it could not
 * read; ZERO entries says so; an empty window names the window; a window
 * whose entries carry no attributed hour says THAT — never "0 h of X".
 */
export function DominantLead({
  answer,
  period,
  scope,
  locale,
  t,
  compact = false,
}: {
  answer: DominantAnswer;
  /** The focus period row (null when the model is unknown). */
  period: WorkPeriodTotals | null;
  /** The scope in words (`scopeText`). */
  scope: string;
  locale: string;
  /** Bound to `journal.intelligence`. */
  t: Translate;
  /** The journal page's summary: one sentence + one hours line. */
  compact?: boolean;
}) {
  const sentence = (() => {
    switch (answer.kind) {
      case "unknown":
        return t("numbers.unknown");
      case "no_entries":
        return t("emptyNoEntries");
      case "period_empty":
        return t("numbers.periodEmpty", { scope });
      case "untimed":
        return t("numbers.dominantUntimed", { scope, entries: answer.entries });
      case "dominant":
        return t("numbers.dominant", {
          skill: answer.row.name ?? answer.row.slug,
          hours: fmtHours(answer.row.attributedHours, locale),
          percent: fmtPct(answer.row.share, locale),
          scope,
        });
    }
  })();
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="wi-dominant"
      data-answer={answer.kind}
      data-scope={scope}
    >
      <p
        className={
          compact
            ? "text-body font-medium leading-relaxed text-text-primary"
            : "font-display text-card-title font-semibold leading-snug text-text-primary sm:text-title"
        }
        data-testid="wi-dominant-sentence"
      >
        {sentence}
      </p>
      {period && answer.kind !== "unknown" && answer.kind !== "no_entries" ? (
        <p
          className="text-support tabular-nums text-text-secondary"
          data-testid="wi-dominant-period-hours"
          data-hours={period.hours}
        >
          {t("numbers.periodHours", { hours: fmtHours(period.hours, locale), scope })}
          {period.dayUnits > 0
            ? ` · ${t("plusDayUnits", { days: fmtHours(period.dayUnits, locale) })}`
            : ""}
          {period.entries > 0
            ? ` · ${t("glance", { days: period.daysWorked, entries: period.entries })}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
