import { setRequestLocale } from "next-intl/server";
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

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <SiteNav />
      <main className="relative">{children}</main>
      <SiteFooter />
    </div>
  );
}
