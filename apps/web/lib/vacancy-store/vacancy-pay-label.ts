import type { ActiveLocale } from "@/lib/i18n/config";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

type L = Record<ActiveLocale, string>;

/** Pay range words. The publisher states no period on the stored row, so the
 *  card says none either: the range and the currency, exactly as supplied. */
const PAY_FROM: L = { en: "from", lt: "nuo", ru: "от", nl: "vanaf", de: "ab", pl: "od", sv: "från" };
const PAY_UP_TO: L = { en: "up to", lt: "iki", ru: "до", nl: "tot", de: "bis", pl: "do", sv: "upp till" };

/**
 * THE ONE pay wording (audit 2026-11-03: job cards and job alerts used to
 * format the same stated pay two ways — an alert printed "up to 3200" as
 * "3200 EUR", an exact amount the publisher never stated).
 *
 * `locale` given: the reader's number format and words ("nuo 2 500 EUR").
 * `locale` null: the language-neutral form for text stored before anyone
 * reads it (a job alert's metadata) — no grouping, "≥" / "≤" for one bound.
 * Never invented: no currency (or a malformed one) or no amount = null.
 */
export function payLabel(
  currencyRaw: string | null | undefined,
  minRaw: number | null | undefined,
  maxRaw: number | null | undefined,
  locale: ActiveLocale | null,
): string | null {
  const currency = currencyRaw?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const valid = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  const min = valid(minRaw);
  const max = valid(maxRaw);
  if (min === null && max === null) return null;
  const fmt = locale
    ? (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v)
    : (v: number) => String(Math.round(v));
  if (min !== null && max !== null && max > min) return `${fmt(min)}–${fmt(max)} ${currency}`;
  if (min !== null && max !== null) return `${fmt(min)} ${currency}`;
  if (min !== null) return `${locale ? PAY_FROM[locale] : "≥"} ${fmt(min)} ${currency}`;
  return `${locale ? PAY_UP_TO[locale] : "≤"} ${fmt(max as number)} ${currency}`;
}

/** The pay the publisher supplied on a job card, in the reader's format. */
export function vacancyPayLabel(
  vacancy: Pick<PublicVacancyPreview, "compensationCurrency" | "compensationMin" | "compensationMax">,
  locale: ActiveLocale,
): string | null {
  return payLabel(vacancy.compensationCurrency, vacancy.compensationMin, vacancy.compensationMax, locale);
}
