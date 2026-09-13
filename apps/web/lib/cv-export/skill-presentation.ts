/**
 * SKILL PRESENTATION — how a person's skills are SHOWN, in one place, for
 * the profile and the Living CV. Pure: no IO, no persistence, no AI.
 *
 * ── WHY THIS MODULE EXISTS (owner HUMAN_ACCEPTANCE, 2026-09-12) ──────────
 * On production the skill list read as an unweighted tag cloud: a skill with
 * 0.5 h beside one with 25 h at the same size, and the same skill twice —
 * "Programavimas" (the catalogue name of `programming`) beside
 * "programavimas" (the free-label claim it was promoted from), likewise
 * "Renginių paruošimas / renginių paruošimas", "Patalpų valymas / patalpų
 * valymas". The claim rows and the catalogue rows are BOTH real evidence
 * with their own provenance; the defect was in presentation, not in data.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────────
 *  1. NO DESTRUCTIVE MERGE. Nothing here writes; a hidden variant stays in
 *     the database exactly as the person saved it. The presentation groups
 *     variants under one visible item and says how many it stands for.
 *  2. ONE FOLD. Variants are grouped by `foldText` (lower-case, Lithuanian
 *     and other Latin diacritics folded, whitespace collapsed) — the same
 *     fold the recognizer uses. "Patalpų valymas" and "patalpu valymas" are
 *     one item; "Patalpų valymas" and "Patalpų priežiūra" are two.
 *  3. A CLAIM THAT IS ALREADY A SKILL IS SHOWN AS THE SKILL. A free-label
 *     claim whose folded label equals a catalogued skill's name, or whose
 *     lexicon mapping points at a catalogued slug the person already holds,
 *     is folded INTO that skill (the skill carries hours; the claim cannot).
 *  4. MAGNITUDE IS VISIBLE WHEN KNOWN. Each item carries the journal's own
 *     figures for it (attributed hours, confirmed hours, share, entries,
 *     days, contexts, first/last day) and a presentation `magnitude` band
 *     derived from them — so 0.5 h can never look like 1 000 h. The band is
 *     a size for the eye, never a person score, never stored.
 *  5. ORDER = STRENGTH OF EVIDENCE, THEN MAGNITUDE. Manager-confirmed →
 *     journal-backed → catalogued-declared → self-stated free labels; within
 *     a tier by attributed hours, then entries, then the stored order.
 *
 * UNKNOWN ≠ ZERO: when the journal could not be read (`practice === null`)
 * every item is `magnitude: "unknown"` and carries no figures — never a 0.
 */

import { foldText } from "@/lib/structuring/normalize";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import type { CvSkillTier, CvSkillTiers } from "./skill-tiers";

/** The journal's per-skill figures as the ONE reader hands them over
 *  (`SkillWorkTime` in lib/journal/work-intelligence.ts), keyed by slug. */
export type SkillPracticeFacts = {
  readonly attributedHours: number;
  readonly confirmedHours: number;
  readonly sharedHours: number;
  /** Share of the person's ATTRIBUTED hours, 0..1. */
  readonly share: number;
  readonly entries: number;
  readonly days: number;
  readonly contexts: number;
  readonly firstWorkedDay?: string | null;
  readonly lastWorkedDay: string | null;
  readonly trend?: "up" | "down" | "flat" | "new" | "none";
};

export type SkillPracticeBySlug = Readonly<Record<string, SkillPracticeFacts>>;

/** The model's per-skill rows as the presentation needs them, keyed by
 *  slug — no arithmetic, no reinterpretation: every figure is the journal's
 *  own (`SkillWorkTime`). Skills with nothing recorded are left out, so a
 *  missing key means "none", and a `null` map means "unknown". */
export function skillPracticeFromIntelligence(
  wi: WorkIntelligence,
): Record<string, SkillPracticeFacts> {
  const out: Record<string, SkillPracticeFacts> = {};
  for (const s of wi.skills) {
    if (s.attributedHours <= 0 && s.sharedHours <= 0 && s.entries <= 0) continue;
    out[s.slug] = {
      attributedHours: s.attributedHours,
      confirmedHours: s.confirmedHours,
      sharedHours: s.sharedHours,
      share: s.share,
      entries: s.entries,
      days: s.days,
      contexts: s.contexts,
      firstWorkedDay: (s as { firstWorkedDay?: string | null }).firstWorkedDay ?? null,
      lastWorkedDay: s.lastWorkedDay,
      trend: s.trend,
    };
  }
  return out;
}

/** Presentation band for the eye. Thresholds are stated here once so every
 *  surface agrees; they are sizes, not judgements of the person. */
