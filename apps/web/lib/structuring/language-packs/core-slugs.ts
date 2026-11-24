/**
 * The core cross-language recognition slug set (owner mandate 2026-07-04).
 *
 * Every offline language pack MUST carry non-empty exact needles for every
 * slug below (guard: lib/guards/offline-language-pack.test.ts). The list is
 * the owner's minimum coverage across all Wave-1 + Wave-2 labour-market
 * families — office/admin, warehouse/logistics, hospitality/food,
 * retail/customer service, cleaning/facility, repair/maintenance,
 * beauty, HR, IT, agriculture, care, construction, manufacturing, events,
 * education.
 *
 * Slugs here MUST be a subset of the seeded catalogue (SKILL_HINTS_LT) —
 * enforced by the same guard. Growing this list tightens every pack at once.
 */
export const CORE_PACK_SLUGS: readonly string[] = [
  // office & administration
  "data-entry",
  "office-software",
  "document-handling",
  "bookkeeping",
  "reception",
  "administration",
  // warehouse & logistics
  "warehouse-operations",
  "order-picking",
  "barcode-scanning",
  "pallet-handling",
  "stock-taking",
  "driving",
  "delivery-driving",
  "cargo-transport",
  "forklift-operation",
  // hospitality & food
  "cooking",
  "kitchen-help",
  "dishwashing",
  "baking",
  "barista-work",
  "waiting-tables",
  // retail & customer service
  "cashier",
  "customer-service",
  "call-centre",
  "merchandising",
  "sales-assistant",
  // cleaning & facility
  "cleaning-services",
  "laundry",
  "window-cleaning",
  "housekeeping",
  // repair & maintenance
  "auto-repair",
  "appliance-repair",
  "handyman-work",
  // beauty & personal services
  "hairdressing",
  "barbering",
  "nail-care",
  // HR & recruitment
  "recruitment",
  "personnel-admin",
  // IT
  "programming",
  "it-support",
  // agriculture & gardening
  "gardening",
  "farm-work",
  // care & assistance (no regulated medical claims — doctrine/owner gate)
  "childcare",
  "elderly-care",
  // construction (existing depth kept; these are the cross-language basics)
  "bricklaying",
  "painting",
  "tiling",
  "plastering",
  "flooring",
  "welding-blueprint",
  "roofing",
  "electrical-install",
  "plumbing",
  "carpentry",
  "demolition",
  "furniture-fitting",
  // manufacturing & assembly
  "assembly-work",
  "production-line",
  "packaging",
  // events
  "event-setup",
  // education & languages
  "teaching",
  "translation",
] as const;
