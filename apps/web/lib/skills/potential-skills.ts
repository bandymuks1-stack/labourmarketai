/**
 * POTENTIAL capabilities — the Living CV constitution (owner decision
 * 2026-10-11, docs/DECISIONS/0023): evidenced work can point at a related
 * capability the person never named. Welding work is evidence of welding; it
 * is also a *signal* that the person may read technical drawings.
 *
 * Evidence state: POTENTIAL. Below self-declared, never stored in
 * worker_skills, never a confirmation, never a qualification. It is computed
 * at read time from skills the person's own journal already evidences, it
 * names the skills it comes from, and it disappears the moment the person
 * holds the skill in any state (declared, recorded, confirmed) — from then on
 * the existing ladder speaks for it.
 *
 * Cross-sector by construction (construction, warehousing, hospitality,
 * accounting, education, retail, electrical). Only catalogue slugs
 * (messages/en/skill-names.json); extend by adding pairs, never by a second
 * profession map (PROFESSION_SKILLS stays the one profession→skill truth).
 */

/** evidenced skill → capabilities its practice commonly involves. */
export const POTENTIAL_SKILLS: Readonly<Record<string, readonly string[]>> = {
  // welding & steel: working to drawings
  "welding-blueprint": ["blueprint-reading"],
  "mig-mag-welding": ["blueprint-reading"],
  "tig-welding": ["blueprint-reading"],
  "arc-welding": ["blueprint-reading"],
  "structural-steel": ["blueprint-reading", "rigging"],
  "steel-fixing": ["blueprint-reading"],
  "rebar-cutting": ["blueprint-reading"],
  formwork: ["blueprint-reading"],
  "formwork-carpentry": ["blueprint-reading"],
  // finishing trades
  tiling: ["grouting"],
  "large-format-tiling": ["grouting"],
  plastering: ["skim-coating"],
  painting: ["skim-coating"],
  // electrical
  "electrical-install": ["electrical-testing"],
  // warehousing & logistics
  "order-picking": ["barcode-scanning"],
  "forklift-operation": ["pallet-handling"],
  // hospitality & retail
  "waiting-tables": ["customer-service"],
  bartending: ["customer-service"],
  "sales-assistant": ["customer-service"],
  // office & accounting
  bookkeeping: ["data-entry", "office-software"],
  // education
  teaching: ["presenting"],
  // site leadership
  "site-supervision": ["team-coordination", "work-scheduling"],
  "site-management": ["team-coordination", "work-scheduling"],
};

export type PotentialSkill = {
  readonly slug: string;
  /** The evidenced skills this signal comes from — always shown with it. */
  readonly fromSlugs: readonly string[];
};

export const MAX_POTENTIAL = 4;

/**
 * Potential capabilities of a person whose journal evidences `evidenced`,
 * excluding every skill they already hold in ANY state (`known`). Ordered by
 * how many evidenced skills point at it, then slug.
 */
export function derivePotentialSkills(
  evidenced: Iterable<string>,
  known: Iterable<string>,
  limit: number = MAX_POTENTIAL,
): PotentialSkill[] {
  const knownSet = new Set(known);
  const from = new Map<string, Set<string>>();
  for (const s of new Set(evidenced)) {
    for (const p of POTENTIAL_SKILLS[s] ?? []) {
      if (knownSet.has(p)) continue;
      const set = from.get(p) ?? new Set<string>();
      set.add(s);
      from.set(p, set);
    }
  }
  return [...from.entries()]
    .map(([slug, f]) => ({ slug, fromSlugs: [...f].sort() }))
    .sort((a, b) => b.fromSlugs.length - a.fromSlugs.length || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, limit));
}
