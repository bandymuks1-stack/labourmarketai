/**
 * "NE 5, O 6 VALANDAS" — a correction said in words (owner continuation
 * 2026-09-29 §7). Walked on production: after an entry was saved, "Ne 5, o 6
 * valandas." and "Pataisyk šiandienos įrašą: ne 5, o 6 valandos." each opened
 * a NEW 6 h entry — the correction would have been counted on top of the
 * original (11 h). A correction is an edit of the entry that exists, through
 * the canonical supersede path (the old entry stays in history as corrected).
 *
 * This pure half reads what the person asked to change, only so the answer
 * can repeat it back; nothing here writes and nothing is inferred beyond the
 * words. Pure: no IO, no clock.
 */

export type CorrectionAsk =
  | { readonly kind: "hours"; readonly from: number | null; readonly to: number }
  | { readonly kind: "day"; readonly day: "yesterday" | "day-before" }
  | { readonly kind: "unspecified" };

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const num = (s: string) => Number.parseFloat(s.replace(",", "."));

export function readCorrectionAsk(text: string): CorrectionAsk {
  const q = fold(text ?? "");
  // "ne 5, o 6" / "not 5 but 6" / "не 5, а 6" / "nicht 5, sondern 6" / "niet 5 maar 6" / "nie 5, a 6"
  const pair =
    /\b(?:ne|not|не|nicht|niet|nie)\s+(\d+(?:[.,]\d+)?)\s*(?:val\w*|h|hours?|час\w*|std\w*|uur|godz\w*)?\s*,?\s*(?:o|but|а|sondern|maar|a|ale)\s+(\d+(?:[.,]\d+)?)/u.exec(q);
  if (pair) {
    const to = num(pair[2]!);
    if (to > 0 && to <= 24) return { kind: "hours", from: num(pair[1]!), to };
  }
  if (/\b(uzvakar|day\s+before\s+yesterday|позавчера|vorgestern|eergisteren|przedwczoraj)/u.test(q)) {
    return { kind: "day", day: "day-before" };
  }
  if (/\b(vakar|yesterday|вчера|gestern|gisteren|wczoraj)\b/u.test(q)) return { kind: "day", day: "yesterday" };
  return { kind: "unspecified" };
}

/** What the chat needs to name the entry it is about to correct. */
export type CorrectableEntry =
  | {
      readonly kind: "entry";
      readonly id: string;
      /** The day the work was done (`work_date` metric), else the day it was recorded. */
      readonly workDate: string;
      readonly text: string;
      /** A manager/client already confirmed it: the edit door is closed. */
      readonly confirmed: boolean;
    }
  | { readonly kind: "none" }
  | { readonly kind: "no-worker" }
  | { readonly kind: "error" };

/** The canonical edit surface for one entry (the journal page's supersede flow). */
export function correctionHref(entryId: string): string {
  return `/dashboard/journal?editing=${encodeURIComponent(entryId)}#journal-composer`;
}