export type SkillMagnitude =
  /** ≥ 20 attributed hours, or ≥ 5 entries with a real share. */
  | "major"
  /** Some recorded practice: ≥ 2 h or ≥ 2 entries. */
  | "supported"
  /** A trace: under 2 h and at most one entry, or involvement only. */
  | "trace"
  /** Declared, nothing recorded against it. */
  | "none"
  /** The journal could not be read — no figure is shown, no zero either. */
  | "unknown";

export const MAGNITUDE_MAJOR_HOURS = 20;
export const MAGNITUDE_MAJOR_ENTRIES = 5;
export const MAGNITUDE_SUPPORTED_HOURS = 2;
export const MAGNITUDE_SUPPORTED_ENTRIES = 2;

export function skillMagnitude(
  facts: SkillPracticeFacts | null | undefined,
  journalReadable: boolean,
): SkillMagnitude {
  if (!journalReadable) return "unknown";
  if (!facts) return "none";
  const h = facts.attributedHours;
  const n = facts.entries;
  if (h >= MAGNITUDE_MAJOR_HOURS || (n >= MAGNITUDE_MAJOR_ENTRIES && facts.share > 0)) {
    return "major";
  }
  if (h >= MAGNITUDE_SUPPORTED_HOURS || n >= MAGNITUDE_SUPPORTED_ENTRIES) {
    return "supported";
  }
  if (h > 0 || n > 0 || facts.sharedHours > 0) return "trace";
  return "none";
}

/** A free-label claim as the profile stores it (`profile_skill_claims`) or
 *  as a journal `skill_claim` metric carries it. `label` is the person's
 *  own casing; `origin` is where it came from. */
export type PresentableClaim = {
  readonly id?: string;
  readonly label: string;
  readonly origin: "profile" | "journal";
  /** Catalogue slugs the lexicon maps this label to (may be empty). */
  readonly mappedSlugs?: readonly string[];
};

export type PresentedSkillTier = CvSkillTier | "self_stated";

export type PresentedSkill = {
  /** Stable key: the slug for a catalogued skill, `claim:<fold>` for a
   *  free label. */
  readonly key: string;
  readonly name: string;
  readonly kind: "catalog" | "claim";
  readonly slug: string | null;
  readonly tier: PresentedSkillTier;
  readonly magnitude: SkillMagnitude;
  /** The journal's figures for this skill, or null when unknown / none. */
  readonly practice: SkillPracticeFacts | null;
  /** Free-label variants (their stored labels) this item stands for —
   *  the item's own label first. Length 1 when there is no variant. */
  readonly variants: readonly string[];
  /** Ids of the claim rows folded into this item (for removal UIs). */
  readonly claimIds: readonly string[];
  /** For claims: where the label came from. */
  readonly claimOrigin: "profile" | "journal" | null;
};

export type PresentedSkillGroup = {
  readonly tier: PresentedSkillTier;
  readonly items: readonly PresentedSkill[];
};

export type SkillPresentation = {
  readonly groups: readonly PresentedSkillGroup[];
  /** Free-label claims folded into a catalogued skill they already are. */
  readonly claimsFoldedIntoSkills: number;
  /** Free-label variants folded into another free label. */
  readonly variantsFolded: number;
  /** Total visible items across all groups. */
  readonly visible: number;
};

export const PRESENTED_TIER_ORDER: readonly PresentedSkillTier[] = [
  "confirmed",
  "evidence",
  "declared",
  "self_stated",
];

const MAGNITUDE_RANK: Record<SkillMagnitude, number> = {
  major: 4,
  supported: 3,
  trace: 2,
  none: 1,
  unknown: 0,
};

function foldKey(label: string): string {
  return foldText(label).replace(/\s+/g, " ").trim();
}

/** Prefer the variant a person would expect to see: the first one whose
 *  first letter is upper-case, else the first seen. Never invents casing. */
function preferredVariant(labels: readonly string[]): string {
  const cased = labels.find((l) => /^\p{Lu}/u.test(l));
  return cased ?? labels[0] ?? "";
}

