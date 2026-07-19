/**
 * Pure Lithuanian pluralization helper (journal compact edit UX, P0-G).
 *
 * Standard LT plural rules:
 *   • n % 10 === 1 && n % 100 !== 11            → singular  (1 valanda, 21 valanda, 101 valanda)
 *   • n % 10 ∈ 2..9 && !(n % 100 ∈ 11..19)      → paucal    (2 valandos, 109 valandos)
 *   • everything else (0, 10–20, 30, 111, …)    → genitive  (10 valandų, 11 valandų, 110 valandų)
 *
 * Non-integer counts (1,5 valandos) read as the paucal/genitive-singular form
 * in everyday LT usage, so fractions always resolve to `few`.
 *
 * No IO, no locale framework — reusable from client and server components.
 */

export type LtPluralForms = {
  /** Singular: 1, 21, 31, 101… */
  one: string;
  /** Paucal: 2–9, 22–29, 102–109… (and non-integer values). */
  few: string;
  /** Genitive plural: 0, 10–20, 30, 40, 111–119… */
  many: string;
};

/** Pick the correct LT form for `n`. */
export function ltPlural(n: number, forms: LtPluralForms): string {
  if (!Number.isFinite(n)) return forms.many;
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return forms.few;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) {
    return forms.few;
  }
  return forms.many;
}

/** `${n} ${correct form}` — LT decimal comma for fractional values. */
export function formatLtCount(n: number, forms: LtPluralForms): string {
  const num = Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  return `${num} ${ltPlural(n, forms)}`;
}

/** Full-word LT time-unit forms (unit-select bases stay abbreviated: val./min.). */
export const LT_HOUR_FORMS: LtPluralForms = {
  one: "valanda",
  few: "valandos",
  many: "valandų",
};

export const LT_MINUTE_FORMS: LtPluralForms = {
  one: "minutė",
  few: "minutės",
  many: "minučių",
};

export const LT_DAY_FORMS: LtPluralForms = {
  one: "diena",
  few: "dienos",
  many: "dienų",
};
