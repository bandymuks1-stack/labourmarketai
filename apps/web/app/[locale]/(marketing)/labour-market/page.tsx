import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Card } from "@/components/ui/Card";
import {
  PRIORITY_MARKETS,
  isSupportedCountry,
} from "@/lib/labour-market/country-evidence";

/**
 * Country labour-market evidence INDEX (Step 5/6). Lists the priority markets;
 * the Baltic core has live, source-backed pages, the rest are honestly marked
 * "coming soon". No invented data — links only. Server-rendered, no auth.
 */
export default async function CountryIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("labourMarket");

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12" id="main-content">
      <section>
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {t("countryIndexEyebrow")}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {t("countryIndexTitle")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {t("countryIndexSubcopy")}
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIORITY_MARKETS.map((code) => {
            const live = isSupportedCountry(code);
            const name = t(`countryNames.${code}`);
            return (
              <li key={code}>
                {live ? (
                  <Link
                    href={`/labour-market/${code.toLowerCase()}`}
                    className="block"
                    data-testid={`country-link-${code}`}
                  >
                    <Card className="flex items-center justify-between gap-3 transition-colors hover:border-brand-blue">
                      <span className="font-display text-lg font-semibold text-text-primary">
                        {name}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-label text-brand-blue">
                        {t("countryView")} →
                      </span>
                    </Card>
                  </Link>
                ) : (
                  <Card className="flex items-center justify-between gap-3 opacity-70">
                    <span className="font-display text-lg font-semibold text-text-secondary">
                      {name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t("countryComingSoon")}
                    </span>
                  </Card>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
