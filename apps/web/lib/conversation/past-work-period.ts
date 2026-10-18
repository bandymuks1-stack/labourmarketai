/**
 * PAST WORK STATED WITH ITS YEARS (owner continuation 2026-09-29 §6).
 *
 * Walked on production: "2019–2022 dirbau įmonėje Baumeister GmbH
 * Vokietijoje." opened TODAY's work-journal card with the current employer
 * preselected — a job from years ago was one click from becoming today's
 * evidence for an unrelated organization. "2018–2020 dirbau stogdengiu
 * Norvegijoje." got the generic fallback.
 *
 * A dated past job has one home: the person's self-declared work history
 * (`worker.add-work-history` → `save_self_declared_work_history_v1`), which
 * stores title, relationship and the period — as a CLAIM, never as
 * employer-confirmed evidence. This reads the period and the person's own
 * words so that form opens prefilled; nothing here writes.
 *
 * The store has no organization or country field: those stay in the
 * person's own words (the title), and the answer says so.
 *
 * Pure: no IO; the current year is a parameter.
 */

export interface PastWorkPeriod {
  readonly startYear: number;
  /** null when ongoing ("iki dabar"). */
  readonly endYear: number | null;
  readonly isCurrent: boolean;
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const PAST_VERB = /(dirbau|dirbo|dirbome|worked|работал|arbeitete|werkte|pracowa)/u;
const NOW_WORDS = "dabar|siol|now|present|today|сейчас|настоящее|heute|jetzt|nu|teraz|obecnie";
// A year that is part of a calendar date (2026-09-28, 28.09.2026) is not a period.
// (a separator + 1–2 digits that END is a month/day; "2019-2022" stays a range)
const YEAR = String.raw`((?:19|20)\d{2})(?![-./]\d{1,2}(?!\d))`;
const RANGE = new RegExp(
  String.raw`(?<![-./\d])${YEAR}\s*(?:m\.?\s*)?(?:-|–|—|iki|to|until|до|по|bis|tot|do)\s*(?:${YEAR}|(${NOW_WORDS}))`,
  "u",
);
const SINGLE = new RegExp(
  String.raw`(?:(?<![-./\d])${YEAR}\s*(?:m\.|metais|metu)|\bin\s+${YEAR}\b|(?:^|\s)в\s+${YEAR}\s*(?:году|г\.)|\bim\s+jahr\s+${YEAR}|\bin\s+${YEAR}|\bw\s+${YEAR}\s*r)`,
  "u",
);

export function readPastWorkPeriod(text: string, currentYear: number): PastWorkPeriod | null {
  const q = fold(text ?? "");
  if (!PAST_VERB.test(q)) return null;
  const ok = (y: number) => y >= 1950 && y <= currentYear;
  const r = RANGE.exec(q);
  if (r) {
    const start = Number(r[1]);
    if (r[3]) return ok(start) ? { startYear: start, endYear: null, isCurrent: true } : null;
    const end = Number(r[2]);
    return ok(start) && ok(end) && start <= end ? { startYear: start, endYear: end, isCurrent: false } : null;
  }
  const one = SINGLE.exec(q);
  if (one) {
    const y = Number(one.slice(1).find((g) => g !== undefined));
    return ok(y) ? { startYear: y, endYear: y, isCurrent: false } : null;
  }
  return null;
}

/**
 * The person's own words for the job, with the years and the work verb taken
 * out: "2019–2022 dirbau įmonėje Baumeister GmbH Vokietijoje." →
 * "įmonėje Baumeister GmbH Vokietijoje". Their words, never a generated label.
 */
export function pastWorkOwnWords(text: string): string {
  return (text ?? "")
    .replace(/(?<![-./\d])(?:19|20)\d{2}\s*(?:m\.|metais|metų)?\s*(?:-|–|—|iki|to|until|до|по|bis|tot|do)?\s*(?:(?:19|20)\d{2}|dabar|šiol|now|present|сейчас|heute|nu|teraz)?/giu, " ")
    .replace(/(?<![\p{L}])(nuo|from|с|von|van|od|in|в|im jahr|w)\s+(?=\s|$)/giu, " ")
    .replace(/(?<![\p{L}])(dirbau|dirbo|dirbome|i\s+worked|worked|я\s+работал[аи]?|работал[аи]?|ich\s+arbeitete|arbeitete|ik\s+werkte|werkte|pracowa[lł][\p{L}]*)(?![\p{L}])/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, "")
    .slice(0, 200);
}
