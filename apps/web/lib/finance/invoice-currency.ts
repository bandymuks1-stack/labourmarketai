/**
 * CURRENCY-NEUTRAL MONEY (pure). Amounts are INTEGER MINOR UNITS everywhere
 * (database and model). The minor-unit exponent differs per currency
 * (JPY 0, most 2, KWD 3) and lives ONLY here, in parsing and formatting - the
 * stored arithmetic (net, tax, totals) is exponent-independent because it
 * works on the integer minor units.
 *
 * The database enforces the SHAPE of an ISO 4217 code (three uppercase
 * letters). It deliberately carries no closed list; this module is the app-side
 * ISO 4217 list used for validation in forms. It is not a short or EUR-centred
 * set; a code missing here can be added without a migration.
 */

export const CURRENCY_SHAPE = /^[A-Z]{3}$/;

/** Active ISO 4217 alphabetic codes (app-side validation list). */
export const ISO_4217_CODES: readonly string[] = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK " +
  "DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF " +
  "KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK " +
  "PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX " +
  "USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL"
).split(" ");

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function isCurrencyShape(code: unknown): code is string {
  return typeof code === "string" && CURRENCY_SHAPE.test(code);
}

export function isKnownCurrency(code: unknown): code is string {
  return isCurrencyShape(code) && ISO_4217_CODES.includes(code);
}

/** Minor-unit exponent: 0 for JPY-like, 3 for KWD-like, 2 otherwise. */
export function currencyExponent(code: string): 0 | 2 | 3 {
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** Integer minor units -> exact decimal string ("12.500" for KWD, "15000" for JPY). */
export function minorToDecimalString(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = BigInt(Math.abs(Math.trunc(minor)));
  if (exp === 0) return `${sign}${abs}`;
  const base = BigInt(10) ** BigInt(exp);
  return `${sign}${abs / base}.${String(abs % base).padStart(exp, "0")}`;
}

/**
 * User input in MAJOR units ("45", "45.5", "12,500") -> integer minor units, or
 * null when it has more decimals than the currency allows or is not a number.
 * Pure integer math, no floats.
 */
export function parseMajorToMinor(input: string, currency: string): number | null {
  const exp = currencyExponent(currency);
  const raw = input.trim().replace(",", ".");
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > exp) return null;
  const minor = BigInt(m[1]) * BigInt(10) ** BigInt(exp) + BigInt((frac || "0").padEnd(exp, "0") || "0");
  if (minor > BigInt(100000000000)) return null;
  return Number(minor);
}

/** Locale-aware display. Intl applies the currency's own exponent; we pass the decimal string, not minor/100. */
export function formatMinor(minor: number, currency: string, locale: string): string {
  const exp = currencyExponent(currency);
  const value = Number(minorToDecimalString(minor, currency));
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${minorToDecimalString(minor, currency)} ${currency}`;
  }
}
