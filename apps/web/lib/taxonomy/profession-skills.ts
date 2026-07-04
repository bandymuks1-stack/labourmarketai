/**
 * Static profession → canonical-skill map (Matching PR4, 2026-07-04).
 *
 * EXACT mirror of the `profession_skills` seed migrations (232 links / 49
 * professions — the same rows live in prod). Matching needs the expansion
 * OFFLINE and synchronously (owner mandate: no remote calls at runtime), and
 * a static mirror also lets guards run without a DB.
 *
 * DRIFT-PROOF: `lib/guards/matching-canonical.test.ts` re-derives the links
 * from `supabase/migrations/*.sql` (the same parser as the installation-chain
 * guard) and fails if this file diverges by one link. Never edit this map by
 * hand without the corresponding seed migration — the guard will catch it.
 */

export const PROFESSION_SKILLS: Readonly<Record<string, readonly string[]>> = {
  builder: ["blueprint-reading", "bricklaying", "concrete-works", "demolition", "formwork", "general-labour", "hand-tools", "scaffolding"],
  carpenter: ["blueprint-reading", "carpentry", "door-window-install", "flooring", "formwork-carpentry", "furniture-fitting", "joinery", "timber-framing"],
  concrete_worker: ["concrete-finishing", "concrete-pouring", "concrete-vibration", "concrete-works", "floor-screeding", "formwork", "precast-install", "waterproofing"],
  crane_operator: ["crane-operator", "load-signaling", "mobile-crane", "precast-install", "rigging", "safety-officer", "tower-crane"],
  drywaller: ["blueprint-reading", "ceiling-systems", "drywall", "insulation", "partition-walls", "plastering", "skim-coating"],
  electrician: ["cable-pulling", "electrical-install", "electrical-testing", "industrial-electric", "lighting-install", "low-voltage", "panel-install"],
  foreman: ["blueprint-reading", "materials-management", "quality-control", "safety-officer", "site-supervision", "team-coordination", "work-scheduling"],
  general_laborer: ["demolition", "general-labour", "hand-tools", "manual-handling", "material-transport", "scaffolding", "site-cleaning"],
  heavy_equipment_operator: ["bulldozer-operator", "compactor-operator", "earthworks", "excavator-operator", "forklift-operator", "grader-operator", "loader-operator"],
  mason: ["blockwork", "bricklaying", "concrete-works", "mortar-prep", "plastering", "stone-masonry"],
  painter: ["decorative-plaster", "facade-plaster", "painting", "plastering", "skim-coating", "spray-painting", "wallpapering"],
  plumber: ["drainage", "heating-install", "hvac-install", "pipefitting", "plumbing", "sanitary-install", "ventilation"],
  rebar_worker: ["blueprint-reading", "concrete-works", "formwork", "rebar-cutting", "rebar-detailing", "steel-fixing"],
  roofer: ["flat-roofing", "gutter-install", "insulation", "roof-insulation", "roof-tiling", "roofing", "waterproofing"],
  site_engineer: ["blueprint-reading", "quality-control", "quantity-takeoff", "setting-out", "surveying", "work-scheduling"],
  site_manager: ["blueprint-reading", "materials-management", "quality-control", "safety-officer", "site-management", "site-supervision", "team-coordination", "work-scheduling"],
  tiler: ["floor-screeding", "flooring", "grouting", "large-format-tiling", "mosaic-tiling", "tiling", "waterproofing-tiles"],
  welder: ["arc-welding", "gas-cutting", "mig-mag-welding", "structural-steel", "tig-welding", "welding-blueprint"],
  driver: ["cargo-transport", "delivery-driving", "driving", "forklift-operation"],
  warehouse_worker: ["barcode-scanning", "forklift-operation", "order-picking", "packaging", "pallet-handling", "stock-taking", "warehouse-operations"],
  production_worker: ["assembly-work", "equipment-operation", "packaging", "production-line"],
  furniture_assembler: ["assembly-work", "furniture-fitting", "hand-tools"],
  cleaner: ["cleaning-services", "housekeeping", "laundry", "window-cleaning", "winter-service"],
  office_administrator: ["administration", "bookkeeping", "customer-service", "data-entry", "document-handling", "office-software", "reception"],
  software_developer: ["it-support", "programming", "qa-testing", "web-design"],
  customer_service_specialist: ["call-centre", "cashier", "customer-service", "sales-assistant"],
  cook: ["cooking", "waiting-tables"],
  waiter: ["bartending", "cashier", "customer-service", "waiting-tables"],
  gardener: ["farm-work", "gardening", "winter-service"],
  farm_worker: ["animal-care", "equipment-operation", "farm-work", "gardening"],
  caregiver: ["childcare", "elderly-care", "first-aid"],
  teacher: ["first-aid", "teaching"],
  translator: ["document-handling", "teaching", "translation"],
  event_organizer: ["customer-service", "event-setup", "team-coordination"],
  sales_assistant: ["cashier", "customer-service", "sales-assistant"],
  safety_specialist: ["first-aid", "quality-control", "safety-officer"],
  receptionist: ["call-centre", "customer-service", "document-handling", "reception"],
  kitchen_helper: ["cleaning-services", "dishwashing", "kitchen-help"],
  barista: ["barista-work", "cashier", "customer-service"],
  baker: ["baking", "cooking", "kitchen-help"],
  call_centre_agent: ["call-centre", "customer-service"],
  merchandiser: ["merchandising", "order-picking", "stock-taking"],
  auto_mechanic: ["auto-repair", "equipment-operation", "hand-tools"],
  handyman: ["appliance-repair", "hand-tools", "handyman-work", "painting"],
  hairdresser: ["customer-service", "hairdressing"],
  barber: ["barbering", "customer-service", "hairdressing"],
  nail_technician: ["customer-service", "nail-care"],
  recruiter: ["document-handling", "personnel-admin", "recruitment"],
  laundry_worker: ["cleaning-services", "housekeeping", "laundry"],
};

/** Skills a profession implies (empty for unknown professions — honest). */
export function skillsForProfession(professionSlug: string | null | undefined): readonly string[] {
  if (!professionSlug) return [];
  return PROFESSION_SKILLS[professionSlug] ?? [];
}

/** Professions that carry a given skill (reverse index, built once). */
const PROFESSIONS_BY_SKILL: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [prof, skills] of Object.entries(PROFESSION_SKILLS)) {
    for (const s of skills) {
      const arr = m.get(s) ?? [];
      arr.push(prof);
      m.set(s, arr);
    }
  }
  return m;
})();

export function professionsForSkill(skillSlug: string): readonly string[] {
  return PROFESSIONS_BY_SKILL.get(skillSlug) ?? [];
}

/** Shared-skill relatedness between two professions (Jaccard on link sets).
 *  Deterministic, [0,1]; 0 when either profession is unknown. */
export function professionRelatedness(a: string | null | undefined, b: string | null | undefined): number {
  const sa = new Set(skillsForProfession(a));
  const sb = new Set(skillsForProfession(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared += 1;
  const union = sa.size + sb.size - shared;
  return union === 0 ? 0 : shared / union;
}
