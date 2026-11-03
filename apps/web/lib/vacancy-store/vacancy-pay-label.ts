import type { ActiveLocale } from "@/lib/i18n/config";
import type { PublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";

type L = Record<ActiveLocale, string>;

/** Pay range words. The publisher states no period on the stored row, so the
 *  card says none either: the range and the currency, exactly as supplied. */
const PAY_FROM: L = { en: "from", lt: "nuo", ru: "от", nl: "vanaf", de: "ab", pl: "od" };
const PAY_UP_TO: L = { en: "up to", lt: "iki", ru: "до", nl: "tot", de: "bis", pl: "do" };

/**
 * The pay the publisher supplied, in the reader's number format, or `null`.
 * Never invented: no currency (or a malformed one) or no amount = no chip.
 */
export function vacancyPayLabel(
  vacancy: Pick<PublicVacancyPreview, "compensationCurrency" | "compensationMin" | "compensationMax">,
  locale: ActiveLocale,
): string | null {
  const currency = vacancy.compensationCurrency?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const valid = (n: number | null) => (n !== null && Number.isFinite(n) && n > 0 ? n : null);
  const min = valid(vacancy.compensationMin);
  const max = valid(vacancy.compensationMax);
  if (min === null && max === null) return null;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  if (min !== null && max !== null && max > min) return `${n.format(min)}–${n.format(max)} ${currency}`;
  if (min !== null && max !== null) return `${n.format(min)} ${currency}`;
  if (min !== null) return `${PAY_FROM[locale]} ${n.format(min)} ${currency}`;
  return `${PAY_UP_TO[locale]} ${n.format(max as number)} ${currency}`;
}
