/**
 * THE PERIOD A JOURNAL QUESTION NAMES (issue #1689, owner outcome 1: "total
 * worked time for relevant period(s)"). Pure: no IO, no AI.
 *
 * ── THE DEFECT THIS CLOSES (measured on production, 2026-09-11) ────────────
 * "Kiek valandų dirbau šiandien?" was routed to the journal read and answered
 * with a fixed two-week window — "Iš viso per 13 d.: 27 val." — for a day the
 * section on the same page showed as 20 h. The intent was right; the period
 * the person asked about was dropped on the floor. A total for a window the
 * person did not ask about is not the answer to their question.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────
 * Reads the ONE period word a journal question carries and maps it onto the
 * SAME period keys the work-in-numbers section uses (`WORK_PERIOD_KEYS`:
 * today / 7 / 30 / 365 days / all, UTC calendar days ending today), plus
 * `yesterday` — a single day the section has no tab for but people ask about.
 * No period word → `null`, and the caller keeps its "recent" default. The
 * answer then STATES the window it used ("Per paskutines 7 dienas: …"), so a
 * looser phrase ("praėjusią savaitę") is never silently reinterpreted.
 *
 * Folded like the router (`fold`): diacritics and case are not signals, and
 * word boundaries are Unicode letters, not ASCII `\b` (memory: `\w` and `\b`
 * are ASCII-only — "šiandien" has no ASCII boundary before "š").
 */
import type { WorkPeriodKey } from "@/lib/journal/work-intelligence";
import { fold } from "./intent-router";

export type JournalPeriodPhrase = WorkPeriodKey | "yesterday";

/** Order = precedence: the narrowest window a sentence names wins. */
const PERIOD_WORDS: ReadonlyArray<readonly [JournalPeriodPhrase, string]> = [
  ["today", "siandien|today|сегодня|heute|vandaag"],
  ["yesterday", "vakar|yesterday|вчера|gestern|gisteren"],
  ["week", "savait\\p{L}*|week(?!end)|недел\\p{L}*|woche\\p{L}*|weken"],
  ["month", "menes\\p{L}*|month\\p{L}*|месяц\\p{L}*|monat\\p{L}*|maand\\p{L}*"],
  // LT "metu" is deliberately absent: folded, it is both "metų" (of the year)
  // and "darbo metu" (during work) — the second is not a period.
  ["year", "met(?:us|ais|ai)|year\\p{L}*|год\\p{L}*|jahr\\p{L}*|jaar"],
  [
    "all",
    "is viso|visa laika|per visa|in total|all time|all-time|overall|всего|за все время|insgesamt|gesamt\\p{L}*|in totaal|totaal|alles bij elkaar",
  ],
];

const PERIOD_RX: ReadonlyArray<readonly [JournalPeriodPhrase, RegExp]> = PERIOD_WORDS.map(
  ([key, source]) => [key, new RegExp(`(?<!\\p{L})(?:${source})(?!\\p{L})`, "u")] as const,
);

/** The period a journal question names, or `null` when it names none. */
export function parseJournalPeriodPhrase(text: string | null | undefined): JournalPeriodPhrase | null {
  if (!text) return null;
  const folded = fold(text);
  for (const [key, rx] of PERIOD_RX) if (rx.test(folded)) return key;
  return null;
}
