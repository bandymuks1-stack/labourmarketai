/**
 * Value-channel registry (V10) — typed, PURE data.
 *
 * The declarative counterpart of vacancy-provider-registry for the OTHER
 * direction: where can a stated piece of value (work capacity, workforce
 * demand, work-bounded goods, services) actually be realized on the platform
 * TODAY. Every entry names a REAL destination that exists in production —
 * `marketplace_listings` / `service_offerings` are live tables (verified
 * 2026-08-13), the demand board is the canonical conversation flow, and the
 * one external entry is the already-governed Swedish job-supply source.
 *
 * ── GOVERNANCE NOTE (registry construction rule) ───────────────────────────
 * NO external goods/buyer channel is registered as active, and none may be
 * added here directly: an EXTERNAL channel enters this registry ONLY through
 * the same terms-reviewed governance the vacancy sources use (legal status
 * confirmed + owner activation) — `permissionStatus: "source_gated"` is the
 * structural default for anything external. Internal channels are approved
 * by nature: they are the platform's own surfaces.
 *
 * Marketplace categories stay WORK-BOUNDED this slice (the shared
 * LISTING_CATEGORIES vocabulary — no widening here; widening is an owner
 * follow-up decision).
 */
import {
  LISTING_CATEGORIES,
  LISTING_KINDS,
  type ListingCategory,
  type ListingKind,
} from "@/lib/marketplace/listings-model";

export type ChannelType = "internal" | "external";
export type ChannelPermissionStatus = "approved" | "source_gated";
export type ChannelActionType =
  | "browse"
  | "create_demand"
  | "create_listing"
  | "create_offering";

/** What a channel can realize — the value-statement subjects plus the
 *  equipment-capacity (rental) reading of goods. */
export type ChannelValueType =
  | "work_capacity"
  | "workforce"
  | "goods"
  | "equipment_capacity"
  | "service";

export interface ValueChannelDescriptorV1 {
  readonly channelId: string;
  readonly channelType: ChannelType;
  readonly valueTypesSupported: readonly ChannelValueType[];
  /** ISO-2 markets the channel serves, or "any" (internal surfaces). */
  readonly geography: readonly string[] | "any";
  readonly actionType: readonly ChannelActionType[];
  /** A real route, or the id of an existing conversation flow. */
  readonly destination: string;
  readonly permissionStatus: ChannelPermissionStatus;
  /** "internal" = the platform's own surface; external = the governance
   *  row's reviewed terms state. */
  readonly termsStatus: "internal" | "confirmed";
  readonly attributionRequirement: string | null;
  /** The minimal facts the channel needs before its action is real. */
  readonly dataRequired: readonly string[];
  /** How current the channel's content is, honestly. */
  readonly freshness: "live" | "imported_periodically";
  readonly provenanceNote: string;
  /** Marketplace-only: the shared work-bounded vocabulary, not a copy. */
  readonly workBoundedCategories?: readonly ListingCategory[];
  readonly listingKinds?: readonly ListingKind[];
}

export const VALUE_CHANNELS: readonly ValueChannelDescriptorV1[] = [
  {
    channelId: "internal_demand_board",
    channelType: "internal",
    valueTypesSupported: ["work_capacity", "workforce"],
    geography: "any",
    actionType: ["browse", "create_demand"],
    // The existing conversation flows — find-work browse + the canonical
    // demand intake form. Not a route: the chat IS the surface.
    destination: "conversation:find-work|company.create-demand",
    permissionStatus: "approved",
    termsStatus: "internal",
    attributionRequirement: null,
    dataRequired: [],
    freshness: "live",
    provenanceNote:
      "The platform's own demand/supply board: customer_requests intake + the opportunities read.",
  },
  {
    channelId: "internal_marketplace_listings",
    channelType: "internal",
    valueTypesSupported: ["goods", "equipment_capacity"],
    geography: "any",
    actionType: ["browse", "create_listing"],
    destination: "/dashboard/listings",
    permissionStatus: "approved",
    termsStatus: "internal",
    attributionRequirement: null,
    // A listing needs to say WHAT the thing is; everything else is form fields.
    dataRequired: ["subjectLabel"],
    freshness: "live",
    provenanceNote:
      "marketplace_listings (live in production) — WORK-BOUNDED resources only; sale/rental/wanted; no payments, no merchant role.",
    workBoundedCategories: LISTING_CATEGORIES,
    listingKinds: LISTING_KINDS,
  },
  {
    channelId: "internal_service_offerings",
    channelType: "internal",
    valueTypesSupported: ["service"],
    geography: "any",
    actionType: ["browse", "create_offering"],
    destination: "/dashboard/services",
    permissionStatus: "approved",
    termsStatus: "internal",
    attributionRequirement: null,
    dataRequired: [],
    freshness: "live",
    provenanceNote:
      "service_offerings (live in production) — the canonical professional-services half of the marketplace.",
  },
  {
    // Registry completeness only — behaviour unchanged: this is the ALREADY
    // GOVERNED external job-supply source the find-work browse includes.
    channelId: "external_job_supply_arbetsformedlingen",
    channelType: "external",
    valueTypesSupported: ["work_capacity"],
    geography: ["SE"],
    actionType: ["browse"],
    destination: "conversation:find-work",
    permissionStatus: "approved",
    termsStatus: "confirmed",
    attributionRequirement: "vacancySources.attribution.arbetsformedlingen",
    dataRequired: [],
    freshness: "imported_periodically",
    provenanceNote:
      "Arbetsförmedlingen public job ads (CC0, attribution shown, terms confirmed 2026-08-04, owner-activated 2026-08-09) — browsed through the existing opportunities surface.",
  },
] as const;

export function getValueChannel(
  channelId: string,
): ValueChannelDescriptorV1 | undefined {
  return VALUE_CHANNELS.find((c) => c.channelId === channelId);
}
