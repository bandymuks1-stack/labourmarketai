/**
 * Single source of truth for the dashboard's primary navigation. Bottom
 * nav + the desktop dashboard tabs read from this file so adding / hiding
 * a tab is one change instead of two.
 *
 * Only "active" entries are rendered in the visible nav. Preparing /
 * hidden entries can still exist as routes (and have their own
 * preparing-state pages), but they never appear as primary nav targets.
 */

import type { Availability } from "./feature-availability";

export type NavItemId = "overview" | "profile" | "journal" | "account";

export type NavItem = {
  id: NavItemId;
  /** i18n key, looked up under `auth.dashboard.tabs.*`. */
  labelKey: string;
  /** Locale-prefixed app route. */
  href:
    | "/dashboard"
    | "/dashboard/profile"
    | "/dashboard/journal"
    | "/dashboard/account";
  availability: Availability;
};

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "overview",
    labelKey: "auth.dashboard.tabs.overview",
    href: "/dashboard",
    availability: "active",
  },
  {
    id: "profile",
    labelKey: "auth.dashboard.tabs.profile",
    href: "/dashboard/profile",
    availability: "active",
  },
  {
    id: "journal",
    labelKey: "auth.dashboard.tabs.journal",
    href: "/dashboard/journal",
    availability: "active",
  },
  {
    id: "account",
    labelKey: "auth.dashboard.tabs.account",
    href: "/dashboard/account",
    availability: "active",
  },
] as const;

/** Items rendered in the visible bottom nav / tabs row. */
export const VISIBLE_PRIMARY_NAV_ITEMS: readonly NavItem[] =
  PRIMARY_NAV_ITEMS.filter((n) => n.availability === "active");
