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

/**
 * WHY A STATUS IS WHAT IT IS (owner P0 2026-11-10: MERGED ≠ DEPLOYED ≠ WORKS).
 * An `active` row names its production proof: the FUNCTION_REGISTER row
 * (docs/program/FUNCTION_REGISTER.md) and a `proof` text that appears IN that
 * row — for a feature, one production walk run id per claim (CatalogClaim).
 * `lib/guards/catalog-status-evidence.test.ts` reads the register and fails
 * when a row is missing, not verified, or no longer carries the proof, so a
 * status cannot go stale silently again. A `preparing` / `hidden` row
 * carries a concrete `reason` instead (internal, English).
 */
export type CatalogEvidence = { readonly register: string; readonly proof: string };

/**
 * One thing an active feature's description SAYS it does (owner P0
 * 2026-11-11). The description shown to users is exactly the feature's claim
 * sentences (`features.<key>.claims.<id>`) joined, in every active locale, so
 * it cannot mention a capability that has no claim — and every claim names
 * the register row and the production walk run id that proved it. A claim on
 * a row that is not verified yet must be `partial` and its sentence must
 * carry `features.notCheckedYet`. Pinned by catalog-status-evidence.test.ts.
 */
export type CatalogClaim = CatalogEvidence & { readonly id: string; readonly partial?: true };

