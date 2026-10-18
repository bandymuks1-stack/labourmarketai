import { classifyIntent } from "./intent-router";
import { extractWorkLog } from "./worklog-extract";

/**
 * ONE MESSAGE, AND THE DAY'S WORK INSIDE IT (owner continuation 2026-09-29
 * §24). Walked on production: "Esu pastolininkas. Dabar dirbu Gama. Šiandien 7
 * valandas montavau pastolius. Ieškau geriau apmokamo darbo Švedijoje." was
 * answered as a search (and the profession) — the seven hours of work the
 * person stated were dropped without a word.
 *
 * This finds, in a message of SEVERAL sentences whose main route is not a
 * work log, the one sentence that is itself a clear work statement: it routes
 * to log-work on its own AND the journal's own reader finds a duration in it.
 * The caller opens the existing work-log card for that sentence — reviewed and
 * saved by the person, never written from here. Pure.
 */
export function secondaryWorkStatement(text: string, today: string): string | null {
  const sentences = (text ?? "")
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 2) return null;
  for (const s of sentences) {
    if (classifyIntent(s).intent !== "log-work") continue;
    const parse = extractWorkLog(s, today);
    if (parse.hasSignal && parse.workedMinutes != null && parse.workedMinutes > 0) return s;
  }
  return null;
}
