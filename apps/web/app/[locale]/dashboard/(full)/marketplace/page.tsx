import { redirect } from "next/navigation";

/**
 * Marketplace → Map (map-first correction).
 *
 * The map is the primary visual market surface, so the marketplace hub is no
 * longer a competing destination: this route redirects to /dashboard/market-map.
 * The offers / shop / rentals concepts are represented as future LAYERS of the
 * map (disabled/preparing legend filters), not a separate hub page. The route
 * is kept (redirect) so any existing link stays valid; it can be renamed or
 * re-homed later without breaking bookmarks. No fake data anywhere.
 */
export default async function MarketplaceRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/market-map`);
}
