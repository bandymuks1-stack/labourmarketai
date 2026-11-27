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
import {
  getActiveOrganizationContext,
  governedActiveOrganizationId,
} from "@/lib/company/active-organization";
import { PageTitle } from "@/components/app/premium/page-title";
import { dashboardPageMetadata } from "@/lib/navigation/dashboard-metadata";

// The document title names this page (WCAG 2.4.2) — lib/navigation/dashboard-metadata.ts.
export const generateMetadata = dashboardPageMetadata("/dashboard/listings");


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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tab?: string | string[]; focus?: string | string[] }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/listings`);

  const t = await getTranslations("marketplaceListings");
  const [mine, discovery, orgCtx] = await Promise.all([
    listMyMarketplaceListings(),
    discoverMarketplaceListings(),
    getActiveOrganizationContext(),
  ]);
  // A company sells, rents out or looks for things as ITSELF: when the active
  // workspace (the chip) is an organization the person governs, the form
  // offers it as the publisher. The RPC re-checks `manages_organization`.
  const governedId = governedActiveOrganizationId(orgCtx);
  const publisher =
    governedId && orgCtx.activeOrganization
      ? { id: governedId, name: orgCtx.activeOrganization.name }
      : null;
  const needsMigration =
    mine.kind === "needs-migration" || discovery.kind === "needs-migration";
  // A failed read is named as such — never rendered as an empty board.
  const readUnavailable = mine.kind === "unavailable" || discovery.kind === "unavailable";
  const extended =
    mine.kind === "ok" && discovery.kind === "ok" && mine.extended && discovery.extended;
  const myRows = mine.kind === "ok" ? mine.rows : [];
  const discoveryRows = discovery.kind === "ok" ? discovery.rows : [];
  const unavailable = discovery.kind === "ok" ? (discovery.unavailable ?? []) : [];
  // One block per screen (decision 0034): browse, or my listings — each with
  // its own address. `?focus=<id>` names one of MY listings (the only rows
  // that carry that anchor), so it opens on that block.
  const focus = typeof query?.focus === "string" ? query.focus : null;
  const tab: "browse" | "mine" =
    query?.tab === "mine" || (focus !== null && myRows.some((r) => r.id === focus))
      ? "mine"
      : "browse";

  return (
    <div className="flex flex-col gap-4" data-testid="listings-page">
      <header className="flex flex-col gap-1">
        <PageTitle>{t("pageTitle")}</PageTitle>
      </header>

      <nav aria-label={t("pageTitle")} data-testid="listings-tabs" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {(
          [
            ["browse", t("browseTitle")],
            ["mine", t("myTitle")],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={(id === "browse" ? "/dashboard/listings" : `/dashboard/listings?tab=${id}`) as "/dashboard"}
            aria-current={tab === id ? "page" : undefined}
            data-testid={`listings-tab-${id}`}
            className={
              tab === id
                ? "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-brand-blue bg-ink-800 px-4 text-sm font-semibold text-text-primary"
                : "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-ink-600 bg-ink-800/50 px-4 text-sm font-medium text-text-secondary hover:border-ink-500 hover:text-text-primary"
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      <MarketplaceListingsSection
        myRows={myRows}
        discoveryRows={discoveryRows}
        needsMigration={needsMigration}
        readUnavailable={readUnavailable}
        extended={extended}
        unavailable={unavailable}
        publisher={publisher}
        locale={locale}
        view={tab}
      />

      {/* Cross-link to the professional-services half of the marketplace —
          the canonical service_offerings surface (reused, not duplicated). */}
      <Link
        href={"/dashboard/services" as "/dashboard"}
        data-testid="listings-to-services-link"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        {t("linkToServices")}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}
