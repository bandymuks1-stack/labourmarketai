/**
 * Human-readable duration formatter for the work journal.
 *
 * The composer/extractor canonicalises compound times like
 * "valandą dvidešimt minučių" (1h20) into `{ value: 80, unitSlug: "minutes" }`
 * so per-fragment arithmetic stays integer-precise. But surfacing
 * `80 minutes` to a worker is hostile — the same number reads as
 * `1 val. 20 min.` in LT and `1 h 20 min` in EN.
 *
 * This module is rule-based and works for ANY UI locale: LT and RU carry
 * their own unit abbreviations, every other locale reads the neutral
 * international unit symbols (h / min / d) with its OWN decimal separator.
 * It never coerces a value into a finer unit than the input carried —
 * `5 valandos` stays `5 val.`, not `300 min`.
 */
export type DurationUnit = "hours" | "minutes" | "days";

/** A UI locale code. Deliberately open (not a closed `"lt" | "en" | "ru"`
 *  union): a locale without hand-written abbreviations still formats
 *  correctly, so activating a locale needs no edit here. */
export type DurationFormatLocale = string;

export type FormatDurationOpts = {
  /** When false, the formatter returns the raw value + the localized unit
   *  label (`5 val.`), without splitting fractional values into mixed
   *  hour+minute forms. Default: true. */
  splitFractions?: boolean;
};

/** The duration locale a UI locale reads. LT and RU have their own
 *  abbreviations; every other locale (de / nl / pl and the inactive ones)
 *  reads the neutral international "h / min" — never the LT "val." that a
 *  Russian, Polish or German reader cannot parse — and keeps its own code,
 *  so a German reader gets "1,5 h", not the English "1.5 h". */
export function durationLocale(locale: string): DurationFormatLocale {
  const code = (locale ?? "").trim().toLowerCase();
  return code === "" ? "en" : code;
}

/** Format a duration value + canonical unit into a human-readable string.
 *
 *  Examples (locale = "lt"):
 *    formatDuration(195, "minutes") → "3 val. 15 min."
 *    formatDuration(80,  "minutes") → "1 val. 20 min."
 *    formatDuration(45,  "minutes") → "45 min."
 *    formatDuration(1.5, "hours")   → "1 val. 30 min."
 *    formatDuration(5,   "hours")   → "5 val."
 *    formatDuration(2,   "days")    → "2 d."
 *
 *  Examples (locale = "en"):
 *    formatDuration(195, "minutes") → "3 h 15 min"
 *    formatDuration(45,  "minutes") → "45 min"
 *    formatDuration(2,   "days")    → "2 d"
 */
export function formatDuration(
  value: number,
  unitSlug: DurationUnit | string | null | undefined,
  locale: DurationFormatLocale = "lt",
  opts: FormatDurationOpts = {},
): string {
  const split = opts.splitFractions !== false;
  // A locale without its own abbreviations reads the international symbols —
  // never another language's ("val." is Lithuanian, not a default).
  const labels = LABELS[locale] ?? LABELS.en;

  if (!Number.isFinite(value) || value < 0) {
    return `${value} ${labels.minutes}`;
  }

  // Days stay as-is — half-days are rare in journal language.
  if (unitSlug === "days") {
    return `${formatNumber(value, locale)} ${labels.days}`;
  }

  // Pull every duration into TOTAL MINUTES so the split logic is uniform.
  let totalMinutes: number;
  if (unitSlug === "minutes") {
    totalMinutes = value;
  } else if (unitSlug === "hours") {
    totalMinutes = value * 60;
  } else {
    // Unknown unit — degrade gracefully to a labeled raw value.
    return `${formatNumber(value, locale)} ${unitSlug ?? ""}`.trim();
  }

  // If the value is a clean integer in the input unit AND we're not
  // splitting, return the value verbatim.
  if (!split) {
    if (unitSlug === "hours") {
      return `${formatNumber(value, locale)} ${labels.hours}`;
    }
    return `${formatNumber(value, locale)} ${labels.minutes}`;
  }

  // Rounding: pull to the nearest whole minute. Compound LT durations
  // upstream are integer-precise, so this just cleans up float noise from
  // `valandą su puse` (90 min exactly).
  totalMinutes = Math.round(totalMinutes);

  if (totalMinutes < 60) {
    return `${formatNumber(totalMinutes, locale)} ${labels.minutes}`;
  }

  const wholeHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes - wholeHours * 60;

  if (remMinutes === 0) {
    return `${formatNumber(wholeHours, locale)} ${labels.hours}`;
  }

  return (
    `${formatNumber(wholeHours, locale)} ${labels.hours} ` +
    `${formatNumber(remMinutes, locale)} ${labels.minutes}`
  );
}

/** Locale-aware number formatting — keeps integers as integers and writes
 *  the decimal separator the locale itself uses (comma for LT / RU / DE /
 *  NL / PL, dot for EN), read from Intl rather than a hand-kept list. */
function formatNumber(n: number, locale: DurationFormatLocale): string {
  if (Number.isInteger(n)) return String(n);
  const fixed = n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return decimalSeparator(locale) === "," ? fixed.replace(".", ",") : fixed;
}

const SEPARATORS = new Map<string, string>();

function decimalSeparator(locale: string): string {
  const cached = SEPARATORS.get(locale);
  if (cached !== undefined) return cached;
  let sep = ".";
  try {
    sep =
      new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ??
      ".";
  } catch {
    // Not a valid BCP-47 tag — the international dot.
  }
  SEPARATORS.set(locale, sep);
  return sep;
}

const LABELS: Readonly<Record<string, Record<DurationUnit, string>>> = {
  lt: {
    hours: "val.",
    minutes: "min.",
    days: "d.",
  },
  en: {
    hours: "h",
    minutes: "min",
    days: "d",
  },
  ru: {
    hours: "ч",
    minutes: "мин",
    days: "дн.",
  },
};
