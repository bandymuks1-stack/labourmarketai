/**
 * Skill taxonomy — functional GROUP axis (systemic-ux-skills-v1).
 *
 * The audit found that every skill was rendered in one flat list, mixing a
 * profession ("Santechnikos darbai"), a specific task skill ("Nuotekų sistemų
 * montavimas"), a general ability ("Vairavimas"), and a business/admin ability
 * ("Apskaitos sistemos") into one undifferentiated pile. The DB `skills.category`
 * only encodes construction sub-disciplines (`construction.plumbing`, …) — the
 * wrong axis.
 *
 * This module is the single source of truth for the OWNER's functional grouping:
 *   1. profession      — a work direction / trade ("Santechnikas", "Dailidė")
 *   2. specific        — a concrete work skill / task ("Nuotekų montavimas")
 *   3. general          — a transferable ability ("Vairavimas", "Oratorius")
 *   4. administrative  — business / coordination ability ("Apskaitos sistemos",
 *                        "Darbuotojų paieška", grafikų derinimas)
 *
 * The 5th owner group — "evidence-based" — is a STATUS, not a category. It is
 * orthogonal and already modelled by `lib/profile/skill-evidence-state.ts`
 * (self_declared / work_supported / manager_confirmed / verified). A skill in
 * any category 1–4 can additionally be evidence-backed; the two axes compose.
 *
 * Pure + deterministic; safe in client + server bundles. No DB change.
 */

export type SkillGroup = "profession" | "specific" | "general" | "administrative";

export const SKILL_GROUP_ORDER: readonly SkillGroup[] = [
  "profession",
  "specific",
  "general",
  "administrative",
];

/** Profession / work-direction slugs (mirror messages/{locale}/professions.json
 *  plus the work-direction aliases used by the recogniser). */
const PROFESSION_SLUGS = new Set<string>([
  "builder", "carpenter", "concrete_worker", "crane_operator", "drywaller",
  "electrician", "foreman", "general_laborer", "heavy_equipment_operator",
  "mason", "painter", "plumber", "rebar_worker", "roofer", "site_engineer",
  "site_manager", "tiler", "welder",
  // universal profession families (catalogue 20260704120000) — construction
  // is one family among many:
  "caregiver", "cleaner", "cook", "customer_service_specialist", "driver",
  "event_organizer", "farm_worker", "gardener", "office_administrator",
  "production_worker", "safety_specialist", "sales_assistant",
  "software_developer", "teacher", "translator", "waiter", "warehouse_worker",
]);

/** Coordination / business / paperwork abilities. */
const ADMINISTRATIVE_SLUGS = new Set<string>([
  "site-management", "site-supervision", "team-coordination", "quality-control",
  "safety-officer", "materials-management", "quantity-takeoff", "work-scheduling",
  "surveying", "setting-out",
  // cross-sector business abilities (may not exist in the construction
  // catalogue but appear via self-declared claims / future sectors):
  "recruiting", "accounting", "client-communication", "document-handling",
  "procurement", "logistics-planning",
  // universal catalogue (20260704120000):
  "administration", "bookkeeping",
]);

/** Transferable, non-trade-specific abilities. */
const GENERAL_SLUGS = new Set<string>([
  "manual-handling", "hand-tools", "general-labour", "material-transport",
  "load-signaling",
  // cross-sector general abilities:
  "driving", "public-speaking", "languages", "computer-literacy", "teamwork",
  "customer-service",
  // universal catalogue (20260704120000):
  "translation", "teaching", "first-aid",
]);

/**
 * Classify a skill slug into its functional group. Unknown slugs default to
 * "specific" (a concrete work skill) — the safest assumption for a catalogue
 * that is mostly trade tasks. Never throws.
 */
export function classifySkillSlug(slug: string): SkillGroup {
  if (PROFESSION_SLUGS.has(slug)) return "profession";
  if (ADMINISTRATIVE_SLUGS.has(slug)) return "administrative";
  if (GENERAL_SLUGS.has(slug)) return "general";
  return "specific";
}

/**
 * Group a list of slug-bearing items into the owner's functional buckets,
 * preserving input order within each bucket and emitting buckets in
 * SKILL_GROUP_ORDER. Empty buckets are omitted.
 */
export function groupSkillsByFunction<T extends { slug: string }>(
  items: readonly T[],
): { group: SkillGroup; items: T[] }[] {
  const byGroup = new Map<SkillGroup, T[]>();
  for (const item of items) {
    const g = classifySkillSlug(item.slug);
    const arr = byGroup.get(g) ?? [];
    arr.push(item);
    byGroup.set(g, arr);
  }
  return SKILL_GROUP_ORDER.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map(
    (g) => ({ group: g, items: byGroup.get(g)! }),
  );
}

/** i18n key (under `skillGroups`) for a group's heading. */
export function skillGroupLabelKey(group: SkillGroup): string {
  return `skillGroups.${group}`;
}
