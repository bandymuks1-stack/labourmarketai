import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listMyMarketplaceListings,
  discoverMarketplaceListings,
} from "@/lib/marketplace/listings";
import { MarketplaceListingsSection } from "@/components/app/marketplace-listings-section";

export const dynamic = "force-dynamic";

/**
 * Marketplace — work-resource listings (Wagon 13, slice 1). The European Work &
 * Business Ecosystem Marketplace's physical-resource half: accommodation &
 * worker housing, commercial premises, vehicles/transport, tools, equipment,
 * machinery and safety equipment offered for sale / rent / wanted. Bounded to
 * work & projects — never generic consumer classifieds.
 *
 * The professional-SERVICES half stays the canonical `service_offerings`
 * (/dashboard/services). Enquiries reuse the canonical conversation inbox.
 *
 * Honest degradation: until the owner applies the marketplace_listings
 * migration, the readers return `needs-migration` and the section shows a calm
 * "not available yet" state — never an error, never a fake listing.
 */
export default async function ListingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/listings`);

  const t = await getTranslations("marketplaceListings");
  const [mine, discovery] = await Promise.all([
    listMyMarketplaceListings(),
    discoverMarketplaceListings(),
  ]);
  const needsMigration =
    mine.kind === "needs-migration" || discovery.kind === "needs-migration";
  const myRows = mine.kind === "ok" ? mine.rows : [];
  const discoveryRows = discovery.kind === "ok" ? discovery.rows : [];

  return (
    <div className="flex flex-col gap-4" data-testid="listings-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageIntro")}</p>
      </header>

      <MarketplaceListingsSection
        myRows={myRows}
        discoveryRows={discoveryRows}
        needsMigration={needsMigration}
        locale={locale}
      />

      {/* Cross-link to the professional-services half of the marketplace —
          the canonical service_offerings surface (reused, not duplicated). */}
      <Link
        href={"/dashboard/services" as "/dashboard"}
        data-testid="listings-to-services-link"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-brand-blue"
      >
        {t("linkToServices")}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}
