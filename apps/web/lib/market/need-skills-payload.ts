/**
 * THE NEED'S REQUIRED SKILLS, stored at intake as catalogue slugs (PURE).
 *
 * Owner decision 2026-10-29: job fit for workers comes from evidence of work
 * actually done and the need's requirements — not from title matching alone.
 * The worker board cannot read a need's description, skills text or notes
 * (they are the employer's private words; the gated reader
 * `list_open_demand_for_workers` projects no free text, by design). So the
 * ONE offline derivation scouting already runs (`deriveNeedSkills`) is run
 * once, server-side, when the need is written, and only its RESULT is kept:
 *
 *   payload.need_skills = { slugs: [catalogue slugs], source, contract: 1 }
 *
 * Never free text, never a slug the derivation did not produce, never a
 * human-structured claim (the company's own confirmed set lives in
 * `payload.structured_need`, which this never writes). The reader
 * (migration 20261029190000) re-filters every slug against the active
 * `public.skills` catalogue and projects `need_skill_slugs` /
 * `need_skill_source`; `needFromDemandRow` turns them into the match need.
 *
 * Old needs without the key keep the exact title-only reading they have
 * today; filling it in for them is a data change behind its own approval.
 */

import {
  deriveNeedSkills,
  type NeedSkillSource,
  type NeedTextInput,
} from "./need-skills";

export const NEED_SKILLS_PAYLOAD_KEY = "need_skills" as const;
export const NEED_SKILLS_CONTRACT = 1 as const;

/** The sources a stored, DERIVED set may carry. `human_structured` is not
 *  one of them: a human set is the company's own act, stored elsewhere. */
export const STORED_NEED_SKILL_SOURCES = [
  "esco_mapped",
  "recognized_from_text",
  "profession_expanded",
] as const satisfies readonly NeedSkillSource[];
export type StoredNeedSkillSource = (typeof STORED_NEED_SKILL_SOURCES)[number];

export interface StoredNeedSkills {
  readonly slugs: readonly string[];
  readonly source: StoredNeedSkillSource;
  readonly contract: typeof NEED_SKILLS_CONTRACT;
}

/** Same shape the catalogue uses for a slug; anything else is not stored. */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/;
/** deriveNeedSkills caps text recognition at 8; profession expansion can be
 *  longer, but a stored requirement set is never an unbounded list. */
const MAX_STORED = 20;

/**
 * Derive the set to store for a need, or null when nothing is derivable
 * reliably (the need then stays honestly unassessed — never invented).
 */
export function needSkillsForPayload(input: NeedTextInput): StoredNeedSkills | null {
  const derived = deriveNeedSkills(input);
  if (derived.source === null || derived.source === "human_structured") return null;
  const slugs = [...new Set(derived.skillSlugs.filter((s) => SLUG.test(s)))].sort().slice(0, MAX_STORED);
  if (slugs.length === 0) return null;
  return { slugs, source: derived.source, contract: NEED_SKILLS_CONTRACT };
}

function isStoredSource(v: unknown): v is NeedSkillSource {
  return v === "human_structured" || (STORED_NEED_SKILL_SOURCES as readonly unknown[]).includes(v);
}

/**
 * Read the reader's two projected columns off a board row. Tolerant: an
 * absent column (the migration is not applied yet), a null, a non-array or an
 * unknown source all read as "no stored set" → the caller keeps the title-only
 * derivation. Never throws, never invents.
 */
export function readProjectedNeedSkills(
  row: unknown,
): { readonly slugs: readonly string[]; readonly source: NeedSkillSource } | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const raw = r.need_skill_slugs;
  const source = r.need_skill_source;
  if (!Array.isArray(raw) || !isStoredSource(source)) return null;
  const slugs = [...new Set(raw.filter((s): s is string => typeof s === "string" && SLUG.test(s)))].sort();
  return slugs.length > 0 ? { slugs, source } : null;
}
