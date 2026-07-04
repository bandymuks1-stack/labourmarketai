/**
 * Canonical demand-need derivation (Matching PR4, 2026-07-04).
 *
 * ONE canonical input contract for the demand side of matching. Pure and
 * deterministic — no DB, no network, no AI provider (§7). Priority order,
 * strongest human signal first:
 *
 *   1. human-structured canonical slugs  (payload.structured_need.skill_slugs)
 *   2. human-structured ESCO URIs        (bridged to slugs via the curated
 *      skills.esco_uri registry the CALLER provides; unbridged URIs are kept
 *      visible as `escoUnmappedUris`, never silently dropped)
 *   3. recognized from the demand's free text via the SAME offline
 *      12-language recognizer the Work Journal uses (exact/synonym tiers
 *      only — a fuzzy accident is not a requirement)
 *   4. profession-expanded via the static profession_skills mirror when a
 *      profession is detectable but no concrete skill is
 *
 * The derivation NEVER invents data: when nothing is derivable the result is
 * honestly unstructured (`source: null`) and matching shows no percentage
 * (§19). A recognized/expanded need is ALWAYS labeled with its source so the
 * UI can ask the company to CONFIRM it (human act) instead of presenting it
 * as human-structured.
 */

import { recognizeSkills } from "@/lib/structuring/skill-recognition";
import { foldText } from "@/lib/structuring/normalize";
import { PROFESSION_HINTS_LT } from "@/lib/structuring/keywords";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";
import { parseStructuredNeed } from "./fit";

export type NeedSkillSource =
  | "human_structured"
  | "esco_mapped"
  | "recognized_from_text"
  | "profession_expanded";

export interface RecognizedNeedSkill {
  readonly slug: string;
  /** The demand-text fragment that triggered the recognition (the "why"). */
  readonly matchedText: string;
}

export interface DerivedNeedSkills {
  /** Canonical required-skill slugs (deduped, sorted). Empty ⇒ unstructured. */
  readonly skillSlugs: readonly string[];
  /** Canonical profession slug (human-structured or detected from text). */
  readonly professionSlug: string | null;
  /** Where the need set came from — null ⇒ honestly unstructured. */
  readonly source: NeedSkillSource | null;
  /** Human-picked ESCO URIs the curated registry could not bridge to a slug
   *  (esco_uri is owner-curated and may be sparse — never fake a mapping). */
  readonly escoUnmappedUris: readonly string[];
  /** Recognition evidence when source === "recognized_from_text". */
  readonly recognized: readonly RecognizedNeedSkill[];
}

export interface NeedTextInput {
  readonly title?: string | null;
  readonly needSummary?: string | null;
  readonly roleOrWorkType?: string | null;
  readonly notes?: string | null;
  /** customer_requests.payload (jsonb). */
  readonly payload?: unknown;
  /** Curated esco_uri → skill slug bridge (from the skills registry rows the
   *  caller already holds). Missing/empty map is fine — slugs stay primary. */
  readonly escoUriToSlug?: ReadonlyMap<string, string>;
}

/** Cap on text-recognized requirement slugs — a long demand text must not
 *  turn into an unmeetable 15-skill checklist. */
const RECOGNIZED_NEED_LIMIT = 8;

/** Detect a canonical profession from demand text via the SAME profession
 *  lexicon the journal recognisers use (folded substring; longest needle
 *  wins so "call centre agent" beats a shorter accidental hit). */
export function detectNeedProfession(text: string): string | null {
  const folded = foldText(text);
  if (!folded.trim()) return null;
  let best: { slug: string; len: number } | null = null;
  for (const row of PROFESSION_HINTS_LT) {
    for (const n of row.needles) {
      const needle = foldText(n);
      if (needle && folded.includes(needle)) {
        if (!best || needle.length > best.len) best = { slug: row.slug, len: needle.length };
      }
    }
  }
  return best?.slug ?? null;
}

export function deriveNeedSkills(input: NeedTextInput): DerivedNeedSkills {
  const structured = parseStructuredNeed(input.payload);
  const text = [input.title, input.roleOrWorkType, input.needSummary, input.notes]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .join("\n");
  const detectedProfession = detectNeedProfession(text);

  // 1. Human-structured canonical slugs — the strongest signal.
  if (structured && structured.skillSlugs.length > 0) {
    return {
      skillSlugs: structured.skillSlugs,
      professionSlug: structured.professionSlug ?? detectedProfession,
      source: "human_structured",
      escoUnmappedUris: [],
      recognized: [],
    };
  }

  // 2. Human-structured ESCO URIs, bridged to slugs where curated.
  if (structured && structured.escoSkillUris.length > 0) {
    const bridge = input.escoUriToSlug ?? new Map<string, string>();
    const mapped: string[] = [];
    const unmapped: string[] = [];
    for (const uri of structured.escoSkillUris) {
      const slug = bridge.get(uri);
      if (slug) mapped.push(slug);
      else unmapped.push(uri);
    }
    if (mapped.length > 0) {
      return {
        skillSlugs: [...new Set(mapped)].sort(),
        professionSlug: structured.professionSlug ?? detectedProfession,
        source: "esco_mapped",
        escoUnmappedUris: unmapped,
        recognized: [],
      };
    }
    // Human picked ESCO concepts but none bridge to the catalogue yet —
    // fall through to text recognition so the demand is not inert, keeping
    // the unbridged URIs visible.
    const viaText = recognizeFromText(text, detectedProfession);
    return { ...viaText, escoUnmappedUris: unmapped };
  }

  // 3./4. Recognition from free text, then profession expansion.
  return recognizeFromText(text, detectedProfession);
}

function recognizeFromText(
  text: string,
  detectedProfession: string | null,
): DerivedNeedSkills {
  if (text.trim() !== "") {
    // Same offline recognizer as the Work Journal; fuzzy tier excluded — a
    // 1-edit spelling accident must never become a REQUIREMENT.
    const hits = recognizeSkills(text, RECOGNIZED_NEED_LIMIT).filter(
      (s) => s.via !== "fuzzy",
    );
    if (hits.length > 0) {
      return {
        skillSlugs: [...new Set(hits.map((h) => h.slug))].sort(),
        professionSlug: detectedProfession,
        source: "recognized_from_text",
        escoUnmappedUris: [],
        recognized: hits.map((h) => ({ slug: h.slug, matchedText: h.matchedText })),
      };
    }
  }

  if (detectedProfession) {
    const expanded = skillsForProfession(detectedProfession);
    if (expanded.length > 0) {
      return {
        skillSlugs: [...expanded].sort(),
        professionSlug: detectedProfession,
        source: "profession_expanded",
        escoUnmappedUris: [],
        recognized: [],
      };
    }
  }

  // Honestly unstructured — no set, no percentage, ever (§19).
  return {
    skillSlugs: [],
    professionSlug: detectedProfession,
    source: null,
    escoUnmappedUris: [],
    recognized: [],
  };
}