export function presentSkills(input: {
  readonly tiers: CvSkillTiers;
  readonly claims: readonly PresentableClaim[];
  /** Journal figures by slug; `null` when the journal could not be read. */
  readonly practice: SkillPracticeBySlug | null;
  /** Catalogue name for a slug, in the reader's language. */
  readonly nameOf: (slug: string) => string;
}): SkillPresentation {
  const journalReadable = input.practice !== null;
  const practice = input.practice ?? {};

  // ── catalogued skills, one item per slug ────────────────────────────────
  const heldSlugs = new Set<string>();
  const catalogByFold = new Map<string, string>(); // folded name → slug
  const catalogItems = new Map<PresentedSkillTier, PresentedSkill[]>();
  for (const tier of ["confirmed", "evidence", "declared"] as const) {
    const items: PresentedSkill[] = [];
    for (const slug of input.tiers[tier]) {
      if (heldSlugs.has(slug)) continue; // two rows for one slug are one skill
      heldSlugs.add(slug);
      const name = input.nameOf(slug);
      catalogByFold.set(foldKey(name), slug);
      const facts = practice[slug] ?? null;
      items.push({
        key: slug,
        name,
        kind: "catalog",
        slug,
        tier,
        magnitude: skillMagnitude(facts, journalReadable),
        practice: facts,
        variants: [name],
        claimIds: [],
        claimOrigin: null,
      });
    }
    catalogItems.set(tier, items);
  }

  // ── free-label claims: fold into skills, then into each other ────────────
  let claimsFoldedIntoSkills = 0;
  let variantsFolded = 0;
  const claimGroups = new Map<
    string,
    { labels: string[]; ids: string[]; origin: "profile" | "journal" }
  >();
  for (const c of input.claims) {
    const label = (c.label ?? "").trim();
    if (!label) continue;
    const fold = foldKey(label);
    const mappedHeld = (c.mappedSlugs ?? []).some((s) => heldSlugs.has(s));
    if (catalogByFold.has(fold) || mappedHeld) {
      claimsFoldedIntoSkills += 1;
      const slug = catalogByFold.get(fold) ?? (c.mappedSlugs ?? []).find((s) => heldSlugs.has(s))!;
      // record the claim id on the catalogue item so a removal UI can reach it
      for (const items of catalogItems.values()) {
        const idx = items.findIndex((i) => i.slug === slug);
        if (idx >= 0) {
          const it = items[idx]!;
          items[idx] = {
            ...it,
            variants: it.variants.includes(label) ? it.variants : [...it.variants, label],
            claimIds: c.id ? [...it.claimIds, c.id] : it.claimIds,
          };
        }
      }
      continue;
    }
    const g = claimGroups.get(fold);
    if (g) {
      variantsFolded += 1;
      if (!g.labels.includes(label)) g.labels.push(label);
      if (c.id) g.ids.push(c.id);
      // a profile claim outranks a journal-derived one as the group's origin
      if (c.origin === "profile") g.origin = "profile";
    } else {
      claimGroups.set(fold, {
        labels: [label],
        ids: c.id ? [c.id] : [],
        origin: c.origin,
      });
    }
  }
  const selfStated: PresentedSkill[] = [...claimGroups.entries()].map(([fold, g]) => ({
    key: `claim:${fold}`,
    name: preferredVariant(g.labels),
    kind: "claim",
    slug: null,
    tier: "self_stated",
    magnitude: journalReadable ? "none" : "unknown",
    practice: null,
    variants: g.labels,
    claimIds: g.ids,
    claimOrigin: g.origin,
  }));

  // ── order: evidence strength, then magnitude, then stored order ─────────
  const byStrength = (a: PresentedSkill, b: PresentedSkill) => {
    const m = MAGNITUDE_RANK[b.magnitude] - MAGNITUDE_RANK[a.magnitude];
    if (m !== 0) return m;
    const h = (b.practice?.attributedHours ?? 0) - (a.practice?.attributedHours ?? 0);
    if (h !== 0) return h;
    return (b.practice?.entries ?? 0) - (a.practice?.entries ?? 0);
  };
  const groups: PresentedSkillGroup[] = [];
  for (const tier of PRESENTED_TIER_ORDER) {
    const items =
      tier === "self_stated" ? selfStated : [...(catalogItems.get(tier) ?? [])];
    // stable sort: JS sort is stable, so equal items keep the stored order
    items.sort(byStrength);
    if (items.length > 0) groups.push({ tier, items });
  }
  return {
    groups,
    claimsFoldedIntoSkills,
    variantsFolded,
    visible: groups.reduce((n, g) => n + g.items.length, 0),
  };
}

/** The strongest items across tiers, for compact surfaces (a card's top N).
 *  Strength = evidence tier first, then magnitude. */
export function topPresentedSkills(
  p: SkillPresentation,
  limit: number,
): PresentedSkill[] {
  const out: PresentedSkill[] = [];
  for (const g of p.groups) {
    for (const it of g.items) {
      if (out.length >= limit) return out;
      out.push(it);
    }
  }
  return out;
}
