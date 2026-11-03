/**
 * DOCUMENT TITLES FOR THE SIGNED-IN PRODUCT (production audit 2026-10-25):
 * every /dashboard page rendered the one generic site title, so tabs,
 * history and screen readers could not tell Journal from Calendar from
 * Profile (WCAG 2.2 SC 2.4.2 Page Titled).
 *
 * A page's title is the name the person already sees — never a second label
 * table:
 *   1. the page heading's own key, when the page passes it (the h1 copy);
 *   2. otherwise the header's "where am I" label (`header-place.ts`): the
 *      module label, or the highlighted nav item's tab label.
 *
 * Labels only — no data read, so a title never costs a query and never
 * names a record. `robots: noindex` from the dashboard layout still merges in.
 */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getCoreNavItems, getHeaderOverflowNavItems } from "@/lib/config/navigation";
import { activeNavItem, headerPlaceLabelKey } from "@/lib/navigation/header-place";
import { BRAND_NAME } from "@/lib/seo/metadata";

const NAV_ITEMS = [...getCoreNavItems(), ...getHeaderOverflowNavItems({ isAdmin: true })];

/** The public title shape ("Santechnikas · LabourMarket.ai", lib/seo/metadata.ts). */
const brandedTitle = (title: string): string => `${title} · ${BRAND_NAME}`;

/** The message key that names the page at `route` (a `/dashboard…` path). */
export function dashboardTitleKey(route: string, headingKey?: string): string {
  return (
    headingKey ??
    headerPlaceLabelKey(route, NAV_ITEMS) ??
    activeNavItem(route, NAV_ITEMS)?.tabLabelKey ??
    "auth.dashboard.tabs.overview"
  );
}

/** `export const generateMetadata = dashboardPageMetadata("/dashboard/…", key?)` */
export function dashboardPageMetadata(route: string, headingKey?: string) {
  const key = dashboardTitleKey(route, headingKey);
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale });
    return { title: brandedTitle(t(key as never)) };
  };
}
