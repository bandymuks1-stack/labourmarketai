/**
 * "WHERE AM I" FOR THE ONE TOP BAR (owner order 2026-10-25, three-second
 * clarity): the name of the place a person is standing in, derived from the
 * sources that already exist — never a second route list.
 *
 *   1. the header's nav items (`lib/config/navigation.ts`) answer for the
 *      areas the bar itself offers: the matching item is highlighted;
 *   2. the dashboard module registry (`lib/dashboard/dashboard-module-registry`)
 *      answers for every other real launch surface (projects, the company
 *      workspace, hours, bookings, documents…): its label becomes the
 *      breadcrumb after the workspace chip.
 *
 * Both lookups are pure and longest-prefix, so `/dashboard/company/planning`
 * names the planning zone, not the company workspace above it, and an id
 * segment (`/dashboard/projects/<id>`) still names its area.
 */

import {
  DASHBOARD_MODULES,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import type { NavItem } from "@/lib/config/navigation";

/** Does `pathname` stand inside the area that starts at `href`? */
export function pathIsInside(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item whose area holds `pathname` — the deepest one wins. */
export function activeNavItem(
  pathname: string,
  items: readonly NavItem[],
): NavItem | null {
  let best: NavItem | null = null;
  for (const item of items) {
    if (!pathIsInside(pathname, item.href)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

/**
 * The i18n key naming the place `pathname` is in, when the header's own nav
 * does NOT already name it. A module whose route IS a nav destination is
 * skipped: the highlighted nav item already says where the person is, and a
 * crumb repeating it would only add noise.
 *
 * A catalogue-backed module is named by its FEATURE label (a place: "Profilis"),
 * not by its control-room card title (an action: "Papildyti profilį").
 */
export function headerPlaceLabelKey(
  pathname: string,
  navItems: readonly NavItem[],
): string | null {
  const navHrefs = new Set(navItems.map((i) => i.href));
  let bestRoute = "";
  let bestKey: string | null = null;
  for (const m of DASHBOARD_MODULES) {
    const route = getModuleRoute(m.id);
    if (route === "/dashboard" || navHrefs.has(route)) continue;
    if (!pathIsInside(pathname, route)) continue;
    if (route.length <= bestRoute.length) continue;
    bestRoute = route;
    bestKey = m.featureKey ? `features.${m.featureKey}.label` : m.labelKey;
  }
  // A deeper nav destination beats a shallower module: inside the map or the
  // network the nav item already names the place.
  const nav = activeNavItem(pathname, navItems);
  if (nav && nav.href.length >= bestRoute.length) return null;
  return bestKey;
}
