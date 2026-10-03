/**
 * DISCOVER registry - the ONE descriptor list behind the Discover destination
 * (/dashboard/market).
 *
 * Owner decision (2026-10-02): the marketplace is NOT only recruitment. It is
 * the broader DISCOVER world where people and businesses OFFER or SEEK work,
 * services, work resources and opportunities. Discover is a ROLE-AWARE
 * DESTINATION that LINKS to the real sections - it owns no data, no table and
 * no write path (doctrine: reuse, never duplicate).
 *
 * Truth rules (guard: lib/guards/discover-ia.test.ts):
 *  - every entry points at a REAL page that exists today;
 *  - a branch that is not production-real is NOT listed (recognition/RPL,
 *    paid marketplace, consumer classifieds, work-offer listings do not exist
 *    and therefore have no card);
 *  - `status: "early"` marks branches whose code is complete but which have
 *    little or no production use yet; the UI says so (honest, not hidden);
 *  - roles mirror the destination page's own gate (role-gated-routes.ts), so a
 *    card never leads a person to a refusal. Pure data, no IO.
 */

export type DiscoverRole = "worker" | "company" | "agency" | "customer";

const ALL: readonly DiscoverRole[] = ["worker", "company", "agency", "customer"];
const ORG: readonly DiscoverRole[] = ["company", "agency"];

export type DiscoverGroupId =
  | "around"
  | "work"
  | "people"
  | "offers"
  | "grow";

/** seek = the viewer looks for something; offer = the viewer offers something. */
export type DiscoverSide = "seek" | "offer" | "both";

export type DiscoverIconKey =
  | "map"
  | "sparkles"
  | "briefcase"
  | "globe"
  | "gauge"
  | "search"
  | "clipboard"
  | "users"
  | "network"
  | "store"
  | "handshake"
  | "resources"
  | "graduation"
  | "book"
  | "building";

export type DiscoverEntry = {
  readonly id: string;
  /** Locale-prefix-free app route (must exist; guard-pinned). */
  readonly href: string;
  readonly group: DiscoverGroupId;
  readonly side: DiscoverSide;
  /** Roles that can actually use the destination. */
  readonly roles: readonly DiscoverRole[];
  readonly icon: DiscoverIconKey;
  /** `live` = in real use; `early` = complete in code, little production use. */
  readonly status: "live" | "early";
  /** Needs a declared organisation capability (resolved server-side). */
  readonly requires?: "training_provider";
};

export const DISCOVER_GROUPS: readonly DiscoverGroupId[] = [
  "around",
  "work",
  "people",
  "offers",
  "grow",
];

export const DISCOVER_ENTRIES: readonly DiscoverEntry[] = [
  // ── Around you: the spatial lens + the plain-words recogniser ────────
  { id: "map", href: "/dashboard/market-map", group: "around", side: "both", roles: ALL, icon: "map", status: "live" },
  { id: "recognize", href: "/dashboard/market/recognize", group: "around", side: "both", roles: ALL, icon: "sparkles", status: "live" },

  // ── Work ─────────────────────────────────────────────────────────────
  { id: "opportunities", href: "/dashboard/opportunities", group: "work", side: "seek", roles: ["worker"], icon: "briefcase", status: "live" },
  { id: "jobs", href: "/jobs", group: "work", side: "seek", roles: ALL, icon: "globe", status: "live" },
  { id: "intelligence", href: "/dashboard/intelligence", group: "work", side: "seek", roles: ["worker", "company", "agency"], icon: "gauge", status: "live" },

  // ── People & companies ───────────────────────────────────────────────
  { id: "scouting", href: "/dashboard/company/scouting", group: "people", side: "seek", roles: ORG, icon: "search", status: "live" },
  { id: "needs", href: "/dashboard/company/needs", group: "people", side: "seek", roles: ORG, icon: "clipboard", status: "live" },
  { id: "candidates", href: "/dashboard/candidates", group: "people", side: "seek", roles: ORG, icon: "users", status: "live" },
  { id: "buyer", href: "/dashboard/buyer", group: "people", side: "seek", roles: ["customer"], icon: "clipboard", status: "early" },
  { id: "network", href: "/dashboard/network", group: "people", side: "both", roles: ALL, icon: "network", status: "live" },

  // ── Services & work resources ────────────────────────────────────────
  { id: "services", href: "/dashboard/services", group: "offers", side: "offer", roles: ALL, icon: "store", status: "early" },
  { id: "service_requests", href: "/dashboard/service-requests", group: "offers", side: "seek", roles: ALL, icon: "handshake", status: "early" },
  { id: "listings", href: "/dashboard/listings", group: "offers", side: "both", roles: ALL, icon: "resources", status: "early" },

  // ── Grow: only for a training organisation. Personal learning stays
  //    CONTEXTUAL on purpose (EDU-5: the review queue is reached through the
  //    brief chip while there is something to review) - route-truth-map. ─────
  { id: "education", href: "/dashboard/company/education", group: "grow", side: "offer", roles: ORG, icon: "graduation", status: "live", requires: "training_provider" },
];

export type DiscoverViewer = {
  readonly roles: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<string>;
};

/** Pure, role-aware selection: only what THIS viewer can use. */
export function discoverEntriesFor(viewer: DiscoverViewer): readonly DiscoverEntry[] {
  return DISCOVER_ENTRIES.filter(
    (e) =>
      e.roles.some((r) => viewer.roles.has(r)) &&
      (!e.requires || viewer.capabilities.has(e.requires)),
  );
}

/** Group the selection in the canonical group order; empty groups are dropped. */
export function groupDiscoverEntries(
  entries: readonly DiscoverEntry[],
): readonly { group: DiscoverGroupId; entries: readonly DiscoverEntry[] }[] {
  return DISCOVER_GROUPS.flatMap((group) => {
    const inGroup = entries.filter((e) => e.group === group);
    return inGroup.length > 0 ? [{ group, entries: inGroup }] : [];
  });
}
