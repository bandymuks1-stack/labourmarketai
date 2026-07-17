import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { MarketingFunnelBeacon } from "@/components/app/marketing-funnel-beacon";
import { SiteFooter } from "@/components/layouts/site-footer";
import { SiteNav } from "@/components/layouts/site-nav";
import {
  MARKETING_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";

/** Public marketing shell: ambient glow + global nav/footer wrap every
 *  page in the (marketing) route group. The /design preview lives outside
 *  this group, so it stays chrome-free.
 *
 *  Performance Reality Audit v2: this provider REPLACES the root layout's
 *  minimal message context with the marketing pick (~4 KB) — the union
 *  client pick (~300 KB serialized) no longer ships on public pages. The
 *  allowlist is re-derived from this tree's import graph by
 *  lib/guards/client-messages-allowlist.test.ts on every CI run. */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");

  return (
    <NextIntlClientProvider
      messages={pickMessages(
        await getMessages(),
        MARKETING_CLIENT_MESSAGE_ROOTS,
      )}
    >
      <div className="relative min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-brand-blue focus:bg-ink-800 focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-label focus:text-text-primary"
        >
          {t("skipToContent")}
        </a>
        <AmbientGlow />
        <MarketingFunnelBeacon />
        <SiteNav />
        <main id="main-content" className="relative">
          {children}
        </main>
        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
