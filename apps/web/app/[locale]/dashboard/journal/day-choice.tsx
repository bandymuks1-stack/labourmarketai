"use client";

import { Check } from "lucide-react";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { chipLinkClassName } from "@/components/ui/Chip";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { journalDayChoice, journalDayHref, shiftIsoDay, type JournalDayChoiceKey } from "@/lib/journal/day-choice";

/**
 * THE WORK DAY, CHOSEN FIRST (owner P1, 2026-11-21). Opening the journal, the
 * person picks the day the work happened: today, yesterday, a week ago,
 * another date, or goes to the earlier entries.
 *
 * It is the SAME `?date=` the journal calendar already sets — no second
 * source of "which day": the quick recorder, the detailed form and the
 * readback all take the day from it, and the entry keeps it as its work date
 * (creation time, edits and confirmations stay as the save path records them;
 * decision 0025). A sentence that names its own day still wins in the reader.
 */

export function JournalDayChoice({
  today,
  selected,
  full,
  selectedLabel = null,
}: {
  /** The person's own calendar day (`viewerWorkToday`), `YYYY-MM-DD`. */
  today: string;
  /** The journal's `?date=`, or null. */
  selected: string | null;
  /** Keep the detailed form open when the day changes. */
  full: boolean;
  /** The chosen day as the page formats it, shown on "another date". */
  selectedLabel?: string | null;
}) {
  const t = useTranslations("journal");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = journalDayChoice(selected, today);
  const presets: ReadonlyArray<[Exclude<JournalDayChoiceKey, "other">, string | null]> = [
    ["today", null],
    ["yesterday", shiftIsoDay(today, -1)],
    ["weekAgo", shiftIsoDay(today, -7)],
  ];

  return (
    <nav
      aria-label={t("date")}
      className="flex flex-wrap items-center gap-2"
      data-testid="journal-day-choice"
      data-choice={chosen}
    >
      {presets.map(([key, day]) => (
        <Link
          key={key}
          href={journalDayHref(day, full) as "/dashboard"}
          aria-current={chosen === key ? "date" : undefined}
          className={chipLinkClassName(chosen === key)}
          data-testid={`journal-day-choice-${key}`}
        >
          {chosen === key && <Check aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />}
          {t(`dayChoice.${key}`)}
        </Link>
      ))}
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={() => {
            const input = inputRef.current;
            if (!input) return;
            try {
              input.showPicker();
            } catch {
              input.focus();
              input.click();
            }
          }}
          aria-current={chosen === "other" ? "date" : undefined}
          className={chipLinkClassName(chosen === "other")}
          data-testid="journal-day-choice-other"
        >
          {chosen === "other" && <Check aria-hidden className="h-4 w-4 shrink-0 text-brand-blue" />}
          {chosen === "other" && selectedLabel ? selectedLabel : t("dayChoice.otherDate")}
        </button>
        <input
          ref={inputRef}
          type="date"
          max={today}
          tabIndex={-1}
          aria-hidden
          value={chosen === "other" && selected ? selected : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today) {
              router.push(journalDayHref(v === today ? null : v, full) as "/dashboard");
            }
          }}
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
          data-testid="journal-day-choice-input"
        />
      </span>
      <Link
        href={"/dashboard/journal#journal-entries" as "/dashboard"}
        className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-brand-blue underline-offset-4 hover:underline"
        data-testid="journal-day-choice-earlier"
      >
        {t("dayChoice.earlier")} →
      </Link>
    </nav>
  );
}
