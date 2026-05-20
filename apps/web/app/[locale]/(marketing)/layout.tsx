import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { SiteFooter } from "@/components/layouts/site-footer";
import { SiteNav } from "@/components/layouts/site-nav";

/** Public marketing shell: ambient glow + global nav/footer wrap every
 *  page in the (marketing) route group. The /design preview lives outside
 *  this group, so it stays chrome-free. */
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
    <div className="relative min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-brand-blue focus:bg-ink-800 focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-label focus:text-text-primary"
      >
        {t("skipToContent")}
      </a>
      <AmbientGlow />
      <SiteNav />
      <main id="main-content" className="relative">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
