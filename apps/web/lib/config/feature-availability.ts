/**
 * Central feature-availability catalogue.
 *
 * One source of truth for: which product features exist, which are
 * usable today, which are honestly preparing, which are out of scope
 * entirely. Dashboard cards, CTAs, and nav items consult this map
 * before rendering — so preparing features cannot accidentally appear
 * as working actions, and matching / scoring / AI claims stay impossible
 * to ship by mistake.
 *
 * Not a runtime feature-flag system. Flag toggles (e.g. PR #18's
 * `visibility.public_proof`) live in the database; that layer can
 * still INTERSECT with these defaults to gate exposure further.
 *
 * Schema is intentionally lightweight — every UI surface that consumes
 * a feature needs the same handful of fields (label, description,
 * availability, primary route, why-preparing reason, whether it's safe
 * in primary nav). When new fields are needed, add them here once.
 */

export type FeatureAvailability = "active" | "preparing" | "hidden";

export type FeatureKey =
  // Active surfaces backing the first working beta.
  | "overview"
  | "marketplace_hub"
  | "market_map"
  | "profile_text_first"
  | "journal_text_first"
  | "communication"
  | "account_roles"
  // Adjacent capabilities — visible but honestly preparing.
  | "role_expansion"
  | "external_confirmation"
  | "company_workspace"
  | "agency_workspace"
  | "customer_workspace"
  | "document_records"
  | "team_offers"
  | "work_needs"
  | "service_offers"
  // Explicitly hidden so the honesty guard has a canonical home.
  | "matching"
  | "marketplace";

export type FeatureConfig = {
  key: FeatureKey;
  availability: FeatureAvailability;
  /** i18n key for the localized feature label (look up under `features.*`). */
  labelKey: string;
  /** i18n key for a one-line description. */
  descriptionKey: string;
  /** Locale-prefixed app route. Omit when there is no destination yet. */
  primaryRoute?: string;
  /** i18n key explaining *why* a feature is preparing. UI surfaces can
   *  show this as a chip / tooltip. */
  preparingReasonKey?: string;
  /** Whether the feature is safe to show as a top-level nav item today.
   *  Preparing features may still appear inside the dashboard as cards,
   *  but they MUST NOT live in the primary nav. */
  safeToShowInPrimaryNav: boolean;
};

/**
 * The canonical feature catalogue. Order matters — UI surfaces may render
 * features in this order when listing them as cards.
 */
