/**
 * Single source of truth for the dashboard's primary navigation.
 *
 * The list of tabs is DERIVED from the feature-availability catalogue
 * (`getVisiblePrimaryFeatures()`), not maintained separately. This file
 * adds the bits the catalogue doesn't carry — the short tab label
 * (catalogue label = full feature name; tab label is shorter) and the
 * icon. Adding a new tab is a two-line change: flip
 * `safeToShowInPrimaryNav: true` in feature-availability, then add a
 * matching row to `TAB_META` below.
 *
 * Preparing or hidden features cannot reach the primary nav: the
 * `getVisiblePrimaryFeatures()` filter requires `availability: "active"`
 * AND `safeToShowInPrimaryNav: true`. The guard test enforces it.
 */

import {
  getVisiblePrimaryFeatures,
  type FeatureConfig,
  type FeatureKey,
} from "./feature-availability";

/** Icon ids — concrete icon imports live in the nav components
 *  (`BottomNav`, `DashboardTabs`), so this config stays
 *  framework-agnostic. */
export type NavIconKey =
  | "home"
  | "store"
  | "map"
  | "idCard"
  | "journal"
  | "messages"
  | "user"
  | "shield";

type TabMeta = {
  /** i18n key for the SHORT tab label (e.g. "Apžvalga" vs the feature's
   *  full label "Apžvalga"). Lives under `auth.dashboard.tabs.*`. */
  tabLabelKey: string;
  iconKey: NavIconKey;
};

/**
 * Per-feature tab presentation. Only feature keys that appear here can
 * become a primary-nav tab — even if a feature flips
 * `safeToShowInPrimaryNav: true`, it must also opt-in with an icon and
 * a short label here. This keeps tab visuals tightly controlled.
 */
const TAB_META: Partial<Record<FeatureKey, TabMeta>> = {
  overview: {
    tabLabelKey: "auth.dashboard.tabs.overview",
    iconKey: "home",
  },
  // Žemėlapis — the map is its own PRIMARY product surface (map-first
  // correction). The tab goes directly to the real map at /dashboard/market-map
  // (the market_map feature's route), not the marketplace hub.
  market_map: {
    tabLabelKey: "auth.dashboard.tabs.marketMap",
    iconKey: "map",
  },
  // Darbo žurnalas — recording work is a primary action and feeds the
  // profile / CV / player-card (action-first IA v1). The tab routes directly
  // to the real journal at /dashboard/journal.
  journal_text_first: {
    tabLabelKey: "auth.dashboard.tabs.journal",
    iconKey: "journal",
  },
  communication: {
    tabLabelKey: "auth.dashboard.tabs.communication",
    iconKey: "messages",
  },
  // Account / settings is intentionally NOT a primary tab — it lives in the
  // avatar / account menu (action-first IA v1: settings is a utility, not a
  // primary action).
};

export type NavItem = {
  /** The feature key the tab is sourced from, or "admin" for the
   *  permission-gated admin item (not a catalogue feature). Useful for
   *  tests + telemetry + React keys. */
  id: FeatureKey | "admin";
  /** Locale-prefixed app route. */
  href: string;
  tabLabelKey: string;
  iconKey: NavIconKey;
};

/**
 * The tabs the user sees. Derived live from the catalogue so future
 * promotions / demotions of features automatically reflect here.
 */
export function getVisiblePrimaryNavItems(): readonly NavItem[] {
  const items: NavItem[] = [];
  for (const f of getVisiblePrimaryFeatures()) {
    const meta = TAB_META[f.key];
    if (!meta) continue;
    if (!f.primaryRoute) continue;
    items.push({
      id: f.key,
      href: f.primaryRoute,
      tabLabelKey: meta.tabLabelKey,
      iconKey: meta.iconKey,
    });
  }
  return items;
}

/**
 * Frozen snapshot for callers that need a stable, plain array. Recomputed
 * once on module load. Tests / guards read from here.
 */
export const VISIBLE_PRIMARY_NAV_ITEMS: readonly NavItem[] =
  getVisiblePrimaryNavItems();

/**
 * Admin nav item. NOT sourced from the feature catalogue — admin is a
 * permission dimension, not a product feature (see dashboard layout's
 * `deriveIsAdmin`). The nav components append it ONLY when the auth context
 * reports `isAdmin`, so non-admins never see it. This is the "Admin only if
 * admin" item the compact nav allows for.
 */
export const ADMIN_NAV_ITEM: NavItem = {
  id: "admin",
  href: "/dashboard/admin",
  tabLabelKey: "auth.dashboard.tabs.admin",
  iconKey: "shield",
};

/** Plain feature list backing the nav — used by audit / route-check docs. */
export const PRIMARY_NAV_SOURCE_FEATURES: readonly FeatureConfig[] =
  getVisiblePrimaryFeatures().filter((f) => TAB_META[f.key] !== undefined);
