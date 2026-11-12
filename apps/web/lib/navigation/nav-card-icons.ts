/**
 * WHICH ICON A NAVIGATION CARD CARRIES — ids only, a LEAF module (no imports).
 * `components/navigation/nav-card-icon.tsx` maps each id to its lucide icon.
 *
 * Every function has its own icon and every catalogue profession has a
 * DISTINCT one (owner review 2026-11-12: never one identical icon across a
 * rail). `lib/guards/goal-navigation.test.ts` fails when a profession has no
 * icon or two share one. A card also has an image slot of the same size, so a
 * licensed photograph can replace the tile later with no layout change.
 */

export const FUNCTION_ICONS = {
  jobs: "search",
  workOpportunities: "compass",
  createCv: "idCard",
  workAbroad: "globe",
  forWorkers: "info",
  companyNeed: "clipboardList",
  forCompanies: "info",
  labourMarket: "barChart",
  myServices: "wrench",
  serviceRequests: "inbox",
  marketListings: "store",
  commercial: "fileSignature",
  network: "users",
  partnerWithUs: "handshake",
  forAgencies: "info",
  setUpAgency: "building",
} as const satisfies Record<string, string>;

export const PROFESSION_ICONS = {
  auto_mechanic: "car",
  baker: "croissant",
  barber: "scissors",
  barista: "coffee",
  builder: "hardHat",
  call_centre_agent: "headset",
  caregiver: "heartHandshake",
  carpenter: "hammer",
  cleaner: "sprayCan",
  concrete_worker: "blocks",
  cook: "chefHat",
  crane_operator: "construction",
  customer_service_specialist: "messagesSquare",
  driver: "truck",
  drywaller: "layoutPanelTop",
  electrician: "zap",
  event_organizer: "calendarCheck",
  farm_worker: "wheat",
  foreman: "clipboardCheck",
  furniture_assembler: "armchair",
  gardener: "flower",
  general_laborer: "shovel",
  hairdresser: "sparkles",
  handyman: "wrench",
  heavy_equipment_operator: "tractor",
  kitchen_helper: "utensils",
  laundry_worker: "washingMachine",
  mason: "brickWall",
  merchandiser: "package",
  nail_technician: "hand",
  office_administrator: "fileText",
  painter: "paintRoller",
  plumber: "showerHead",
  production_worker: "factory",
  rebar_worker: "grid",
  receptionist: "conciergeBell",
  recruiter: "userSearch",
  roofer: "home",
  safety_specialist: "shieldCheck",
  sales_assistant: "shoppingBag",
  site_engineer: "ruler",
  site_manager: "building",
  software_developer: "code",
  teacher: "graduationCap",
  tiler: "layoutGrid",
  translator: "languages",
  waiter: "handPlatter",
  warehouse_worker: "warehouse",
  welder: "flame",
} as const satisfies Record<string, string>;

export const GOAL_ICONS = {
  work: "briefcase",
  workers: "userSearch",
  services: "wrench",
  orders: "fileSignature",
  partners: "handshake",
  agencies: "building",
} as const satisfies Record<string, string>;

/** Signed-in areas the pinned row and the role home draw (Lane A2). */
export const AREA_ICONS = {
  journal: "notebook",
  hours: "clock",
  projects: "folder",
} as const satisfies Record<string, string>;

export type NavCardIconKey =
  | (typeof AREA_ICONS)[keyof typeof AREA_ICONS]
  | (typeof FUNCTION_ICONS)[keyof typeof FUNCTION_ICONS]
  | (typeof PROFESSION_ICONS)[keyof typeof PROFESSION_ICONS]
  | (typeof GOAL_ICONS)[keyof typeof GOAL_ICONS];
