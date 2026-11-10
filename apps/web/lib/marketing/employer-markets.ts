/**
 * EMPLOYER MARKET PAGES — the country versions of `/for-companies` that
 * employer adverts link to (owner order 2026-11-10: P1 Luxembourg, P2 the
 * Netherlands, P3 Denmark).
 *
 * A market version is the same page with `?market=<code>`: its own headline,
 * three plain points and ONE call to action, the canonical company-need entry
 * with the country already chosen. It is not a second route, but it IS its own
 * indexable page (owner P0 2026-11-10, SEO): `employerMarketPath` is its
 * self-canonical address, it carries its own hreflang set and sitemap entry,
 * and an advert's `utm_*` parameters canonicalise back to it. Before, every
 * market version declared `/for-companies` as canonical, so Luxembourg, the
 * Netherlands and Denmark had no page a search engine would index.
 *
 * `locales` are the languages a market's adverts are written in. Another
 * active locale still renders the market copy (every active catalogue carries
 * it), so a shared link never breaks; only the advert links are limited.
 * Pure: no fs, no network.
 */

import { isActiveLocale } from "@/lib/i18n/config";

export const EMPLOYER_MARKETS = {
  lu: { country: "LU", adLocales: ["de", "en", "fr"] },
  nl: { country: "NL", adLocales: ["nl", "en"] },
  dk: { country: "DK", adLocales: ["en"] },
} as const;

export type EmployerMarket = keyof typeof EMPLOYER_MARKETS;

/** The market a `?market=` value names, or null. Case-insensitive; the first value of a repeated parameter. */
export function readEmployerMarket(raw: unknown): EmployerMarket | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return Object.hasOwn(EMPLOYER_MARKETS, code) ? (code as EmployerMarket) : null;
}

/** A market version's own indexable address (canonical, hreflang, sitemap). */
export function employerMarketPath(market: EmployerMarket): string {
  return `/for-companies?market=${market}`;
}

/** Every market version's address, for the sitemap. */
export const EMPLOYER_MARKET_PATHS: readonly string[] = (
  Object.keys(EMPLOYER_MARKETS) as EmployerMarket[]
).map(employerMarketPath);

/** The company-need query a market page's one call to action carries. */
export function employerMarketNeedQuery(market: EmployerMarket): string {
  return `country=${EMPLOYER_MARKETS[market].country}`;
}

/** UTM convention for employer adverts: one source/medium pair per channel. */
export const EMPLOYER_AD_CHANNELS = {
  google: { utm_source: "google", utm_medium: "cpc" },
  facebook: { utm_source: "facebook", utm_medium: "paid" },
  linkedin: { utm_source: "linkedin", utm_medium: "paid" },
} as const;

export type EmployerAdChannel = keyof typeof EMPLOYER_AD_CHANNELS;

/**
 * The advert link for one market, language, channel and variant:
 * `https://labourmarket.ai/<locale>/for-companies?market=<m>&utm_source=…&utm_medium=…&utm_campaign=<m>-employers-<variant>&utm_content=<locale>`.
 * Throws for a language the market's adverts are not written in, so a kit
 * can never print a link to a page in the wrong language.
 */
export function employerAdLink(
  market: EmployerMarket,
  locale: string,
  channel: EmployerAdChannel,
  variant: string,
): string {
  const m = EMPLOYER_MARKETS[market];
  if (!(m.adLocales as readonly string[]).includes(locale)) {
    throw new Error(`No ${market} employer adverts in ${locale}`);
  }
  // FR is planned for Luxembourg but is not a routed locale yet: no link to a page that does not exist.
  if (!isActiveLocale(locale)) throw new Error(`${locale} is not an active locale yet`);
  if (!/^[a-z0-9-]{1,40}$/.test(variant)) throw new Error(`Bad variant: ${variant}`);
  const q = new URLSearchParams({
    market,
    ...EMPLOYER_AD_CHANNELS[channel],
    utm_campaign: `${market}-employers-${variant}`,
    utm_content: locale,
  });
  return `https://labourmarket.ai/${locale}/for-companies?${q.toString()}`;
}