export type FeatureKey =
  // Active surfaces backing the first working beta.
  | "overview"
  | "marketplace_hub"
  | "market_map"
  | "profile_text_first"
  | "journal_text_first"
  | "communication"
  | "planning"
  | "network"
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
  | "rule_matching"
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
  /** What an `active` row's description claims, each with its production
   *  proof (see CatalogClaim). */
  claims?: readonly CatalogClaim[];
  /** Concrete reason a row is `preparing` / `hidden` (internal). */
  reason?: string;
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
    claims: [
      { id: "home_per_role", register: "1.5", proof: "41280157502" },
    ],
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
    claims: [
      { id: "map", register: "10.27", proof: "41283989921" },
    ],
    labelKey: "features.marketplace_hub.label",
    descriptionKey: "features.marketplace_hub.description",
    // Rebuild W5: point at the REAL surface — /dashboard/marketplace is a
    // REDIRECT_STUB to the market map; a catalogue route must never hop
    // through a stub.
    primaryRoute: "/dashboard/market-map",
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
    claims: [
      { id: "map", register: "10.27", proof: "41283989921" },
    ],
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
    claims: [
      { id: "profile", register: "2.1", proof: "41282258795" },
    ],
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
    claims: [
      { id: "entry_to_cv", register: "2.19", proof: "41279196446" },
    ],
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
    claims: [
      { id: "threads", register: "5.4", proof: "41717112150" },
    ],
    labelKey: "features.communication.label",
    descriptionKey: "features.communication.description",
    primaryRoute: "/dashboard/communication",
    safeToShowInPrimaryNav: true,
  },
  {
    // Kalendorius / planavimas (F14, production UX repair v2). The canonical
    // calendar at /dashboard/planning existed but was reachable ONLY by
    // typing the URL / command palette — a hidden core module. It is a
    // primary product surface: one calendar over bookings / projects /
    // tasks / journal, so it gets a real nav tab. No second calendar.
    key: "planning",
    availability: "active",
    claims: [
      { id: "company_calendar", register: "3.14", proof: "39571666417" },
      { id: "own_calendar", register: "5.11", proof: "40007491242" },
    ],
    labelKey: "features.planning.label",
    descriptionKey: "features.planning.description",
    primaryRoute: "/dashboard/planning",
    safeToShowInPrimaryNav: true,
  },
  {
    // Tinklas / kontaktai (F15, production UX repair v2). The canonical
    // network surface at /dashboard/network (people/company search, invite,
    // pending invitations, relationships) was reachable only by URL. It is
    // where relationships start, so it gets a real nav tab. No second
    // dashboard — this is the existing surface, only made findable.
    key: "network",
    availability: "active",
    claims: [
      { id: "invitations", register: "1.9", proof: "41430482903" },
    ],
    labelKey: "features.network.label",
    descriptionKey: "features.network.description",
    primaryRoute: "/dashboard/network",
    safeToShowInPrimaryNav: true,
  },
  {
    // Account / settings. Active and reachable, but NOT a primary action tab
    // (action-first IA v1): settings is a utility, not something a user comes
    // to "do" — it lives in the avatar / account menu, not the global nav.
    key: "account_roles",
    availability: "active",
    claims: [
      { id: "several_roles", register: "1.5", proof: "41280157502" },
    ],
    labelKey: "features.account_roles.label",
    descriptionKey: "features.account_roles.description",
    primaryRoute: "/dashboard/account",
    safeToShowInPrimaryNav: false,
  },

  {
    // Service offers — publish a service, be found in the one market index,
    // answer requests and continue in a conversation (MKT-1). Shipping and
    // proven on production by the marketplace walk; the row said "preparing"
    // long after the surface went live (registry row 6.1). Not a nav tab: it
    // is reached from the market (/dashboard/listings) and the spine signals.
    key: "service_offers",
    availability: "active",
    claims: [
      { id: "offer_and_requests", register: "6.1", proof: "41729310761" },
    ],
    labelKey: "features.service_offers.label",
    descriptionKey: "features.service_offers.description",
    primaryRoute: "/dashboard/services",
    safeToShowInPrimaryNav: false,
  },

  // ── Shipped 2026-10/11, proven by production walks (were "preparing") ──
  // Flipped 2026-11-10 (owner P0): /vision listed these as "coming soon"
  // although every one runs in production; the catalogue was never updated
  // after delivery.
  {
    key: "role_expansion",
    availability: "active",
    claims: [
      { id: "add_company", register: "E-1", proof: "41279196446" },
      { id: "add_buying", register: "J-13", proof: "41480104268" },
    ],
    labelKey: "features.role_expansion.label",
    descriptionKey: "features.role_expansion.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "external_confirmation",
    availability: "active",
    claims: [
      { id: "manager_confirms", register: "2.20", proof: "41478434884" },
    ],
    labelKey: "features.external_confirmation.label",
    descriptionKey: "features.external_confirmation.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "company_workspace",
    availability: "active",
    claims: [
      { id: "setup_and_need", register: "E-1", proof: "41279196446" },
      { id: "company_home", register: "3.1", proof: "39783147517" },
    ],
    labelKey: "features.company_workspace.label",
    descriptionKey: "features.company_workspace.description",
    safeToShowInPrimaryNav: false,
  },
  {
    // A-2 (agency documents readiness and client records) is still NOT VERIFIED:
    // no walk opens those two surfaces. The roster/client/need/offer chain (A-1) is.
    key: "agency_workspace",
    availability: "active",
    claims: [
      { id: "roster_clients_offers", register: "A-1", proof: "41787046374" },
    ],
    labelKey: "features.agency_workspace.label",
    descriptionKey: "features.agency_workspace.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "customer_workspace",
    availability: "active",
    claims: [
      { id: "record_and_requests", register: "C-1", proof: "41785749357" },
    ],
    labelKey: "features.customer_workspace.label",
    descriptionKey: "features.customer_workspace.description",
    safeToShowInPrimaryNav: false,
  },
  {
    // The agency-side document check (A-2) is still NOT VERIFIED; the organization
    // register and approvals (HR-2) and personal documents (2.18) are proven.
    key: "document_records",
    availability: "active",
    claims: [
      { id: "own_documents", register: "2.18", proof: "41716118134" },
      { id: "company_register", register: "HR-2", proof: "41786102850" },
    ],
    labelKey: "features.document_records.label",
    descriptionKey: "features.document_records.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "team_offers",
    availability: "active",
    claims: [
      { id: "team_as_unit", register: "4.6", proof: "41350506578" },
    ],
    labelKey: "features.team_offers.label",
    descriptionKey: "features.team_offers.description",
    safeToShowInPrimaryNav: false,
  },
  {
    key: "work_needs",
    availability: "active",
    claims: [
      { id: "one_form", register: "4.1", proof: "41279196446" },
      { id: "people_answer", register: "SC-5", proof: "41672031864" },
    ],
    labelKey: "features.work_needs.label",
    descriptionKey: "features.work_needs.description",
    safeToShowInPrimaryNav: false,
  },

  {
    // The candidate shortlist for a stated need (SC-5 / J-5). No AI involved.
    key: "rule_matching",
    availability: "active",
    claims: [
      { id: "shortlist_with_reason", register: "4.5", proof: "41279265278" },
    ],
    labelKey: "features.rule_matching.label",
    descriptionKey: "features.rule_matching.description",
    safeToShowInPrimaryNav: false,
  },

  // ── Preparing ──────────────────────────────────────────────────────
  {
    // AI (LLM) matching. Built, but switched off: no AI provider key is set and
    // paid AI is not allowed (0 EUR AI budget). Never shown as working AI.
    key: "matching",
    availability: "preparing",
    reason: "AI matching is switched off (no provider key, paid AI not allowed); the candidate shortlist (rule_matching) works.",
    labelKey: "features.matching.label",
    descriptionKey: "features.matching.description",
    preparingReasonKey: "features.matching_reason",
    safeToShowInPrimaryNav: false,
  },

  // ── Hidden: explicitly out of scope (no UI, no CTAs) ───────────────
  {
    key: "marketplace",
    availability: "hidden",
    reason: "The full two-sided automated marketplace is not built; the market index, service offers and needs are separate active rows.",
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