export const FEATURES: readonly FeatureConfig[] = [
  // ── Active first-beta surfaces ─────────────────────────────────────
  // The dashboard home itself is a "feature" so primary nav can be
  // derived from this catalogue without a separate source of truth.
  {
    key: "overview",
    availability: "active",
    labelKey: "features.overview.label",
    descriptionKey: "features.overview.description",
    primaryRoute: "/dashboard",
    safeToShowInPrimaryNav: true,
  },
  {
    // Marketplace hub — SECONDARY, no longer a nav tab (map-first correction).
    // The map is the primary product surface; /dashboard/marketplace now
    // redirects to /dashboard/market-map. The route/feature stays active so the
    // redirect is valid and the concept can be renamed/re-homed later. The full
    // two-sided matching marketplace stays the separate `marketplace` key below,
    // which remains `hidden` (honesty guard home).
    key: "marketplace_hub",
    availability: "active",
    labelKey: "features.marketplace_hub.label",
    descriptionKey: "features.marketplace_hub.description",
    primaryRoute: "/dashboard/marketplace",
    safeToShowInPrimaryNav: false,
  },
  {
    // Market map — its OWN primary product surface (map-first correction). This
    // is the central visual market layer (Google-Maps-like): the user opens it
    // and sees the market visually. Real signals only — no fake markers; future
    // layers (companies, teams, opportunities, services, rentals, shops,
    // availability, trust) are shown as disabled/preparing legend filters, not
    // fake data. It is the "Žemėlapis" global nav tab.
    key: "market_map",
    availability: "active",
    labelKey: "features.market_map.label",
    descriptionKey: "features.market_map.description",
    primaryRoute: "/dashboard/market-map",
    safeToShowInPrimaryNav: true,
  },
  {
    // Profile (person/account identity). Active and reachable, but demoted out
    // of the global nav (IA cleanup v2) — it lives under the person identity,
    // reachable from Mano erdvė and the account menu, not as a global tab.
    key: "profile_text_first",
    availability: "active",
    labelKey: "features.profile_text_first.label",
    descriptionKey: "features.profile_text_first.description",
    primaryRoute: "/dashboard/profile",
    safeToShowInPrimaryNav: false,
  },
  {
    // Darbo žurnalas (work/skill recording). PRIMARY action surface
    // (action-first IA v1): recording work is one of the few core things a
    // user comes to do, and it feeds the profile / CV / player-card. So it is
    // a global nav tab ("Darbo žurnalas"). Profile / CV / player-card stay
    // reachable under Mano erdvė as the RESULT of journaling, not competing
    // primary tabs.
    key: "journal_text_first",
    availability: "active",
    labelKey: "features.journal_text_first.label",
    descriptionKey: "features.journal_text_first.description",
    primaryRoute: "/dashboard/journal",
    safeToShowInPrimaryNav: true,
  },
  {
    // Inbox / messages. Active and primary-nav-safe: it is the recipient's
    // ONLY entry point for a request another user starts with them. Without a
    // permanent nav item a worker had no way to notice an incoming request
    // even though the conversation row really exists and RLS lets them read it.
    key: "communication",
    availability: "active",
    labelKey: "features.communication.label",
    descriptionKey: "features.communication.description",
    primaryRoute: "/dashboard/communication",
    safeToShowInPrimaryNav: true,
  },
  {
    // Account / settings. Active and reachable, but NOT a primary action tab
    // (action-first IA v1): settings is a utility, not something a user comes
    // to "do" — it lives in the avatar / account menu, not the global nav.
    key: "account_roles",
    availability: "active",
    labelKey: "features.account_roles.label",
    descriptionKey: "features.account_roles.description",
    primaryRoute: "/dashboard/account",
    safeToShowInPrimaryNav: false,
  },

  // ── Preparing surfaces (visible as cards, no broken CTA) ───────────
  {
    key: "role_expansion",
    availability: "preparing",
    labelKey: "features.role_expansion.label",
    descriptionKey: "features.role_expansion.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "external_confirmation",
    availability: "preparing",
    labelKey: "features.external_confirmation.label",
    descriptionKey: "features.external_confirmation.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "company_workspace",
    availability: "preparing",
    labelKey: "features.company_workspace.label",
    descriptionKey: "features.company_workspace.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "agency_workspace",
    availability: "preparing",
    labelKey: "features.agency_workspace.label",
    descriptionKey: "features.agency_workspace.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "customer_workspace",
    availability: "preparing",
    labelKey: "features.customer_workspace.label",
    descriptionKey: "features.customer_workspace.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "document_records",
    availability: "preparing",
    labelKey: "features.document_records.label",
    descriptionKey: "features.document_records.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "team_offers",
    availability: "preparing",
    labelKey: "features.team_offers.label",
    descriptionKey: "features.team_offers.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "work_needs",
    availability: "preparing",
    labelKey: "features.work_needs.label",
    descriptionKey: "features.work_needs.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "service_offers",
    availability: "preparing",
    labelKey: "features.service_offers.label",
    descriptionKey: "features.service_offers.description",
    preparingReasonKey: "features.preparing_generic_reason",
    safeToShowInPrimaryNav: false,
  },

  // ── Hidden: explicitly out of scope (no UI, no CTAs) ───────────────
  // These rows exist so the honesty guard has a canonical home. Flipping
  // them to "active" without shipping real behaviour fails the guard.
  {
    key: "matching",
    availability: "hidden",
    labelKey: "features.matching.label",
    descriptionKey: "features.matching.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "marketplace",
    availability: "hidden",
    labelKey: "features.marketplace.label",
    descriptionKey: "features.marketplace.description",
    safeToShowInPrimaryNav: false,
  },
] as const;

const FEATURE_BY_KEY: Record<FeatureKey, FeatureConfig> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f]),
) as Record<FeatureKey, FeatureConfig>;

export function getFeatureConfig(key: FeatureKey): FeatureConfig {
  return FEATURE_BY_KEY[key];
}

export function isFeatureActive(key: FeatureKey): boolean {
  return FEATURE_BY_KEY[key]?.availability === "active";
}

export function isFeaturePreparing(key: FeatureKey): boolean {
  return FEATURE_BY_KEY[key]?.availability === "preparing";
}

/** Features safe to surface as a top-level nav item (= active AND tagged
 *  `safeToShowInPrimaryNav`). Used by the nav config to derive a tab list
 *  without duplicating the source of truth. */
export function getVisiblePrimaryFeatures(): readonly FeatureConfig[] {
  return FEATURES.filter(
    (f) => f.availability === "active" && f.safeToShowInPrimaryNav,
  );
}

/** All non-hidden features (active + preparing) in catalogue order. */
export function getVisibleFeatures(): readonly FeatureConfig[] {
  return FEATURES.filter((f) => f.availability !== "hidden");
}
