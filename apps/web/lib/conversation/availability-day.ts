import { foldText } from "@/lib/structuring/normalize";

/**
 * THE DAY A "WHO IS FREE" QUESTION NAMES — pure, UTC calendar days.
 *
 * "Kas iš komandos laisvas pirmadienį?" was answered for the default 7-day
 * window and the named day was ignored (production walk 2026-10-01). This only
 * READS the day out of the sentence; the answer is still computed by the one
 * `whoIsAvailableCore` (the same read the home, planning and the MCP use) over
 * a one-day window. Nothing here computes availability.
 *
 * Reads: today / tomorrow / the day after, a weekday name, "next <weekday>",
 * and an ISO date — in LT, EN, RU, NL, DE, PL. `null` = no day named: the
 * caller keeps its default window.
 */

/** Weekday stems, folded, Monday first (index 0 = Monday). */
const WEEKDAY_STEMS: ReadonlyArray<readonly string[]> = [
  ["pirmadien", "monday", "понедельник", "maandag", "montag", "poniedzialek"],
  ["antradien", "tuesday", "вторник", "dinsdag", "dienstag", "wtorek"],
  ["treciadien", "wednesday", "сред", "woensdag", "mittwoch", "srod"],
  ["ketvirtadien", "thursday", "четверг", "donderdag", "donnerstag", "czwartek"],
  ["penktadien", "friday", "пятниц", "vrijdag", "freitag", "piatek"],
  ["sestadien", "saturday", "суббот", "zaterdag", "samstag", "sobot"],
  ["sekmadien", "sunday", "воскресень", "zondag", "sonntag", "niedziel"],
];

/** "next" in front of a weekday means the one AFTER today, never today itself. */
const NEXT_WORD = /(?:^|[^\p{L}])(?:kit\p{L}*|next|следующ\p{L}*|volgend\p{L}*|nachst\p{L}*|nastepn\p{L}*)\s+$/u;

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function plusDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function readAvailabilityDay(text: string, todayIso: string): string | null {
  const folded = foldText(text ?? "");
  const iso = folded.match(/(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/u);
  if (iso) {
    const d = utc(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso[0]) return iso[0];
  }
  if (/(?:^|[^\p{L}])(?:poryt|day\s+after\s+tomorrow|послезавтра|overmorgen|ubermorgen|pojutrze)/u.test(folded)) {
    return plusDays(todayIso, 2);
  }
  if (/(?:^|[^\p{L}])(?:rytoj|tomorrow|завтра|morgen|jutro)/u.test(folded)) return plusDays(todayIso, 1);
  if (/(?:^|[^\p{L}])(?:siandien|today|сегодня|vandaag|heute|dzis)/u.test(folded)) return todayIso;

  const todayDow = (utc(todayIso).getUTCDay() + 6) % 7; // 0 = Monday
  for (let dow = 0; dow < 7; dow++) {
    for (const stem of WEEKDAY_STEMS[dow]) {
      const at = folded.search(new RegExp(`(?:^|[^\\p{L}])${stem}`, "u"));
      if (at < 0) continue;
      const before = folded.slice(0, folded.indexOf(stem, Math.max(0, at)));
      let ahead = (dow - todayDow + 7) % 7;
      if (ahead === 0 && NEXT_WORD.test(before)) ahead = 7;
      return plusDays(todayIso, ahead);
    }
  }
  return null;
}
